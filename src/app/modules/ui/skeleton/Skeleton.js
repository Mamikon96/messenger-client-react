import "./Skeleton.css";

// Заглушка на время загрузки: декоративная, для скринридеров состояние озвучивает отдельный role="status".
export const Skeleton = ({ circle = false, width, height, className = "" }) => {
    const classes = `skeleton${circle ? " _circle" : ""} ${className}`.trim();

    return <span className={classes} aria-hidden="true" data-testid="skeleton" style={{ width, height }} />;
};
