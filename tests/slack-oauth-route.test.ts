import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({sessionRpc:vi.fn(),serviceRpc:vi.fn(),getUser:vi.fn(),cookieGet:vi.fn(),cookieSet:vi.fn(),exchange:vi.fn(),enabled:vi.fn()}));
vi.mock("next/headers",()=>({cookies:async()=>({get:mocks.cookieGet,set:mocks.cookieSet})}));
vi.mock("@/lib/supabase/server",()=>({createServerSupabaseClient:async()=>({rpc:mocks.sessionRpc,auth:{getUser:mocks.getUser}})}));
vi.mock("@/lib/supabase/service",()=>({createServiceSupabaseClient:()=>({rpc:mocks.serviceRpc})}));
vi.mock("@/lib/features",()=>({orgAdminWritesEnabled:mocks.enabled}));
vi.mock("@/lib/site",()=>({metadataBase:()=>new URL("https://sasu.example")}));
vi.mock("@/lib/slack/installation",async()=>({...await vi.importActual<typeof import("@/lib/slack/installation")>("@/lib/slack/installation"),exchangeSlackCode:mocks.exchange}));
import { GET } from "@/app/api/slack/oauth/callback/route";
import { POST } from "@/app/api/slack/oauth/start/route";
import { oauthStateHash, decryptSlackToken } from "@/lib/slack/installation";
const state="a".repeat(43),org="22222222-2222-4222-8222-222222222222",user="11111111-1111-4111-8111-111111111111";
const callback=()=>GET(new Request(`https://sasu.example/api/slack/oauth/callback?state=${state}&code=synthetic-code`));
describe("Slack OAuth HTTP boundary",()=>{
  beforeEach(()=>{
    vi.resetAllMocks(); vi.stubEnv("SLACK_TOKEN_ENCRYPTION_KEY",Buffer.alloc(32,17).toString("base64"));
    vi.stubEnv("SLACK_CLIENT_ID","123.456");vi.stubEnv("SLACK_CLIENT_SECRET","synthetic-secret");
    mocks.enabled.mockReturnValue(true);mocks.cookieGet.mockReturnValue({value:state});
    mocks.getUser.mockResolvedValue({data:{user:{id:user}},error:null});
    mocks.sessionRpc.mockResolvedValue({data:org,error:null});mocks.serviceRpc.mockResolvedValue({data:true,error:null});
    mocks.exchange.mockResolvedValue({token:"xoxb-sensitive-token",teamId:"TQA",teamName:"QA",botUserId:"UBOT",scopes:["chat:write"]});
  });
  it("start rejects foreign origins before reading a session or writing state",async()=>{
    expect((await POST(new Request("https://sasu.example/api/slack/oauth/start",{method:"POST",headers:{origin:"https://foreign.example"}}))).status).toBe(403);
    expect(mocks.sessionRpc).not.toHaveBeenCalled();
  });
  it("start writes a hashed state with secure HttpOnly cookie and fixed redirect",async()=>{
    const result=await POST(new Request("https://sasu.example/api/slack/oauth/start",{method:"POST",headers:{origin:"https://sasu.example"}}));
    expect(result.status).toBe(303);
    const redirect=new URL(result.headers.get("location")!);expect(redirect.origin).toBe("https://slack.com");
    const sent=redirect.searchParams.get("state")!;
    expect(mocks.sessionRpc).toHaveBeenCalledWith("begin_slack_installation",{p_hash:oauthStateHash(sent)});
    expect(mocks.cookieSet).toHaveBeenCalledWith("sasu-slack-oauth",sent,expect.objectContaining({httpOnly:true,secure:true,sameSite:"lax",maxAge:600}));
  });
  it("mismatched browser state prevents any exchange or credential write",async()=>{
    mocks.cookieGet.mockReturnValue({value:"b".repeat(43)});
    expect((await callback()).headers.get("location")).toContain("invalid_state");
    expect(mocks.exchange).not.toHaveBeenCalled();expect(mocks.serviceRpc).not.toHaveBeenCalled();
  });
  it("expired/consumed session state prevents exchange",async()=>{
    mocks.sessionRpc.mockResolvedValue({data:null,error:null});
    expect((await callback()).headers.get("location")).toContain("invalid_state");expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it("encrypts tokens for the session-derived organization and never returns them",async()=>{
    const result=await callback();expect(result.headers.get("location")).toBe("https://sasu.example/admin/sources?slack=installed");
    const [name,args]=mocks.serviceRpc.mock.calls[0];expect(name).toBe("complete_slack_installation");
    expect(args).toMatchObject({p_actor:user,p_org:org,p_team:"TQA"});
    expect(JSON.stringify(args)).not.toContain("xoxb-sensitive-token");
    expect(decryptSlackToken(args.p_encrypted,org,"TQA")).toBe("xoxb-sensitive-token");
    expect(await result.text()).not.toContain("xoxb");
  });
  it("feature off and workspace conflicts are closed with fixed messages",async()=>{
    mocks.enabled.mockReturnValue(false);expect((await callback()).status).toBe(404);expect(mocks.serviceRpc).not.toHaveBeenCalled();
    mocks.enabled.mockReturnValue(true);mocks.serviceRpc.mockResolvedValue({data:null,error:{code:"23505",message:"private db detail"}});
    expect((await callback()).headers.get("location")).toContain("workspace_conflict");
  });
});
