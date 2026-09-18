import { changeInvite, type InviteRouteContext } from "../../_shared";
export const POST = (_request: Request, context: InviteRouteContext) => changeInvite(context, "revoke");
