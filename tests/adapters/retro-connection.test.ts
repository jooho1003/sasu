import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({rpc:vi.fn(),encrypt:vi.fn()}));
vi.mock('@/lib/supabase/service',()=>({createServiceSupabaseClient:()=>({rpc:m.rpc})}));
vi.mock('@/lib/retro/connection-crypto',()=>({encryptConnectionSecret:m.encrypt}));
import { saveRetroConnection } from '@/lib/adapters/retro-connection';
beforeEach(()=>{vi.resetAllMocks();m.rpc.mockResolvedValue({data:'connection',error:null});m.encrypt.mockReturnValue('v2.cipher');});
it('검증된 자격만 사용자·부서에 묶어 암호화하고 반환값에 비밀을 넣지 않는다',async()=>{
 const credential={accessToken:'secret',refreshToken:null,expiresAt:null,subjectId:'external-me',authKind:'token' as const,scopes:[]};
 expect(await saveRetroConnection({hash:'state',actor:'me',dept:'dept',provider:'github',credential})).toBe('connection');
 expect(m.encrypt).toHaveBeenCalledWith(JSON.stringify(credential),'me','github','dept');
 expect(m.rpc).toHaveBeenCalledWith('complete_retro_connection',expect.objectContaining({p_actor:'me',p_encrypted:'v2.cipher',p_hash:'state'}));
});
it('신원 없는 자격과 DB 오류를 저장 성공으로 처리하지 않는다',async()=>{
 await expect(saveRetroConnection({hash:'s',actor:'me',dept:'d',provider:'github',credential:{} as never})).rejects.toThrow();
 expect(m.rpc).not.toHaveBeenCalled();
 m.rpc.mockResolvedValue({data:null,error:{message:'private'}});
 await expect(saveRetroConnection({hash:'s',actor:'me',dept:'d',provider:'github',credential:{accessToken:'secret',refreshToken:null,expiresAt:null,subjectId:'me',authKind:'token',scopes:[]}})).rejects.toThrow('connector_failed');
});
