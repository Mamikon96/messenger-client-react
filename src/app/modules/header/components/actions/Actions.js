import "./Actions.css";
import { Action } from "../action/Action";
import JoinForm from "../../../form/join-form/JoinForm";
import { UserMenu } from "../user-menu/UserMenu";
import { useSelector } from "react-redux";

function Actions() {
    const userName = useSelector((state) => state.auth.user?.name);

    const getJoinForm = () => {
        return (
            <JoinForm></JoinForm>
        );
    }

    return (
        <div className="actions">
            <Action name={"Join"} popoverTemplate={getJoinForm()}></Action>
            <Action name={userName} popoverTemplate={<UserMenu></UserMenu>}></Action>
        </div>
    );
}

export default Actions;