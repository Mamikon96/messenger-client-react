import { BACKOFF_BASE_MS, BACKOFF_MAX_MS, createWsService } from './wsService';

// Подменный сокет: тест сам «открывает», шлёт кадры и закрывает.
class FakeSocket {
  constructor(url) {
    this.url = url;
    this.closed = null;
    FakeSocket.instances.push(this);
  }

  close(code) {
    this.closed = code ?? 1000;
  }

  open() {
    this.onopen?.();
  }

  receive(data) {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) });
  }

  drop(code) {
    this.onclose?.({ code });
  }
}
FakeSocket.instances = [];

const lastSocket = () => FakeSocket.instances[FakeSocket.instances.length - 1];

// Таймеры управляются вручную: тест решает, когда «прошло время».
const createTimers = () => {
  const pending = new Map();
  let nextId = 1;
  return {
    setTimer: jest.fn((fn, ms) => {
      pending.set(nextId, { fn, ms });
      return nextId++;
    }),
    clearTimer: jest.fn((id) => pending.delete(id)),
    pending,
    fire() {
      const [id, { fn }] = [...pending.entries()][0];
      pending.delete(id);
      fn();
    },
  };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const setup = (overrides = {}) => {
  const timers = createTimers();
  const options = {
    url: 'ws://test/ws',
    createSocket: (url) => new FakeSocket(url),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    random: () => 0.5,
    onFrame: jest.fn(),
    onStatus: jest.fn(),
    onSessionClosed: jest.fn(),
    checkSession: jest.fn().mockResolvedValue({ id: 'u1' }),
    ...overrides,
  };
  return { service: createWsService(options), timers, options };
};

beforeEach(() => {
  FakeSocket.instances = [];
});

describe('createWsService', () => {
  it('connect открывает сокет по адресу и сообщает статусы connecting → open', () => {
    const { service, options } = setup();

    service.connect();
    expect(lastSocket().url).toBe('ws://test/ws');
    expect(options.onStatus).toHaveBeenLastCalledWith('connecting');

    lastSocket().open();
    expect(options.onStatus).toHaveBeenLastCalledWith('open');
  });

  it('повторный connect при живом сокете ничего не открывает', () => {
    const { service } = setup();

    service.connect();
    service.connect();

    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('передаёт разобранные кадры, неразборчивое и без type игнорирует', () => {
    const { service, options } = setup();
    service.connect();
    lastSocket().open();

    lastSocket().receive({ type: 'message.new', payload: { seq: 1 } });
    lastSocket().receive('не json');
    lastSocket().receive({ payload: {} });
    lastSocket().receive('[1,2]');

    expect(options.onFrame).toHaveBeenCalledTimes(1);
    expect(options.onFrame).toHaveBeenCalledWith({ type: 'message.new', payload: { seq: 1 } });
  });

  it('close закрывает сокет, отменяет переподключение и сообщает closed', () => {
    const { service, options, timers } = setup();
    service.connect();
    lastSocket().open();
    const socket = lastSocket();

    service.close();

    expect(socket.closed).toBe(1000);
    expect(options.onStatus).toHaveBeenLastCalledWith('closed');
    socket.drop(1006);
    expect(timers.pending.size).toBe(0);
  });

  it('кадры закрытого сокета не доходят до onFrame', () => {
    const { service, options } = setup();
    service.connect();
    lastSocket().open();
    const socket = lastSocket();
    service.close();

    socket.receive({ type: 'message.new', payload: {} });

    expect(options.onFrame).not.toHaveBeenCalled();
  });

  describe('обрыв после open (1006, 1001)', () => {
    it.each([1006, 1001])('код %i: переподключение с backoff', (code) => {
      const { service, options, timers } = setup();
      service.connect();
      lastSocket().open();

      lastSocket().drop(code);

      expect(options.onStatus).toHaveBeenLastCalledWith('reconnecting');
      expect(timers.setTimer).toHaveBeenCalledTimes(1);
      timers.fire();
      expect(FakeSocket.instances).toHaveLength(2);
    });

    it('full jitter: задержка = random × min(потолок, база × 2^попытка), попытка растёт до успешного open', async () => {
      const { service, timers } = setup({ random: () => 1 });
      service.connect();
      lastSocket().open();

      lastSocket().drop(1006);
      expect(timers.setTimer.mock.calls[0][1]).toBe(BACKOFF_BASE_MS);
      timers.fire();
      lastSocket().drop(1006);
      await flush();
      expect(timers.setTimer.mock.calls[1][1]).toBe(BACKOFF_BASE_MS * 2);
      timers.fire();
      lastSocket().drop(1006);
      await flush();
      expect(timers.setTimer.mock.calls[2][1]).toBe(BACKOFF_BASE_MS * 4);
    });

    it('задержка не превышает потолок, random = 0 даёт 0', () => {
      const first = setup({ random: () => 1 });
      first.service.connect();
      lastSocket().open();
      for (let i = 0; i < 12; i++) {
        lastSocket().open();
        lastSocket().drop(1006);
        first.timers.fire();
      }
      const delays = first.timers.setTimer.mock.calls.map(([, ms]) => ms);
      expect(Math.max(...delays)).toBeLessThanOrEqual(BACKOFF_MAX_MS);

      const zero = setup({ random: () => 0 });
      zero.service.connect();
      lastSocket().open();
      lastSocket().drop(1006);
      expect(zero.timers.setTimer.mock.calls[0][1]).toBe(0);
    });

    it('успешный open сбрасывает счётчик попыток', () => {
      const { service, timers } = setup({ random: () => 1 });
      service.connect();
      lastSocket().open();
      lastSocket().drop(1006);
      timers.fire();
      lastSocket().open();

      lastSocket().drop(1006);

      expect(timers.setTimer.mock.calls[1][1]).toBe(BACKOFF_BASE_MS);
    });
  });

  describe('4008: вытеснен лимитом вкладок', () => {
    it('статус displaced, автопереподключения нет', async () => {
      const { service, options, timers } = setup();
      service.connect();
      lastSocket().open();

      lastSocket().drop(4008);
      await flush();

      expect(options.onStatus).toHaveBeenLastCalledWith('displaced');
      expect(timers.setTimer).not.toHaveBeenCalled();
      expect(options.checkSession).not.toHaveBeenCalled();
      expect(FakeSocket.instances).toHaveLength(1);
    });

    it('ручной connect открывает новый сокет', () => {
      const { service, options } = setup();
      service.connect();
      lastSocket().open();
      lastSocket().drop(4008);

      service.connect();

      expect(FakeSocket.instances).toHaveLength(2);
      expect(options.onStatus).toHaveBeenLastCalledWith('connecting');
    });
  });

  describe('4401 и 1006 до open: проверка сессии', () => {
    it('4401 и сессия жива — переподключение с backoff', async () => {
      const { service, options, timers } = setup();
      service.connect();
      lastSocket().open();

      lastSocket().drop(4401);
      await flush();

      expect(options.checkSession).toHaveBeenCalledTimes(1);
      expect(options.onSessionClosed).not.toHaveBeenCalled();
      timers.fire();
      expect(FakeSocket.instances).toHaveLength(2);
    });

    it('4401 и сессии нет (null) — onSessionClosed, сокет не открывается', async () => {
      const { service, options, timers } = setup({ checkSession: jest.fn().mockResolvedValue(null) });
      service.connect();
      lastSocket().open();

      lastSocket().drop(4401);
      await flush();

      expect(options.onSessionClosed).toHaveBeenCalledTimes(1);
      expect(timers.setTimer).not.toHaveBeenCalled();
      expect(options.onStatus).toHaveBeenLastCalledWith('closed');
    });

    it('1006 до open и сессия жива — backoff', async () => {
      const { service, options, timers } = setup();
      service.connect();

      lastSocket().drop(1006);
      await flush();

      expect(options.checkSession).toHaveBeenCalledTimes(1);
      timers.fire();
      expect(FakeSocket.instances).toHaveLength(2);
    });

    it('1006 до open и сессии нет — onSessionClosed', async () => {
      const { service, options } = setup({ checkSession: jest.fn().mockResolvedValue(null) });
      service.connect();

      lastSocket().drop(1006);
      await flush();

      expect(options.onSessionClosed).toHaveBeenCalledTimes(1);
    });

    it('1006 на переподключённом сокете без open проверяет сессию, даже если прежний сокет открывался; сессии нет — onSessionClosed', async () => {
      const { service, options, timers } = setup({ checkSession: jest.fn().mockResolvedValue(null) });
      service.connect();
      lastSocket().open();

      lastSocket().drop(1006);
      expect(options.checkSession).not.toHaveBeenCalled();
      timers.fire();
      lastSocket().drop(1006);
      await flush();

      expect(options.checkSession).toHaveBeenCalledTimes(1);
      expect(options.onSessionClosed).toHaveBeenCalledTimes(1);
    });

    it('проверка сессии упала (сеть) — backoff, выхода нет', async () => {
      const { service, options, timers } = setup({ checkSession: jest.fn().mockRejectedValue(new TypeError('Failed to fetch')) });
      service.connect();
      lastSocket().drop(1006);
      await flush();

      expect(options.onSessionClosed).not.toHaveBeenCalled();
      expect(timers.setTimer).toHaveBeenCalledTimes(1);
    });

    it('close во время проверки сессии отменяет и переподключение, и onSessionClosed', async () => {
      let resolveCheck;
      const checkSession = jest.fn(() => new Promise((resolve) => { resolveCheck = resolve; }));
      const { service, options, timers } = setup({ checkSession });
      service.connect();
      lastSocket().drop(1006);

      service.close();
      resolveCheck(null);
      await flush();

      expect(options.onSessionClosed).not.toHaveBeenCalled();
      expect(timers.setTimer).not.toHaveBeenCalled();
    });
  });
});
