import { changeInvite, type InviteRouteContext } from "../_shared";

export const DELETE = (_request: Request, context: InviteRouteContext) => changeInvite(context, "delete");
