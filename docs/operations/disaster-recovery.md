# 재해 복구 절차

## 백업 정책
- Supabase Pro 일일 자동 백업: 7일 보관
- PITR (Point-in-Time Recovery): 7일 보관, 분 단위 복원

## 복구 시나리오

### 1. 단일 테이블 데이터 손상 / 잘못된 마이그레이션
1. Supabase Dashboard → Database → Backups → PITR
2. 복원 시점 선택 (마이그레이션 직전)
3. 새 프로젝트로 복원 또는 in-place 복원
4. 복원 후 차이만 export → 운영 DB로 병합

### 2. 프로젝트 전체 손실
1. PITR 복원으로 새 Supabase 프로젝트 생성
2. Vercel 환경변수의 `NEXT_PUBLIC_SUPABASE_URL`, `*_KEY` 갱신
3. 재배포

## 정기 점검
- 월 1회: 백업 가용성 확인 (대시보드 진입만으로 OK)
- 분기 1회: 비운영 환경에 PITR 복원 1회 시뮬레이션
