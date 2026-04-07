"use client";

import { useState, useEffect, useCallback } from "react";
import { BUDGET_CATEGORIES, PAYMENT_METHODS, FIXED_EXPENSES } from "@/lib/constants";
import { supabase } from "@/lib/supabase";

type Tab = "입력" | "월급" | "월별요약";

type FormState = {
  date: string;
  category: (typeof BUDGET_CATEGORIES)[number];
  description: string;
  memo: string;
  amount: string;
  paymentMethod: (typeof PAYMENT_METHODS)[number];
};

type BudgetEntry = {
  id: string;
  date: string;
  category: string;
  description: string | null;
  memo: string | null;
  amount: number;
  payment_method: string;
};

const CAT_COLORS: Record<string, string> = {
  고정지출: "#6366f1",
  할부:     "#8b5cf6",
  식사:     "#f59e0b",
  카페:     "#f97316",
  간식:     "#fbbf24",
  생필품:   "#10b981",
  교통:     "#3b82f6",
  취미:     "#ec4899",
  회사:     "#6b7280",
  병원:     "#14b8a6",
  도파민:   "#ef4444",
};

function DonutChart({ data }: { data: { category: string; amount: number }[] }) {
  const total = data.reduce((s, d) => s + d.amount, 0);
  if (total === 0) return (
    <div className="w-40 h-40 flex items-center justify-center">
      <p className="text-xs text-gray-300">데이터 없음</p>
    </div>
  );

  const size = 160;
  const r = 58;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;

  let offset = 0;
  const slices = data.map((d) => {
    const pct = d.amount / total;
    const dash = Math.max(pct * circ - 2, 0);
    const s = { ...d, pct, dash, offset };
    offset += pct;
    return s;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map((s) => (
        <circle key={s.category} cx={cx} cy={cy} r={r} fill="none"
          stroke={CAT_COLORS[s.category] ?? "#d1d5db"} strokeWidth={22}
          strokeDasharray={`${s.dash} ${circ}`}
          strokeDashoffset={-s.offset * circ}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      ))}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="11" fill="#9ca3af">총 지출</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="14" fontWeight="500" fill="#111">
        {(total / 10000).toFixed(0)}만원
      </text>
    </svg>
  );
}

