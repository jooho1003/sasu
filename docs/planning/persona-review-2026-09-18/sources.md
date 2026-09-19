# 외부 참고와 적용 범위

열람일: 2026-09-18. 외부 자료는 페르소나를 만드는 방법과 책임/권한·인간 AI 상호작용을 점검하는 참고다. **사수 고객의 실제 수요·효과·시장 규모를 증명하는 자료로 사용하지 않았다.** 한국 기업의 직급/부서에 일반화한 부분은 검토 가설이다. 인용문을 길게 복제하지 않고 필요한 취지만 요약했다.

| 참고자료 | 이 검토에 적용한 점 | 적용하지 않은 주장 |
|---|---|---|
| [NN/g: 3 Persona Types](https://www.nngroup.com/articles/persona-types/) | 조사 기반 페르소나와 기존 가정을 정리한 proto-persona를 구별한다. 이번 50개는 후자이며 실제 조사에서 수정할 대상이다 | 역할별 인원 비중·고객 선호·수요를 측정했다는 주장 |
| [NN/g: Personas and Archetypes](https://www.nngroup.com/articles/personas-archetypes/) | 행동/상황 중심 프로필로 표현한다. 이름·나이·사진을 붙여 실재성을 가장하지 않는다 | 50명이 최적의 핵심 페르소나 수라는 주장. 구현 우선순위는 소수 대표 여정에 집중 |
| [GitLab: Directly Responsible Individuals](https://handbook.gitlab.com/handbook/people-group/directly-responsible-individuals/) | 업무를 수행하는 책임, 최종 판단, 자문·공유 역할을 구별하는 실제 조직 사례를 참고했다 | 모든 회사가 GitLab의 책임/승인 제도를 써야 한다는 주장 |
| [GitLab: Product processes](https://handbook.gitlab.com/handbook/product/product-processes/) | 제품·기술·디자인이 협력하지만 책임이 같지는 않다는 맥락을 기획/개발 여정에 참고했다 | 사수 고객의 PM/개발 직급·승인 방식이 동일하다는 주장 |
| [GitLab: People Operations](https://handbook.gitlab.com/handbook/people-group/people-operations/) | 인사 업무를 온보딩·정책/운영 문의·전문 역할로 나눠 생각하는 참고 사례다 | 개인 HR 정보를 모두 하나의 AI 부서에 모아도 된다는 주장 |
| [Microsoft Research: Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/research/project/guidelines-for-human-ai-interaction/) 및 [HAX 가이드](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/) | 사용 가능한 범위와 기대를 명확히 하고, 잘못됐을 때 수정·복구할 수 있게 하는 관점으로 결과 편집/거절 인계를 검토했다 | 가이드를 참고했다는 이유로 사수 사용성 검증을 통과했다는 주장 |
| [NIST: RBAC FAQ](https://csrc.nist.gov/Projects/Role-Based-Access-Control/faqs) | 역할은 허용된 작업의 묶음이고 작업별 제약·직무 분리가 중요하다는 관점으로 직급/열람/행동을 구분했다 | 사수가 NIST 인증을 받았거나 모든 기업용 권한 요구를 구현했다는 주장 |
| [Microsoft WorkLab: Breaking down the infinite workday](https://www.microsoft.com/en-us/worklab/work-trend-index/breaking-down-infinite-workday) | 새 알림을 추가하는 것이 이익인지 별도 검증할 필요가 있다는 문제의식만 참고했다 | 공급자 연구의 방해 빈도/생산성 수치를 사수 고객이나 한국 소규모 팀의 수치로 전용하지 않음 |

권한 구현에 대한 최우선 근거는 외부 RBAC 자료가 아니라 프로젝트의 [ARCHITECTURE](../../ARCHITECTURE.md)·`can_see()` 불변식이다. 전문 회계·법률·의료 판단이나 규제 준수 결론은 이 조사에서 내리지 않았다.

## 가설을 반증해야 하는 부분

- 작은 조직이 반드시 기록이 적거나 대표에게 모든 결정이 모이는 것은 아니다. 실제 업무 한 건에서 확인한다.
- 중견 규모라도 부서 하나의 업무는 단순할 수 있다. 조직 전체가 크다는 이유로 다단 결재/전사 기능을 먼저 만들지 않는다.
- 신입이 항상 설명을 선호하거나 선임이 항상 요약만 원하는 것은 아니다. 압박·시간·원문 접근·개인 경험을 관찰한다.
- 반복 질문 감소가 좋은 결과인지는 재확인이 필요한 질문까지 줄어드는지 함께 봐야 한다.
- 인용이 붙어도 잘못된 결론을 낼 수 있고, 거절이 많아도 정확성이 좋아졌다고 단정할 수 없다.
- 사용자가 만족한다고 말해도 설정/검토/정정 비용을 빼면 이익이 없을 수 있다.
