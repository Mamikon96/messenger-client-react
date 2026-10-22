import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css';
import './index.css';
import App from './App';
import ErrorBoundary from './app/modules/ui/error-boundary/ErrorBoundary';
import store from './app/store'
import { recoverCsrf, sessionClosed } from './app/reducers/auth'
import { setCsrfRecoveryHandler, setUnauthorizedHandler } from './app/services/apiClient'
import { Provider } from 'react-redux'
import { initTheme } from './app/modules/theme/theme';

initTheme();

// 401 unauthorized на запрос открытой сессии: store сбрасывается, показывается экран входа с сообщением (UC-SESSION-06).
setUnauthorizedHandler(() => store.dispatch(sessionClosed()));

// 403 csrf_invalid: перечитать сессию; запрос повторяется, только если пользователь прежний (UC-SESSION-09).
setCsrfRecoveryHandler(() => store.dispatch(recoverCsrf()).unwrap());

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <Provider store={store}>
    <React.StrictMode>
      <ErrorBoundary actionLabel="Перезагрузить страницу" onAction={() => window.location.reload()} fullscreen>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  </Provider>
);
