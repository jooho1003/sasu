import { createRoot } from "react-dom/client";
import AskS4 from "@/components/ask-s4";
import { EvidenceDetail } from "@/components/evidence-detail";
import "@/app/globals.css";

const evidence = location.pathname.includes("/evidence/");
createRoot(document.getElementById("root")!).render(<>
  <p className="m-4 text-sm">격리 화면 검증 · 가상 자료 · 실제 화면 구성 요소</p>
  {evidence ? <EvidenceDetail deptId="dept" id="item" /> : <AskS4 deptId="dept" />}
</>);
