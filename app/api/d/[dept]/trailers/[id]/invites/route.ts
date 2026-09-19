import { createInvites, listInvites, type InviteRouteContext } from "./_shared";
export const GET = (_request: Request, context: InviteRouteContext) => listInvites(context);
export const POST = (request: Request, context: InviteRouteContext) => createInvites(request, context);
