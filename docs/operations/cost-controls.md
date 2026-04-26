# 비용 통제

## Anthropic
- Monthly spend limit: **$5 / month** (설정일 2026-04-26 예정)
- Alert: 80%, 100%
- 콘솔: https://console.anthropic.com/ → Workspace → Limits

## Supabase
- Pro 플랜
- PITR retention 7일 (`docs/operations/disaster-recovery.md` 참조)
- Compute: micro (현재)
- 청구서 모니터링: 월 1회

## Vercel
- Hobby 또는 Pro (확인 필요)
- 함수 실행시간 / 대역폭 모니터링은 매월 1회 점검
- 자동 알림 임계: 사용량의 80%

## Upstash (Phase 2 Ratelimit)
- 무료 티어 10K req/day
- 임계 도달 시 콘솔 자동 알림 활성화
