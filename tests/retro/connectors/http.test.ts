import { describe, expect, it, vi } from "vitest";
import { connectorJson } from "@/lib/retro/connectors/http";

describe("회고 외부 HTTP 경계",()=>{
  it("고정 API 호스트만 허용하며 리다이렉트로 비밀값을 전달하지 않는다",async()=>{
    const fetcher=vi.fn().mockResolvedValue(Response.json({id:1}));
    await expect(connectorJson('https://evil.example/user',{headers:{authorization:'Bearer secret'}},fetcher)).rejects.toThrow('connector_scope_denied');
    for(const url of ['https://team.zendesk.com.evil.test/api','https://user@team.zendesk.com/api','https://team.zendesk.com:8443/api','https://us6.api.mailchimp.com.evil.test/3.0','https://127.0.0.1.zendesk.com/api']) await expect(connectorJson(url,{},fetcher)).rejects.toThrow('connector_scope_denied');
    expect(fetcher).not.toHaveBeenCalled();
    await connectorJson('https://api.github.com/user',{},fetcher);
    expect(fetcher.mock.calls[0][1]).toMatchObject({redirect:'error',cache:'no-store'});
  });
  it("429는 Retry-After를 지킨 후 한 번만 재시도한다",async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(null,{status:429,headers:{'retry-after':'2'}})).mockResolvedValue(Response.json({ok:true}));
    const sleep=vi.fn().mockResolvedValue(undefined);
    expect(await connectorJson('https://api.figma.com/v1/me',{},fetcher,sleep)).toEqual({ok:true});expect(sleep).toHaveBeenCalledWith(2000);expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockReset().mockResolvedValue(new Response(null,{status:429,headers:{'retry-after':'3600'}}));
    await expect(connectorJson('https://api.figma.com/v1/me',{},fetcher,sleep)).rejects.toMatchObject({code:'rate_limited',retryAfterSeconds:3600});expect(fetcher).toHaveBeenCalledOnce();
  });
  it("응답 크기와 오류 본문을 제한한다",async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response('secret error',{status:401}));
    await expect(connectorJson('https://api.github.com/user',{},fetcher)).rejects.toThrow('connector_auth_failed');
    fetcher.mockResolvedValue(new Response('x',{headers:{'content-length':'5000000'}}));
    await expect(connectorJson('https://api.github.com/user',{},fetcher)).rejects.toThrow('connector_response_too_large');
  });
});
