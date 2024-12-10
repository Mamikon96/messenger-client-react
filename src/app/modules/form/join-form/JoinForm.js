import { useDispatch } from "react-redux";
import "./JoinForm.css";
import { addChat } from "../../../reducers/chats";
import { useState } from "react";

function JoinForm() {
    // const chats = useSelector((state) => state.chats);
    const dispatch = useDispatch();

    const [formState, setFormState] = useState({
        title: "",
        name: ""
    });

    const handleAction = () => {
        console.log("form:", formState);
        
        dispatch(addChat(formState));
    }

    const handleChange = (event) => {
        const {name, value} = event.target;
        setFormState((prev) => ({ ...prev, [name]: value }));
    }

    return (
        <div className="join-form">
            <div className="join-form__header">
                Join to the messenger
            </div>
            <div className="join-form__content">
                <label className="join-form__content-label" htmlFor="name">Name:</label>
                <input className="join-form__content-input" name="title" type="text" onChange={handleChange}></input>
                <input className="join-form__content-input" name="name" type="text" onChange={handleChange}></input>
            </div>
            <div className="join-form__footer">
                <button onClick={handleAction}>Join</button>
            </div>
        </div>
    );
}

export default JoinForm;