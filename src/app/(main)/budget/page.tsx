"use client";

import { useState, useEffect, useCallback } from "react";
import { BUDGET_CATEGORIES, PAYMENT_METHODS, FIXED_EXPENSES } from "@/lib/constants";
import { supabase } from "@/lib/supabase";

type Tab = "입력" | "세부내역" | "월별요약";

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
  type: string | null;
};

function entryType(category: string): "income" | "saving" | "expense" {
  if (category === "월급") return "income";
  if (category === "저축") return "saving";
  return "expense";
}

const NO_PAYMENT_CATS = new Set(["월급", "저축"]);

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
  월급:     "#22c55e",
  저축:     "#60a5fa",
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

// Generate last 24 months as [{ year, month, label }]
function generateMonthOptions(currentYear: number, currentMonth: number) {
  const options = [];
  for (let i = 0; i < 24; i++) {
    let y = currentYear;
    let m = currentMonth - i;
    while (m <= 0) { m += 12; y -= 1; }
    options.push({ year: y, month: m, label: `${y}년 ${m}월` });
  }
  return options;
}

const INIT_FORM = (todayStr: string): FormState => ({
  date: todayStr,
  category: BUDGET_CATEGORIES[0],
  description: "",
  memo: "",
  amount: "",
  paymentMethod: PAYMENT_METHODS[0],
});

