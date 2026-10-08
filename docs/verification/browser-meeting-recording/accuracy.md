# 웹 회의 녹음 정확률 실측

공백은 문자 오류율에서 제외하고 구두점은 포함합니다. 같은 모드의 전후 비교는 동일한 원본 파일 해시를 사용합니다.

| 모드 | 용어집 | OS | 브라우저 | 원본 SHA-256 | CER | 용어 CER | 오류 구간 낮은 신뢰 표시율 |
|---|---|---|---|---|---:|---:|---:|
| microphone | before | Windows 11 Home 10.0.26200 | Chrome 154.0.0.0 | `6377746f2e4642bee66476a7a767039f181cd15aac0b2cd4f7062203a68e6c99` | 0.0941 | 0.3898 | 0.0000 |
| microphone | after | Windows 11 Home 10.0.26200 | Chrome 154.0.0.0 | `6377746f2e4642bee66476a7a767039f181cd15aac0b2cd4f7062203a68e6c99` | 0.0870 | 0.3649 | 0.0000 |
| tab | before | Windows 11 Home 10.0.26200 | Chrome 154.0.0.0 | `05710ea1e8e6474f4ab08d690989f69f31272f18390fb74063a610fb063c499e` | 0.0870 | 0.3820 | 0.0000 |
| tab | after | Windows 11 Home 10.0.26200 | Chrome 154.0.0.0 | `05710ea1e8e6474f4ab08d690989f69f31272f18390fb74063a610fb063c499e` | 0.0844 | 0.3447 | 0.0000 |
| system | before | Windows 11 Home 10.0.26200 | Chrome 154.0.0.0 | `54a8c6d5c30f9ca3d546fe4755c468beb7cb3ff94bd3d9fe758b4cc268a508f2` | 0.1014 | 0.4519 | 0.0000 |
| system | after | Windows 11 Home 10.0.26200 | Chrome 154.0.0.0 | `54a8c6d5c30f9ca3d546fe4755c468beb7cb3ff94bd3d9fe758b4cc268a508f2` | 0.1018 | 0.3742 | 0.0118 |

| 결정 후보 | Precision | Recall | 정답 수 |
|---|---:|---:|---:|
| 병합 전 | 0.6818 | 0.6522 | 15 |
| 병합 후 | 0.6818 | 0.6522 | 15 |

설계된 정확률 기준: **미충족** (microphone_low_confidence_below_half, tab_low_confidence_below_half, system_overall_cer_regressed, system_low_confidence_below_half). 결정 후보는 수치 기록 대상이며 개선 목표치를 별도로 단정하지 않습니다.

이 표는 입력으로 제공한 라벨과 원본 해시를 계산한 결과입니다. 녹음 모드와 라벨의 실제 적합성은 별도로 확인해야 합니다.
