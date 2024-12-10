import "./Overlay.css";

export const Overlay = ({opacity, onClick}) => {
    return (
        <div className="overlay"
            style={{ opacity }}
            onClick={onClick}
        ></div>
    );
}