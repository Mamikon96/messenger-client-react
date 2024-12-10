import './App.css';
import Header from './app/modules/header/Header';
import Login from './app/modules/login/Login';
import Messenger from './app/modules/messenger/Messenger';
import loginService from './app/services/loginService';

function App() {

  return (
    <div className="App">
      {
        loginService.isLoggedIn() 
        ? <Login></Login>
        : <>
            <Header/>
            <Messenger/>
          </>
      }
      {/* <Header></Header> */}
      {/* <Messenger></Messenger> */}
    </div>
  );
}

export default App;
