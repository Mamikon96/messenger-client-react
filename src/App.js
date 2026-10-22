import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import './App.css';
import Header from './app/modules/header/Header';
import Login from './app/modules/login/Login';
import Messenger from './app/modules/messenger/Messenger';
import { Button } from './app/modules/ui/button/Button';
import ErrorBoundary from './app/modules/ui/error-boundary/ErrorBoundary';
import { checkSession, selectAuthStatus, selectAuthUserId } from './app/reducers/auth';

function App() {
  const dispatch = useDispatch();
  const status = useSelector(selectAuthStatus);
  const userId = useSelector(selectAuthUserId);
  useEffect(() => {
    const request = dispatch(checkSession());
    return () => request.abort();
  }, [dispatch]);

  const handleRetry = () => {
    dispatch(checkSession());
  };

  const renderContent = () => {
    switch (status) {
      case 'authenticated':
        return (
          <>
            <Header/>
            <ErrorBoundary>
              <Messenger key={userId}/>
            </ErrorBoundary>
          </>
        );
      case 'anonymous':
      case 'sessionClosed':
        return (
          <ErrorBoundary>
            <Login/>
          </ErrorBoundary>
        );
      case 'error':
        return (
          <div className="App__status" role="alert">
            <p className="App__message">Не удалось проверить сессию. Проверьте соединение и попробуйте снова.</p>
            <Button className="App__retry" onClick={handleRetry}>Повторить</Button>
          </div>
        );
      default:
        return <p className="App__status" role="status">Загрузка…</p>;
    }
  };

  return <div className="App">{renderContent()}</div>;
}

export default App;
