import { trailerAction, type TrailerRouteContext } from "../../_shared";
export const POST = (request: Request, context: TrailerRouteContext) => trailerAction(request, context, "recheck");
