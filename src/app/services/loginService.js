class LoginService {
    USER_LOCAL_STORAGE_KEY = "user";

    constructor() {
        console.log("[LoginService] constructor");
    }

    isLoggedIn() {
        return window.localStorage.getItem(this.USER_LOCAL_STORAGE_KEY);
    }
}

const loginService = new LoginService();

export default loginService;