import { useDispatch } from "react-redux";
import "./JoinForm.css";
import { addChat } from "../../../reducers/chats";
import { useState } from "react";
import { Button } from "../../ui/button/Button";
import { Input } from "../../ui/input/Input";

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
                <Input name="title" type="text" aria-label="Название чата" onChange={handleChange} />
                <Input name="name" type="text" aria-label="Имя" onChange={handleChange} />
            </div>
            <div className="join-form__footer">
                <Button onClick={handleAction}>Join</Button>
            </div>
        </div>
    );
}

export default JoinForm;