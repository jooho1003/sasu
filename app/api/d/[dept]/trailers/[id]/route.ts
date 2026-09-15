import { trailerAction, type TrailerRouteContext } from "../_shared";
export const PATCH = (request: Request, context: TrailerRouteContext) => trailerAction(request, context, "update");
export const DELETE = (request: Request, context: TrailerRouteContext) => trailerAction(request, context, "delete");
