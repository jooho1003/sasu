import { WorkReviewUpload } from "./WorkReviewUpload";
import { WorkSalesReview } from "./WorkSalesReview";
export function WorkTab({
  lead,
  deptId,
  onNotice,
}: {
  lead: boolean;
  deptId: string;
  onNotice: (value: string) => void;
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
      <WorkReviewUpload deptId={deptId} onNotice={onNotice} />
      <WorkSalesReview onNotice={onNotice} />
    </>
  );
}
