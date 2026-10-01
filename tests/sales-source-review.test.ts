import { describe, expect, it } from "vitest";
import { SalesSourceReviewChoice } from "@/lib/contracts";
import { prepareSalesSourceInputs, buildSalesSourceReview, salesSourceVersions } from "@/lib/sales-source-review";

const ids = [1,2,3,4].map(n => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`);
const rows = ids.map((id,index) => ({ position:index+1,item_id:id,title:"자료",kind:"document",content:"소개\r\n\r\n납기는 확정하지 않습니다.\r\n승인 후 다시 협의합니다.",version:"v" }));
const choice = { topics:[{ topic:"schedule", selections:[{ evidence:3,first_paragraph:2,last_paragraph:2 }] }] };
describe("current sales source paragraph selections", () => {
  it("preserves the entire paragraph including denial and CRLF", () => {
    const inputs=prepareSalesSourceInputs(rows);
    const result=buildSalesSourceReview(choice,inputs,"dept");
    expect(result.topics[0].evidence[0].quote).toBe("납기는 확정하지 않습니다.\r\n승인 후 다시 협의합니다.");
    expect(result.topics[0].evidence[0].role).toBe("new_quote");
    expect(result.topics[0].evidence[0].href).toBe(`/d/dept/evidence/${ids[2]}`);
    expect(result.topics[0].question).toContain("일정");
  });
  it("resolves multi-paragraph ranges without normalizing separators", () => {
    const c={topics:[{topic:"price",selections:[{evidence:1,first_paragraph:1,last_paragraph:2}]}]};
    expect(buildSalesSourceReview(c,prepareSalesSourceInputs(rows),"d").topics[0].evidence[0].quote).toBe(rows[0].content);
  });
  it("requires four unique ordered current inputs", () => {
    for(const invalid of [rows.slice(1),[rows[0],rows[0],rows[2],rows[3]],[rows[1],rows[0],rows[2],rows[3]]])
      expect(()=>prepareSalesSourceInputs(invalid)).toThrow();
  });
  it("rejects all input if any complete document or paragraph exceeds the limit", () => {
    for(const content of ["a".repeat(20001),"a".repeat(4001),Array(81).fill("段").join("\n\n")," "])
      expect(()=>prepareSalesSourceInputs([{...rows[0],content},...rows.slice(1)])).toThrow();
    expect(()=>prepareSalesSourceInputs([{...rows[0],content:"a".repeat(4000)},...rows.slice(1)])).not.toThrow();
  });
  it("rejects invalid, reversed or duplicate ranges and duplicate topics atomically", () => {
    for(const selections of [
      [{evidence:5,first_paragraph:1,last_paragraph:1}],
      [{evidence:1,first_paragraph:0,last_paragraph:1}],
      [{evidence:1,first_paragraph:2,last_paragraph:1}],
      [{evidence:1,first_paragraph:1,last_paragraph:1},{evidence:1,first_paragraph:2,last_paragraph:2}],
    ]) expect(()=>buildSalesSourceReview({topics:[{topic:"price",selections}]},prepareSalesSourceInputs(rows),"d")).toThrow();
    expect(()=>buildSalesSourceReview({topics:[...choice.topics,...choice.topics]},prepareSalesSourceInputs(rows),"d")).toThrow();
  });
  it("does not render topics without citations and refuses a wholly empty result", () => {
    const result=buildSalesSourceReview({topics:[{topic:"contract",selections:[]}]},prepareSalesSourceInputs(rows),"d");
    expect(result).toEqual({status:"refused",topics:[]});
    expect(buildSalesSourceReview({topics:[{topic:"contract",selections:[]},...choice.topics]},prepareSalesSourceInputs(rows),"d").topics).toHaveLength(1);
  });
  it("strictly rejects free model sentences, unknown topics and additional fields", () => {
    for(const invalid of [
      {...choice,summary:"승인 가능합니다."},
      {topics:[{topic:"legal",selections:[]}]},
      {topics:[{topic:"price",question:"할인 승인",selections:[]}]},
      {topics:[{topic:"price",selections:[{evidence:1,first_paragraph:1,last_paragraph:1,quote:"조작"}]}]},
    ]) expect(SalesSourceReviewChoice.safeParse(invalid).success).toBe(false);
    expect(SalesSourceReviewChoice.safeParse(choice).success).toBe(true);
  });
  it("hashes all original UTF8 content so edits invalidate selections", () => {
    expect(salesSourceVersions(rows)).toHaveLength(4);
    expect(salesSourceVersions(rows)[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(salesSourceVersions([{...rows[0],content:rows[0].content+" "},...rows.slice(1)])[0]).not.toBe(salesSourceVersions(rows)[0]);
  });
});
