import { createClientId } from './clientId';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const withCrypto = (value, run) => {
  const original = Object.getOwnPropertyDescriptor(window, 'crypto');
  Object.defineProperty(window, 'crypto', { value, configurable: true, writable: true });
  try {
    run();
  } finally {
    if (original) Object.defineProperty(window, 'crypto', original);
    else delete window.crypto;
  }
};

// Предсказуемый getRandomValues: заполняет массив значениями из seed по кругу.
const fakeCrypto = (seed) => ({
  getRandomValues: (bytes) => {
    bytes.forEach((_, index) => {
      bytes[index] = seed[index % seed.length];
    });
    return bytes;
  },
});

describe('createClientId', () => {
  it('использует crypto.randomUUID, если он есть', () => {
    const randomUUID = jest.fn(() => 'from-random-uuid');

    withCrypto({ randomUUID, getRandomValues: jest.fn() }, () => {
      expect(createClientId()).toBe('from-random-uuid');
    });

    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  describe('запасная ветка на crypto.getRandomValues (нет randomUUID)', () => {
    it('даёт UUID v4', () => {
      withCrypto(fakeCrypto([0, 255, 17, 128, 64, 200]), () => {
        expect(createClientId()).toMatch(UUID_V4);
      });
    });

    it('при нулевых и максимальных байтах версия и вариант всё равно верные', () => {
      withCrypto(fakeCrypto([0]), () => {
        expect(createClientId()).toBe('00000000-0000-4000-8000-000000000000');
      });
      withCrypto(fakeCrypto([255]), () => {
        expect(createClientId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
      });
    });

    it('разные случайные байты дают разные id', () => {
      let counter = 0;
      const crypto = {
        getRandomValues: (bytes) => {
          bytes.forEach((_, index) => {
            bytes[index] = (counter + index * 7) % 256;
          });
          counter += 1;
          return bytes;
        },
      };

      withCrypto(crypto, () => {
        expect(createClientId()).not.toBe(createClientId());
      });
    });
  });

  it('с реальным crypto окружения даёт UUID v4 и уникальные значения', () => {
    const ids = Array.from({ length: 100 }, () => createClientId());

    ids.forEach((id) => expect(id).toMatch(UUID_V4));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
