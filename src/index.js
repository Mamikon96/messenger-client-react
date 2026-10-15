import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css';
import './index.css';
import App from './App';
import store from './app/store'
import { sessionClosed } from './app/reducers/auth'
import { setUnauthorizedHandler } from './app/services/apiClient'
import { Provider } from 'react-redux'
import { initTheme } from './app/modules/theme/theme';

initTheme();

// 401 unauthorized на запрос открытой сессии: store сбрасывается, показывается экран входа с сообщением (UC-SESSION-06).
setUnauthorizedHandler(() => store.dispatch(sessionClosed()));

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <Provider store={store}>
    <React.StrictMode>
      <App />
    </React.StrictMode>
  </Provider>
);
