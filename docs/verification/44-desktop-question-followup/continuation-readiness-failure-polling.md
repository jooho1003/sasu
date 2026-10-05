# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: followup.spec.ts >> desktop followup >> 새 질문 실패 후 이전 답의 취소된 폴링은 기록 안내로 끝난다
- Location: tests\e2e\followup.spec.ts:1178:3

# Error details

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '질문하기', exact: true })
    - locator resolved to <button>질문하기</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - performing click action

```

# Test source

```ts
  1084 |     try {
  1085 |       await trackWeb(app); await login(panel);
  1086 |       for (const logout of [false, true]) {
  1087 |         releaseInbox = null; inboxMode = "delayed";
  1088 |         await panel.getByRole("button", { name: "일 맡기기", exact: true }).click();
  1089 |         await panel.getByRole("button", { name: /늦은 합성 자료/ }).click();
  1090 |         await expect.poll(() => !!releaseInbox).toBe(true);
  1091 |         await panel.getByRole("button", { name: "설정", exact: true }).click();
  1092 |         if (logout) await panel.getByRole("button", { name: "로그아웃하기" }).click();
  1093 |         inboxMode = "normal"; releaseInbox!();
  1094 |         await panel.evaluate(async () => window.sasu.inbox.get().catch(() => null));
  1095 |         expect(await webEvents(app)).toEqual([]);
  1096 |         expect(await panel.evaluate(async () => (await window.sasu.settings.get()).seen)).not.toContain(reviewId);
  1097 |       }
  1098 |     } finally {
  1099 |       releaseInbox?.();
  1100 |       await app.close();
  1101 |       if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
  1102 |       await removeUserData(userData);
  1103 |     }
  1104 |   });
  1105 | 
  1106 |   test("질문 이력에서 이어 묻기와 새 질문 전환은 부모와 초안을 보존한다", async () => {
  1107 |     previousQuestion = "합성 이전 질문의 승인 기준은 무엇인가요?";
  1108 |     const original = previousQuestion;
  1109 |     const { app, panel, userData } = await launch();
  1110 |     try {
  1111 |       await login(panel);
  1112 |       await panel.getByRole("button", { name: "기록", exact: true }).click();
  1113 |       await expect(panel.getByRole("button", { name: new RegExp(original) })).toBeVisible();
  1114 |       expect(historyRequests).toBe(1);
  1115 |       await panel.getByRole("button", { name: new RegExp(original) }).click();
  1116 |       await expect(panel.getByText(original, { exact: true })).toBeVisible();
  1117 |       await panel.getByRole("button", { name: "이어 묻기", exact: true }).click();
  1118 |       await expect(panel.getByPlaceholder("질문을 적어 주세요.")).toBeFocused();
  1119 |       const draft = "승인 기준에서 예외는 어떻게 판단하나요?";
  1120 |       await panel.getByPlaceholder("질문을 적어 주세요.").fill(draft);
  1121 |       askMode = "forbidden";
  1122 |       await panel.getByRole("button", { name: "질문하기", exact: true }).dblclick();
  1123 |       await expect(panel.getByText(/이 질문을 이어갈 수 없습니다/)).toBeVisible();
  1124 |       expect(askBodies).toEqual([{ question: draft, parent_id: answerId }]);
  1125 |       await expect(panel.getByPlaceholder("질문을 적어 주세요.")).toHaveValue(draft);
  1126 |       await expect(panel.getByText("이 질문에 이어 묻습니다.")).toBeVisible();
  1127 |       const screenshots = resolve(process.cwd(), "../docs/verification/44-desktop-question-followup/screenshots");
  1128 |       mkdirSync(screenshots, { recursive: true });
  1129 |       await panel.screenshot({ path: resolve(screenshots, "followup-forbidden.png") });
  1130 |       askMode = "accepted";
  1131 |       await panel.getByRole("button", { name: "질문하기", exact: true }).click();
  1132 |       await expect(panel.getByText("근거가 부족해 답하지 못했습니다.")).toBeVisible();
  1133 |       expect(askBodies[1]).toEqual({ question: draft, parent_id: answerId });
  1134 |       await panel.getByRole("button", { name: "이어 묻기", exact: true }).click();
  1135 |       await panel.getByPlaceholder("질문을 적어 주세요.").fill("이번에는 별개의 새 질문입니다.");
  1136 |       await panel.getByRole("button", { name: "새 질문으로 시작" }).click();
  1137 |       await expect(panel.getByPlaceholder("질문을 적어 주세요.")).toHaveValue("이번에는 별개의 새 질문입니다.");
  1138 |       await expect(panel.getByText("이 질문에 이어 묻습니다.")).toHaveCount(0);
  1139 |       await panel.getByRole("button", { name: "질문하기", exact: true }).click();
  1140 |       await expect.poll(() => askBodies.length).toBe(3);
  1141 |       expect(askBodies[2].parent_id).toBeNull();
  1142 |     } finally {
  1143 |       await app.close();
  1144 |       if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
  1145 |       await removeUserData(userData);
  1146 |     }
  1147 |   });
  1148 | 
  1149 |   test("질문 이력은 오류 재시도·빈 상태·중복 없는 페이지와 현재 권한을 표시한다", async () => {
  1150 |     historyMode = "error";
  1151 |     const { app, panel, userData } = await launch();
  1152 |     try {
  1153 |       await login(panel);
  1154 |       await panel.getByRole("button", { name: "기록", exact: true }).click();
  1155 |       await expect(panel.getByText("질문 기록을 불러오지 못했습니다.")).toBeVisible();
  1156 |       await expect(panel.getByText("아직 질문 기록이 없습니다.")).toHaveCount(0);
  1157 |       historyMode = "normal";
  1158 |       await panel.getByRole("button", { name: "기록 불러오기" }).click();
  1159 |       await expect(panel.getByText("아직 질문 기록이 없습니다.")).toBeVisible();
  1160 |       historyMode = "pages"; previousQuestion = "다시 여는 합성 질문입니다.";
  1161 |       await panel.getByRole("button", { name: "기록 불러오기" }).click();
  1162 |       await expect(panel.getByText(/근거 부족/)).toBeVisible();
  1163 |       await panel.getByRole("button", { name: "더 보기" }).click();
  1164 |       await expect(panel.getByRole("button", { name: /더 오래된 합성 후속 질문/ })).toBeVisible();
  1165 |       await expect(panel.getByRole("button", { name: /다시 여는 합성 질문입니다/ })).toHaveCount(1);
  1166 |       await expect(panel.getByRole("button", { name: "더 보기" })).toHaveCount(0);
  1167 |       answerMode = "forbidden";
  1168 |       await panel.getByRole("button", { name: /다시 여는 합성 질문입니다/ }).click();
  1169 |       await expect(panel.getByText(/답을 확인할 권한이 없습니다/)).toBeVisible();
  1170 |       await expect(panel.getByRole("heading", { name: "지난 질문" })).toBeVisible();
  1171 |     } finally {
  1172 |       await app.close();
  1173 |       if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
  1174 |       await removeUserData(userData);
  1175 |     }
  1176 |   });
  1177 | 
  1178 |   test("새 질문 실패 후 이전 답의 취소된 폴링은 기록 안내로 끝난다", async () => {
  1179 |     answerMode = "pending";
  1180 |     const { app, panel, userData } = await launch();
  1181 |     try {
  1182 |       await login(panel);
  1183 |       await panel.getByPlaceholder("질문을 적어 주세요.").fill("아직 처리 중인 첫 번째 합성 질문");
> 1184 |       await panel.getByRole("button", { name: "질문하기", exact: true }).click();
       |                                                                      ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
  1185 |       await expect(panel.getByText("답을 찾는 중입니다.")).toBeVisible();
  1186 |       askMode = "forbidden";
  1187 |       await panel.getByPlaceholder("질문을 적어 주세요.").fill("실패하는 두 번째 합성 질문입니다.");
  1188 |       await panel.getByRole("button", { name: "질문하기", exact: true }).click();
  1189 |       await expect(panel.getByText(/이 질문을 이어갈 수 없습니다/)).toBeVisible();
  1190 |       await expect(panel.getByText("답 확인을 멈췄습니다. 기록에서 다시 확인해 주세요.")).toBeVisible();
  1191 |       await expect(panel.getByText("답을 찾는 중입니다.")).toHaveCount(0);
  1192 |       await expect(panel.getByPlaceholder("질문을 적어 주세요.")).toHaveValue("실패하는 두 번째 합성 질문입니다.");
  1193 |     } finally {
  1194 |       await app.close();
  1195 |       if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
  1196 |       await removeUserData(userData);
  1197 |     }
  1198 |   });
  1199 | 
  1200 |   test("완료 답의 인용을 열고 오프라인으로 이어 묻기 후 부모를 유지해 전송한다", async () => {
  1201 |     answerMode = "done"; previousQuestion = "완료된 합성 질문의 예외 승인 기준";
  1202 |     const { app, panel, userData } = await launch();
  1203 |     try {
  1204 |       await login(panel);
  1205 |       await panel.getByRole("button", { name: "기록", exact: true }).click();
  1206 |       await panel.getByRole("button", { name: /완료된 합성 질문/ }).click();
  1207 |       await expect(panel.getByText("합성 원칙에 따라 팀장 승인이 필요합니다.")).toBeVisible();
  1208 |       await expect(panel.getByText("예외는 팀장 승인 후 진행한다.")).toBeVisible();
  1209 |       await panel.getByRole("button", { name: "이어 묻기", exact: true }).click();
  1210 |       const draft = "오프라인에서 이어 묻는 합성 예외 승인 질문";
  1211 |       await panel.getByPlaceholder("질문을 적어 주세요.").fill(draft);
  1212 |       askMode = "offline";
  1213 |       await panel.getByRole("button", { name: "질문하기", exact: true }).click();
  1214 |       await expect(panel.getByText("연결되면 보낼게요.")).toBeVisible();
  1215 |       await expect(panel.getByPlaceholder("질문을 적어 주세요.")).toHaveValue("");
  1216 |       await expect(panel.getByText("이 질문에 이어 묻습니다.")).toHaveCount(0);
  1217 |       const outbox = resolve(userData, "outbox.bin");
  1218 |       expect(readFileSync(outbox).includes(Buffer.from(draft))).toBe(false);
  1219 |       const postsBeforeReconnect = askBodies.length;
  1220 |       askMode = "accepted";
  1221 |       await panel.evaluate(async () => window.sasu.inbox.get());
  1222 |       await expect.poll(() => askBodies.length).toBe(postsBeforeReconnect + 1);
  1223 |       expect(askBodies.at(-1)).toEqual({ question: draft, parent_id: answerId });
  1224 |       expect(askBodies.every((body) => body.parent_id === answerId)).toBe(true);
  1225 |     } finally {
  1226 |       await app.close();
  1227 |       if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
  1228 |       await removeUserData(userData);
  1229 |     }
  1230 |   });
  1231 | 
  1232 |   test("질문 이력의 늦은 목록과 상세 응답은 떠난 화면을 바꾸지 않는다", async () => {
  1233 |     historyMode = "delayed"; previousQuestion = "늦게 도착하는 합성 질문입니다.";
  1234 |     const { app, panel, userData } = await launch();
  1235 |     try {
  1236 |       await login(panel);
  1237 |       await panel.getByRole("button", { name: "기록", exact: true }).click();
  1238 |       await expect.poll(() => !!releaseHistory).toBe(true);
  1239 |       await panel.getByRole("button", { name: "질문", exact: true }).click();
  1240 |       releaseHistory!(); historyMode = "normal";
  1241 |       await panel.getByRole("button", { name: "기록", exact: true }).click();
  1242 |       await expect(panel.getByRole("button", { name: /늦게 도착하는 합성 질문/ })).toBeVisible();
  1243 |       answerMode = "delayed";
  1244 |       await panel.getByRole("button", { name: /늦게 도착하는 합성 질문/ }).click();
  1245 |       await expect.poll(() => !!releaseAnswer).toBe(true);
  1246 |       await panel.getByRole("button", { name: "설정", exact: true }).click();
  1247 |       releaseAnswer!();
  1248 |       await expect(panel.getByRole("button", { name: "로그아웃하기" })).toBeVisible();
  1249 |       await panel.getByRole("button", { name: "질문", exact: true }).click();
  1250 |       await expect(panel.getByText("근거가 부족해 답하지 못했습니다.")).toHaveCount(0);
  1251 |     } finally {
  1252 |       releaseHistory?.(); releaseAnswer?.();
  1253 |       await app.close();
  1254 |       if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
  1255 |       await removeUserData(userData);
  1256 |     }
  1257 |   });
  1258 | 
  1259 |   test("질문 한도 429는 이어 묻기 초안·부모를 보존하고 보관·자동 재전송하지 않는다", async () => {
  1260 |     previousQuestion = "질문 한도 테스트의 합성 부모 질문입니다.";
  1261 |     const { app, panel, userData } = await launch();
  1262 |     try {
  1263 |       await login(panel);
  1264 |       await panel.getByRole("button", { name: "기록", exact: true }).click();
  1265 |       await panel.getByRole("button", { name: /질문 한도 테스트의 합성 부모/ }).click();
  1266 |       await panel.getByRole("button", { name: "이어 묻기", exact: true }).click();
  1267 |       const draft = "한도를 넘긴 합성 후속 질문을 보존해 주세요.";
  1268 |       await panel.getByLabel("질문 내용").fill(draft);
  1269 |       askMode = "limit";
  1270 |       await panel.getByRole("button", { name: "질문하기", exact: true }).click();
  1271 |       await expect(panel.getByText("오늘 질문 한도를 모두 사용했습니다.")).toBeVisible();
  1272 |       await expect(panel.getByLabel("질문 내용")).toHaveValue(draft);
  1273 |       await expect(panel.getByText("이 질문에 이어 묻습니다.")).toBeVisible();
  1274 |       expect(askBodies).toEqual([{ question: draft, parent_id: answerId }]);
  1275 |       expect((await panel.evaluate(async () => window.sasu.inbox.get())).outbox_count).toBe(0);
  1276 |       expect(askBodies).toHaveLength(1);
  1277 |       expect(existsSync(resolve(userData, "outbox.bin"))).toBe(false);
  1278 |       const screenshots = resolve(process.cwd(), "../docs/verification/44-desktop-question-followup/screenshots");
  1279 |       mkdirSync(screenshots, { recursive: true });
  1280 |       await panel.screenshot({ path: resolve(screenshots, "followup-429.png") });
  1281 |       askMode = "accepted";
  1282 |       await panel.getByRole("button", { name: "질문하기", exact: true }).click();
  1283 |       await expect.poll(() => askBodies.length).toBe(2);
  1284 |       expect(askBodies[1]).toEqual({ question: draft, parent_id: answerId });
```