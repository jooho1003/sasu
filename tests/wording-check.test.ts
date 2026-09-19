import { describe, expect, it } from "vitest";
import { checkStrings, extractStrings, type Term } from "@/lib/wording-check";
const terms:Term[]=[{term:"원장",replacement:"결정 기록",reason:"쉬운말",allow_in:["lib/consent.ts"]},{term:"전사",replacement:"받아쓴 글",reason:"쉬운말",allow_in:[],context:"전사(?!원)"}];
const check=(source:string,file="components/example.tsx",styleExempt=false)=>checkStrings(extractStrings(source,".tsx"),terms,{file,styleExempt});
describe('사용자에게 보이는 문구 추출',()=>{
 it('코드·주석·경로·콘솔·속성은 제외하고 버튼과 오류를 구별한다',()=>{
  const source='import x from "한글 경로"; // 원장\nconsole.log("원장 로그"); const r=/원장/; const x=<button className="원장" href="/원장" data-note="원장">원장 보기</button>; const y={error:"다시 시도하세요"};';
  expect(extractStrings(source,'.tsx')).toEqual([expect.objectContaining({text:'원장 보기',context:'button',line:2}),expect.objectContaining({text:'다시 시도하세요',context:'error',line:2})]);
 });
 it('JSX 속성 안내·문자열·템플릿 정적 문구를 추출한다',()=>{
  expect(extractStrings('const x=<input placeholder="질문을 적으세요" aria-label="질문"/>; const y=`현재 ${row.status} 상태입니다`;', '.tsx').map(x=>x.text)).toEqual(['질문을 적으세요','질문','현재 ${row.status} 상태입니다']);
 });
 it('복잡한 템플릿 식의 코드 이름은 검사하지 않고 식 안의 표시 문구는 검사한다',()=>{
  const source='const x=`${({a:"제목"} as Record<string,string>)[key]} 항목`; const y=`결과 ${ok ? "원장" : "기록"}`;';
  const findings=check(source);
  expect(findings.filter(f=>f.kind==='english')).toEqual([]);
  expect(findings.filter(f=>f.kind==='banned')).toHaveLength(1);
  expect(extractStrings('const url=`/api/${encodeURIComponent(dept)}/settings`;','.ts')).toEqual([]);
  expect(check('const b=<button onClick={()=>setMessage("원장에 남겼습니다")}>남기기</button>;').filter(f=>f.kind==='banned')).toHaveLength(1);
 });
});
describe('쉬운말 검사',()=>{
 it('금지어·파일 예외·동음이의어·긴 용어 우선',()=>{
  expect(check('const x="원장을 확인하세요";')[0]).toMatchObject({kind:'banned',blocking:true,suggestion:'결정 기록'});
  expect(check('const x="원장을 확인하세요";','lib/consent.ts')).toEqual([]);
  expect(check('const x="전사원이 확인했습니다";')).toEqual([]);
  const result=checkStrings(extractStrings('const x="결정 원장";','.ts'),[...terms,{term:'결정 원장',replacement:'결정 기록',reason:'메뉴',allow_in:[]}],{file:'a.ts',styleExempt:false});expect(result).toHaveLength(1);
 });
 it('한글 안 영문은 차단하고 소문자 점 확장자·파일 한정 허용은 통과한다',()=>{
  expect(check('const x="Slack에 PDF 자료를 올립니다";').filter(x=>x.kind==='english')).toHaveLength(2);
  expect(check('const x=".pdf 파일을 올립니다";')).toEqual([]);
  expect(checkStrings(extractStrings('const x="Slack 연결";','.ts'),terms,{file:'admin.ts',styleExempt:false,allowEnglish:[{word:'Slack',allow_in:['admin.ts']}]})).toEqual([]);
  expect(check('const x="hello";')).toEqual([]);
 });
 it('원시 상태 템플릿과 막연한 오류를 차단한다',()=>{
  expect(check('const x=`현재 ${row.status} 상태입니다`;').some(x=>x.kind==='template')).toBe(true);
  expect(check('const x=`현재 ${label("cardStatus", row.status)} 상태입니다`;')).toEqual([]);
  expect(check('const x="오류가 발생했습니다";').some(x=>x.kind==='template')).toBe(true);
 });
 it('긴 문장·혼용·명사 버튼은 경고이며 예외가 가능하다',()=>{
  expect(check('const x="'+ '가'.repeat(61)+'입니다";')[0]).toMatchObject({kind:'length',blocking:false});
  expect(check('const a="괜찮아요"; const b="확인했습니다";').some(x=>x.kind==='style_mix')).toBe(true);
  expect(check('const a="괜찮아요"; const b="확인했습니다";','npc.tsx',true)).toEqual([]);
  expect(check('const a=<button>설정</button>;')[0]).toMatchObject({kind:'button_noun',blocking:false});
  expect(check('const a=<><button>확인</button><button>취소</button><button>설정하기</button></>;')).toEqual([]);
 });
 it('같은 줄의 이유 있는 예외만 차단을 경고로 내린다',()=>{
  expect(check('const x="원장"; // wording-ok: 원문을 그대로 표시')[0]).toMatchObject({blocking:false,reason:'원문을 그대로 표시'});
  expect(check('const x="원장"; // wording-ok:')[0].blocking).toBe(true);
  expect(check('// wording-ok: 다른 줄\nconst x="원장";')[0].blocking).toBe(true);
  expect(check('const x="원장 // wording-ok: 이것은 문자열";')[0].blocking).toBe(true);
  expect(check('const x=<><p>원장</p>{/* // wording-ok: 보존하는 원문 */}</>;')[0]).toMatchObject({blocking:false,reason:'보존하는 원문'});
 });
});
