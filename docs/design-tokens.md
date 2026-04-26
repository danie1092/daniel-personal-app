# 디자인 토큰 가이드 (Phase 1)

`src/app/globals.css`의 `@theme` directive로 정의됨. Tailwind 유틸리티 클래스로 사용.

## 색상

| 토큰 | 값 | 클래스 예시 | 용도 |
|------|-----|-------------|------|
| `--color-bg` | `#F4F6F8` | `bg-bg` | 페이지 배경 |
| `--color-surface` | `#FFFFFF` | `bg-surface` | 카드/시트 표면 |
| `--color-ink` | `#121417` | `text-ink` | 본문 텍스트 |
| `--color-ink-sub` | `#6B7684` | `text-ink-sub` | 보조 텍스트 |
| `--color-ink-muted` | `#8B95A1` | `text-ink-muted` | 약한 텍스트(라벨, 메타) |
| `--color-hair` | `#E5E8EB` | `border-hair` | 카드 외곽선 |
| `--color-hair-light` | `#F2F4F6` | `border-hair-light`, `bg-hair-light` | 안쪽 구분선/조용한 배경 |
| `--color-primary` | `#2E6FF2` | `bg-primary`, `text-primary` | 주요 액션, 활성 상태 |
| `--color-primary-soft` | `#E8F0FE` | `bg-primary-soft` | 활성 상태 배경 |
| `--color-success` | `#22C55E` | `bg-success`, `text-success` | 완료/성공 (홈 루틴) |
| `--color-success-soft` | `#DCFCE7` | `bg-success-soft` | 완료 배경 |
| `--color-danger` | `#DC2626` | `text-danger` | 오류/경고 |
| `--color-danger-soft` | `#FDECEC` | `bg-danger-soft` | 오류 배경 |
| `--color-warning` | `#F59E0B` | `text-warning` | 주의 |

## 라디우스

| 토큰 | 값 | 클래스 | 용도 |
|------|-----|--------|------|
| `--radius-card` | `16px` | `rounded-card` | 일반 카드 |
| `--radius-card-lg` | `20px` | `rounded-card-lg` | 큰 카드(KPI) |
| `--radius-sheet` | `24px` | `rounded-sheet` | 바텀시트 |
| `--radius-btn` | `14px` | `rounded-btn` | 둥근 버튼 |
| `--radius-input` | `12px` | `rounded-input` | 입력 필드 |
| `--radius-chip` | `6px` | `rounded-chip` | chip/태그 |

## 그림자

| 토큰 | 클래스 | 용도 |
|------|--------|------|
| `--shadow-card` | `shadow-card` | 카드 들기 |
| `--shadow-soft` | `shadow-soft` | 약한 들기 |
| `--shadow-fab` | `shadow-fab` | FAB 버튼 |

## 폰트

`Pretendard Variable`이 기본. weight: 300/500/700/800.

폰트 사이즈는 Tailwind 기본 사이즈(`text-xs/sm/base/lg/xl/2xl/3xl/...`)와 임의 사이즈(`text-[14px]`) 혼용. 자주 쓰는 패턴:
- 카드 제목: `text-[14px] font-bold`
- KPI 숫자: `text-[28px] font-extrabold tracking-tight`
- 라벨: `text-[10px] font-extrabold tracking-wider text-ink-sub uppercase`
- 본문: `text-[13px]` 또는 `text-[12px]`
- 메타: `text-[11px] text-ink-sub`

## 컴포넌트 패턴

### 카드
```tsx
<div className="bg-surface rounded-card p-4 mb-3 border border-hair shadow-card">
  ...
</div>
```

### 카드 (탭 가능, 링크)
```tsx
<Link href="/x" className="block bg-surface rounded-card p-4 mb-3 border border-hair shadow-card active:opacity-80">
  ...
</Link>
```

### 라벨
```tsx
<div className="text-[10px] font-extrabold tracking-wider text-ink-sub uppercase">
  이번달 지출
</div>
```

### 진행률 바
```tsx
<div className="h-2 bg-hair-light rounded-full overflow-hidden">
  <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
</div>
```

### Chip (선택 가능)
```tsx
<span className="text-[11px] px-2.5 py-1 bg-hair-light text-ink-sub rounded-input font-semibold">
  ...
</span>
```

## Phase 1.5 적용 가이드

메모/가계부/일기/루틴 페이지를 리노베이션할 때:
1. 모든 텍스트 색은 `text-ink/text-ink-sub/text-ink-muted` 중 하나만 사용
2. 카드는 위 패턴 따름 (`bg-surface rounded-card p-4 border border-hair shadow-card`)
3. 액션 버튼은 `bg-ink text-white` 또는 `bg-primary text-white`
4. 가계부 카테고리 색상은 Phase 1.5 진입 시 별도로 정의 (이 가이드 갱신)
