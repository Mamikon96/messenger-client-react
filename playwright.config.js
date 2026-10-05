const { defineConfig } = require('@playwright/test');

// Порт mock-BFF — один для самого сервера, прокси (src/setupProxy.js), готовности и контрактных тестов.
const bffPort = process.env.MOCK_BFF_PORT || 3200;
const bffUrl = `http://localhost:${bffPort}`;
process.env.MOCK_BFF_PORT = String(bffPort);
process.env.MOCK_BFF_URL = process.env.MOCK_BFF_URL || bffUrl;

module.exports = defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3100' },
  webServer: [
    {
      command: 'npm run mock-bff',
      url: `${bffUrl}/api/auth/session`, // 401 без сессии = сервер поднялся
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: 'BROWSER=none PORT=3100 npm start',
      url: 'http://localhost:3100',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
