// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom не даёт TextEncoder (браузер даёт): берём его из Node для подсчёта байтов UTF-8 в тестах.
import { TextEncoder } from 'util';
import { webcrypto } from 'crypto';

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}

// jsdom не даёт crypto (браузер даёт): берём Web Crypto из Node для createClientId в тестах.
if (typeof global.crypto === 'undefined') {
  Object.defineProperty(global, 'crypto', { value: webcrypto, configurable: true, writable: true });
}
