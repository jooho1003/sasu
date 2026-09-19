import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({member:vi.fn(),rpc:vi.fn(),service:vi.fn(),auth:vi.fn(),get:vi.fn(),set:vi.fn(),exchange:vi.fn(),encrypt:vi.fn(),query:vi.fn(),filters:vi.fn(),kick:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:m.get,set:m.set})}));
vi.mock('@/lib/site',()=>({metadataBase:()=>new URL('https://sasu.example')}));
vi.mock('@/lib/jobs',()=>({kickWorker:m.kick}));
vi.mock('@/lib/supabase/membership',()=>({requireMembership:m.member}));
vi.mock('@/lib/supabase/server',()=>({createServerSupabaseClient:async()=>({rpc:m.rpc,auth:{getUser:m.auth},from:()=>({select:()=>({eq:chain})})})}));
function chain(...args:unknown[]):unknown {m.filters(...args);return {eq:chain,maybeSingle:m.query};}
vi.mock('@/lib/supabase/service',()=>({createServiceSupabaseClient:()=>({rpc:m.service})}));
vi.mock('@/lib/retro/connection-crypto',()=>({encryptConnectionSecret:m.encrypt,connectionEncryptionConfigured:()=>true}));
vi.mock('@/lib/retro/connectors/auth',()=>({stateHash:(s:string)=>s,oauthConfigured:()=>true,authorizationUrl:()=> 'https://www.figma.com/oauth',exchangeCredential:m.exchange}));
import { POST as start } from '@/app/api/retro/connect/[provider]/start/route';
import { GET as callback } from '@/app/api/retro/connect/[provider]/callback/route';
import { DELETE as revoke } from '@/app/api/d/[dept]/retros/connections/[id]/route';
import { POST as pull } from '@/app/api/d/[dept]/retros/connections/[id]/pull/route';
const dept='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const state='s'.repeat(43),verifier='v'.repeat(43),provider={params:Promise.resolve({provider:'figma'})};
const connection={params:Promise.resolve({dept,id})};
const startRequest=(origin='https://sasu.example')=>new Request('https://sasu.example/api/retro/connect/figma/start',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({dept,config:{files:['fileABC']},consent:true})});
describe('개인 연결 요청 경계',()=>{
  beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('SASU_RETRO_ENABLED','true');m.member.mockResolvedValue({deptId:dept,userId:'me',consentedAt:'yes'});m.rpc.mockResolvedValue({data:{dept_id:dept,config:{files:['fileABC']},auth_kind:'oauth'},error:null});m.service.mockResolvedValue({data:id,error:null});m.auth.mockResolvedValue({data:{user:{id:'me'}},error:null});m.get.mockReturnValue({value:state+'.'+verifier});m.exchange.mockResolvedValue({accessToken:'never-in-response',refreshToken:'private',subjectId:'figma-me',expiresAt:null,authKind:'oauth',scopes:['read']});m.encrypt.mockReturnValue('encrypted');m.query.mockResolvedValue({data:{id,status:'active'},error:null});});
  afterEach(()=>vi.unstubAllEnvs());
  it('기능 off와 다른 origin은 세션·제공자 요청 전에 거부한다',async()=>{vi.stubEnv('SASU_RETRO_ENABLED','false');expect((await start(startRequest(),provider)).status).toBe(404);vi.stubEnv('SASU_RETRO_ENABLED','true');expect((await start(startRequest('https://evil.example'),provider)).status).toBe(403);expect(m.member).not.toHaveBeenCalled();});
  it('시작은 세션 사용자 부서에 상태를 묶고 안전한 쿠키를 쓴다',async()=>{expect((await start(startRequest(),provider)).status).toBe(200);expect(m.rpc).toHaveBeenCalledWith('begin_retro_connection',expect.objectContaining({p_dept:dept,p_provider:'figma',p_auth_kind:'oauth'}));expect(m.set).toHaveBeenCalledWith('sasu-retro-figma',expect.any(String),expect.objectContaining({httpOnly:true,secure:true,sameSite:'lax',maxAge:600}));});
  it('틀린 state·로그아웃·재사용은 토큰 교환 전에 거부한다',async()=>{expect((await callback(new Request('https://sasu.example/callback?state=wrong&code=x'),provider)).status).toBe(400);m.auth.mockResolvedValueOnce({data:{user:null},error:null});expect((await callback(new Request('https://sasu.example/callback?state='+state+'&code=x'),provider)).status).toBe(400);m.rpc.mockResolvedValueOnce({data:null,error:null});expect((await callback(new Request('https://sasu.example/callback?state='+state+'&code=x'),provider)).status).toBe(400);expect(m.exchange).not.toHaveBeenCalled();expect(m.service).not.toHaveBeenCalled();});
  it('검증된 콜백만 저장하고 응답·리다이렉트에 토큰을 넣지 않는다',async()=>{const response=await callback(new Request('https://sasu.example/callback?state='+state+'&code=x'),provider);expect(response.status).toBe(303);expect(m.exchange).toHaveBeenCalledWith('figma','x','https://sasu.example/api/retro/connect/figma/callback',verifier,expect.any(Function),{files:['fileABC']});expect(m.encrypt).toHaveBeenCalledWith(expect.any(String),'me','figma',dept);expect(response.headers.get('location')).toBe('https://sasu.example/d/'+dept+'/settings?retro=connected');expect(await response.text()).not.toContain('never-in-response');});
  it('다른 부서 연결 ID는 해제·수집 모두 거부한다',async()=>{m.query.mockResolvedValue({data:null,error:null});expect((await revoke(new Request('https://sasu.example'),connection)).status).toBe(404);expect((await pull(new Request('https://sasu.example'),connection)).status).toBe(404);expect(m.filters).toHaveBeenCalledWith('dept_id',dept);expect(m.rpc).not.toHaveBeenCalled();expect(m.kick).not.toHaveBeenCalled();});
});
