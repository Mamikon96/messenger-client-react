import { useState } from "react";
import "./Action.css";
import Popover from "../../../popover/Popover";

export const Action = ({name, popoverTemplate}) => {

    const OVERLAY_OPACITY = 0.5;

    const [isShowPopover, setIsShowPopover] = useState(false);

    const handleAction = () => {
        setIsShowPopover(!isShowPopover);
    }

    return (
        <>
            <button className="action-button"
                        onClick={handleAction}
            >{name}</button>
            {
                isShowPopover
                    ?   <Popover content={popoverTemplate}
                                overlayOpacity={OVERLAY_OPACITY}
                                onClose={handleAction}
                        ></Popover>
                    : ""
            }
        </>
    );
};