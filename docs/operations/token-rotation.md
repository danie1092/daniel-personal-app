# 토큰 회전 운영 절차

## 정기 회전 주기
- `COLLECT_API_KEY`: 6개월
- `BUDGET_API_KEY`, `BUDGET_HMAC_SECRET`: 6개월
- `CRON_SECRET`: 12개월
- `SUPABASE_SERVICE_ROLE_KEY`: 노출 의심 시 즉시
- `ANTHROPIC_API_KEY`: 노출 의심 시 즉시

## 회전 명령

신규 32바이트 시크릿 생성:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## 회전 시 후속 조치 매트릭스

| 키 | Vercel 등록 | 외부 시스템 갱신 |
|----|-------------|------------------|
| `COLLECT_API_KEY` | ✓ | iPhone Shortcut Authorization 헤더 |
| `CRON_SECRET` | ✓ | Vercel Cron(자동) |
| `BUDGET_API_KEY` / `BUDGET_HMAC_SECRET` | ✓ | 맥미니 Keychain (`security add-generic-password`) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | 없음 (Vercel 재배포만) |
| `ANTHROPIC_API_KEY` | ✓ | 없음 |

## Vercel 환경변수 등록 절차

1. https://vercel.com/danie1092s-projects/daniel-personal-app → Settings → Environment Variables
2. 키 이름 입력, 값 붙여넣기
3. 적용 환경 모두 체크 (Production, Preview, Development)
4. Save → 자동 재배포 트리거 또는 수동 재배포

## 노출 의심 시 즉시 절차

1. 콘솔에서 키 revoke (Supabase / Anthropic) 또는 Vercel 환경변수 즉시 새 값으로 교체
2. 새 키 생성 → Vercel 등록
3. 외부 시스템 갱신 (단축어 / 맥미니 Keychain)
4. 액세스 로그 점검 (Supabase Project Logs, Vercel Functions Logs, Anthropic Usage)
5. 회전 일시·이유를 `docs/operations/security-incidents.md`에 추가 (없으면 새로 생성)

## 맥미니 Keychain 등록 (Phase 3 BUDGET_API_KEY 등)

```bash
# 등록
security add-generic-password -a danie1092 -s daniel-budget-api -w "<KEY_VALUE>"
security add-generic-password -a danie1092 -s daniel-budget-hmac -w "<HMAC_VALUE>"

# 조회 (회전 후 확인용)
security find-generic-password -a danie1092 -s daniel-budget-api -w
```

## 단축어(iPhone Shortcut) 갱신 절차

1. iPhone 단축어 앱 → 인스타 적재 단축어 열기
2. URL 호출 액션의 헤더 `Authorization` 값 → `Bearer <NEW_KEY>` 로 교체
3. 저장
4. 테스트 호출 1회 (인스타 게시물 공유 → 단축어 실행 → 응답 확인)
