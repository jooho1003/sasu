import { createRoot } from "react-dom/client";
import { ReviewDetail } from "../../components/review-detail";
import { RetentionConsole } from "../../components/retention-console";
import { ReviewSettingsForm } from "../../components/admin/review-settings";
import { MeetingRecorder } from "../../components/meeting-recorder";
import "../../app/globals.css";
const query = new URLSearchParams(window.location.search);
const view = query.get("view");
createRoot(document.getElementById("root")!).render(view === "settings"
  ? <ReviewSettingsForm initial={{ browser_recording_enabled: query.get("recording") === "1", allow_original_download: false }} writable={query.get("readonly") !== "1"} />
  : view === "retention" ? <RetentionConsole deptId="dept" />
    : view === "recorder" ? <MeetingRecorder deptId="dept" userId="synthetic-user" />
      : <ReviewDetail deptId="dept" id="review" />);
