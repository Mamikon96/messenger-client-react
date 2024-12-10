import { useSelector } from "react-redux";
import "./Dialog.css";

function Dialog({chat}) {
    const activeChat = useSelector((state) => state.activeChat);

    const handleClick = () => {
        console.log("click");
        
    }

    return (
        <div className="dialog">
            <div className="dialog__header">
                <div className="dialog__header-title">
                    {activeChat.title}
                </div>
            </div>
            <div className="dialog__content"></div>
            <div className="dialog__footer">
                <textarea className="dialog__footer-input"></textarea>
                <button className="dialog__footer-send" onClick={handleClick}>Send</button>
            </div>
        </div>
    );
}

export default Dialog;