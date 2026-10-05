# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: followup.spec.ts >> desktop followup >> 폴링 실패 안내·화면 이동 뒤 취소·완료 답 열람 보존
- Location: tests\e2e\followup.spec.ts:1544:3

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
  1462 |       }
  1463 |     });
  1464 |   }
  1465 | 
  1466 |   test("부서 연결 대기 중 현재 세대 401도 세션을 종료한다", async () => {
  1467 |     const { app, panel, userData } = await launch();
  1468 |     try {
  1469 |       await panel.evaluate(async () => window.sasu.auth.verifyCode("synthetic@example.test", "123456"));
  1470 |       expect(existsSync(resolve(userData, "session.bin"))).toBe(true);
  1471 |       revoked = true;
  1472 |       await expect(panel.evaluate(async () => window.sasu.link.departments())).rejects.toThrow("session_invalid");
  1473 |       await expect(panel.getByRole("heading", { name: "사수 시작하기" })).toBeVisible();
  1474 |       await expect.poll(() => existsSync(resolve(userData, "session.bin"))).toBe(false);
  1475 |       expect((await panel.evaluate(async () => window.sasu.settings.get())).seen).toEqual([]);
  1476 |     } finally {
  1477 |       await app.close();
  1478 |       await removeUserData(userData);
  1479 |     }
  1480 |   });
  1481 | 
  1482 |   test("실제 본체의 동시 오프라인 보관과 응답 오류 재전송 금지", async () => {
  1483 |     const { app, panel, userData } = await launch();
  1484 |     try {
  1485 |       await panel.evaluate(async (id) => {
  1486 |         await window.sasu.auth.verifyCode("synthetic@example.test", "123456");
  1487 |         await window.sasu.link.create({ dept_id: id });
  1488 |       }, deptId);
  1489 |       askMode = "offline";
  1490 |       const results = await panel.evaluate(async () => Promise.all([
  1491 |         window.sasu.ask.send("첫 번째 오프라인 합성 질문입니다."),
  1492 |         window.sasu.ask.send("두 번째 오프라인 합성 질문입니다."),
  1493 |       ]));
  1494 |       expect(results.every((result) => "queued" in result)).toBe(true);
  1495 |       expect((await panel.evaluate(async () => window.sasu.inbox.get())).outbox_count).toBe(2);
  1496 |       const encrypted = readFileSync(resolve(userData, "outbox.bin"));
  1497 |       expect(encrypted.includes(Buffer.from("오프라인 합성 질문"))).toBe(false);
  1498 |       await panel.evaluate(async () => window.sasu.auth.signOut());
  1499 |       expect(existsSync(resolve(userData, "outbox.bin"))).toBe(false);
  1500 |       await panel.evaluate(async (id) => {
  1501 |         await window.sasu.auth.verifyCode("synthetic@example.test", "123456");
  1502 |         await window.sasu.link.create({ dept_id: id });
  1503 |       }, deptId);
  1504 |       askMode = "invalid";
  1505 |       const previousRequests = askRequests;
  1506 |       await expect(panel.evaluate(async () => window.sasu.ask.send("응답 형식 오류 합성 질문입니다."))).rejects.toThrow("invalid_response");
  1507 |       expect((await panel.evaluate(async () => window.sasu.inbox.get())).outbox_count).toBe(0);
  1508 |       expect(askRequests - previousRequests).toBe(1);
  1509 |     } finally {
  1510 |       await app.close();
  1511 |       await removeUserData(userData);
  1512 |     }
  1513 |   });
  1514 | 
  1515 |   test("실제 암호화 설정의 동시 열람·위치·선호와 IPC 제한", async () => {
  1516 |     const { app, panel, pet, userData } = await launch();
  1517 |     try {
  1518 |       const ids = [randomUUID(), randomUUID()];
  1519 |       await panel.evaluate(async ([first, second]) => {
  1520 |         await Promise.all([
  1521 |           window.sasu.settings.markSeen(first!),
  1522 |           window.sasu.settings.markSeen(second!),
  1523 |           window.sasu.settings.set({ pet: "purple", panelPinned: true }),
  1524 |         ]);
  1525 |       }, ids);
  1526 |       await pet.evaluate(async () => window.sasu.window.movePet({ x: 320, y: 380 }));
  1527 |       const settings = await panel.evaluate(async () => window.sasu.settings.get());
  1528 |       expect(settings.seen).toEqual(ids);
  1529 |       expect(settings.pet).toBe("purple");
  1530 |       expect(settings.petPosition).toEqual({ x: 320, y: 380 });
  1531 |       await expect(panel.evaluate(async () => window.sasu.settings.set({ seen: [] } as never))).rejects.toThrow("invalid_input");
  1532 |       await expect(pet.evaluate(async (id) => window.sasu.settings.markSeen(id), ids[0]!)).rejects.toThrow("window_forbidden");
  1533 |       expect((await panel.evaluate(async () => window.sasu.settings.get())).seen).toEqual(ids);
  1534 |       const encrypted = readFileSync(resolve(userData, "settings.bin"));
  1535 |       expect(ids.every((id) => !encrypted.includes(Buffer.from(id)))).toBe(true);
  1536 |       await panel.reload();
  1537 |       expect((await panel.evaluate(async () => window.sasu.settings.get())).seen).toEqual(ids);
  1538 |     } finally {
  1539 |       await app.close();
  1540 |       await removeUserData(userData);
  1541 |     }
  1542 |   });
  1543 | 
  1544 |   test("폴링 실패 안내·화면 이동 뒤 취소·완료 답 열람 보존", async () => {
  1545 |     const { app, panel, userData } = await launch();
  1546 |     try {
  1547 |       const answerId = randomUUID();
  1548 |       const readId = randomUUID();
  1549 |       await app.evaluate(({ ipcMain }, id) => {
  1550 |         const replace = (name: string, handler: () => unknown) => {
  1551 |           ipcMain.removeHandler(name); ipcMain.handle(name, handler);
  1552 |         };
  1553 |         replace("link:get", () => ({ dept: { id, name: "합성 부서" }, role: "member" }));
  1554 |         replace("inbox:get", () => ({ inbox: { cards: [], answers: [], reviews: [], sales: [] }, outbox_count: 0 }));
  1555 |         replace("ask:send", () => ({ answer_id: id, job_id: id, truncated: false }));
  1556 |         replace("answer:get", () => { throw new Error("network:연결을 확인해 주세요."); });
  1557 |       }, answerId);
  1558 |       await panel.reload();
  1559 |       await expect(panel.getByRole("heading", { name: "무엇이 궁금한가요?" })).toBeVisible();
  1560 |       await panel.evaluate(async () => window.sasu.settings.set({ panelPinned: true }));
  1561 |       await panel.getByPlaceholder("질문을 적어 주세요.").fill("합성 질문의 답변을 확인해 주세요.");
> 1562 |       await panel.getByRole("button", { name: "질문하기" }).click();
       |                                                         ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
  1563 |       await expect(panel.getByText(/연결을 확인해 주세요.*기록에서 답/u)).toBeVisible();
  1564 |       await expect(panel.getByText("답 확인을 멈췄습니다. 기록에서 다시 확인해 주세요.")).toBeVisible();
  1565 |       await expect(panel.getByText(/network|Error:|answer:get/u)).toHaveCount(0);
  1566 |       const screenshots = resolve(process.cwd(), "../docs/verification/43-desktop-companion/screenshots");
  1567 |       mkdirSync(screenshots, { recursive: true });
  1568 |       await panel.screenshot({ path: resolve(screenshots, "desktop-followup-poll-error.png") });
  1569 | 
  1570 |       await app.evaluate(({ ipcMain }, id) => {
  1571 |         const state = globalThis as typeof globalThis & { followupPollCalls?: number };
  1572 |         state.followupPollCalls = 0;
  1573 |         ipcMain.removeHandler("answer:get");
  1574 |         ipcMain.handle("answer:get", () => {
  1575 |           state.followupPollCalls! += 1;
  1576 |           return { id, status: "pending", answer: null, refused: false, citations: [] };
  1577 |         });
  1578 |       }, answerId);
  1579 |       await panel.getByPlaceholder("질문을 적어 주세요.").fill("다음 합성 질문의 답변을 확인해 주세요.");
  1580 |       await panel.getByRole("button", { name: "질문하기" }).click();
  1581 |       await expect(panel.getByText("답을 찾는 중입니다.")).toBeVisible();
  1582 |       expect((await panel.evaluate(async () => window.sasu.settings.get())).seen).not.toContain(answerId);
  1583 |       await panel.getByRole("button", { name: "설정", exact: true }).click();
  1584 |       await expect(panel.getByRole("heading", { name: "설정", exact: true })).toBeVisible();
  1585 |       await panel.evaluate(async (id) => window.sasu.settings.markSeen(id), readId);
  1586 |       const calls = await app.evaluate(() => (globalThis as typeof globalThis & { followupPollCalls?: number }).followupPollCalls);
  1587 |       await panel.waitForTimeout(2_200);
  1588 |       expect(await app.evaluate(() => (globalThis as typeof globalThis & { followupPollCalls?: number }).followupPollCalls)).toBe(calls);
  1589 |       await app.evaluate(({ ipcMain }, id) => {
  1590 |         ipcMain.removeHandler("answer:get");
  1591 |         ipcMain.handle("answer:get", () => ({ id, status: "refused", answer: null, refused: true, citations: [] }));
  1592 |       }, answerId);
  1593 |       await panel.getByRole("button", { name: "질문", exact: true }).click();
  1594 |       await expect(panel.getByText("답 확인을 멈췄습니다. 기록에서 다시 확인해 주세요.")).toBeVisible();
  1595 |       await expect(panel.getByText("답을 찾는 중입니다.")).toHaveCount(0);
  1596 |       await panel.getByPlaceholder("질문을 적어 주세요.").fill("완료 합성 질문의 답변을 확인해 주세요.");
  1597 |       await panel.getByRole("button", { name: "질문하기" }).click();
  1598 |       await expect(panel.getByText("근거가 부족해 답하지 못했습니다.")).toBeVisible();
  1599 |       await expect.poll(async () => (await panel.evaluate(async () => window.sasu.settings.get())).seen).toEqual([readId, answerId]);
  1600 |     } finally {
  1601 |       await app.close();
  1602 |       await removeUserData(userData);
  1603 |     }
  1604 |   });
  1605 | 
  1606 |   test("실제 본체 hostname을 기존 E02 요청과 앱 정보에 같이 사용한다", async () => {
  1607 |     const { app, panel, userData } = await launch();
  1608 |     try {
  1609 |       linkedBody = null;
  1610 |       await panel.evaluate(async () => window.sasu.auth.verifyCode("synthetic@example.test", "123456"));
  1611 |       const info = await panel.evaluate(async () => window.sasu.app.info());
  1612 |       await panel.evaluate(async (id) => window.sasu.link.create({ dept_id: id }), deptId);
  1613 |       expect(linkedBody).toEqual({ dept_id: deptId, device_name: info.device_name, app_version: info.version });
  1614 |       expect(info.device_name.length).toBeGreaterThan(0);
  1615 |       expect(info.device_name.length).toBeLessThanOrEqual(60);
  1616 |       expect(info.device_name).not.toBe("데스크톱 앱");
  1617 |     } finally {
  1618 |       await app.close();
  1619 |       await removeUserData(userData);
  1620 |     }
  1621 |   });
  1622 | });
  1623 | 
```