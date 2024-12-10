import "./Actions.css";
import { Action } from "../action/Action";
import JoinForm from "../../../form/join-form/JoinForm";

function Actions() {
    
    const getJoinForm = () => {
        return (
            <JoinForm></JoinForm>
        );
    }

    return (
        <div className="actions">
            <Action name={"Join"} popoverTemplate={getJoinForm()}></Action>
        </div>
    );
}

export default Actions;