# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: followup.spec.ts >> desktop followup >> 최근 작업 새로고침은 30초 갱신과 공유하고 팀원에게 목록을 표시하지 않는다
- Location: tests\e2e\followup.spec.ts:1016:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: '무엇이 궁금한가요?' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('heading', { name: '무엇이 궁금한가요?' }) with timeout 5000ms
  - waiting for getByRole('heading', { name: '무엇이 궁금한가요?' })

```

```yaml
- main: 불러오는 중…
```

# Test source

```ts
  219 |         historyUrls.push(request.url!);
  220 |         // Snapshot at request time: a released old-session response must carry
  221 |         // old-session content even after the fixture has switched users.
  222 |         const requestedQuestion = previousQuestion;
  223 |         const before = new URL(request.url!, fixtureOrigin).searchParams.has("before");
  224 |         if (historyMode === "delayed") await new Promise<void>((resolve) => { releaseHistory = resolve; });
  225 |         if (historyMode === "error" || (historyMode === "page-error" && before)) {
  226 |           response.statusCode = 503;
  227 |           response.end(JSON.stringify({ code: "unavailable", error: "질문 기록을 불러오지 못했습니다." }));
  228 |         } else {
  229 |           const first = { id: answerId, question: requestedQuestion, status: "refused", created_at: "2026-10-01T12:00:00Z", parent_id: null };
  230 |           response.end(JSON.stringify({ questions: before ? [first, { ...first, id: olderId, question: "더 오래된 합성 후속 질문", status: "done", parent_id: answerId }] : requestedQuestion ? [first] : [], next: ["pages", "page-error"].includes(historyMode) && !before ? { before: first.created_at, before_id: answerId } : null }));
  231 |         }
  232 |         historyResponses += 1;
  233 |       } else {
  234 |         response.statusCode = 404;
  235 |         response.end(JSON.stringify({ code: "not_found", error: "합성 경로를 찾지 못했습니다." }));
  236 |       }
  237 |     });
  238 |     await new Promise<void>((resolve) => fixtureServer.listen(0, "127.0.0.1", resolve));
  239 |     const address = fixtureServer.address();
  240 |     if (!address || typeof address === "string") throw new Error("fixture_address_missing");
  241 |     fixtureOrigin = `https://127.0.0.1:${address.port}`;
  242 |     const developmentReact = process.env.SASU_DESKTOP_REACT_MODE === "development";
  243 |     execFileSync(developmentReact ? process.execPath : "cmd.exe", developmentReact ? ["tests/e2e/build-development-react.mjs"] : ["/d", "/s", "/c", "npm run build"], {
  244 |       cwd: process.cwd(),
  245 |       env: {
  246 |         ...process.env,
  247 |         SASU_APP_URL: fixtureOrigin,
  248 |         SUPABASE_URL: fixtureOrigin,
  249 |         SUPABASE_ANON_KEY: "synthetic-public-key",
  250 |       },
  251 |       stdio: "inherit",
  252 |     });
  253 |   });
  254 |   test.afterAll(async () => {
  255 |     fixtureServer?.closeAllConnections();
  256 |     if (fixtureServer) await new Promise<void>((resolve, reject) => fixtureServer.close((cause) => cause ? reject(cause) : resolve()));
  257 |     if (tlsDirectory) {
  258 |       if (!tlsDirectory.startsWith(resolve(tmpdir(), "sasu-desktop-tls-"))) throw new Error("unsafe_tls_path");
  259 |       rmSync(tlsDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  260 |     }
  261 |   });
  262 | 
  263 |   async function removeUserData(userData: string): Promise<void> {
  264 |     const absolute = resolve(userData);
  265 |     if (!absolute.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
  266 |     // Windows may retain Chromium handles briefly after Electron exits.
  267 |     await rm(absolute, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  268 |   }
  269 |   async function launch() {
  270 |     const userData = mkdtempSync(resolve(tmpdir(), "sasu-desktop-followup-"));
  271 |     const app = await electron.launch({
  272 |       args: [".", `--user-data-dir=${userData}`],
  273 |       executablePath: resolve(process.cwd(), "node_modules/electron/dist/electron.exe"),
  274 |       env: { ...process.env, SASU_DISABLE_UPDATER: "1", NODE_EXTRA_CA_CERTS: certificatePath },
  275 |     });
  276 |     try {
  277 |       await app.evaluate(async (_electron, pem) => {
  278 |         const tls = process.getBuiltinModule("node:tls") as typeof import("node:tls");
  279 |         tls.setDefaultCACertificates([...tls.getCACertificates(), pem]);
  280 |       }, readFileSync(certificatePath, "utf8"));
  281 |       await app.evaluate(({ session }, pem) => {
  282 |         session.defaultSession.setCertificateVerifyProc((request, callback) => {
  283 |           callback(request.hostname === "127.0.0.1" && request.certificate.data.trim() === pem.trim() ? 0 : -3);
  284 |         });
  285 |       }, readFileSync(certificatePath, "utf8"));
  286 |       await expect.poll(() => app.windows().some((page) => page.url().includes("#panel")) && app.windows().some((page) => page.url().includes("#pet")), { timeout: 30_000 }).toBe(true);
  287 |       const panel = app.windows().find((page) => page.url().includes("#panel"))!;
  288 |       const pet = app.windows().find((page) => page.url().includes("#pet"))!;
  289 |       await expect(panel.getByRole("heading", { name: "사수 시작하기" })).toBeVisible({ timeout: 30_000 });
  290 |       // Rendering may precede main's authorized sender assignment.
  291 |       await expect.poll(async () => panel.evaluate(async () => window.sasu.app.info().then(() => true).catch(() => false))).toBe(true);
  292 |       return { app, panel, pet, userData };
  293 |     } catch (cause) {
  294 |       await app.close();
  295 |       if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
  296 |       await removeUserData(userData);
  297 |       throw cause;
  298 |     }
  299 |   }
  300 | 
  301 |   async function login(panel: Awaited<ReturnType<typeof launch>>["panel"]) {
  302 |     if (process.env.SASU_DESKTOP_REACT_MODE === "development") {
  303 |       await panel.addInitScript(() => {
  304 |         Reflect.set(window, "strictReactBundleType", null);
  305 |         Reflect.set(window, "__REACT_DEVTOOLS_GLOBAL_HOOK__", {
  306 |           supportsFiber: true,
  307 |           inject: (renderer: { bundleType: number }) => { Reflect.set(window, "strictReactBundleType", renderer.bundleType); return 1; },
  308 |           onCommitFiberRoot: (_id: number, root: unknown) => { Reflect.set(window, "strictReactRoot", root); },
  309 |           onCommitFiberUnmount: () => undefined,
  310 |           checkDCE: () => undefined,
  311 |         });
  312 |       });
  313 |     }
  314 |     await panel.evaluate(async (id) => {
  315 |       await window.sasu.auth.verifyCode("synthetic@example.test", "123456");
  316 |       await window.sasu.link.create({ dept_id: id });
  317 |     }, deptId);
  318 |     await panel.reload();
> 319 |     await expect(panel.getByRole("heading", { name: "무엇이 궁금한가요?" })).toBeVisible();
      |                                                                      ^ Error: expect(locator).toBeVisible() failed
  320 |   }
  321 | 
  322 |   async function trackWeb(app: Awaited<ReturnType<typeof launch>>["app"], fail = false) {
  323 |     await app.evaluate(({ shell }, shouldFail) => {
  324 |       Reflect.set(globalThis, "recentWorkOpened", []);
  325 |       shell.openExternal = async (url: string) => {
  326 |         if (shouldFail) throw new Error("합성 웹 열기 실패");
  327 |         (Reflect.get(globalThis, "recentWorkOpened") as string[]).push(url);
  328 |       };
  329 |     }, fail);
  330 |   }
  331 |   const webEvents = (app: Awaited<ReturnType<typeof launch>>["app"]) => app.evaluate(() => Reflect.get(globalThis, "recentWorkOpened") as string[]);
  332 | 
  333 |   function seedDecisionCard() {
  334 |     decisionCards = [{ id: cardId, title: "합성 승인 카드", deadline: null, status: "open" }];
  335 |     cardStatus = "open";
  336 |   }
  337 |   function seedSalesSources() {
  338 |     sourceCandidates = sourceIds.map((item_id, index) => ({ item_id, title: `합성 원문 ${index + 1}`, kind: "document", quote: "합성 인용은 선택창에서 답으로 보여주지 않습니다.", is_principles: index === 3 }));
  339 |   }
  340 |   async function selectSalesSources(panel: Awaited<ReturnType<typeof launch>>["panel"], first = sourceIds[0]) {
  341 |     for (const [label, id] of [["고객 요청", first], ["기존 견적", sourceIds[1]], ["변경 견적", sourceIds[2]], ["원칙", sourceIds[3]]]) {
  342 |       await panel.getByRole("combobox", { name: label, exact: true }).selectOption(id);
  343 |     }
  344 |   }
  345 | 
  346 |   test("sales start 자료 조회는 지연·empty·오류·수동 재조회와 현재 distinct 원칙을 구분한다", async () => {
  347 |     contextRole = "lead"; sourceMode = "delayed";
  348 |     const { app, panel, userData } = await launch();
  349 |     try {
  350 |       await login(panel); await panel.getByRole("button", { name: "일 맡기기", exact: true }).click();
  351 |       if (process.env.SASU_DESKTOP_REACT_MODE === "development") {
  352 |         const replay = await panel.evaluate(() => {
  353 |           type Hook = { memoizedState: unknown; next: Hook | null };
  354 |           type Fiber = { type?: { name?: string }; mode: number; memoizedState: Hook | null; child: Fiber | null; sibling: Fiber | null };
  355 |           const root = Reflect.get(window, "strictReactRoot") as { current: Fiber };
  356 |           const find = (fiber: Fiber | null): Fiber | null => !fiber ? null : fiber.type?.name === "WorkSalesReview" ? fiber : find(fiber.child) ?? find(fiber.sibling);
  357 |           const sales = find(root.current);
  358 |           let cleanupGeneration: number | null = null;
  359 |           for (let hook = sales?.memoizedState; hook; hook = hook.next) {
  360 |             const value = hook.memoizedState as { current?: unknown } | null;
  361 |             if (value && typeof value.current === "number") cleanupGeneration = value.current;
  362 |           }
  363 |           return { bundleType: Reflect.get(window, "strictReactBundleType"), strictEffects: !!sales && (sales.mode & 16) !== 0, cleanupGeneration };
  364 |         });
  365 |         // DevTools observes the actual development renderer and cleanup of its mounted StrictMode subtree.
  366 |         expect(replay).toEqual({ bundleType: 1, strictEffects: true, cleanupGeneration: 1 });
  367 |         console.log("strictmode_actual_replay", replay);
  368 |       }
  369 |       await expect(panel.getByText("자료를 불러오는 중입니다.")).toBeVisible();
  370 |       await expect(panel.getByText("선택할 원문이 없습니다.")).toHaveCount(0);
  371 |       await panel.getByRole("button", { name: "자료 다시 불러오기" }).evaluate((node) => { (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click(); });
  372 |       await expect.poll(() => !!releaseSources).toBe(true); expect(sourceRequests).toBe(1);
  373 |       sourceMode = "error"; releaseSources!();
  374 |       await expect(panel.getByRole("alert")).toContainText("합성 자료 목록을 불러오지 못했습니다.");
  375 |       await expect(panel.getByRole("combobox", { name: "고객 요청", exact: true })).toHaveCount(0);
  376 |       sourceMode = "normal"; await panel.getByRole("button", { name: "자료 다시 불러오기" }).click();
  377 |       await expect(panel.getByText("선택할 원문이 없습니다.")).toBeVisible();
  378 |       seedSalesSources(); await panel.getByRole("button", { name: "자료 다시 불러오기" }).click();
  379 |       await selectSalesSources(panel);
  380 |       await expect(panel.getByRole("combobox", { name: "원칙", exact: true }).locator("option")).toHaveCount(2);
  381 |       const salesSection = panel.locator('section[aria-labelledby="sales-review-title"]');
  382 |       await salesSection.scrollIntoViewIfNeeded();
  383 |       expect(await panel.evaluate(() => window.innerWidth)).toBe(380);
  384 |       expect(await panel.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  385 |       const screenshots = resolve(process.cwd(), "../docs/verification/47-desktop-sales-flow/screenshots");
  386 |       mkdirSync(screenshots, { recursive: true });
  387 |       await panel.screenshot({ path: resolve(screenshots, "sales-form.png") });
  388 |       await salesSection.screenshot({ path: resolve(screenshots, "sales-form-section.png") });
  389 |       await expect(panel.getByText("합성 인용은 선택창에서 답으로 보여주지 않습니다.")).toHaveCount(0);
  390 |       await panel.getByRole("combobox", { name: "고객 요청", exact: true }).selectOption(sourceIds[1]);
  391 |       await panel.getByRole("button", { name: "검토 시작하기", exact: true }).click();
  392 |       await expect(panel.getByText("서로 다른 현재 원문 4건을 골라 주세요.")).toBeVisible(); expect(startBodies).toEqual([]);
  393 |       await selectSalesSources(panel);
  394 |       await panel.getByRole("combobox", { name: "원칙", exact: true }).evaluate((node, value) => {
  395 |         const select = node as HTMLSelectElement;
  396 |         select.add(new Option("합성 비원칙 후보", value)); select.value = value;
  397 |         select.dispatchEvent(new Event("change", { bubbles: true }));
  398 |       }, sourceIds[4]);
  399 |       await expect(panel.getByRole("button", { name: "검토 시작하기", exact: true })).toBeDisabled();
  400 |       await panel.getByRole("button", { name: "검토 시작하기", exact: true }).evaluate((node) => { (node as HTMLButtonElement).click(); });
  401 |       expect(startBodies).toEqual([]);
  402 |       await selectSalesSources(panel); sourceCandidates = sourceCandidates.filter((row) => row.item_id !== sourceIds[0]);
  403 |       await panel.getByRole("button", { name: "자료 다시 불러오기" }).click();
  404 |       await expect(panel.getByRole("button", { name: "검토 시작하기", exact: true })).toBeDisabled();
  405 |       expect(startBodies).toEqual([]);
  406 |       for (const [code, text] of [["lead_only", "팀장만 사용할 수 있습니다."], ["consent_required", "동의한 팀장만 사용할 수 있습니다."], ["demo", "로그인 없이 보는 부서에서는 사용할 수 없습니다."], ["forbidden", "합성 자료 목록을 불러오지 못했습니다."], ["network", "서버에 연결하지 못했습니다."]]) {
  407 |         sourceMode = code; await panel.getByRole("button", { name: "자료 다시 불러오기" }).click();
  408 |         await expect(panel.getByRole("alert")).toContainText(text);
  409 |       }
  410 |     } finally { releaseSources?.(); await app.close(); await removeUserData(userData); }
  411 |   });
  412 | 
  413 |   test("sales start 연타 잠금과 선택별 동일 ID 수동 재시도·새 선택·접수 뒤 중복 금지", async () => {
  414 |     contextRole = "lead"; seedSalesSources(); startMode = "delayedError";
  415 |     const { app, panel, userData } = await launch();
  416 |     try {
  417 |       await login(panel); await panel.getByRole("button", { name: "일 맡기기", exact: true }).click();
  418 |       await selectSalesSources(panel);
  419 |       await panel.getByRole("button", { name: "검토 시작하기", exact: true }).evaluate((node) => { (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click(); });
```