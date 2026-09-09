# Step 2: guest-demo

게스트 라우트는 orgs.is_demo를 SQL 함수로 판별하고 anon 읽기 정책만 사용한다. demo seed는 온새미로 주식회사의 영업·개발 부서 합성 데이터, 결정 카드, 원장, 6개 사전 Q&A와 generic_answer를 멱등 생성한다. 게스트 자유 질문과 쓰기는 제공하지 않는다.

검증:

```bash
npx tsx scripts/seed-demo.ts
```
