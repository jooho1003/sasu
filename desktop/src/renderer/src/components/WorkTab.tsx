import { WorkReviewUpload } from "./WorkReviewUpload";
import { WorkSalesReview } from "./WorkSalesReview";
import type { CompanionInbox } from "@sasu/contracts";
import { RecentWork } from "./RecentWork";
export function WorkTab({
  lead,
  deptId,
  onNotice,
  onSeen,
  inbox,
  loading,
  error,
  onRefresh,
}: {
  lead: boolean;
  deptId: string;
  onNotice: (value: string) => void;
  onSeen: (id: string, stillCurrent?: () => boolean) => Promise<void>;
  inbox: CompanionInbox | null;
  loading: boolean;
  error: string;
  onRefresh: () => Promise<CompanionInbox | null>;
}) {
  if (!lead)
    return (
      <>
        <h1>일 맡기기</h1>
        <p>팀장만 사용할 수 있어요.</p>
      </>
    );
  return (
    <>
      <h1>일 맡기기</h1>
      <RecentWork inbox={inbox} loading={loading} error={error} deptId={deptId} onRefresh={onRefresh} onNotice={onNotice} onSeen={onSeen} />
      <WorkReviewUpload deptId={deptId} onNotice={onNotice} onSeen={onSeen} />
      <WorkSalesReview onNotice={onNotice} onSeen={onSeen} />
    </>
  );
}
