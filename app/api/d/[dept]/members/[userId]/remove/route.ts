import { leadMemberCommand } from "../../_command";
export async function POST(_request: Request, context: { params: Promise<{ dept: string; userId: string }> }) { return leadMemberCommand("remove_member", context); }
