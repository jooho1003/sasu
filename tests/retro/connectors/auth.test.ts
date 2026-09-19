import { beforeEach, describe, expect, it, vi } from "vitest";
import { authorizationUrl, exchangeCredential, refreshCredential, validatePersonalToken } from "@/lib/retro/connectors/auth";

describe("개인 계정 연결",()=>{
  beforeEach(()=>{for(const key of ['FIGMA','GOOGLE','NOTION']){vi.stubEnv(`RETRO_${key}_CLIENT_ID`,'client');vi.stubEnv(`RETRO_${key}_CLIENT_SECRET`,'secret');}});
  it("Google 요청은 읽기 전용과 본인 식별 권한만 요청한다",()=>{
    const url=new URL(authorizationUrl('google_calendar','state','https://example.com/callback','proof'));
    expect(url.origin).toBe('https://accounts.google.com');expect(url.searchParams.get('scope')).toBe('openid https://www.googleapis.com/auth/calendar.events.readonly');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');expect(url.searchParams.get('access_type')).toBe('offline');
  });
  it("Figma 코드 교환 후 실제 /me로 사용자 일치를 확인한다",async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(Response.json({access_token:'access',refresh_token:'refresh',expires_in:3600,user_id_string:'me'})).mockResolvedValueOnce(Response.json({id:'me',email:'not-stored@example.com'}));
    const credential=await exchangeCredential('figma','code','https://example.com/callback','proof',fetcher);
    expect(credential).toMatchObject({subjectId:'me',accessToken:'access',authKind:'oauth'});expect(JSON.stringify(credential)).not.toContain('not-stored');
    expect(fetcher.mock.calls[0][0]).toBe('https://api.figma.com/v1/oauth/token');expect(fetcher.mock.calls[0][1].body.toString()).toContain('code_verifier=proof');
    fetcher.mockReset().mockResolvedValueOnce(Response.json({access_token:'access',user_id_string:'other'})).mockResolvedValueOnce(Response.json({id:'me'}));
    await expect(exchangeCredential('figma','code','https://example.com/callback','proof',fetcher)).rejects.toThrow('connector_auth_failed');
  });
  it("GitHub은 개인 세부 권한 토큰만 허용하고 검증된 ID를 저장한다",async()=>{
    const fetcher=vi.fn().mockResolvedValue(Response.json({id:42,type:'User',name:'not stored',email:'not stored'}));
    await expect(validatePersonalToken('github','classic-token',fetcher)).rejects.toThrow('connector_scope_denied');expect(fetcher).not.toHaveBeenCalled();
    expect(await validatePersonalToken('github','github_pat_synthetic_only',fetcher)).toMatchObject({subjectId:'42',authKind:'token'});
    await expect(validatePersonalToken('intercom','access',fetcher)).rejects.toThrow('connector_scope_denied');
  });
  it("갱신 토큰 회전과 Figma의 기존 refresh token을 보존한다",async()=>{
    const fetcher=vi.fn().mockResolvedValue(Response.json({access_token:'new-access',expires_in:3600}));
    const old={accessToken:'old',refreshToken:'refresh',expiresAt:1,authKind:'oauth' as const,subjectId:'me',scopes:[]};
    expect(await refreshCredential('figma',old,fetcher)).toMatchObject({accessToken:'new-access',refreshToken:'refresh',subjectId:'me'});
    expect(fetcher.mock.calls[0][0]).toBe('https://api.figma.com/v1/oauth/refresh');
  });
});
