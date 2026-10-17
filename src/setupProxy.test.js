const setupProxy = require('./setupProxy');

describe('getProxyTarget', () => {
  it('по умолчанию — реальный бэкенд на 3333', () => {
    expect(setupProxy.getProxyTarget({})).toBe('http://localhost:3333');
  });

  it('BACKEND_URL перекрывает значение по умолчанию', () => {
    expect(setupProxy.getProxyTarget({ BACKEND_URL: 'http://localhost:3334' })).toBe('http://localhost:3334');
  });

  it('пустой BACKEND_URL даёт значение по умолчанию', () => {
    expect(setupProxy.getProxyTarget({ BACKEND_URL: '' })).toBe('http://localhost:3333');
  });
});
