import { connectionAccess } from "../_shared";
import { fail, noStore } from "../../_shared";
export async function DELETE(_request:Request,{params}:{params:Promise<{dept:string;id:string}>}) {
  const access=await connectionAccess(params);if(access instanceof Response)return access;
  const result=await access.client.rpc("revoke_retro_connection",{p_connection:access.connection.id});
  return result.error?fail(result.error):new Response(null,{status:204,headers:noStore});
}
