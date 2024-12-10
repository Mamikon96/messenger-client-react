import { Overlay } from "../overlay/Overlay";
import { InnerPopover } from "./components/inner-popover/InnerPopover";
import "./Popover.css";

function Popover({content, overlayOpacity, onClose}) {
    return (
        <div className="popover">
            <InnerPopover content={content}></InnerPopover>
            <Overlay opacity={overlayOpacity} onClick={onClose}></Overlay>
        </div>
    );
}

export default Popover;