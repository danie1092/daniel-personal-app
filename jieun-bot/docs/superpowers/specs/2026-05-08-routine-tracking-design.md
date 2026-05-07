# 루틴 트래킹 + 컨디션 기록 설계

**날짜:** 2026-05-08  
**브랜치:** blissful-gates-fa9b73  
**작업 위치:** `jieun-bot/`

---

## 목표

지은이가 텔레그램 대화를 통해 자연스럽게:
1. 다영의 루틴 체크를 유도하고 Notion에 기록
2. 컨디션(수면/기분/에너지) + 끼니를 수집해 DB + Notion에 저장
3. 데이터가 쌓이면 패턴 기반으로 루틴 추가/제거 제안

---

## 섹션 1: 데이터 모델

### 새 Supabase 테이블: `daily_log`

```sql
CREATE TABLE daily_log (
  date           DATE PRIMARY KEY,
  sleep_score    SMALLINT,        -- 1~5
  sleep_text     TEXT,
  mood_score     SMALLINT,
  mood_text      TEXT,
  energy_score   SMALLINT,
  energy_text    TEXT,
  breakfast      TEXT,
  lunch          TEXT,
  dinner         TEXT,
  updated_at     TIMESTAMPTZ DEFAULT now()
);
```

입력 포맷: `"2점이야. 분명 잘잤는데 개운하지 않아"` → sleep_score=2, sleep_text="분명 잘잤는데 개운하지 않아"

### 기존 `routine_items` 변경

Notion DB `✅ 루틴 항목`에 `시간대(select)` 컬럼 추가: `아침` / `낮` / `저녁`  
Supabase `routine_items` 테이블에도 `time_slot TEXT` 컬럼 추가.

syncRoutineItems()에서 `시간대` → `time_slot` 매핑 포함.

### 루틴 목록 (초기값)

| 항목 | time_slot | 레이어 |
|---|---|---|
| 물 한 잔 | morning | 컨디션 |
| 영양제 챙겨먹기 (유산균, 오메가3) | morning | 컨디션 |
| 오늘 할 일 1개만 정하기 | morning | 컨디션 |
| 옥상/바깥 5~10분 | afternoon | 컨디션 |
| 하루 2끼 먹기 | afternoon | **생존** |
| 집에 오자마자 씻기 | evening | **생존** |
| 일기 한 줄 | evening | 컨디션 |
| 핸드폰 12시에 내려놓기 / 취침 목표 12:30 | evening | **생존** |

**생존 루틴**: 2끼, 씻기, 수면 루틴 — 이탈 시 지쳤거나 우울한 신호

### 새 Notion DB: `📊 일일 컨디션`

`다영이 기록` 페이지 하위 생성.

```
날짜(date) / 수면점수(number) / 수면메모(text)
기분점수(number) / 기분메모(text)
에너지점수(number) / 에너지메모(text)
아침(text) / 점심(text) / 저녁(text)
```

`✍️ 오늘` 페이지: 기존 컨디션/끼니 자유텍스트 블록 제거 → `📊 일일 컨디션` 인라인 뷰(오늘 날짜 필터)로 교체.

---

## 섹션 2: 액션 타입

기존 `src/claude/actions.ts`에 추가.

### 루틴 체크

```typescript
{ kind: "record_routine_check", item_id: string, checked: boolean, date: string }
```

배열로 여러 개 한 번에 가능.

### 컨디션

```typescript
{
  kind: "record_condition",
  date: string,
  sleep_score?: number,  sleep_text?: string,
  mood_score?: number,   mood_text?: string,
  energy_score?: number, energy_text?: string,
}
```

모든 필드 optional. 대화에서 나온 것만 채워서 emit. 같은 날짜면 UPDATE.

### 끼니

```typescript
{ kind: "record_meal", date: string, breakfast?: string, lunch?: string, dinner?: string }
```

### 루틴 변경 제안 (3-way handshake — 캘린더와 동일 패턴)

```typescript
{ kind: "propose_routine_change", change: "add" | "remove", name: string, time_slot: string, reason: string }
{ kind: "confirm_routine_change" }
{ kind: "cancel_routine_change" }
```

`reason` 필드에 구체적 수치 필수: `"에너지 2점↓ 3일 연속"` 등.

---

## 섹션 3: 루틴 컨텍스트 + 스케줄 + 시그널

