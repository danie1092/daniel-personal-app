# budget-sms 운영 Runbook

Phase 3에서 추가된 SMS 결제문자 자동 가계부 입력 라인의 운영 가이드.

## 구성

- **맥미니**: `~/Library/Application Support/budget-sms/`의 launchd agent(**KeepAlive 장수 프로세스**)가
  `poll-loop.sh`를 돌린다 — 30초마다 poll.sh, 6시간마다 watchdog.sh, 매 사이클 `heartbeat.txt` 갱신.
  - StartInterval이 아니라 KeepAlive인 이유: macOS가 소프트웨어 업데이트 재시동을 기다리는 동안
    launchd가 신규 잡 스폰을 전부 보류한다(2026-07-17 장애, 아래). 이미 떠 있는 프로세스는 무사하다.
  - **cron 생존 감시**(30분 주기, `check-heartbeat.sh`): heartbeat가 10분+ 오래되면 알림 + `alerts.log`.
    cron은 Full Disk Access가 없어 chat.db를 못 읽으므로 수집 대행은 불가, 감시만 맡는다.
  - poll.sh는 락(`poll.lock`)으로 동시 실행을 막는다 (수동 실행과 루프가 겹쳐도 안전).
  - 본문은 `text` 컬럼 또는 `attributedBody` BLOB(typedstream) 두 곳 중 하나에 있다.
    2026-07-16부터 수신 문자가 attributedBody에만 저장되기 시작해 python3 디코딩 폴백 추가 (PR #45).
  - **watchdog.sh**(poll-loop 내부, 6시간 주기): 도착 1시간+ 지난 미처리 문자가 state 뒤에 남아있으면 macOS 알림.
    poll.sh가 조용히 멈추는 사고(포맷 변경 등)를 당일에 알아채기 위한 장치.
  - poll.sh 자체도 attributedBody 디코딩 실패 시 `failed-decodes.log` 기록 + 알림(6시간 스로틀).
- **Vercel**: `/api/budget/auto`가 인증 + rate limit + 카드 파서 + 사전 조회 후 INSERT.
- **Supabase**: `budget_entries` (UNIQUE 중복 방지), `merchant_category_map` (사전).

## 환경변수

### Vercel

| 키 | 용도 |
|---|---|
| `BUDGET_SMS_SECRET` | 256bit 랜덤. 맥미니의 `secret.env`와 동일 |
| `DEFAULT_USER_ID` | Supabase auth.users 기준 본인 uuid (이미 `/api/collect`에서 사용 중) |
| `SUPABASE_SERVICE_ROLE_KEY` | RLS 우회용. 이미 다른 endpoint에서 사용 중 |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | rate limit. 누락 시 fail-open (개발 편의) |

### 맥미니

`~/Library/Application Support/budget-sms/secret.env`:

```bash
export BUDGET_SMS_SECRET="..."         # Vercel과 동일
export BUDGET_SMS_API_URL="..."        # 선택, 기본은 prod 도메인
```

## Secret 로테이션 (분기 1회 권장 / 유출 즉시)

1. 새 secret 생성: `openssl rand -hex 32`.
2. Vercel 대시보드 → Settings → Environment Variables → `BUDGET_SMS_SECRET` 값 교체 → Redeploy.
3. 맥미니 `secret.env` 갱신:
   ```bash
   nano "$HOME/Library/Application Support/budget-sms/secret.env"
   ```
4. 로테이션 동안 진입한 SMS 1~2건은 401로 실패할 수 있음. 만약 macOS 알림이 떴다면 secret.env 값과 Vercel 값이 다른 상태 → 동기화 후 다음 30초에 자동 재시도.
5. 검증: 새 결제 1건 발생 후 가계부 페이지에 entry 들어왔는지 확인.

## 새 카드 파서 추가 (예: 하나체크카드)

1. **SMS 샘플 수집**: 카드사 알림 신청 → 첫 결제 SMS 1~2건 raw 텍스트 메모.
2. **파서 작성**: `src/lib/budget/parsers/<카드>.ts` 신규.
   - 시그니처: `export const parse<카드>: ParseFn = (text, smsDate) => Parsed | null`
   - 키워드 식별 → null 빠르게 반환
   - 정규식으로 amount/date/merchant 추출
3. **단위 테스트**: `src/lib/budget/parsers/<카드>.test.ts` 픽스처 1~2개.
4. **등록**: `src/lib/budget/parsers/index.ts`의 `parsers` 배열에 import + 추가.
5. **커밋 + 배포**: PR → merge → Vercel 자동 배포.
6. **검증**: 다음 결제부터 자동 분류 흐름 시작.

## 디버깅

### "결제했는데 가계부에 안 떠요"

체크 순서:

1. `~/Library/Application Support/budget-sms/state.txt` — ROWID가 결제 SMS 도착 시점보다 큰가?
2. `stderr.log` — 에러 메시지?
3. `failed-parses.log` — 파싱 실패로 빠진 게 있나? 새 카드 형식이면 위 절차로 파서 추가.
4. `failed-decodes.log` — attributedBody 디코딩 실패? 저장 포맷이 또 바뀐 것 → poll.sh의 decode_body 수정.
5. `failed-network.log` — 네트워크 실패 누적?
6. 수동 호출: `bash "$HOME/Library/Application Support/budget-sms/poll.sh"`
7. Vercel logs: `/api/budget/auto`로 들어온 호출 보기.
8. Supabase: `select * from budget_entries order by created_at desc limit 5;`

주의: chat.db를 눈으로 확인할 때 `text` 컬럼만 보면 안 됨 — 최근 문자는 text가 NULL이고
본문이 `attributedBody`에만 있다 (시간이 지나면 과거 행도 NULL로 바뀜).

### "state가 멈췄는데 stderr.log도 조용해요" (launchd pended spawn)

2026-07-17 장애. 증상: 수동 실행(`bash poll.sh`)은 정상인데 launchd 주기 실행이 전혀 안 됨.
`launchctl print gui/$(id -u)/com.daniel.budget-sms`에서 `runs`가 안 올라가고
`pended nondemand spawn`이 보이면 이 케이스.

원인: macOS가 소프트웨어 업데이트 **재시동을 기다리는 상태**면 launchd가 신규 잡 스폰을
전부 보류한다. 이 상태에서 setup.sh 등으로 잡을 재로드하면 "이미 돌던 잡"이 "새로 스폰할 잡"이
되어 그대로 멈춘다. 당시 watchdog도 별도 launchd 잡이라 같이 죽어 알림조차 안 왔다.
이 장애를 계기로 StartInterval → KeepAlive 장수 프로세스(poll-loop.sh)로 전환했다.

조치:

1. 응급: `launchctl kickstart gui/$(id -u)/com.daniel.budget-sms` — **직접 스폰은 보류에 안 걸린다.**
   KeepAlive 루프라 한 번 뜨면 계속 돈다. (수동 `bash poll.sh` 1회 실행도 가능.)
2. heartbeat 확인: `cat heartbeat.txt` 값이 최근 타임스탬프면 루프 정상.
3. 근본: 맥 재시동. `pmset -g log | grep RestartCountdown`으로 대기 중인 업데이트 재시동 확인 가능.
   (재시동 대기 상태가 아닌데도 재발하면 cron 감시 알림(`alerts.log`)이 30분 내에 뜬다.)

### "401 에러 macOS 알림이 자꾸 떠요"

= secret 불일치. Vercel 값과 secret.env 값을 다시 비교.

### "rate limit 자꾸 걸려요"

`@upstash` 대시보드에서 `budget-sms-m:budget-sms:global` 키 확인. 정상 사용에선 분당 30건 도달 어려움. 폭주는 봇 또는 chat.db 폴링 버그.

### "특정 가맹점이 자꾸 잘못된 카테고리로 들어와요"

`merchant_category_map`에 학습된 매핑이 잘못됨:

```sql
update merchant_category_map set category='카페' where merchant='스타벅스' and user_id='<your uuid>';
```

또는 사용자가 가계부 페이지에서 미분류 entry를 분류해도 됨 (자동 학습). 그러나 이미 분류된 entry를 다른 카테고리로 바꿀 때는 학습이 일어나지 **않음**(spec 의도) — SQL로 직접 수정 필요.

## 비용 모니터링 포인트

- Vercel Function Invocations (월 한도 100k): `/api/budget/auto` 호출 수.
- Supabase row 수: `budget_entries`, `merchant_category_map`.
- Upstash commands: 한도의 1% 미만이어야 정상.