export default function BudgetPage() {
  const [activeTab, setActiveTab] = useState<Tab>("입력");
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // 입력 탭
  const [form, setForm] = useState<FormState>({
    date: todayStr,
    category: BUDGET_CATEGORIES[0],
    description: "",
    memo: "",
    amount: "",
    paymentMethod: PAYMENT_METHODS[0],
  });
  const [saving, setSaving] = useState(false);
  const [todayEntries, setTodayEntries] = useState<BudgetEntry[]>([]);
  const [fixedLoading, setFixedLoading] = useState(false);
  const [fixedResult, setFixedResult] = useState<string | null>(null);

  // 클립보드 카드 문자 감지
  const [clipText, setClipText] = useState<string | null>(null);
  const [clipParsing, setClipParsing] = useState(false);

  // 월급 탭
  const [salaryForm, setSalaryForm] = useState({ date: todayStr, amount: "" });
  const [salarySaving, setSalarySaving] = useState(false);

  // 공통 월별 state (월급 탭 + 월별요약 탭에서 공유)
  const [summaryYear, setSummaryYear] = useState(today.getFullYear());
  const [summaryMonth, setSummaryMonth] = useState(today.getMonth() + 1);
  const [monthlyEntries, setMonthlyEntries] = useState<BudgetEntry[]>([]);
  const [monthlySalary, setMonthlySalary] = useState(0);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  const fetchToday = useCallback(async () => {
    const { data } = await supabase
      .from("budget_entries")
      .select("*")
      .eq("date", todayStr)
      .order("created_at", { ascending: false });
    setTodayEntries((data as BudgetEntry[]) ?? []);
  }, [todayStr]);

  const fetchMonthly = useCallback(async (year: number, month: number) => {
    setMonthlyLoading(true);
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = new Date(year, month, 0).toISOString().split("T")[0];

    const [entriesRes, salaryRes] = await Promise.all([
      supabase.from("budget_entries").select("*").gte("date", start).lte("date", end),
      supabase.from("salary_entries").select("*")
        .gte("date", start).lte("date", end)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
    setMonthlyEntries((entriesRes.data as BudgetEntry[]) ?? []);
    setMonthlySalary((salaryRes.data?.[0] as { amount: number } | undefined)?.amount ?? 0);
    setMonthlyLoading(false);
  }, []);

  useEffect(() => { fetchToday(); }, [fetchToday]);

  // 입력 탭 진입 시 클립보드 감지
  useEffect(() => {
    if (activeTab !== "입력") return;
    (async () => {
      try {
        const text = await navigator.clipboard.readText();
        const isCard =
          (text.includes("현대카드") || text.includes("우리카드") || text.includes("승인")) &&
          text.includes("원");
        setClipText(isCard ? text : null);
      } catch {
        // 권한 없으면 조용히 무시
        setClipText(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (activeTab === "월급" || activeTab === "월별요약") {
      fetchMonthly(summaryYear, summaryMonth);
    }
  }, [activeTab, summaryYear, summaryMonth, fetchMonthly]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) return;
    setSaving(true);
    const { error } = await supabase.from("budget_entries").insert({
      date: form.date,
      category: form.category,
      description: form.description || null,
      memo: form.memo || null,
      amount: Number(form.amount),
      payment_method: form.paymentMethod,
    });
    if (!error) {
      setForm((prev) => ({ ...prev, description: "", memo: "", amount: "" }));
      await fetchToday();
    }
    setSaving(false);
  }

  async function handleClipParse() {
    if (!clipText) return;
    setClipParsing(true);
    try {
      const res = await fetch("/api/budget/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: clipText }),
      });
      const json = await res.json();
      if (json.ok && json.entry) {
        const e = json.entry;
        const method = PAYMENT_METHODS.includes(e.payment_method as typeof PAYMENT_METHODS[number])
          ? (e.payment_method as typeof PAYMENT_METHODS[number])
          : PAYMENT_METHODS[0];
        setForm((prev) => ({
          ...prev,
          amount: String(e.amount),
          memo: e.memo ?? "",
          date: e.date ?? prev.date,
          paymentMethod: method,
        }));
        setClipText(null); // 배너 숨김
      }
    } finally {
      setClipParsing(false);
    }
  }

  async function handleFixedExpenses() {
    setFixedLoading(true);
    setFixedResult(null);
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = new Date(year, month, 0).toISOString().split("T")[0];

    // 이번 달 고정지출 카테고리 항목 이름 조회
    const { data: existing } = await supabase
      .from("budget_entries")
      .select("description")
      .eq("category", "고정지출")
      .gte("date", start)
      .lte("date", end);

    const existingNames = new Set((existing ?? []).map((e: { description: string | null }) => e.description));
    const toInsert = FIXED_EXPENSES.filter((e) => !existingNames.has(e.description));

    if (toInsert.length === 0) {
      setFixedResult("이미 이번 달 고정지출이 모두 있어요");
      setFixedLoading(false);
      return;
    }

    await supabase.from("budget_entries").insert(
      toInsert.map((e) => ({
        date: start,
        category: "고정지출",
        description: e.description,
        memo: null,
        amount: e.amount,
        payment_method: e.paymentMethod,
      }))
    );

    setFixedResult(`${toInsert.length}개 추가됨${existingNames.size > 0 ? ` (${existingNames.size}개 스킵)` : ""}`);
    await fetchToday();
    setFixedLoading(false);
  }

  async function handleSalarySave() {
    if (!salaryForm.amount || Number(salaryForm.amount) <= 0) return;
    setSalarySaving(true);
    await supabase.from("salary_entries").insert({
      date: salaryForm.date,
      amount: Number(salaryForm.amount),
    });
    setSalaryForm((prev) => ({ ...prev, amount: "" }));
    await fetchMonthly(summaryYear, summaryMonth);
    setSalarySaving(false);
  }

  function prevMonth() {
    if (summaryMonth === 1) { setSummaryYear((y) => y - 1); setSummaryMonth(12); }
    else setSummaryMonth((m) => m - 1);
  }
  function nextMonth() {
    if (summaryMonth === 12) { setSummaryYear((y) => y + 1); setSummaryMonth(1); }
    else setSummaryMonth((m) => m + 1);
  }

  const categorySummary = BUDGET_CATEGORIES
    .map((cat) => ({
      category: cat,
      amount: monthlyEntries.filter((e) => e.category === cat).reduce((s, e) => s + e.amount, 0),
    }))
    .filter((c) => c.amount > 0);

  const totalExpense = monthlyEntries.reduce((s, e) => s + e.amount, 0);
  const savings = monthlySalary - totalExpense;

  return (
    <div className="flex flex-col h-full">
      {/* 상단 탭 */}
      <div className="flex border-b border-gray-100 bg-white sticky top-0 z-10">
        {(["입력", "월급", "월별요약"] as Tab[]).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm transition-colors ${
              activeTab === tab ? "text-black border-b-2 border-black font-medium" : "text-gray-400"
            }`}
          >{tab}</button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── 입력 탭 ── */}
        {activeTab === "입력" && (
          <>
            {/* 클립보드 카드 문자 감지 배너 */}
            {clipText && (
              <button
                type="button"
                onClick={handleClipParse}
                disabled={clipParsing}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-left active:opacity-70 disabled:opacity-50"
                style={{ background: "linear-gradient(90deg, #d1fae5, #a7f3d0)" }}
              >
                <span className="text-base">💳</span>
                <span className="text-sm font-medium text-emerald-800 flex-1">
                  {clipParsing ? "파싱 중..." : "카드 결제 문자 감지됨 → 탭하여 입력"}
                </span>
                <span className="text-emerald-500 text-lg">›</span>
              </button>
            )}

            {/* 고정지출 불러오기 */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
              <span className="text-xs text-gray-400">
                {fixedResult ?? `고정지출 ${FIXED_EXPENSES.length}개`}
              </span>
              <button type="button" onClick={handleFixedExpenses} disabled={fixedLoading}
                className="text-xs font-medium text-black disabled:opacity-40 active:opacity-60"
              >{fixedLoading ? "처리 중..." : "이번 달 불러오기"}</button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col divide-y divide-gray-100">
              <div className="flex items-center px-4 py-3 gap-3">
                <span className="text-xs text-gray-400 w-14 flex-shrink-0">날짜</span>
                <input type="date" name="date" value={form.date} onChange={handleChange}
                  className="flex-1 text-sm text-right bg-transparent outline-none" />
              </div>

              <div className="px-4 py-3">
                <span className="text-xs text-gray-400 block mb-2">카테고리</span>
                <div className="flex flex-wrap gap-1.5">
                  {BUDGET_CATEGORIES.map((cat) => (
                    <button key={cat} type="button"
                      onClick={() => setForm((p) => ({ ...p, category: cat }))}
                      className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                        form.category === cat ? "bg-black text-white" : "bg-gray-100 text-gray-600"
                      }`}
                    >{cat}</button>
                  ))}
                </div>
              </div>

              <div className="flex items-center px-4 py-3 gap-3">
                <span className="text-xs text-gray-400 w-14 flex-shrink-0">항목</span>
                <input type="text" name="description" value={form.description} onChange={handleChange}
                  placeholder="커피, 점심, 교통비..."
                  className="flex-1 text-sm text-right bg-transparent outline-none placeholder:text-gray-300" />
              </div>

              <div className="flex items-center px-4 py-3 gap-3">
                <span className="text-xs text-gray-400 w-14 flex-shrink-0">메모</span>
                <input type="text" name="memo" value={form.memo} onChange={handleChange}
                  placeholder="한마디 남기기 (선택)"
                  className="flex-1 text-sm text-right bg-transparent outline-none placeholder:text-gray-300" />
              </div>

              <div className="flex items-center px-4 py-3 gap-3">
                <span className="text-xs text-gray-400 w-14 flex-shrink-0">금액</span>
                <input type="number" name="amount" value={form.amount} onChange={handleChange}
                  placeholder="0" inputMode="numeric"
                  className="flex-1 text-right text-xl font-medium bg-transparent outline-none placeholder:text-gray-300" />
                <span className="text-sm text-gray-400">원</span>
              </div>

              <div className="px-4 py-3">
                <span className="text-xs text-gray-400 block mb-2">결제수단</span>
                <div className="flex gap-1.5">
                  {PAYMENT_METHODS.map((method) => (
                    <button key={method} type="button"
                      onClick={() => setForm((p) => ({ ...p, paymentMethod: method }))}
                      className={`flex-1 py-1.5 rounded-xl text-xs transition-colors ${
                        form.paymentMethod === method ? "bg-black text-white" : "bg-gray-100 text-gray-600"
                      }`}
                    >{method}</button>
                  ))}
                </div>
              </div>

              <div className="flex justify-center py-4">
                <button type="submit" disabled={saving || !form.amount}
                  className="px-10 py-2.5 bg-black text-white rounded-2xl text-sm font-medium active:opacity-75 disabled:opacity-40"
                >{saving ? "저장 중..." : "저장"}</button>
              </div>
            </form>

            {/* 오늘 지출 목록 */}
            {todayEntries.length > 0 && (
              <div className="border-t border-gray-100">
                <p className="text-[11px] text-gray-400 px-4 pt-3 pb-1">오늘 지출</p>
                {todayEntries.map((entry, i) => (
                  <div key={entry.id}
                    className={`flex items-center gap-3 px-4 py-2.5 ${
                      i < todayEntries.length - 1 ? "border-b border-gray-50" : ""
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: CAT_COLORS[entry.category] ?? "#d1d5db" }} />
                    <span className="text-xs flex-1 text-gray-700">
                      {entry.description ?? entry.category}
                    </span>
                    <span className="text-xs text-gray-400">{entry.payment_method}</span>
                    <span className="text-sm font-medium">{entry.amount.toLocaleString()}원</span>
                  </div>
                ))}
                <div className="flex justify-between items-center px-4 py-2.5 bg-gray-50">
                  <span className="text-xs text-gray-400">오늘 합계</span>
                  <span className="text-sm font-medium">
                    {todayEntries.reduce((s, e) => s + e.amount, 0).toLocaleString()}원
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── 월급 탭 ── */}
        {activeTab === "월급" && (
          <div className="flex flex-col divide-y divide-gray-100">
            <div className="flex items-center px-4 py-3 gap-3">
              <span className="text-xs text-gray-400 w-14 flex-shrink-0">날짜</span>
              <input type="date" value={salaryForm.date}
                onChange={(e) => setSalaryForm((p) => ({ ...p, date: e.target.value }))}
                className="flex-1 text-sm text-right bg-transparent outline-none" />
            </div>
            <div className="flex items-center px-4 py-3 gap-3">
              <span className="text-xs text-gray-400 w-14 flex-shrink-0">금액</span>
              <input type="number" value={salaryForm.amount} inputMode="numeric"
                onChange={(e) => setSalaryForm((p) => ({ ...p, amount: e.target.value }))}
                placeholder="0"
                className="flex-1 text-right text-xl font-medium bg-transparent outline-none placeholder:text-gray-300" />
              <span className="text-sm text-gray-400">원</span>
            </div>
            <div className="flex justify-center py-4">
              <button onClick={handleSalarySave} disabled={salarySaving || !salaryForm.amount}
                className="px-10 py-2.5 bg-black text-white rounded-2xl text-sm font-medium active:opacity-75 disabled:opacity-40"
              >{salarySaving ? "저장 중..." : "저장"}</button>
            </div>

            <div className="px-4 py-4">
              <p className="text-[11px] text-gray-400 mb-3">
                {summaryYear}년 {summaryMonth}월 요약
              </p>
              {monthlyLoading ? (
                <p className="text-center text-gray-300 text-xs py-4">로딩 중...</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "월급", value: monthlySalary, color: "text-black", bg: "bg-gray-50" },
                    { label: "지출", value: totalExpense, color: "text-red-500", bg: "bg-red-50" },
                    {
                      label: "저축", value: savings,
                      color: savings >= 0 ? "text-blue-500" : "text-red-500",
                      bg: savings >= 0 ? "bg-blue-50" : "bg-red-50",
                    },
                  ].map((item) => (
                    <div key={item.label} className={`${item.bg} rounded-2xl p-3 flex flex-col gap-1`}>
                      <span className="text-[10px] text-gray-400">{item.label}</span>
                      <span className={`text-sm font-medium ${item.color} leading-tight`}>
                        {item.value.toLocaleString()}원
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 월별요약 탭 ── */}
        {activeTab === "월별요약" && (
          <div className="flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <button onClick={prevMonth} className="text-gray-400 text-xl px-1 active:opacity-50">‹</button>
              <span className="text-sm font-medium">{summaryYear}년 {summaryMonth}월</span>
              <button onClick={nextMonth} className="text-gray-400 text-xl px-1 active:opacity-50">›</button>
            </div>

            {monthlyLoading ? (
              <p className="text-center text-gray-300 text-sm py-12">로딩 중...</p>
            ) : (
              <>
                <div className="flex divide-x divide-gray-100 border-b border-gray-100">
                  {[
                    { label: "월급", value: monthlySalary, color: "text-black" },
                    { label: "지출", value: totalExpense, color: "text-red-500" },
                    { label: "잔액", value: savings, color: savings >= 0 ? "text-black" : "text-red-500" },
                  ].map((item) => (
                    <div key={item.label} className="flex-1 flex flex-col items-center py-4 gap-0.5">
                      <span className="text-[10px] text-gray-400">{item.label}</span>
                      <span className={`text-sm font-medium ${item.color}`}>
                        {item.value.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>

                {categorySummary.length > 0 ? (
                  <>
                    <div className="flex items-center gap-4 px-4 py-5">
                      <DonutChart data={categorySummary} />
                      <div className="flex flex-col gap-1.5 flex-1">
                        {categorySummary.slice(0, 5).map((d) => (
                          <div key={d.category} className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: CAT_COLORS[d.category] ?? "#d1d5db" }} />
                            <span className="text-xs text-gray-500 flex-1">{d.category}</span>
                            <span className="text-xs font-medium">
                              {totalExpense > 0 ? ((d.amount / totalExpense) * 100).toFixed(0) : 0}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border-t border-gray-100">
                      <p className="text-[10px] text-gray-400 px-4 pt-3 pb-1">카테고리별 지출</p>
                      {categorySummary.map((d, i) => (
                        <div key={d.category}
                          className={`flex items-center gap-3 px-4 py-2.5 ${
                            i < categorySummary.length - 1 ? "border-b border-gray-50" : ""
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: CAT_COLORS[d.category] ?? "#d1d5db" }} />
                          <span className="text-sm flex-1">{d.category}</span>
                          <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full"
                              style={{
                                width: `${(d.amount / totalExpense) * 100}%`,
                                background: CAT_COLORS[d.category] ?? "#d1d5db",
                              }} />
                          </div>
                          <span className="text-xs text-gray-500 w-16 text-right">
                            {d.amount.toLocaleString()}원
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-center text-gray-300 text-xs py-12">이번 달 지출이 없어요</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
