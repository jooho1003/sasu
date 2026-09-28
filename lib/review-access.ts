import { OriginalAccessGrant, OriginalSegmentAccessGrant } from "@/lib/contracts";

type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{
  data: unknown;
  error: unknown;
}>;

export async function requestOriginalAccess(
  rpc: Rpc,
  deptId: string,
  reviewId: string,
  action: "play_original" | "download_original",
) {
  const result = await rpc("authorize_review_access", {
    p_dept: deptId, p_review: reviewId, p_action: action,
  });
  if (result.error) throw result.error;
  const parsed = OriginalAccessGrant.safeParse(result.data);
  if (!parsed.success) throw new Error("invalid_access_response");
  return parsed.data;
}

export async function requestOriginalSegmentAccess(
  rpc: Rpc,
  deptId: string,
  reviewId: string,
  index: number,
  action: "play_original" | "download_original",
) {
  const result = await rpc("authorize_review_segment_access", {
    p_dept: deptId, p_review: reviewId, p_index: index, p_action: action,
  });
  if (result.error) throw result.error;
  const parsed = OriginalSegmentAccessGrant.safeParse(result.data);
  if (!parsed.success) throw new Error("invalid_access_response");
  return parsed.data;
}

export function originalAccessError(error: unknown): { status: number; error: string } {
  const code = error && typeof error === "object" ? Reflect.get(error, "code") : null;
  const message = error && typeof error === "object" ? Reflect.get(error, "message") : null;
  if (code === "P0001" && message === "rate_limited")
    return { status: 429, error: "원본 요청이 많습니다. 1분 후 다시 시도해 주세요." };
  if (code === "42501")
    return { status: 403, error: message === "original_download_disabled"
      ? "조직에서 원본 내려받기를 허용하지 않았습니다."
      : "자료 접근 권한과 참여자 동의를 확인해 주세요." };
  if (code === "P0002") return { status: 404, error: "보관된 원본이 없거나 보존 기한이 지났습니다." };
  if (code === "22023") return { status: 400, error: "원본 요청 정보를 확인해 주세요." };
  return { status: 500, error: "원본을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." };
}
