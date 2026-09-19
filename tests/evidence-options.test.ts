import { expect, it } from "vitest";
import { groupEvidenceOptions } from "@/lib/evidence-options";
it('동일 ID만 제거하고 서로 다른 ID의 같은 발언은 유지하며 최신 출처부터 정렬한다',()=>{
 const groups=groupEvidenceOptions([
 {id:'a',sourceId:'old',source:'옛 문서',content:'원문',at:'2026-09-18'},
 {id:'a',sourceId:'old',source:'옛 문서',content:'원문',at:'2026-09-18'},
 {id:'b',sourceId:'old',source:'옛 문서',content:'원문',at:'2026-09-18'},
 {id:'c',sourceId:'new',source:'최근 회의',content:'원문',at:'2026-09-19'},
 ]);
 expect(groups.map(g=>g.source)).toEqual(['최근 회의','옛 문서']);expect(groups.map(g=>g.options.map(o=>o.id))).toEqual([['c'],['a','b']]);
});
it('검색은 출처와 본문을 함께 찾으며 입력 배열과 원문은 바꾸지 않는다',()=>{
 const items=[{id:'a',sourceId:'1',source:'영업 문서',content:'새 계약 조건'}];
 expect(groupEvidenceOptions(items,'영업')[0].options[0].content).toBe('새 계약 조건');
 expect(groupEvidenceOptions(items,'계약')).toHaveLength(1);expect(groupEvidenceOptions(items,'없음')).toEqual([]);
 expect(items).toEqual([{id:'a',sourceId:'1',source:'영업 문서',content:'새 계약 조건'}]);
});
