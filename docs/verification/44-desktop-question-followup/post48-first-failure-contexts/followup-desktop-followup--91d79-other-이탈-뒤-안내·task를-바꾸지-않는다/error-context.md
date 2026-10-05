# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: followup.spec.ts >> desktop followup >> sales start 자료·시작 늦은 응답은 other 이탈 뒤 안내·task를 바꾸지 않는다
- Location: tests\e2e\followup.spec.ts:473:5

# Error details

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '일 맡기기', exact: true })
    - locator resolved to <button class="">일 맡기기</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable

```

# Test source

```ts
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
  397 |       await panel.screenshot({ path: resolve(screenshots, "sales-form.png") });
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
> 481 |         await login(panel); await panel.getByRole("button", { name: "일 맡기기", exact: true }).click();
      |                                                                                             ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
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
  498 |           await expect(panel.getByRole("heading", { name: "사수 시작하기" })).toBeVisible();
  499 |           await login(panel);
  500 |         }
  501 |         {
  502 |           await panel.getByRole("button", { name: "일 맡기기", exact: true }).click(); await selectSalesSources(panel);
  503 |           startMode = "delayed"; releaseStart = null;
  504 |           await panel.getByRole("button", { name: "검토 시작하기", exact: true }).click();
  505 |           await expect.poll(() => !!releaseStart).toBe(true); await leave(); releaseStart!(); await panel.waitForTimeout(150);
  506 |           await expect(panel.getByText("검토를 준비하고 있습니다.")).toHaveCount(0); expect(salesRequests).toBe(0);
  507 |         }
  508 |       } finally { releaseSources?.(); releaseStart?.(); await app.close(); await removeUserData(userData); }
  509 |     });
  510 |   }
  511 |   async function startSalesTask(panel: Awaited<ReturnType<typeof launch>>["panel"]) {
  512 |     await panel.getByRole("button", { name: "일 맡기기", exact: true }).click();
  513 |     await selectSalesSources(panel);
  514 |     await panel.getByRole("button", { name: "검토 시작하기", exact: true }).click();
  515 |     await expect(panel.getByText("검토를 준비하고 있습니다.")).toBeVisible();
  516 |   }
  517 |   async function salesClock(panel: Awaited<ReturnType<typeof launch>>["panel"]) {
  518 |     await login(panel);
  519 |     await panel.clock.install();
  520 |     await panel.reload();
  521 |     await expect(panel.getByRole("heading", { name: "무엇이 궁금한가요?" })).toBeVisible();
  522 |     await panel.clock.pauseAt(new Date(Date.now() + 1_000));
  523 |   }
  524 |   async function readySalesTask(panel: Awaited<ReturnType<typeof launch>>["panel"]) {
  525 |     salesMode = "normal"; salesState = "ready";
  526 |     await startSalesTask(panel); await panel.clock.runFor(5_000);
  527 |     await expect(panel.getByText("검토가 끝났습니다.")).toBeVisible();
  528 |   }
  529 |   test("sales status 5초 단일 조회와 한국어 5상태·terminal 새 검토 ID", async () => {
  530 |     contextRole = "lead"; seedSalesSources(); salesMode = "delayed"; salesState = "processing";
  531 |     const { app, panel, userData } = await launch();
  532 |     try {
  533 |       await salesClock(panel); await startSalesTask(panel);
  534 |       await expect(panel.getByRole("button", { name: "새 검토", exact: true })).toHaveCount(0);
  535 |       await panel.getByLabel("검토할 파일", { exact: true }).setInputFiles({ name: "synthetic.exe", mimeType: "application/octet-stream", buffer: Buffer.from("synthetic") });
  536 |       await panel.getByRole("checkbox", { name: "참여자 동의 확인", exact: true }).check();
  537 |       await panel.getByRole("button", { name: "자료 올리기", exact: true }).click();
  538 |       await expect(panel.locator(".notice")).toContainText("파일만 올릴 수 있습니다.");
  539 |       await panel.clock.runFor(4_999); expect(salesRequests).toBe(0);
  540 |       await panel.clock.runFor(1); await expect.poll(() => !!releaseSales).toBe(true);
  541 |       await expect(panel.locator(".notice")).toContainText("파일만 올릴 수 있습니다.");
  542 |       await panel.clock.runFor(10_000); expect(salesRequests).toBe(1);
  543 |       releaseSales!(); salesMode = "normal";
  544 |       await expect(panel.getByText("원문을 검토하고 있습니다.")).toBeVisible();
  545 |       await expect(panel.locator(".notice")).toContainText("파일만 올릴 수 있습니다.");
  546 |       await expect(panel.getByRole("button", { name: "새 검토", exact: true })).toHaveCount(0);
  547 |       for (const [state, text] of [["ready", "검토가 끝났습니다."], ["refused", "검토 근거를 확인하지 못했습니다."], ["failed", "검토를 끝내지 못했습니다."]]) {
  548 |         salesState = state; await panel.clock.runFor(5_000);
  549 |         await expect(panel.getByText(text, { exact: true })).toBeVisible();
  550 |         const terminalRequests = salesRequests; await panel.clock.runFor(10_000); expect(salesRequests).toBe(terminalRequests);
  551 |         const oldAttempt = startBodies.at(-1)!.request_id;
  552 |         await panel.getByRole("button", { name: "새 검토", exact: true }).click();
  553 |         await expect(panel.getByText(text, { exact: true })).toHaveCount(0);
  554 |         await expect(panel.getByRole("combobox", { name: "고객 요청", exact: true })).toHaveValue(sourceIds[0]);
  555 |         await expect(panel.getByRole("button", { name: "검토 시작하기", exact: true })).toBeEnabled();
  556 |         await panel.getByRole("button", { name: "검토 시작하기", exact: true }).click();
  557 |         await expect(panel.getByText("검토를 준비하고 있습니다.")).toBeVisible();
  558 |         expect(startBodies.at(-1)!.request_id).not.toBe(oldAttempt);
  559 |       }
  560 |       expect(new Set(startBodies.map((body) => body.request_id)).size).toBe(4);
  561 |     } finally { releaseSales?.(); await app.close(); await removeUserData(userData); }
  562 |   });
  563 |   test("sales status 오류는 폴링을 멈추고 수동 재확인·재개·not_found 회복을 제공한다", async () => {
  564 |     contextRole = "lead"; seedSalesSources(); salesMode = "error";
  565 |     const { app, panel, userData } = await launch();
  566 |     try {
  567 |       await salesClock(panel); await startSalesTask(panel); await panel.clock.runFor(5_000);
  568 |       await expect(panel.getByRole("alert")).toContainText("합성 검토 상태를 확인하지 못했습니다.");
  569 |       await expect(panel.getByText("검토를 준비하고 있습니다.")).toHaveCount(0);
  570 |       const stoppedRequests = salesRequests; await panel.clock.runFor(15_000); expect(salesRequests).toBe(stoppedRequests);
  571 |       for (const mode of ["not_found", "forbidden", "network"]) {
  572 |         salesMode = mode; await panel.getByRole("button", { name: "상태 다시 확인", exact: true }).click();
  573 |         await expect(panel.getByRole("alert")).toContainText(mode === "forbidden" ? "팀장만 사용할 수 있습니다." : mode === "network" ? "서버에 연결하지 못했습니다." : "합성 검토 상태를 확인하지 못했습니다.");
  574 |         await expect(panel.getByRole("heading", { name: "영업 원문 검토", exact: true })).toBeVisible();
  575 |         await expect(panel.getByRole("button", { name: "웹에서 결과 보기", exact: true })).toHaveCount(0);
  576 |       }
  577 |       salesMode = "delayed"; salesState = "queued"; releaseSales = null;
  578 |       await panel.getByRole("button", { name: "상태 다시 확인", exact: true }).evaluate((node) => { (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click(); });
  579 |       await expect.poll(() => !!releaseSales).toBe(true);
  580 |       const retryRequests = salesRequests; await panel.clock.runFor(10_000); expect(salesRequests).toBe(retryRequests);
  581 |       releaseSales!(); salesMode = "normal"; await expect(panel.getByText("검토를 준비하고 있습니다.")).toBeVisible();
```