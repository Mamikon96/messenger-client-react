import { getWsUrl } from './wsUrl';

describe('getWsUrl', () => {
  it('берёт адрес из REACT_APP_WS_URL', () => {
    expect(getWsUrl({ REACT_APP_WS_URL: 'ws://localhost:3333/ws' }, { protocol: 'http:', host: 'localhost:3000' }))
      .toBe('ws://localhost:3333/ws');
  });

  it('без переменной на http строит ws://host/ws', () => {
    expect(getWsUrl({}, { protocol: 'http:', host: 'example.com' })).toBe('ws://example.com/ws');
  });

  it('без переменной на https строит wss://host/ws', () => {
    expect(getWsUrl({}, { protocol: 'https:', host: 'example.com:8443' })).toBe('wss://example.com:8443/ws');
  });

  it('пустая переменная считается незаданной', () => {
    expect(getWsUrl({ REACT_APP_WS_URL: '' }, { protocol: 'https:', host: 'a.b' })).toBe('wss://a.b/ws');
  });
});
