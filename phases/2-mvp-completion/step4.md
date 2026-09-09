# Step 4: verification

실행 기록:

- `npm test`: 21개 파일, 120개 통과
- `npm run lint`: 통과
- `npx tsc --noEmit`: 통과
- `npm run build`: 통과
- `npm run test:rls`: 6개 통과
- `npx playwright test --list`: vertical slice 1개 목록 확인
- 원격 `/demo`, `/demo/d/[dept]`, `/demo/d/[dept]/ask`: 모두 HTTP 200
