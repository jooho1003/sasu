import { memberCommand } from "../_command";
export async function POST(request: Request) { return memberCommand(request, "demote_lead"); }
