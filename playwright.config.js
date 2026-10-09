const { defineConfig } = require('@playwright/test');

// Порт mock-BFF — один для самого сервера, прокси (BACKEND_URL для dev-сервера e2e), готовности и контрактных тестов.
const bffPort = process.env.MOCK_BFF_PORT || 3333;
const bffUrl = `http://localhost:${bffPort}`;
process.env.MOCK_BFF_PORT = String(bffPort);
process.env.MOCK_BFF_URL = process.env.MOCK_BFF_URL || bffUrl;

module.exports = defineConfig({
  testDir: './e2e',
  forbidOnly: true, // test.only не должен скрывать остальные кейсы (FE-D16)
  retries: 0, // flaky-тест = нарушенный кейс, ретраи не маскируют
  use: { baseURL: 'http://localhost:3100' },
  webServer: [
    {
      command: 'npm run mock-bff',
      url: `${bffUrl}/api/auth/session`, // 401 без сессии = сервер поднялся
      reuseExistingServer: false, // на 3333 мог остаться реальный бэкенд: e2e не должны молча идти на него
      timeout: 30000,
    },
    {
      command: `BROWSER=none PORT=3100 BACKEND_URL=${bffUrl} npm start`, // e2e идут на mock-BFF (тот же порт 3333, что у реального бэкенда — одновременно не запускать)
      url: 'http://localhost:3100',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
