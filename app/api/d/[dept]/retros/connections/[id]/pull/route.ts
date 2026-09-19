import { connectionAccess } from "../../_shared";
import { fail, noStore } from "../../../_shared";
import { kickWorker } from "@/lib/jobs";
import { localDate } from "@/lib/retro/bundle";
export async function POST(_request:Request,{params}:{params:Promise<{dept:string;id:string}>}) {
  const access=await connectionAccess(params);if(access instanceof Response)return access;
  const result=await access.client.rpc("queue_retro_pull",{p_connection:access.connection.id,p_date:localDate(new Date(),"Asia/Seoul")});
  if(result.error)return fail(result.error);
  kickWorker();return Response.json({queued:true},{status:202,headers:noStore});
}
