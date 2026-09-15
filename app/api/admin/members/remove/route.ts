import { memberCommand } from "../_command";
export async function POST(request: Request) { return memberCommand(request, "remove_member"); }
