const { createProxyMiddleware } = require('http-proxy-middleware');

// Dev: /api и фейковый провайдер mock-BFF идут на него (SPA и API на одном origin, как в контракте).
const target = `http://localhost:${process.env.MOCK_BFF_PORT || 3200}`;

module.exports = function setupProxy(app) {
  app.use(['/api', '/mock-provider'], createProxyMiddleware({ target }));
};
