import { useState } from "react";
import "./Login.css";
import { useDispatch } from "react-redux";
import { addUser } from "../../reducers/users";

export default function Login() {

    const dispatch = useDispatch();

    const [formState, setFormState] = useState({
        name: ""
    });

    const handleClick = () => {
        console.log("form:", formState);
        
        dispatch(addUser(formState));
    }

    const handleChange = (event) => {
        const {name, value} = event.target;
        setFormState((prev) => ({ ...prev, [name]: value }));
    }

    return (
        <div className="login">
            <input className="login__name" type="text" name="name" onChange={handleChange}></input>
            <button className="login__submit" onClick={handleClick}>Log in</button>
        </div>
    );
}