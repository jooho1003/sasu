import { rescoreInviteAttempt, type InviteRouteContext } from "../../../_shared";
export const POST = (_request: Request, context: InviteRouteContext) => rescoreInviteAttempt(context);
