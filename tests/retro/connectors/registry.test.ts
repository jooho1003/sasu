import { it, expect } from "vitest";
import { parseConnectorConfig } from "@/lib/retro/connectors/registry";
  it("범위는 제공자별 명시한 리소스뿐이며 임의 주소를 받지 않는다",()=>{
    expect(()=>parseConnectorConfig('github',{endpoint:'https://evil.example'})).toThrow();
    expect(()=>parseConnectorConfig('github',{repositories:['../bad']})).toThrow();
    expect(parseConnectorConfig('github',{repositories:['sasu/app']})).toEqual({repositories:['sasu/app']});
    expect(()=>parseConnectorConfig('figma',{repositories:['sasu/app']})).toThrow();
  });
