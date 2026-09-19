import { beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({rpc:vi.fn(),pull:vi.fn(),refresh:vi.fn(),encrypt:vi.fn(),decrypt:vi.fn()}));
vi.mock('@/lib/supabase/service',()=>({createServiceSupabaseClient:()=>({rpc:m.rpc})}));
vi.mock('@/lib/jobs',()=>({registerHandler:vi.fn()}));
vi.mock('@/lib/retro/connection-crypto',()=>({encryptConnectionSecret:m.encrypt,decryptConnectionSecret:m.decrypt}));
vi.mock('@/lib/retro/connectors/pull',()=>({pullConnector:m.pull}));
vi.mock('@/lib/retro/connectors/auth',()=>({refreshCredential:m.refresh}));
import { pullRetroConnection, scheduleRetroPulls } from '@/lib/pipeline/retro-pull';
const credential={accessToken:'synthetic',refreshToken:null,subjectId:'me',expiresAt:null,authKind:'token',scopes:[]};
const row={id:'c',user_id:'u',dept_id:'d',provider:'github',config:{repositories:['sasu/qa']},encrypted_secret:'cipher',lease:'lease'};
describe('수집 작업의 연결 경계',()=>{
  beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('SASU_RETRO_ENABLED','true');m.rpc.mockImplementation(async(name:string)=>({data:name==='claim_retro_pull'?row:1,error:null}));m.decrypt.mockReturnValue(JSON.stringify(credential));m.refresh.mockResolvedValue(credential);m.pull.mockResolvedValue([]);m.encrypt.mockReturnValue('new-cipher');});
  it('해제되거나 다른 작업이 수집 중이면 외부 요청을 하지 않는다',async()=>{m.rpc.mockResolvedValueOnce({data:null,error:null});await pullRetroConnection({connectionId:'c',date:'2026-09-20'});expect(m.pull).not.toHaveBeenCalled();});
  it('본인·부서에 묶인 자격으로 읽고 lease를 보내 원자 저장한다',async()=>{await pullRetroConnection({connectionId:'c',date:'2026-09-20'});expect(m.decrypt).toHaveBeenCalledWith('cipher','u','github','d');expect(m.rpc).toHaveBeenCalledWith('save_retro_pull',{p_connection:'c',p_lease:'lease',p_date:'2026-09-20',p_activities:[],p_encrypted:'new-cipher'});});
  it('외부 오류 본문은 버리고 안전한 코드만 기록해 재시도를 허용한다',async()=>{m.pull.mockRejectedValue(new Error('비공개 응답'));await expect(pullRetroConnection({connectionId:'c',date:'2026-09-20'})).rejects.toThrow('connector_failed');expect(m.rpc).toHaveBeenCalledWith('fail_retro_pull',{p_connection:'c',p_lease:'lease',p_error:'connector_failed'});expect(JSON.stringify(m.rpc.mock.calls)).not.toContain('비공개 응답');});
  it('회전된 토큰은 수집 실패 전에 저장하고 늦은 해제에는 수집하지 않는다',async()=>{
    m.refresh.mockResolvedValue({...credential,accessToken:'rotated',refreshToken:'rotated-refresh'});
    m.pull.mockRejectedValue(new Error('failed'));
    await expect(pullRetroConnection({connectionId:'c',date:'2026-09-20'})).rejects.toThrow();
    expect(m.rpc.mock.calls.map(call=>call[0])).toEqual(['claim_retro_pull','refresh_retro_pull','fail_retro_pull']);
    m.pull.mockClear();m.rpc.mockImplementation(async(name:string)=>({data:name==='claim_retro_pull'?row:false,error:null}));
    await pullRetroConnection({connectionId:'c',date:'2026-09-20'});expect(m.pull).not.toHaveBeenCalled();
  });
  it('기능 off에는 예약·이미 큐에 있던 수집 모두 외부 호출 0건이다',async()=>{vi.stubEnv('SASU_RETRO_ENABLED','false');await scheduleRetroPulls();await pullRetroConnection({connectionId:'c',date:'2026-09-20'});expect(m.rpc).not.toHaveBeenCalled();expect(m.pull).not.toHaveBeenCalled();});
});