export default function BudgetPage() {
  const [activeTab, setActiveTab] = useState<Tab>("입력");
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // ── 입력 탭 ──
  const [form, setForm] = useState<FormState>(INIT_FORM(todayStr));
  const [saving, setSaving] = useState(false);
  const [todayEntries, setTodayEntries] = useState<BudgetEntry[]>([]);
  const [fixedLoading, setFixedLoading] = useState(false);
  const [fixedResult, setFixedResult] = useState<string | null>(null);
  const [clipParsing, setClipParsing] = useState(false);

  // ── 세부내역 탭 ──
  const [detailYear, setDetailYear] = useState(today.getFullYear());
  const [detailMonth, setDetailMonth] = useState(today.getMonth() + 1);
  const [detailEntries, setDetailEntries] = useState<BudgetEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editEntry, setEditEntry] = useState<BudgetEntry | null>(null);
  const [editForm, setEditForm] = useState<FormState>(INIT_FORM(todayStr));
  const [editSaving, setEditSaving] = useState(false);
  const [editDeleting, setEditDeleting] = useState(false);

  // ── 월별요약 탭 ──
  const [summaryYear, setSummaryYear] = useState(today.getFullYear());
  const [summaryMonth, setSummaryMonth] = useState(today.getMonth() + 1);
  const [monthlyEntries, setMonthlyEntries] = useState<BudgetEntry[]>([]);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  const monthOptions = generateMonthOptions(today.getFullYear(), today.getMonth() + 1);

  // ── Fetchers ──
  const fetchToday = useCallback(async () => {
    const { data } = await supabase
      .from("budget_entries")
      .select("*")
      .eq("date", todayStr)
      .order("created_at", { ascending: false });
    setTodayEntries((data as BudgetEntry[]) ?? []);
  }, [todayStr]);

  const fetchDetail = useCallback(async (year: number, month: number) => {
    setDetailLoading(true);
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = new Date(year, month, 0).toISOString().split("T")[0];
    const { data } = await supabase
      .from("budget_entries")
      .select("*")
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: false });
    setDetailEntries((data as BudgetEntry[]) ?? []);
    setDetailLoading(false);
  }, []);

  const fetchMonthly = useCallback(async (year: number, month: number) => {
    setMonthlyLoading(true);
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = new Date(year, month, 0).toISOString().split("T")[0];
    const { data } = await supabase
      .from("budget_entries")
      .select("*")
      .gte("date", start)
      .lte("date", end);
    setMonthlyEntries((data as BudgetEntry[]) ?? []);
    setMonthlyLoading(false);
  }, []);

  useEffect(() => { fetchToday(); }, [fetchToday]);

  useEffect(() => {
    if (activeTab === "세부내역") fetchDetail(detailYear, detailMonth);
  }, [activeTab, detailYear, detailMonth, fetchDetail]);

  useEffect(() => {
    if (activeTab === "월별요약") fetchMonthly(summaryYear, summaryMonth);
  }, [activeTab, summaryYear, summaryMonth, fetchMonthly]);

  // ── 입력 탭 handlers ──
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) return;
    setSaving(true);
    const type = entryType(form.category);
    const { error } = await supabase.from("budget_entries").insert({
      date: form.date,
      category: form.category,
      description: form.description || null,
      memo: form.memo || null,
      amount: Number(form.amount),
      payment_method: NO_PAYMENT_CATS.has(form.category) ? null : form.paymentMethod,
      type,
    });
    if (!error) {
      setForm((prev) => ({ ...prev, description: "", memo: "", amount: "" }));
      await fetchToday();
    }
    setSaving(false);
  }

  async function handleClipParse(textOverride?: string) {
    const raw = textOverride;
    if (!raw) return;
    setClipParsing(true);
    try {
      const res = await fetch("/api/budget/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: raw }),
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
        type: "expense",
      }))
    );

    setFixedResult(`${toInsert.length}개 추가됨${existingNames.size > 0 ? ` (${existingNames.size}개 스킵)` : ""}`);
    await fetchToday();
    setFixedLoading(false);
  }

  // ── 세부내역 탭 handlers ──
  function openEditModal(entry: BudgetEntry) {
    setEditEntry(entry);
    setEditForm({
      date: entry.date,
      category: BUDGET_CATEGORIES.includes(entry.category as typeof BUDGET_CATEGORIES[number])
        ? (entry.category as typeof BUDGET_CATEGORIES[number])
        : BUDGET_CATEGORIES[0],
      description: entry.description ?? "",
      memo: entry.memo ?? "",
      amount: String(entry.amount),
      paymentMethod: PAYMENT_METHODS.includes(entry.payment_method as typeof PAYMENT_METHODS[number])
        ? (entry.payment_method as typeof PAYMENT_METHODS[number])
        : PAYMENT_METHODS[0],
    });
  }

  function closeEditModal() {
    setEditEntry(null);
  }

  async function handleEditSave() {
    if (!editEntry || !editForm.amount || Number(editForm.amount) <= 0) return;
    setEditSaving(true);
    const type = entryType(editForm.category);
    await supabase.from("budget_entries").update({
      date: editForm.date,
      category: editForm.category,
      description: editForm.description || null,
      memo: editForm.memo || null,
      amount: Number(editForm.amount),
      payment_method: NO_PAYMENT_CATS.has(editForm.category) ? null : editForm.paymentMethod,
      type,
    }).eq("id", editEntry.id);
    await fetchDetail(detailYear, detailMonth);
    setEditSaving(false);
    closeEditModal();
  }

  async function handleEditDelete() {
    if (!editEntry) return;
    setEditDeleting(true);
    await supabase.from("budget_entries").delete().eq("id", editEntry.id);
    await fetchDetail(detailYear, detailMonth);
    setEditDeleting(false);
    closeEditModal();
  }

  // ── 월별요약 탭 ──
  function prevMonth() {
    if (summaryMonth === 1) { setSummaryYear((y) => y - 1); setSummaryMonth(12); }
    else setSummaryMonth((m) => m - 1);
  }
  function nextMonth() {
    if (summaryMonth === 12) { setSummaryYear((y) => y + 1); setSummaryMonth(1); }
    else setSummaryMonth((m) => m + 1);
  }

  const expenseEntries = monthlyEntries.filter((e) => (e.type ?? entryType(e.category)) === "expense");
  const monthlyIncome = monthlyEntries.filter((e) => (e.type ?? entryType(e.category)) === "income").reduce((s, e) => s + e.amount, 0);
  const monthlyExpense = expenseEntries.reduce((s, e) => s + e.amount, 0);
  const monthlySaving = monthlyEntries.filter((e) => (e.type ?? entryType(e.category)) === "saving").reduce((s, e) => s + e.amount, 0);

  const categorySummary = Array.from(
    expenseEntries.reduce((map, e) => {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
      return map;
    }, new Map<string, number>())
  )
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  return (
    <div className="flex flex-col h-full">
      {/* 탭 */}
      <div className="flex border-b border-gray-100 bg-white sticky top-0 z-10">
        {(["입력", "세부내역", "월별요약"] as Tab[]).map((tab) => (
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
            <button
              type="button"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  const isCard = (text.includes("현대카드") || text.includes("우리카드") || text.includes("승인")) && text.includes("원");
                  if (isCard) { await handleClipParse(text); }
                  else { alert("카드 결제 문자가 클립보드에 없어요"); }
                } catch { alert("클립보드 접근 권한이 없어요"); }
              }}
              disabled={clipParsing}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-left active:opacity-70 disabled:opacity-50"
              style={{ background: "linear-gradient(90deg, #d1fae5, #a7f3d0)" }}
            >
              <span className="text-base">💳</span>
              <span className="text-sm font-medium text-emerald-800 flex-1">
                {clipParsing ? "파싱 중..." : "카드 문자 붙여넣기"}
              </span>
              <span className="text-emerald-500 text-lg">›</span>
            </button>

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

              {!NO_PAYMENT_CATS.has(form.category) && (
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
              )}

              <div className="flex justify-center py-4">
                <button type="submit" disabled={saving || !form.amount}
                  className="px-10 py-2.5 bg-black text-white rounded-2xl text-sm font-medium active:opacity-75 disabled:opacity-40"
                >{saving ? "저장 중..." : "저장"}</button>
              </div>
            </form>

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
                    <button
                      type="button"
                      onClick={async () => {
                        await supabase.from("budget_entries").delete().eq("id", entry.id);
                        await fetchToday();
                      }}
                      className="text-gray-300 active:text-red-400 text-base pl-1"
                    >✕</button>
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

        {/* ── 세부내역 탭 ── */}
        {activeTab === "세부내역" && (
          <>
            <div className="px-4 py-3 border-b border-gray-100">
              <select
                value={`${detailYear}-${detailMonth}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split("-").map(Number);
                  setDetailYear(y);
                  setDetailMonth(m);
                }}
                className="w-full text-sm bg-transparent outline-none text-center font-medium"
              >
                {monthOptions.map((opt) => (
                  <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {detailLoading ? (
              <p className="text-center text-gray-300 text-sm py-12">로딩 중...</p>
            ) : detailEntries.length === 0 ? (
              <p className="text-center text-gray-300 text-xs py-12">이번 달 내역이 없어요</p>
            ) : (
              <div>
                {detailEntries.map((entry, i) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => openEditModal(entry)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left active:bg-gray-50 ${
                      i < detailEntries.length - 1 ? "border-b border-gray-50" : ""
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: CAT_COLORS[entry.category] ?? "#d1d5db" }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">
                        {entry.description ?? entry.category}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {entry.date.slice(5)} · {entry.category}
                        {entry.payment_method ? ` · ${entry.payment_method}` : ""}
                      </p>
                    </div>
                    <span className={`text-sm font-medium ${
                      (entry.type ?? entryType(entry.category)) === "income"
                        ? "text-green-600"
                        : (entry.type ?? entryType(entry.category)) === "saving"
                        ? "text-blue-500"
                        : "text-gray-900"
                    }`}>
                      {(entry.type ?? entryType(entry.category)) === "expense" ? "-" : "+"}
                      {entry.amount.toLocaleString()}원
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* 수정 모달 */}
            {editEntry && (
              <div
                className="fixed inset-0 bg-black/40 z-50 flex items-end"
                onClick={(e) => { if (e.target === e.currentTarget) closeEditModal(); }}
              >
                <div className="bg-white w-full rounded-t-2xl max-h-[85vh] overflow-y-auto">
                  <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
                    <span className="text-sm font-medium">내역 수정</span>
                    <button onClick={closeEditModal} className="text-gray-400 text-xl active:opacity-50">✕</button>
                  </div>

                  <div className="flex flex-col divide-y divide-gray-100">
                    <div className="flex items-center px-4 py-3 gap-3">
                      <span className="text-xs text-gray-400 w-14 flex-shrink-0">날짜</span>
                      <input type="date" value={editForm.date}
                        onChange={(e) => setEditForm((p) => ({ ...p, date: e.target.value }))}
                        className="flex-1 text-sm text-right bg-transparent outline-none" />
                    </div>

                    <div className="px-4 py-3">
                      <span className="text-xs text-gray-400 block mb-2">카테고리</span>
                      <div className="flex flex-wrap gap-1.5">
                        {BUDGET_CATEGORIES.map((cat) => (
                          <button key={cat} type="button"
                            onClick={() => setEditForm((p) => ({ ...p, category: cat }))}
                            className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                              editForm.category === cat ? "bg-black text-white" : "bg-gray-100 text-gray-600"
                            }`}
                          >{cat}</button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center px-4 py-3 gap-3">
                      <span className="text-xs text-gray-400 w-14 flex-shrink-0">항목</span>
                      <input type="text" value={editForm.description}
                        onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                        placeholder="커피, 점심, 교통비..."
                        className="flex-1 text-sm text-right bg-transparent outline-none placeholder:text-gray-300" />
                    </div>

                    <div className="flex items-center px-4 py-3 gap-3">
                      <span className="text-xs text-gray-400 w-14 flex-shrink-0">메모</span>
                      <input type="text" value={editForm.memo}
                        onChange={(e) => setEditForm((p) => ({ ...p, memo: e.target.value }))}
                        placeholder="한마디 남기기 (선택)"
                        className="flex-1 text-sm text-right bg-transparent outline-none placeholder:text-gray-300" />
                    </div>

                    <div className="flex items-center px-4 py-3 gap-3">
                      <span className="text-xs text-gray-400 w-14 flex-shrink-0">금액</span>
                      <input type="number" value={editForm.amount} inputMode="numeric"
                        onChange={(e) => setEditForm((p) => ({ ...p, amount: e.target.value }))}
                        placeholder="0"
                        className="flex-1 text-right text-xl font-medium bg-transparent outline-none placeholder:text-gray-300" />
                      <span className="text-sm text-gray-400">원</span>
                    </div>

                    {!NO_PAYMENT_CATS.has(editForm.category) && (
                      <div className="px-4 py-3">
                        <span className="text-xs text-gray-400 block mb-2">결제수단</span>
                        <div className="flex gap-1.5">
                          {PAYMENT_METHODS.map((method) => (
                            <button key={method} type="button"
                              onClick={() => setEditForm((p) => ({ ...p, paymentMethod: method }))}
                              className={`flex-1 py-1.5 rounded-xl text-xs transition-colors ${
                                editForm.paymentMethod === method ? "bg-black text-white" : "bg-gray-100 text-gray-600"
                              }`}
                            >{method}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 px-4 py-4">
                    <button
                      type="button"
                      onClick={handleEditDelete}
                      disabled={editDeleting}
                      className="px-5 py-2.5 bg-red-50 text-red-500 rounded-2xl text-sm font-medium active:opacity-75 disabled:opacity-40"
                    >{editDeleting ? "삭제 중..." : "삭제"}</button>
                    <button
                      type="button"
                      onClick={handleEditSave}
                      disabled={editSaving || !editForm.amount}
                      className="flex-1 py-2.5 bg-black text-white rounded-2xl text-sm font-medium active:opacity-75 disabled:opacity-40"
                    >{editSaving ? "저장 중..." : "저장"}</button>
                  </div>
                </div>
              </div>
            )}
          </>
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
                {/* 요약 카드 3개 */}
                <div className="grid grid-cols-3 gap-2 px-4 py-4 border-b border-gray-100">
                  {[
                    { label: "수입", value: monthlyIncome, color: "text-green-600", bg: "bg-green-50" },
                    { label: "지출", value: monthlyExpense, color: "text-red-500", bg: "bg-red-50" },
                    { label: "저축", value: monthlySaving, color: "text-blue-500", bg: "bg-blue-50" },
                  ].map((item) => (
                    <div key={item.label} className={`${item.bg} rounded-2xl p-3 flex flex-col gap-1`}>
                      <span className="text-[10px] text-gray-400">{item.label}</span>
                      <span className={`text-sm font-medium ${item.color} leading-tight`}>
                        {item.value.toLocaleString()}원
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
                              {monthlyExpense > 0 ? ((d.amount / monthlyExpense) * 100).toFixed(0) : 0}%
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
                                width: `${monthlyExpense > 0 ? (d.amount / monthlyExpense) * 100 : 0}%`,
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
