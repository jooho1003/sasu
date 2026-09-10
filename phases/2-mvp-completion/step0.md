# Step 0: embedding-and-ask

임베딩 모델을 Voyage AI voyage-4-lite 1024차원으로 확정하고 별도 migration으로 items.embedding, embed_model, search_as(), recent_decisions_as()를 추가한다. OpenAI는 명시적 호환 provider로 남긴다. 문서에는 input_type=document, 질문에는 input_type=query를 사용한다. 질문은 answers row를 먼저 만들고 answer job으로 처리하며, 검색·인용 검증·refused 상태를 거친 답만 렌더한다.

검증:

```bash
npm test
npx tsc --noEmit
```
