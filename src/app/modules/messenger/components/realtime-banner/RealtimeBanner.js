import { useDispatch, useSelector } from "react-redux";
import { resumeRealtime, selectRealtimeStatus } from "../../../../reducers/realtime";
import { Button } from "../../../ui/button/Button";
import "./RealtimeBanner.css";

// Полоса над панелями: показывается, только когда сервер вытеснил соединение лимитом вкладок (4008).
function RealtimeBanner() {
    const dispatch = useDispatch();
    const status = useSelector(selectRealtimeStatus);

    if (status !== "displaced") return null;

    return (
        <div className="realtime-banner" role="status">
            <span>Соединение занято в другой вкладке. Новые сообщения не приходят.</span>
            <Button variant="secondary" onClick={() => dispatch(resumeRealtime())}>Подключиться</Button>
        </div>
    );
}

export default RealtimeBanner;
