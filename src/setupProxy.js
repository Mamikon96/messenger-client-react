const { createProxyMiddleware } = require('http-proxy-middleware');

// Dev: /api (и /mock-provider) идут на бэкенд — порт реального бэкенда всегда 3333 (SPA и API на одном origin, как в контракте).
// Для e2e и ручной работы с mock-BFF: BACKEND_URL=http://localhost:3333 npm start.
const target = process.env.BACKEND_URL || 'http://localhost:3333';

module.exports = function setupProxy(app) {
  app.use(['/api', '/mock-provider'], createProxyMiddleware({ target }));
};
