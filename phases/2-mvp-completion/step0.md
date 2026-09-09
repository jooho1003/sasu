# Step 0: embedding-and-ask

임베딩 모델을 OpenAI text-embedding-3-small 1536차원으로 확정하고 별도 migration으로 items.embedding, embed_model, search_as(), recent_decisions_as()를 추가한다. 질문은 answers row를 먼저 만들고 answer job으로 처리하며, 검색·인용 검증·refused 상태를 거친 답만 렌더한다.

검증:

```bash
npm test
npx tsc --noEmit
```
