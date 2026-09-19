import ts from "typescript";

export type Term={term:string;replacement:string;reason:string;allow_in:string[];context?:string};
export type Finding={line:number;kind:"banned"|"english"|"template"|"length"|"style_mix"|"button_noun";text:string;suggestion?:string;blocking:boolean;reason?:string};
export type WordingString={line:number;text:string;context:"jsx"|"literal"|"button"|"error";reason?:string};
const korean=/[가-힣]/;
const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
function matches(file:string,patterns:readonly string[]) {
  return patterns.some(pattern=>new RegExp("^"+pattern.split("**").map(s=>s.split("*").map(escape).join("[^/]*")).join(".*")+"$").test(file.replaceAll("\\","/")));
}

/** Parse syntax, not source lines: strings in code paths and diagnostic output are not UI. */
export function extractStrings(source:string,ext:".tsx"|".ts"):WordingString[] {
  const file=ts.createSourceFile("wording"+ext,source,ts.ScriptTarget.Latest,true,ext===".tsx"?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const reasons=new Map<number,string>(),result:WordingString[]=[];
  function collectComments(node:ts.Node) {
    const ranges=[...(ts.getLeadingCommentRanges(source,node.pos)??[]),...(ts.getTrailingCommentRanges(source,node.end)??[])];
    if(ts.isJsxExpression(node))ranges.push(...(ts.getLeadingCommentRanges(source,node.getStart(file)+1)??[]),...(ts.getTrailingCommentRanges(source,node.getStart(file)+1)??[]));
    for(const range of ranges) {
      const reason=source.slice(range.pos,range.end).match(/\/\/\s*wording-ok:\s*(.*?)(?:\*\/|$)/)?.[1]?.trim();
      if(reason)reasons.set(file.getLineAndCharacterOfPosition(range.pos).line+1,reason);
    }
    for(const child of node.getChildren(file))collectComments(child);
  }
  collectComments(file);
  function context(node:ts.Node):WordingString["context"]|null {
    let kind:WordingString["context"]=ts.isJsxText(node)?"jsx":"literal";
    for(let p=node.parent;p;p=p.parent) {
      if(ts.isImportDeclaration(p)||ts.isExportDeclaration(p)||ts.isImportTypeNode(p))return null;
      if(ts.isCallExpression(p)&&/^console\./.test(p.expression.getText(file)))return null;
      if(ts.isJsxAttribute(p)) {
        const name=p.name.getText(file);
        if(name.startsWith("data-")||["className","href","src","style","role","type","id","key","name","value","download","action","method","aria-controls","aria-labelledby","aria-describedby"].includes(name))return null;
      }
      if(ts.isPropertyAssignment(p)&&["error","message"].includes(p.name.getText(file).replaceAll('"','').replaceAll("'","")))kind="error";
      if(ts.isJsxElement(p)||ts.isJsxSelfClosingElement(p)) {
        const opening=ts.isJsxElement(p)?p.openingElement:p;
        if(opening.tagName.getText(file)==="button" || opening.attributes.properties.some(a=>ts.isJsxAttribute(a)&&((a.name.getText(file)==="role"&&a.initializer?.getText(file)==='"button"')||(a.name.getText(file)==="type"&&a.initializer?.getText(file)==='"submit"'))))kind="button";
      }
    }
    return kind;
  }
  function visit(node:ts.Node) {
    let text:string|undefined;
    if(ts.isJsxText(node))text=node.text;
    else if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))text=node.text;
    else if(ts.isTemplateExpression(node))text=node.head.text+node.templateSpans.map(span=>{
      const expression=span.expression;
      const code=ts.isIdentifier(expression)||ts.isPropertyAccessExpression(expression)?expression.getText(file):"표시값";
      return "${"+code+"}"+span.literal.text;
    }).join("");
    if(text!==undefined) {
      const kind=context(node),clean=text.replace(/\s+/g," ").trim();
      if(kind&&korean.test(clean.replace(/\$\{[^}]*\}/g,""))) {
        const pos=node.getStart(file),line=file.getLineAndCharacterOfPosition(pos).line+1;
        const reason=reasons.get(line);
        result.push({line,text:clean,context:kind,...(reason?{reason}:{})});
      }
      if(ts.isTemplateExpression(node))for(const span of node.templateSpans)visit(span.expression);
      return;
    }
    ts.forEachChild(node,visit);
  }
  visit(file);return result;
}

export function checkStrings(items:WordingString[],terms:Term[],opts:{file:string;styleExempt:boolean;allowEnglish?:{word:string;allow_in:string[]}[]}):Finding[] {
  const output:Finding[]=[],ordered=[...terms].sort((a,b)=>b.term.length-a.term.length);
  const hasFormal=items.some(x=>/(습니다|세요)[.!?]?$/.test(x.text));
  for(const item of items) {
    const add=(kind:Finding["kind"],blocking:boolean,suggestion?:string,text=item.text)=>output.push({line:item.line,kind,text,blocking:blocking&&!item.reason,...(suggestion?{suggestion}:{}),...(item.reason?{reason:item.reason}:{})});
    const display=item.text.replace(/\$\{[^}]*\}/g,"");
    const covered=new Set<number>();
    for(const term of ordered) {
      if(matches(opts.file,term.allow_in))continue;
      const re=new RegExp(term.context||escape(term.term),"g");
      for(const match of display.matchAll(re)) {
        const from=match.index,to=from+match[0].length;
        if(!match[0]||Array.from({length:to-from},(_,i)=>from+i).some(i=>covered.has(i)))continue;
        for(let i=from;i<to;i++)covered.add(i);
        add("banned",true,term.replacement);
      }
    }
    const withoutExtensions=display.replace(/\.[a-z][a-z0-9]{1,9}\b/g,"");
    for(const word of new Set(withoutExtensions.match(/[A-Z]{2,}|\b[A-Za-z]{3,}\b/g)??[])) {
      if(opts.allowEnglish?.some(a=>a.word===word&&matches(opts.file,a.allow_in)))continue;
      add("english",true,"한글로 풀어 쓰세요",word);
    }
    if(/오류가 발생/.test(display)||/\$\{[^{}]*(?:status|state|kind)\s*\}/i.test(item.text))add("template",true,"이름표와 다음 행동을 적으세요");
    if(display.split(/[.!?]|(?<=(?:다|요))\s/).some(s=>s.trim().length>60))add("length",false,"문장을 나누세요");
    if(!opts.styleExempt&&hasFormal&&/(어|아|해|예)요[.!?]?$/.test(display))add("style_mix",false,"합니다·하세요로 끝내세요");
    if(item.context==="button"&&!/\s/.test(display)&&!/(기|하기|보기|받기)$/.test(display)&&!["취소","확인"].includes(display))add("button_noun",false,"하는 일을 적으세요");
  }
  return output;
}
