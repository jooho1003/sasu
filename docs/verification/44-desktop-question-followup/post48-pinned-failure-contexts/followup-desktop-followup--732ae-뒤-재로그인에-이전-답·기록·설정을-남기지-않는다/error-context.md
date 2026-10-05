# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: followup.spec.ts >> desktop followup >> 설정 로그아웃 뒤 재로그인에 이전 답·기록·설정을 남기지 않는다
- Location: tests\e2e\followup.spec.ts:1404:5

# Error details

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '질문하기' })
    - locator resolved to <button>질문하기</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable

```

# Test source

```ts
  1314 |     } finally {
  1315 |       await app.close();
  1316 |       await removeUserData(userData);
  1317 |     }
  1318 |   });
  1319 | 
  1320 |   test("페이지 오류 뒤 목록과 cursor를 보존하고 빠른 상세 연타는 한 번만 조회한다", async () => {
  1321 |     previousQuestion = "페이지 실패에도 남아야 하는 합성 첫 질문";
  1322 |     historyMode = "pages";
  1323 |     const { app, panel, userData } = await launch();
  1324 |     try {
  1325 |       await login(panel);
  1326 |       await panel.getByRole("button", { name: "기록", exact: true }).click();
  1327 |       const first = panel.getByRole("button", { name: /페이지 실패에도 남아야/ });
  1328 |       await expect(first).toBeVisible();
  1329 |       historyMode = "page-error";
  1330 |       await panel.getByRole("button", { name: "더 보기", exact: true }).click();
  1331 |       await expect(panel.getByText("질문 기록을 불러오지 못했습니다.")).toBeVisible();
  1332 |       await expect(first).toBeVisible();
  1333 |       await expect(panel.getByRole("button", { name: "더 보기", exact: true })).toBeEnabled();
  1334 |       expect(historyRequests).toBe(2);
  1335 |       const failedCursor = historyUrls[1];
  1336 |       historyMode = "pages";
  1337 |       await panel.getByRole("button", { name: "더 보기", exact: true }).click();
  1338 |       await expect(panel.getByRole("button", { name: /더 오래된 합성 후속 질문/ })).toBeVisible();
  1339 |       expect(historyRequests).toBe(3);
  1340 |       expect(historyUrls[2]).toBe(failedCursor);
  1341 |       await expect(first).toHaveCount(1);
  1342 |       answerMode = "delayed";
  1343 |       // Two clicks in the same event-loop turn exercise the synchronous ref
  1344 |       // lock, before React has rendered disabled=true.
  1345 |       await first.evaluate((button) => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  1346 |       await expect.poll(() => !!releaseAnswer).toBe(true);
  1347 |       await expect(first).toBeDisabled();
  1348 |       expect(answerRequests).toBe(1);
  1349 |       releaseAnswer!();
  1350 |       await expect(panel.getByRole("heading", { name: "무엇이 궁금한가요?" })).toBeVisible();
  1351 |       await expect(panel.getByText("근거가 부족해 답하지 못했습니다.")).toBeVisible();
  1352 |       expect(answerRequests).toBe(1);
  1353 |     } finally {
  1354 |       releaseAnswer?.();
  1355 |       await app.close();
  1356 |       await removeUserData(userData);
  1357 |     }
  1358 |   });
  1359 | 
  1360 |   for (const delayed of ["목록", "상세"] as const) {
  1361 |     test(`이전 세션의 늦은 ${delayed} 응답은 로그아웃·새 로그인 뒤 표시되지 않는다`, async () => {
  1362 |       previousQuestion = "이전 사용자만 보던 지연된 합성 질문";
  1363 |       if (delayed === "목록") historyMode = "delayed";
  1364 |       else answerMode = "delayed";
  1365 |       const { app, panel, userData } = await launch();
  1366 |       try {
  1367 |         await login(panel);
  1368 |         await panel.getByRole("button", { name: "기록", exact: true }).click();
  1369 |         if (delayed === "목록") await expect.poll(() => !!releaseHistory).toBe(true);
  1370 |         else {
  1371 |           await panel.getByRole("button", { name: /이전 사용자만 보던/ }).click();
  1372 |           await expect.poll(() => !!releaseAnswer).toBe(true);
  1373 |         }
  1374 |         await panel.getByRole("button", { name: "설정", exact: true }).click();
  1375 |         await panel.getByRole("button", { name: "로그아웃하기", exact: true }).click();
  1376 |         await expect(panel.getByRole("heading", { name: "사수 시작하기" })).toBeVisible();
  1377 |         previousQuestion = ""; currentUserId = randomUUID(); historyMode = "normal";
  1378 |         await panel.getByLabel("이메일").fill("synthetic-next@example.test");
  1379 |         await panel.getByRole("button", { name: "코드 받기", exact: true }).click();
  1380 |         await panel.getByLabel("6자리 코드").fill("123456");
  1381 |         await panel.getByRole("button", { name: "로그인하기", exact: true }).click();
  1382 |         await panel.getByRole("button", { name: "합성 부서", exact: true }).click();
  1383 |         await expect(panel.getByRole("heading", { name: "무엇이 궁금한가요?" })).toBeVisible();
  1384 |         const completedBeforeRelease = delayed === "목록" ? historyResponses : answerResponses;
  1385 |         if (delayed === "목록") releaseHistory!();
  1386 |         else releaseAnswer!();
  1387 |         await expect.poll(() => delayed === "목록" ? historyResponses : answerResponses).toBe(completedBeforeRelease + 1);
  1388 |         await panel.getByRole("button", { name: "기록", exact: true }).click();
  1389 |         await expect(panel.getByText("아직 질문 기록이 없습니다.")).toBeVisible();
  1390 |         await expect(panel.getByText(/이전 사용자만 보던/)).toHaveCount(0);
  1391 |         await panel.getByRole("button", { name: "질문", exact: true }).click();
  1392 |         await expect(panel.getByText("근거가 부족해 답하지 못했습니다.")).toHaveCount(0);
  1393 |         await expect(panel.getByLabel("질문 내용")).toHaveValue("");
  1394 |         expect((await panel.evaluate(async () => window.sasu.settings.get())).seen).toEqual([]);
  1395 |       } finally {
  1396 |         releaseHistory?.(); releaseAnswer?.();
  1397 |         await app.close();
  1398 |         await removeUserData(userData);
  1399 |       }
  1400 |     });
  1401 |   }
  1402 | 
  1403 |   for (const reason of ["설정 로그아웃", "서버 401"] as const) {
  1404 |     test(`${reason} 뒤 재로그인에 이전 답·기록·설정을 남기지 않는다`, async () => {
  1405 |       const { app, panel, pet, userData } = await launch();
  1406 |       try {
  1407 |         await panel.evaluate(async (id) => {
  1408 |           await window.sasu.auth.verifyCode("synthetic@example.test", "123456");
  1409 |           await window.sasu.link.create({ dept_id: id });
  1410 |         }, deptId);
  1411 |         await panel.reload();
  1412 |         await expect(panel.getByRole("heading", { name: "무엇이 궁금한가요?" })).toBeVisible();
  1413 |         await panel.getByPlaceholder("질문을 적어 주세요.").fill("이전 사용자의 합성 질문 기록입니다.");
> 1414 |         await panel.getByRole("button", { name: "질문하기" }).click();
       |                                                           ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
  1415 |         await expect(panel.getByText("근거가 부족해 답하지 못했습니다.")).toBeVisible();
  1416 |         await panel.getByRole("button", { name: "기록", exact: true }).click();
  1417 |         await panel.getByRole("button", { name: "기록 불러오기" }).click();
  1418 |         await expect(panel.getByText("이전 사용자의 합성 질문 기록입니다.")).toBeVisible();
  1419 |         await panel.evaluate(async () => window.sasu.settings.set({ pet: "purple", panelPinned: true }));
  1420 |         if (reason === "설정 로그아웃") {
  1421 |           await panel.getByRole("button", { name: "설정", exact: true }).click();
  1422 |           await panel.getByRole("button", { name: "로그아웃하기" }).click();
  1423 |         } else {
  1424 |           revoked = true;
  1425 |           await expect(panel.evaluate(async () => window.sasu.inbox.get())).rejects.toThrow("device_revoked");
  1426 |         }
  1427 |         await expect(panel.getByRole("heading", { name: "사수 시작하기" })).toBeVisible();
  1428 |         await expect.poll(() => existsSync(resolve(userData, "session.bin"))).toBe(false);
  1429 |         await expect.poll(() => existsSync(resolve(userData, "outbox.bin"))).toBe(false);
  1430 |         await expect.poll(() => existsSync(resolve(userData, "settings.bin"))).toBe(false);
  1431 |         expect((await pet.evaluate(async () => window.sasu.settings.get())).pet).toBe("green");
  1432 |         const screenshots = resolve(process.cwd(), "../docs/verification/43-desktop-companion/screenshots");
  1433 |         mkdirSync(screenshots, { recursive: true });
  1434 |         await panel.screenshot({ path: resolve(screenshots, reason === "설정 로그아웃" ? "desktop-session-logout.png" : "desktop-session-401.png") });
  1435 | 
  1436 |         revoked = false; previousQuestion = ""; currentUserId = randomUUID();
  1437 |         await panel.getByLabel("이메일").fill("synthetic-next@example.test");
  1438 |         await panel.getByRole("button", { name: "코드 받기" }).click();
  1439 |         await expect(panel.getByText("로그인 코드를 보냈습니다.")).toBeVisible();
  1440 |         await panel.getByLabel("6자리 코드").fill("123456");
  1441 |         await panel.getByRole("button", { name: "로그인하기" }).click();
  1442 |         await panel.getByRole("button", { name: "합성 부서", exact: true }).click();
  1443 |         await expect(panel.getByRole("heading", { name: "무엇이 궁금한가요?" })).toBeVisible();
  1444 |         await expect(panel.getByText("근거가 부족해 답하지 못했습니다.")).toHaveCount(0);
  1445 |         await panel.getByRole("button", { name: "기록", exact: true }).click();
  1446 |         await expect(panel.getByText("이전 사용자의 합성 질문 기록입니다.")).toHaveCount(0);
  1447 |         expect(await panel.evaluate(async () => window.sasu.settings.get())).toMatchObject({ seen: [], pet: "green", panelPinned: false });
  1448 |       } finally {
  1449 |         await app.close();
  1450 |         await removeUserData(userData);
  1451 |       }
  1452 |     });
  1453 |   }
  1454 | 
  1455 |   test("부서 연결 대기 중 현재 세대 401도 세션을 종료한다", async () => {
  1456 |     const { app, panel, userData } = await launch();
  1457 |     try {
  1458 |       await panel.evaluate(async () => window.sasu.auth.verifyCode("synthetic@example.test", "123456"));
  1459 |       expect(existsSync(resolve(userData, "session.bin"))).toBe(true);
  1460 |       revoked = true;
  1461 |       await expect(panel.evaluate(async () => window.sasu.link.departments())).rejects.toThrow("session_invalid");
  1462 |       await expect(panel.getByRole("heading", { name: "사수 시작하기" })).toBeVisible();
  1463 |       await expect.poll(() => existsSync(resolve(userData, "session.bin"))).toBe(false);
  1464 |       expect((await panel.evaluate(async () => window.sasu.settings.get())).seen).toEqual([]);
  1465 |     } finally {
  1466 |       await app.close();
  1467 |       await removeUserData(userData);
  1468 |     }
  1469 |   });
  1470 | 
  1471 |   test("실제 본체의 동시 오프라인 보관과 응답 오류 재전송 금지", async () => {
  1472 |     const { app, panel, userData } = await launch();
  1473 |     try {
  1474 |       await panel.evaluate(async (id) => {
  1475 |         await window.sasu.auth.verifyCode("synthetic@example.test", "123456");
  1476 |         await window.sasu.link.create({ dept_id: id });
  1477 |       }, deptId);
  1478 |       askMode = "offline";
  1479 |       const results = await panel.evaluate(async () => Promise.all([
  1480 |         window.sasu.ask.send("첫 번째 오프라인 합성 질문입니다."),
  1481 |         window.sasu.ask.send("두 번째 오프라인 합성 질문입니다."),
  1482 |       ]));
  1483 |       expect(results.every((result) => "queued" in result)).toBe(true);
  1484 |       expect((await panel.evaluate(async () => window.sasu.inbox.get())).outbox_count).toBe(2);
  1485 |       const encrypted = readFileSync(resolve(userData, "outbox.bin"));
  1486 |       expect(encrypted.includes(Buffer.from("오프라인 합성 질문"))).toBe(false);
  1487 |       await panel.evaluate(async () => window.sasu.auth.signOut());
  1488 |       expect(existsSync(resolve(userData, "outbox.bin"))).toBe(false);
  1489 |       await panel.evaluate(async (id) => {
  1490 |         await window.sasu.auth.verifyCode("synthetic@example.test", "123456");
  1491 |         await window.sasu.link.create({ dept_id: id });
  1492 |       }, deptId);
  1493 |       askMode = "invalid";
  1494 |       const previousRequests = askRequests;
  1495 |       await expect(panel.evaluate(async () => window.sasu.ask.send("응답 형식 오류 합성 질문입니다."))).rejects.toThrow("invalid_response");
  1496 |       expect((await panel.evaluate(async () => window.sasu.inbox.get())).outbox_count).toBe(0);
  1497 |       expect(askRequests - previousRequests).toBe(1);
  1498 |     } finally {
  1499 |       await app.close();
  1500 |       await removeUserData(userData);
  1501 |     }
  1502 |   });
  1503 | 
  1504 |   test("실제 암호화 설정의 동시 열람·위치·선호와 IPC 제한", async () => {
  1505 |     const { app, panel, pet, userData } = await launch();
  1506 |     try {
  1507 |       const ids = [randomUUID(), randomUUID()];
  1508 |       await panel.evaluate(async ([first, second]) => {
  1509 |         await Promise.all([
  1510 |           window.sasu.settings.markSeen(first!),
  1511 |           window.sasu.settings.markSeen(second!),
  1512 |           window.sasu.settings.set({ pet: "purple", panelPinned: true }),
  1513 |         ]);
  1514 |       }, ids);
```