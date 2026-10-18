import "./Actions.css";
import { Action } from "../action/Action";
import JoinForm from "../../../form/join-form/JoinForm";
import { UserMenu } from "../user-menu/UserMenu";

function Actions() {
    return (
        <div className="actions">
            <Action name={"Join"} popoverTemplate={<JoinForm></JoinForm>}></Action>
            <UserMenu></UserMenu>
        </div>
    );
}

export default Actions;
