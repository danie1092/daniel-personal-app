import { describe, test, expect } from "vitest";
import {
  detectSubscriptions,
  merchantKey,
  monthlySubscriptionTotal,
} from "./subscriptions";

type Row = {
  date: string;
  category: string;
  description: string | null;
  memo: string | null;
  amount: number;
  type: "income" | "saving" | "expense";
};

function row(p: Partial<Row>): Row {
  return {
    date: "2026-06-01",
    category: "구독",
    description: null,
    memo: null,
    amount: 9900,
    type: "expense",
    ...p,
  };
}

describe("merchantKey", () => {
  test("숫자·결제노이즈·괄호를 제거하고 정규화한다", () => {
    expect(merchantKey({ description: "넷플릭스 9,900원 일시불", memo: null })).toBe("넷플릭스");
    expect(merchantKey({ description: "NETFLIX.COM (신용승인)", memo: null })).toBe("netflix com");
  });

  test("description 이 없으면 memo 를 쓴다", () => {
    expect(merchantKey({ description: null, memo: "스타벅스 5500원" })).toBe("스타벅스");
  });
});

describe("detectSubscriptions", () => {
  test("같은 가맹점이 2개월 이상이면 구독으로 잡는다", () => {
    const subs = detectSubscriptions(
      [
        row({ date: "2026-04-10", description: "넷플릭스", amount: 9900 }),
        row({ date: "2026-05-10", description: "넷플릭스", amount: 9900 }),
        row({ date: "2026-06-10", description: "넷플릭스", amount: 9900 }),
      ],
      { nowYearMonth: "2026-06" }
    );
    expect(subs).toHaveLength(1);
    expect(subs[0].name).toBe("넷플릭스");
    expect(subs[0].typicalAmount).toBe(9900);
    expect(subs[0].months).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(subs[0].cadence).toBe("monthly");
    expect(subs[0].isNew).toBe(false);
  });

  test("'구독' 카테고리는 1개월만 있어도 신규로 잡는다", () => {
    const subs = detectSubscriptions(
      [row({ date: "2026-06-03", description: "디즈니플러스", category: "구독", amount: 9900 })],
      { nowYearMonth: "2026-06" }
    );
    expect(subs).toHaveLength(1);
    expect(subs[0].isNew).toBe(true);
    expect(subs[0].cadence).toBe("irregular");
  });

  test("일회성 식사는 구독으로 잡지 않는다", () => {
    const subs = detectSubscriptions(
      [
        row({ date: "2026-06-01", description: "김밥천국", category: "식사", amount: 8000 }),
        row({ date: "2026-06-15", description: "맥도날드", category: "식사", amount: 7000 }),
      ],
      { nowYearMonth: "2026-06" }
    );
    expect(subs).toHaveLength(0);
  });

  test("자주 가지만 금액이 들쭉날쭉한 편의점은 구독이 아니다 (오탐 방지)", () => {
    // 실데이터: GS25 가 3개월간 13번, 금액 제각각 → 구독 아님
    const subs = detectSubscriptions(
      [
        row({ date: "2026-04-03", description: "GS25응암송원", category: "미분류", amount: 3200 }),
        row({ date: "2026-04-12", description: "GS25응암송원", category: "미분류", amount: 8100 }),
        row({ date: "2026-04-25", description: "GS25응암송원", category: "미분류", amount: 1500 }),
        row({ date: "2026-05-08", description: "GS25응암송원", category: "미분류", amount: 6400 }),
        row({ date: "2026-05-19", description: "GS25응암송원", category: "미분류", amount: 2900 }),
        row({ date: "2026-06-02", description: "GS25응암송원", category: "미분류", amount: 5000 }),
      ],
      { nowYearMonth: "2026-06" }
    );
    expect(subs).toHaveLength(0);
  });

  test("미분류라도 월 1회꼴 + 금액 일정하면 구독으로 잡는다 (보험 등)", () => {
    // 실데이터: 삼성화재 보험이 미분류인데 매달 비슷한 금액
    const subs = detectSubscriptions(
      [
        row({ date: "2026-05-15", description: "삼성화재해상보험", category: "미분류", amount: 219000 }),
        row({ date: "2026-06-15", description: "삼성화재해상보험", category: "미분류", amount: 220000 }),
      ],
      { nowYearMonth: "2026-06" }
    );
    expect(subs).toHaveLength(1);
    expect(subs[0].name).toBe("삼성화재해상보험");
    expect(subs[0].cadence).toBe("monthly");
  });

  test("수입·저축은 제외한다", () => {
    const subs = detectSubscriptions(
      [
        row({ date: "2026-05-25", description: "월급", category: "월급", amount: 3000000, type: "income" }),
        row({ date: "2026-06-25", description: "월급", category: "월급", amount: 3000000, type: "income" }),
      ],
      { nowYearMonth: "2026-06" }
    );
    expect(subs).toHaveLength(0);
  });

  test("금액이 달라도 중앙값을 대표금액으로 쓴다 (관리비 등)", () => {
    const subs = detectSubscriptions(
      [
        row({ date: "2026-04-05", description: "관리비", category: "고정지출", amount: 120000 }),
        row({ date: "2026-05-05", description: "관리비", category: "고정지출", amount: 150000 }),
        row({ date: "2026-06-05", description: "관리비", category: "고정지출", amount: 135000 }),
      ],
      { nowYearMonth: "2026-06" }
    );
    expect(subs[0].typicalAmount).toBe(135000);
    expect(subs[0].cadence).toBe("monthly");
  });

  test("2달 넘게 끊기면 irregular", () => {
    const subs = detectSubscriptions(
      [
        row({ date: "2026-01-10", description: "헬스장", category: "취미", amount: 50000 }),
        row({ date: "2026-06-10", description: "헬스장", category: "취미", amount: 50000 }),
      ],
      { nowYearMonth: "2026-06" }
    );
    expect(subs).toHaveLength(1);
    expect(subs[0].cadence).toBe("irregular");
  });
});

describe("monthlySubscriptionTotal", () => {
  test("monthly 인 것만 합산한다", () => {
    const subs = detectSubscriptions(
      [
        row({ date: "2026-05-10", description: "넷플릭스", amount: 9900 }),
        row({ date: "2026-06-10", description: "넷플릭스", amount: 9900 }),
        row({ date: "2026-01-10", description: "헬스장", category: "취미", amount: 50000 }),
        row({ date: "2026-06-10", description: "헬스장", category: "취미", amount: 50000 }),
      ],
      { nowYearMonth: "2026-06" }
    );
    // 넷플릭스(monthly 9900)만 합산, 헬스장(irregular)은 제외
    expect(monthlySubscriptionTotal(subs)).toBe(9900);
  });
});
