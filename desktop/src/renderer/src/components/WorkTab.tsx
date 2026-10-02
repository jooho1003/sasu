import { WorkReviewUpload } from "./WorkReviewUpload";
import { WorkSalesReview } from "./WorkSalesReview";
export function WorkTab({
  lead,
  deptId,
  onNotice,
  onSeen,
}: {
  lead: boolean;
  deptId: string;
  onNotice: (value: string) => void;
  onSeen: (id: string) => Promise<void>;
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
      <WorkReviewUpload deptId={deptId} onNotice={onNotice} onSeen={onSeen} />
      <WorkSalesReview onNotice={onNotice} onSeen={onSeen} />
    </>
  );
}
