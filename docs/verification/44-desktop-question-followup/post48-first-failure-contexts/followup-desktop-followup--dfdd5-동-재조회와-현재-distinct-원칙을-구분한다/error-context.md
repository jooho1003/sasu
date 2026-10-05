# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: followup.spec.ts >> desktop followup >> sales start 자료 조회는 지연·empty·오류·수동 재조회와 현재 distinct 원칙을 구분한다
- Location: tests\e2e\followup.spec.ts:356:3

# Error details

```
TimeoutError: page.screenshot: Timeout 30000ms exceeded.
Call log:
  - taking page screenshot
  - waiting for fonts to load...
  - fonts loaded

```

# Test source

```ts
  297 |       await expect(panel.getByRole("heading", { name: "사수 시작하기" })).toBeVisible({ timeout: 30_000 });
  298 |       // Rendering may precede main's authorized sender assignment.
  299 |       await expect.poll(async () => panel.evaluate(async () => window.sasu.app.info().then(() => true).catch(() => false))).toBe(true);
  300 |       return { app, panel, pet, userData };
  301 |     } catch (cause) {
  302 |       await app.close();
  303 |       if (!userData.startsWith(resolve(tmpdir(), "sasu-desktop-followup-"))) throw new Error("unsafe_temp_path");
  304 |       await removeUserData(userData);
  305 |       throw cause;
  306 |     }
  307 |   }
  308 | 
  309 |   async function login(panel: Awaited<ReturnType<typeof launch>>["panel"]) {
  310 |     if (process.env.SASU_DESKTOP_REACT_MODE === "development") {
  311 |       await panel.addInitScript(() => {
  312 |         Reflect.set(window, "strictReactBundleType", null);
  313 |         Reflect.set(window, "__REACT_DEVTOOLS_GLOBAL_HOOK__", {
  314 |           supportsFiber: true,
  315 |           inject: (renderer: { bundleType: number }) => { Reflect.set(window, "strictReactBundleType", renderer.bundleType); return 1; },
  316 |           onCommitFiberRoot: (_id: number, root: unknown) => { Reflect.set(window, "strictReactRoot", root); },
  317 |           onCommitFiberUnmount: () => undefined,
  318 |           checkDCE: () => undefined,
  319 |         });
  320 |       });
  321 |     }
  322 |     await panel.evaluate(async (id) => {
  323 |       await window.sasu.auth.verifyCode("synthetic@example.test", "123456");
  324 |       await window.sasu.link.create({ dept_id: id });
  325 |     }, deptId);
  326 |     await panel.reload();
  327 |     // Match launch's bounded readiness wait; keep behavior assertions at their
  328 |     // existing timeouts even when a loaded Windows host delays app startup.
  329 |     await expect(panel.getByRole("heading", { name: "무엇이 궁금한가요?" })).toBeVisible({ timeout: 30_000 });
  330 |   }
  331 | 
  332 |   async function trackWeb(app: Awaited<ReturnType<typeof launch>>["app"], fail = false) {
  333 |     await app.evaluate(({ shell }, shouldFail) => {
  334 |       Reflect.set(globalThis, "recentWorkOpened", []);
  335 |       shell.openExternal = async (url: string) => {
  336 |         if (shouldFail) throw new Error("합성 웹 열기 실패");
  337 |         (Reflect.get(globalThis, "recentWorkOpened") as string[]).push(url);
  338 |       };
  339 |     }, fail);
  340 |   }
  341 |   const webEvents = (app: Awaited<ReturnType<typeof launch>>["app"]) => app.evaluate(() => Reflect.get(globalThis, "recentWorkOpened") as string[]);
  342 | 
  343 |   function seedDecisionCard() {
  344 |     decisionCards = [{ id: cardId, title: "합성 승인 카드", deadline: null, status: "open" }];
  345 |     cardStatus = "open";
  346 |   }
  347 |   function seedSalesSources() {
  348 |     sourceCandidates = sourceIds.map((item_id, index) => ({ item_id, title: `합성 원문 ${index + 1}`, kind: "document", quote: "합성 인용은 선택창에서 답으로 보여주지 않습니다.", is_principles: index === 3 }));
  349 |   }
  350 |   async function selectSalesSources(panel: Awaited<ReturnType<typeof launch>>["panel"], first = sourceIds[0]) {
  351 |     for (const [label, id] of [["고객 요청", first], ["기존 견적", sourceIds[1]], ["변경 견적", sourceIds[2]], ["원칙", sourceIds[3]]]) {
  352 |       await panel.getByRole("combobox", { name: label, exact: true }).selectOption(id);
  353 |     }
  354 |   }
  355 | 
  356 |   test("sales start 자료 조회는 지연·empty·오류·수동 재조회와 현재 distinct 원칙을 구분한다", async () => {
  357 |     contextRole = "lead"; sourceMode = "delayed";
  358 |     const { app, panel, userData } = await launch();
  359 |     try {
  360 |       await login(panel); await panel.getByRole("button", { name: "일 맡기기", exact: true }).click();
  361 |       if (process.env.SASU_DESKTOP_REACT_MODE === "development") {
  362 |         const replay = await panel.evaluate(() => {
  363 |           type Hook = { memoizedState: unknown; next: Hook | null };
  364 |           type Fiber = { type?: { name?: string }; mode: number; memoizedState: Hook | null; child: Fiber | null; sibling: Fiber | null };
  365 |           const root = Reflect.get(window, "strictReactRoot") as { current: Fiber };
  366 |           const find = (fiber: Fiber | null): Fiber | null => !fiber ? null : fiber.type?.name === "WorkSalesReview" ? fiber : find(fiber.child) ?? find(fiber.sibling);
  367 |           const sales = find(root.current);
  368 |           let cleanupGeneration: number | null = null;
  369 |           for (let hook = sales?.memoizedState; hook; hook = hook.next) {
  370 |             const value = hook.memoizedState as { current?: unknown } | null;
  371 |             if (value && typeof value.current === "number") cleanupGeneration = value.current;
  372 |           }
  373 |           return { bundleType: Reflect.get(window, "strictReactBundleType"), strictEffects: !!sales && (sales.mode & 16) !== 0, cleanupGeneration };
  374 |         });
  375 |         // DevTools observes the actual development renderer and cleanup of its mounted StrictMode subtree.
  376 |         expect(replay).toEqual({ bundleType: 1, strictEffects: true, cleanupGeneration: 1 });
  377 |         console.log("strictmode_actual_replay", replay);
  378 |       }
  379 |       await expect(panel.getByText("자료를 불러오는 중입니다.")).toBeVisible();
  380 |       await expect(panel.getByText("선택할 원문이 없습니다.")).toHaveCount(0);
  381 |       await panel.getByRole("button", { name: "자료 다시 불러오기" }).evaluate((node) => { (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click(); });
  382 |       await expect.poll(() => !!releaseSources).toBe(true); expect(sourceRequests).toBe(1);
  383 |       sourceMode = "error"; releaseSources!();
  384 |       await expect(panel.getByRole("alert")).toContainText("합성 자료 목록을 불러오지 못했습니다.");
  385 |       await expect(panel.getByRole("combobox", { name: "고객 요청", exact: true })).toHaveCount(0);
  386 |       sourceMode = "normal"; await panel.getByRole("button", { name: "자료 다시 불러오기" }).click();
  387 |       await expect(panel.getByText("선택할 원문이 없습니다.")).toBeVisible();
  388 |       seedSalesSources(); await panel.getByRole("button", { name: "자료 다시 불러오기" }).click();
  389 |       await selectSalesSources(panel);
  390 |       await expect(panel.getByRole("combobox", { name: "원칙", exact: true }).locator("option")).toHaveCount(2);
  391 |       const salesSection = panel.locator('section[aria-labelledby="sales-review-title"]');
  392 |       await salesSection.scrollIntoViewIfNeeded();
  393 |       expect(await panel.evaluate(() => window.innerWidth)).toBe(380);
  394 |       expect(await panel.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  395 |       const screenshots = resolve(process.cwd(), "../docs/verification/47-desktop-sales-flow/screenshots");
  396 |       mkdirSync(screenshots, { recursive: true });
> 397 |       await panel.screenshot({ path: resolve(screenshots, "sales-form.png") });
      |                   ^ TimeoutError: page.screenshot: Timeout 30000ms exceeded.
  398 |       await salesSection.screenshot({ path: resolve(screenshots, "sales-form-section.png") });
  399 |       await expect(panel.getByText("합성 인용은 선택창에서 답으로 보여주지 않습니다.")).toHaveCount(0);
  400 |       await panel.getByRole("combobox", { name: "고객 요청", exact: true }).selectOption(sourceIds[1]);
  401 |       await panel.getByRole("button", { name: "검토 시작하기", exact: true }).click();
  402 |       await expect(panel.getByText("서로 다른 현재 원문 4건을 골라 주세요.")).toBeVisible(); expect(startBodies).toEqual([]);
  403 |       await selectSalesSources(panel);
  404 |       await panel.getByRole("combobox", { name: "원칙", exact: true }).evaluate((node, value) => {
  405 |         const select = node as HTMLSelectElement;
  406 |         select.add(new Option("합성 비원칙 후보", value)); select.value = value;
  407 |         select.dispatchEvent(new Event("change", { bubbles: true }));
  408 |       }, sourceIds[4]);
  409 |       await expect(panel.getByRole("button", { name: "검토 시작하기", exact: true })).toBeDisabled();
  410 |       await panel.getByRole("button", { name: "검토 시작하기", exact: true }).evaluate((node) => { (node as HTMLButtonElement).click(); });
  411 |       expect(startBodies).toEqual([]);
  412 |       await selectSalesSources(panel); sourceCandidates = sourceCandidates.filter((row) => row.item_id !== sourceIds[0]);
  413 |       await panel.getByRole("button", { name: "자료 다시 불러오기" }).click();
  414 |       await expect(panel.getByRole("button", { name: "검토 시작하기", exact: true })).toBeDisabled();
  415 |       expect(startBodies).toEqual([]);
  416 |       for (const [code, text] of [["lead_only", "팀장만 사용할 수 있습니다."], ["consent_required", "동의한 팀장만 사용할 수 있습니다."], ["demo", "로그인 없이 보는 부서에서는 사용할 수 없습니다."], ["forbidden", "합성 자료 목록을 불러오지 못했습니다."], ["network", "서버에 연결하지 못했습니다."]]) {
  417 |         sourceMode = code; await panel.getByRole("button", { name: "자료 다시 불러오기" }).click();
  418 |         await expect(panel.getByRole("alert")).toContainText(text);
  419 |       }
  420 |     } finally { releaseSources?.(); await app.close(); await removeUserData(userData); }
  421 |   });
  422 | 
  423 |   test("sales start 연타 잠금과 선택별 동일 ID 수동 재시도·새 선택·접수 뒤 중복 금지", async () => {
  424 |     contextRole = "lead"; seedSalesSources(); startMode = "delayedError";
  425 |     const { app, panel, userData } = await launch();
  426 |     try {
  427 |       await login(panel); await panel.getByRole("button", { name: "일 맡기기", exact: true }).click();
  428 |       await selectSalesSources(panel);
  429 |       await panel.getByRole("button", { name: "검토 시작하기", exact: true }).evaluate((node) => { (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click(); });
  430 |       await expect.poll(() => !!releaseStart).toBe(true); expect(startBodies.length).toBe(1);
  431 |       await expect(panel.getByText("검토를 시작하는 중입니다.")).toBeVisible();
  432 |       await expect(panel.getByRole("combobox", { name: "고객 요청", exact: true })).toBeDisabled();
  433 |       await expect(panel.getByRole("button", { name: "자료 다시 불러오기" })).toBeDisabled();
  434 |       releaseStart!(); await expect(panel.getByText("합성 검토 시작을 처리하지 못했습니다.")).toBeVisible();
  435 |       await expect(panel.getByRole("combobox", { name: "고객 요청", exact: true })).toHaveValue(sourceIds[0]);
  436 |       await panel.waitForTimeout(250); expect(startBodies.length).toBe(1);
  437 |       for (const code of ["error", "lead_only", "consent_required", "demo", "forbidden", "network"]) {
  438 |         await panel.getByRole("combobox", { name: "고객 요청", exact: true }).selectOption(sourceIds[0]);
  439 |         startMode = code; await panel.getByRole("button", { name: "검토 시작하기", exact: true }).click();
  440 |         await expect.poll(() => startBodies.length).toBeGreaterThan(1);
  441 |         await expect(panel.getByRole("button", { name: "검토 시작하기", exact: true })).toBeEnabled();
  442 |         expect(startBodies.at(-1)?.request_id).toBe(startBodies[0].request_id);
  443 |       }
  444 |       startMode = "normal"; await selectSalesSources(panel, sourceIds[4]);
  445 |       await panel.getByRole("button", { name: "검토 시작하기", exact: true }).click();
  446 |       await expect(panel.getByText("검토를 준비하고 있습니다.")).toBeVisible();
  447 |       expect(startBodies.at(-1)?.request_id).not.toBe(startBodies[0].request_id);
  448 |       expect(Object.keys(startBodies.at(-1)!).sort()).toEqual(["new_quote_item_id", "old_quote_item_id", "policy_item_id", "request_id", "request_item_id"]);
  449 |       const requests = startBodies.length;
  450 |       await panel.getByRole("button", { name: "검토 시작하기", exact: true }).evaluate((node) => { (node as HTMLButtonElement).click(); });
  451 |       await expect(panel.getByRole("combobox", { name: "고객 요청", exact: true })).toBeDisabled();
  452 |       expect(startBodies.length).toBe(requests);
  453 |     } finally { releaseStart?.(); await app.close(); await removeUserData(userData); }
  454 |   });
  455 | 
  456 |   test("sales start source_unavailable은 후보를 숨기고 수동 재검사 뒤 같은 선택을 보존한다", async () => {
  457 |     contextRole = "lead"; seedSalesSources(); startMode = "source_unavailable";
  458 |     const { app, panel, userData } = await launch();
  459 |     try {
  460 |       await login(panel); await panel.getByRole("button", { name: "일 맡기기", exact: true }).click(); await selectSalesSources(panel);
  461 |       await panel.getByRole("button", { name: "검토 시작하기", exact: true }).click();
  462 |       await expect(panel.getByRole("combobox", { name: "고객 요청", exact: true })).toHaveCount(0);
  463 |       await expect(panel.getByRole("alert")).toContainText("합성 검토 시작을 처리하지 못했습니다.");
  464 |       startMode = "normal"; await panel.getByRole("button", { name: "자료 다시 불러오기" }).click();
  465 |       await expect(panel.getByRole("combobox", { name: "고객 요청", exact: true })).toHaveValue(sourceIds[0]);
  466 |       await panel.getByRole("button", { name: "검토 시작하기", exact: true }).click();
  467 |       await expect(panel.getByText("검토를 준비하고 있습니다.")).toBeVisible();
  468 |       expect(startBodies[1].request_id).toBe(startBodies[0].request_id);
  469 |     } finally { await app.close(); await removeUserData(userData); }
  470 |   });
  471 | 
  472 |   for (const exit of ["other", "same", "logout"] as const) {
  473 |     test(`sales start 자료·시작 늦은 응답은 ${exit} 이탈 뒤 안내·task를 바꾸지 않는다`, async () => {
  474 |       contextRole = "lead"; seedSalesSources(); sourceMode = "delayedLead";
  475 |       const { app, panel, userData } = await launch();
  476 |       const leave = async () => {
  477 |         if (exit === "logout") await panel.evaluate(() => window.sasu.auth.signOut());
  478 |         else await panel.getByRole("button", { name: exit === "same" ? "일 맡기기" : "질문", exact: true }).click();
  479 |       };
  480 |       try {
  481 |         await login(panel); await panel.getByRole("button", { name: "일 맡기기", exact: true }).click();
  482 |         await expect.poll(() => !!releaseSources).toBe(true);
  483 |         const oldReleaseSources = releaseSources!;
  484 |         sourceMode = "normal"; await leave(); oldReleaseSources();
  485 |         await panel.waitForTimeout(150);
  486 |         await expect(panel.locator(".notice")).toHaveCount(0);
  487 |         sourceMode = "normal";
  488 |         if (exit === "logout") await login(panel);
  489 |         await panel.getByRole("button", { name: "일 맡기기", exact: true }).click(); await selectSalesSources(panel);
  490 |         startMode = "delayedError";
  491 |         await panel.getByRole("button", { name: "검토 시작하기", exact: true }).click();
  492 |         await expect.poll(() => !!releaseStart).toBe(true);
  493 |         await leave(); releaseStart!(); await panel.waitForTimeout(150);
  494 |         await expect(panel.locator(".notice")).toHaveCount(0);
  495 |         await expect(panel.getByText("검토를 준비하고 있습니다.")).toHaveCount(0);
  496 |         expect(salesRequests).toBe(0);
  497 |         if (exit === "logout") {
```