### 컨텍스트 프로바이더: `src/routine/context.ts` (신규)

각 스케줄 트리거에 주입할 루틴 현황 텍스트 생성.

```typescript
buildRoutineContext(timeSlot: 'morning' | 'afternoon' | 'evening', date: string): Promise<string>
```

출력 예시:
```
[오늘 아침 루틴]
- 물 한 잔 (미체크)
- 영양제 (미체크)
- 오늘 할 일 1개 (미체크)
```

### 스케줄 변경 (`src/triggers/schedule.ts`)

| 시각 | 변경 내용 |
|---|---|
| 08:00 | contextSection에 아침 루틴 현황 추가. 지시: 첫 번째 루틴 하나만 자연스럽게 유도 |
| 12:30 | contextSection에 낮 루틴 + 끼니 현황 추가 |
| 23:00 | contextSection에 저녁 루틴 + 오늘 컨디션 현황 추가 |

### 시그널 2개 신규 (`src/signals/`)

**`survivalRoutineMiss`**
- 감지: 생존 루틴(2끼/씻기/수면) 중 1개라도 2일 연속 미체크
- 컨텍스트 주입: `"생존 루틴 이탈: [항목] 2일 연속 미체크"`
- 지은이 행동: 루틴 얘기 꺼내지 말고 조용히 상태 체크인

**`routineAdjustmentNeeded`**
- 감지 조건 (latent/weekly에서만):
  - 전체 이행률 7일 평균 50% 이하 → 루틴 줄이기 제안
  - 특정 루틴 4주 이행률 90% 이상 → 더하기 제안
  - 컨디션 점수 2점↓ 3일 연속 (survivalRoutineMiss랑 같이 확인)

---

## 섹션 4: Notion sync

### `syncDailyLog()` 신규 (`src/notion/sync.ts`에 추가)

- `daily_log` 최근 14일 → `📊 일일 컨디션` DB upsert
- 기존 30분 주기 `runNotionSync()` 잡에 포함

---

## 섹션 5: 프롬프트 룰

### 시스템 프롬프트 변경 전략

**핵심 원칙**: 프롬프트 비대화 방지.

| 룰 유형 | 위치 | 크기 |
|---|---|---|
| 기록 룰 (record_* emit 조건) | 시스템 프롬프트, user 트리거만 | ~10줄 |
| 루틴 유도 + 현황 | 각 크론의 contextSection | 동적 주입 |
| 생존 루틴 이탈 행동 | 시그널 발동 시 contextSection | 필요할 때만 |

### `ROUTINE_RECORDING_RULES` (신규, user 트리거만)

```
[루틴/컨디션 기록 — user 트리거, 방금 말한 것만]
루틴 완료 언급 → record_routine_check emit (item_id 맥락 매핑).
"2점이야. [설명]" → score 숫자 + text 분리해서 record_condition emit.
끼니 언급 → record_meal emit (해당 필드만).
같은 날짜 중복 emit → UPDATE로 처리.
추측으로 채우지 마. propose_routine_change는 latent/weekly에서만.
```

### 생존 루틴 이탈 시 contextSection에 주입

```
[주의] 생존 루틴 이탈 감지: [항목명] 2일 연속 미체크.
루틴 얘기 꺼내지 마. "요즘 좀 힘들어?" 조용히 한 마디만.
분석 X. 해결책 X. 같이 있기만.
```

---

## 구현 순서 (권장)

1. Supabase 마이그레이션 (`daily_log` + `routine_items.time_slot`)
2. Notion DB `📊 일일 컨디션` 생성 + `✍️ 오늘` 페이지 수정
3. 루틴 항목 초기값 노션에 입력 (time_slot 포함)
4. `src/claude/actions.ts` — 새 액션 타입 추가
5. `src/claude/executeActions.ts` — 새 액션 실행 로직
6. `src/routine/context.ts` — 루틴 컨텍스트 빌더
7. `src/signals/survivalRoutineMiss.ts` + `routineAdjustmentNeeded.ts`
8. `src/signals/compute.ts` — 새 시그널 연결
9. `src/notion/sync.ts` — `syncDailyLog()` 추가
10. `src/triggers/schedule.ts` — 3개 크론 컨텍스트 주입
11. `src/persona/prompt.ts` — `ROUTINE_RECORDING_RULES` 추가
12. 테스트 + notionSyncMap 테이블 확인
