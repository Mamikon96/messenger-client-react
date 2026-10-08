import { useState } from "react";
import "./Action.css";
import Popover from "../../../popover/Popover";
import { Button } from "../../../ui/button/Button";

export const Action = ({name, popoverTemplate}) => {

    const OVERLAY_OPACITY = 0.5;

    const [isShowPopover, setIsShowPopover] = useState(false);

    const handleAction = () => {
        setIsShowPopover(!isShowPopover);
    }

    return (
        <>
            <Button className="action-button" onClick={handleAction}>{name}</Button>
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