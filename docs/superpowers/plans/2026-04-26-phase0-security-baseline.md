# Phase 0 — 보안 베이스라인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 1~3 진행 전 기존 보안 취약점(인증 누락, RLS 미설정, SSRF 가능성, timing attack, 보안 헤더 부재)을 잡고 공통 보안 패턴 라이브러리를 마련한다.

**Architecture:** `src/lib/auth/`에 인증 헬퍼(`requireSession`, `requireBearer`, `timingSafeEqual`)를, `src/lib/og/`에 SSRF 방어 fetch를 모듈로 분리한다. 모든 신규 모듈은 Vitest 단위 테스트로 검증한다. API route는 헬퍼를 명시적으로 호출하는 일관된 패턴으로 통일한다. 운영 작업(PITR, Anthropic limit, gitleaks, 토큰 회전)은 별도 Task로 분리해 검증 증거를 docs로 남긴다.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Node `crypto.timingSafeEqual`, Supabase SSR (`@supabase/ssr`), `@upstash/ratelimit`(Phase 2 사용 위해 환경변수만 준비), `next-pwa`.

**Working directory:** `/Users/daniel_home/daniel-personal-app`
**Branch:** `phase0-security-baseline`
**Spec:** `docs/superpowers/specs/2026-04-26-phase0-security-baseline-design.md`

---

## File Structure (전체 변경 사항 한눈에)

### 신규 파일 (코드)
```
src/lib/auth/
  timingSafeEqual.ts          # crypto.timingSafeEqual 래퍼
  timingSafeEqual.test.ts
  requireBearer.ts            # Bearer 토큰 검증 (timing-safe)
  requireBearer.test.ts
  requireSession.ts           # Supabase 세션 검증
  requireSession.test.ts
src/lib/og/
  safeFetch.ts                # SSRF 방어 fetch
  safeFetch.test.ts
  parseMeta.ts                # OG 메타 파싱 (organize/route.ts에서 추출)
  parseMeta.test.ts
src/lib/rateLimit/
  README.md                   # Phase 2 진입 전 placeholder
vitest.config.ts              # Vitest 설정
```

### 신규 파일 (운영/문서)
```
.env.example                  # 새 항목 포함
supabase_migration_phase0_rls.sql      # RLS 정책 SQL (Phase 1에서 적용)
docs/operations/
  token-rotation.md           # 토큰 회전 절차
  disaster-recovery.md        # PITR 복구 절차
docs/superpowers/specs/
  2026-04-26-phase0-gitleaks-report.md     # gitleaks 결과 기록
  2026-04-26-client-supabase-usage.md      # 클라이언트 supabase 호출 인벤토리
```

### 수정 파일
```
package.json                  # vitest, @vitest/ui devDeps + test scripts
src/app/api/collect/route.ts  # 헬퍼로 리팩터, timing-safe 비교, SSRF는 OG fetch가 들어가는 organize에서만 적용 (collect는 URL 저장만)
src/app/api/inbox/save/route.ts     # requireSession 추가
src/app/api/inbox/organize/route.ts # requireSession 추가, parseMeta + safeFetch로 교체
next.config.ts                # 보안 헤더 + API Cache-Control + next-pwa runtime cache 정책
.gitignore                    # 변경 없음 (이미 .env* 커버)
```

---

## Task 1: Vitest 인프라 추가

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Vitest 의존성 설치**

```bash
cd /Users/daniel_home/daniel-personal-app
npm install -D vitest@^2.1.0 @vitest/ui@^2.1.0
```

Expected: `package.json` devDependencies에 `vitest`, `@vitest/ui` 추가됨.

- [ ] **Step 2: `vitest.config.ts` 생성**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 3: `package.json`에 테스트 스크립트 추가**

`package.json`의 `scripts`를 다음과 같이 변경:

```json
"scripts": {
  "dev": "next dev --webpack",
  "build": "next build --webpack",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui"
}
```

- [ ] **Step 4: 빈 sanity 테스트로 러너 확인**

`src/lib/__sanity__.test.ts` 임시 생성:

```ts
import { test, expect } from "vitest";
test("vitest works", () => {
  expect(1 + 1).toBe(2);
});
```

Run: `npm test`
Expected: PASS, 1 test passed.

- [ ] **Step 5: sanity 테스트 삭제 + 커밋**

```bash
rm src/lib/__sanity__.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "chore(phase0): vitest 인프라 추가"
```

---

## Task 2: `timingSafeEqual` 헬퍼 (TDD)

**Files:**
- Create: `src/lib/auth/timingSafeEqual.ts`
- Test: `src/lib/auth/timingSafeEqual.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/auth/timingSafeEqual.test.ts
import { describe, test, expect } from "vitest";
import { safeCompare } from "./timingSafeEqual";

describe("safeCompare", () => {
  test("같은 문자열은 true", () => {
    expect(safeCompare("hello", "hello")).toBe(true);
  });

  test("다른 문자열은 false", () => {
    expect(safeCompare("hello", "world")).toBe(false);
  });

  test("길이가 다르면 false (timingSafeEqual은 동일 길이 요구)", () => {
    expect(safeCompare("short", "muchlongertoken")).toBe(false);
  });

  test("빈 문자열끼리는 true", () => {
    expect(safeCompare("", "")).toBe(true);
  });

  test("한쪽만 빈 문자열은 false", () => {
    expect(safeCompare("", "x")).toBe(false);
  });

  test("유니코드 문자열도 정상 비교", () => {
    expect(safeCompare("토큰값", "토큰값")).toBe(true);
    expect(safeCompare("토큰값", "토큰X")).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npm test -- timingSafeEqual`
Expected: FAIL with "Cannot find module './timingSafeEqual'"

- [ ] **Step 3: 최소 구현 작성**

```ts
// src/lib/auth/timingSafeEqual.ts
import { timingSafeEqual } from "node:crypto";

/**
 * 길이가 다른 입력도 안전하게 처리하는 timing-safe 문자열 비교.
 * Node의 timingSafeEqual은 동일 길이 Buffer만 받기 때문에,
 * 길이가 다르면 즉시 false를 반환한다 (이 경우는 timing leak 의미가 없음).
 */
export function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- timingSafeEqual`
Expected: PASS, 6 tests passed.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/auth/timingSafeEqual.ts src/lib/auth/timingSafeEqual.test.ts
git commit -m "feat(auth): timing-safe 문자열 비교 헬퍼 추가"
```

---

## Task 3: `requireBearer` 헬퍼 (TDD)

**Files:**
- Create: `src/lib/auth/requireBearer.ts`
- Test: `src/lib/auth/requireBearer.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/auth/requireBearer.test.ts
import { describe, test, expect } from "vitest";
import { requireBearer } from "./requireBearer";

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("authorization", authHeader);
  return new Request("https://example.com/api/x", { headers });
}

describe("requireBearer", () => {
  test("Authorization 헤더 없으면 ok=false, 401 반환", async () => {
    const result = requireBearer(makeRequest(), "expected-token");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  test("Bearer prefix 없으면 ok=false", () => {
    const result = requireBearer(makeRequest("expected-token"), "expected-token");
    expect(result.ok).toBe(false);
  });

  test("토큰이 다르면 ok=false", () => {
    const result = requireBearer(makeRequest("Bearer wrong-token"), "expected-token");
    expect(result.ok).toBe(false);
  });

  test("토큰이 일치하면 ok=true", () => {
    const result = requireBearer(makeRequest("Bearer expected-token"), "expected-token");
    expect(result.ok).toBe(true);
  });

  test("expected가 빈 문자열이면 항상 ok=false (설정 미스 보호)", () => {
    const result = requireBearer(makeRequest("Bearer "), "");
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npm test -- requireBearer`
Expected: FAIL with module not found.

- [ ] **Step 3: 최소 구현 작성**

```ts
// src/lib/auth/requireBearer.ts
import { safeCompare } from "./timingSafeEqual";

export type RequireBearerResult =
  | { ok: true }
  | { ok: false; response: Response };

function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Authorization: Bearer <token> 헤더를 검증한다.
 * - 헤더 없거나 prefix가 다르면 401
 * - 토큰 비교는 timing-safe
 * - expected가 비어있으면(설정 누락) 항상 401
 */
export function requireBearer(
  request: Request,
  expected: string | undefined
): RequireBearerResult {
  if (!expected) {
    return { ok: false, response: unauthorized() };
  }
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return { ok: false, response: unauthorized() };
  }
  const token = header.slice("Bearer ".length);
  if (!safeCompare(token, expected)) {
    return { ok: false, response: unauthorized() };
  }
  return { ok: true };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- requireBearer`
Expected: PASS, 5 tests passed.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/auth/requireBearer.ts src/lib/auth/requireBearer.test.ts
git commit -m "feat(auth): Bearer 토큰 검증 헬퍼 추가"
```

---

## Task 4: `requireSession` 헬퍼 (TDD with mocking)

**Files:**
- Create: `src/lib/auth/requireSession.ts`
- Test: `src/lib/auth/requireSession.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/auth/requireSession.test.ts
import { describe, test, expect, vi, beforeEach } from "vitest";

// Supabase 서버 클라이언트를 모킹
const getUserMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

import { requireSession } from "./requireSession";

describe("requireSession", () => {
  beforeEach(() => {
    getUserMock.mockReset();
  });

  test("user가 null이면 ok=false, 401", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const result = await requireSession();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  test("getUser가 에러를 던져도 ok=false (안전한 fallback)", async () => {
    getUserMock.mockRejectedValue(new Error("network"));
    const result = await requireSession();
    expect(result.ok).toBe(false);
  });

  test("user가 있으면 ok=true, user 정보 노출", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-123", email: "x@y.z" } },
    });
    const result = await requireSession();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe("user-123");
    }
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npm test -- requireSession`
Expected: FAIL with module not found.

- [ ] **Step 3: 최소 구현 작성**

```ts
// src/lib/auth/requireSession.ts
import { createClient } from "@/lib/supabase/server";

export type SessionUser = { id: string; email?: string | null };

export type RequireSessionResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: Response };

function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * 현재 요청의 Supabase 세션을 검증한다.
 * - 세션 없거나 getUser가 throw하면 401
 * - 세션 있으면 ok=true + user 정보 반환
 */
export async function requireSession(): Promise<RequireSessionResult> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data?.user) {
      return { ok: false, response: unauthorized() };
    }
    return {
      ok: true,
      user: { id: data.user.id, email: data.user.email ?? null },
    };
  } catch {
    return { ok: false, response: unauthorized() };
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- requireSession`
Expected: PASS, 3 tests passed.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/auth/requireSession.ts src/lib/auth/requireSession.test.ts
git commit -m "feat(auth): Supabase 세션 검증 헬퍼 추가"
```

---

## Task 5: SSRF 방어 `safeFetch` (TDD)

**Files:**
- Create: `src/lib/og/safeFetch.ts`
- Test: `src/lib/og/safeFetch.test.ts`

설계 메모:
- `safeFetch(url, opts)` → `Promise<{ status, body, finalUrl } | { error }>`
- 본문은 string으로 1MB까지 읽음
- 호스트의 IP를 `dns.lookup`으로 해석한 뒤 사설/링크로컬/loopback 차단
- 리다이렉트는 최대 3회, 각 단계마다 IP 재검증
- 타임아웃 5초

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/og/safeFetch.test.ts
import { describe, test, expect, vi } from "vitest";

// dns.lookup 모킹 — 호스트별 가짜 IP를 돌려준다
vi.mock("node:dns", async () => {
  const actual = await vi.importActual<typeof import("node:dns")>("node:dns");
  return {
    ...actual,
    promises: {
      lookup: vi.fn(async (host: string) => {
        const map: Record<string, { address: string; family: 4 | 6 }> = {
          "good.example.com": { address: "93.184.216.34", family: 4 },
          "private.test": { address: "10.0.0.5", family: 4 },
          "loopback.test": { address: "127.0.0.1", family: 4 },
          "linklocal.test": { address: "169.254.169.254", family: 4 },
          "ipv6loop.test": { address: "::1", family: 6 },
        };
        const entry = map[host];
        if (!entry) throw new Error(`unknown host ${host}`);
        return entry;
      }),
    },
  };
});

import { safeFetch } from "./safeFetch";

describe("safeFetch SSRF defense", () => {
  test("http/https 외 스킴 거부", async () => {
    const result = await safeFetch("file:///etc/passwd");
    expect(result.error).toBeDefined();
  });

  test("javascript: URL 거부", async () => {
    const result = await safeFetch("javascript:alert(1)");
    expect(result.error).toBeDefined();
  });

  test("사설 IP(10/8) 호스트 거부", async () => {
    const result = await safeFetch("https://private.test/");
    expect(result.error).toBe("blocked_private_ip");
  });

  test("loopback(127.0.0.1) 호스트 거부", async () => {
    const result = await safeFetch("https://loopback.test/");
    expect(result.error).toBe("blocked_private_ip");
  });

  test("링크로컬(169.254/16) 호스트 거부 — 클라우드 메타데이터 보호", async () => {
    const result = await safeFetch("https://linklocal.test/");
    expect(result.error).toBe("blocked_private_ip");
  });

  test("IPv6 ::1 거부", async () => {
    const result = await safeFetch("https://ipv6loop.test/");
    expect(result.error).toBe("blocked_private_ip");
  });

  test("malformed URL 거부", async () => {
    const result = await safeFetch("not a url");
    expect(result.error).toBeDefined();
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npm test -- safeFetch`
Expected: FAIL with module not found.

- [ ] **Step 3: 구현 작성**

```ts
// src/lib/og/safeFetch.ts
import { promises as dns } from "node:dns";
import { isIP } from "node:net";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_BYTES = 1_000_000;
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

export type SafeFetchResult =
  | {
      error?: undefined;
      status: number;
      body: string;
      finalUrl: string;
    }
  | { error: string; status?: number };

function isPrivateV4(ip: string): boolean {
  // 10.0.0.0/8
  if (/^10\./.test(ip)) return true;
  // 127.0.0.0/8 (loopback)
  if (/^127\./.test(ip)) return true;
  // 169.254.0.0/16 (link-local, AWS/GCP metadata)
  if (/^169\.254\./.test(ip)) return true;
  // 172.16.0.0/12
  const m = ip.match(/^172\.(\d+)\./);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 16 && n <= 31) return true;
  }
  // 192.168.0.0/16
  if (/^192\.168\./.test(ip)) return true;
  // 0.0.0.0/8 (broadcast / unspecified)
  if (/^0\./.test(ip)) return true;
  return false;
}

function isPrivateV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true; // loopback
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 unique local
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // fe80::/10
  return false;
}

async function resolveAndCheck(host: string): Promise<{ ok: true } | { ok: false; error: string }> {
  // host가 이미 IP면 그대로 검사
  if (isIP(host) === 4) {
    return isPrivateV4(host) ? { ok: false, error: "blocked_private_ip" } : { ok: true };
  }
  if (isIP(host) === 6) {
    return isPrivateV6(host) ? { ok: false, error: "blocked_private_ip" } : { ok: true };
  }
  try {
    const { address, family } = await dns.lookup(host);
    if (family === 4 && isPrivateV4(address)) return { ok: false, error: "blocked_private_ip" };
    if (family === 6 && isPrivateV6(address)) return { ok: false, error: "blocked_private_ip" };
    return { ok: true };
  } catch {
    return { ok: false, error: "dns_failed" };
  }
}

async function readCappedBody(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let received = 0;
  let out = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_BYTES) {
      try { await reader.cancel(); } catch { /* ignore */ }
      break;
    }
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

export async function safeFetch(
  rawUrl: string,
  opts: { timeoutMs?: number } = {}
): Promise<SafeFetchResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { error: "invalid_url" };
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { error: "blocked_protocol" };
  }

  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let currentUrl = url;
  try {
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      const check = await resolveAndCheck(currentUrl.hostname);
      if (!check.ok) return { error: check.error };

      const res = await fetch(currentUrl.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "daniel-personal-app/1.0 (+og-fetch)" },
      });

      // Redirect 처리
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return { status: res.status, body: "", finalUrl: currentUrl.toString() };
        let next: URL;
        try {
          next = new URL(location, currentUrl);
        } catch {
          return { error: "invalid_redirect" };
        }
        if (!ALLOWED_PROTOCOLS.has(next.protocol)) return { error: "blocked_protocol" };
        currentUrl = next;
        continue;
      }

      // Content-Length 사전 검증
      const cl = res.headers.get("content-length");
      if (cl && parseInt(cl, 10) > MAX_BYTES) {
        return { error: "body_too_large", status: res.status };
      }

      const body = await readCappedBody(res);
      return { status: res.status, body, finalUrl: currentUrl.toString() };
    }
    return { error: "too_many_redirects" };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return { error: "timeout" };
    return { error: "fetch_failed" };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- safeFetch`
Expected: PASS, 7 tests passed.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/og/safeFetch.ts src/lib/og/safeFetch.test.ts
git commit -m "feat(og): SSRF 방어 safeFetch 추가"
```

---

## Task 6: OG 메타 파서 추출 (TDD)

**Files:**
- Create: `src/lib/og/parseMeta.ts`
- Test: `src/lib/og/parseMeta.test.ts`

기존 `src/app/api/inbox/organize/route.ts:fetchOGMeta()` 안의 정규식 파싱 로직을 모듈로 분리.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/og/parseMeta.test.ts
import { describe, test, expect } from "vitest";
import { parseOGMeta } from "./parseMeta";

describe("parseOGMeta", () => {
  test("og:title / og:description / og:image 파싱", () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Hello World" />
        <meta property="og:description" content="A description" />
        <meta property="og:image" content="https://cdn.example.com/img.jpg" />
      </head></html>
    `;
    const meta = parseOGMeta(html);
    expect(meta.title).toBe("Hello World");
    expect(meta.description).toBe("A description");
    expect(meta.image).toBe("https://cdn.example.com/img.jpg");
  });

  test("og 태그 없으면 <title> + meta description fallback", () => {
    const html = `
      <html><head>
        <title>Fallback Title</title>
        <meta name="description" content="Fallback Desc" />
      </head></html>
    `;
    const meta = parseOGMeta(html);
    expect(meta.title).toBe("Fallback Title");
    expect(meta.description).toBe("Fallback Desc");
    expect(meta.image).toBe("");
  });

  test("아무것도 없으면 빈 문자열", () => {
    const meta = parseOGMeta("<html></html>");
    expect(meta).toEqual({ title: "", description: "", image: "" });
  });

  test("HTML 엔티티는 그대로 둔다 (호출 측에서 처리)", () => {
    const html = `<meta property="og:title" content="A &amp; B" />`;
    const meta = parseOGMeta(html);
    expect(meta.title).toBe("A &amp; B");
  });

  test("매우 긴 content는 4096자에서 절단", () => {
    const long = "x".repeat(5000);
    const html = `<meta property="og:description" content="${long}" />`;
    const meta = parseOGMeta(html);
    expect(meta.description.length).toBeLessThanOrEqual(4096);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npm test -- parseMeta`
Expected: FAIL.

- [ ] **Step 3: 구현 작성**

```ts
// src/lib/og/parseMeta.ts
const MAX_FIELD_LEN = 4096;

function clip(s: string): string {
  return s.length > MAX_FIELD_LEN ? s.slice(0, MAX_FIELD_LEN) : s;
}

export type OGMeta = {
  title: string;
  description: string;
  image: string;
};

export function parseOGMeta(html: string): OGMeta {
  const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i)?.[1];
  const ogDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i)?.[1];
  const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/i)?.[1];
  const fbTitle = html.match(/<title>([^<]*)<\/title>/i)?.[1];
  const fbDesc = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1];

  return {
    title: clip(ogTitle ?? fbTitle ?? ""),
    description: clip(ogDesc ?? fbDesc ?? ""),
    image: clip(ogImage ?? ""),
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- parseMeta`
Expected: PASS, 5 tests passed.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/og/parseMeta.ts src/lib/og/parseMeta.test.ts
git commit -m "feat(og): OG 메타 파서 모듈 추출"
```

---

## Task 7: `/api/collect` 리팩터 (timing-safe Bearer)

**Files:**
- Modify: `src/app/api/collect/route.ts`

목표: `requireBearer` 헬퍼로 교체.

- [ ] **Step 1: 변경 전 동작 회귀 테스트 (수동, 로컬)**

Run (로컬에서 옵션 — 환경변수 세팅돼있을 때만):
```bash
# 사전: .env.local에 COLLECT_API_KEY=test-token, DEFAULT_USER_ID, SUPABASE_*
npm run dev
# 별도 터미널
curl -X POST http://localhost:3000/api/collect \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/x","memo":"test"}'
```
Expected: 201 또는 200 (duplicate). 이 결과를 기록.

- [ ] **Step 2: 라우트를 `requireBearer` 사용하도록 교체**

`src/app/api/collect/route.ts` 전체 교체:

```ts
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireBearer } from "@/lib/auth/requireBearer";

export async function POST(request: NextRequest) {
  const auth = requireBearer(request, process.env.COLLECT_API_KEY);
  if (!auth.ok) return auth.response;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await request.json();
    const { url, memo, source = "instagram" } = body ?? {};

    if (!url || typeof url !== "string" || url.length > 2048) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }
    if (memo && (typeof memo !== "string" || memo.length > 1024)) {
      return NextResponse.json({ error: "Memo too long" }, { status: 400 });
    }

    // 스킴 화이트리스트 (저장 단계에서도 한 번 더 막음)
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return NextResponse.json({ error: "Invalid URL scheme" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Malformed URL" }, { status: 400 });
    }

    const userId = process.env.DEFAULT_USER_ID!;

    const { data: existing } = await supabase
      .from("collected_items")
      .select("id")
      .eq("user_id", userId)
      .eq("url", url)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { message: "Already collected", duplicate: true },
        { status: 200 }
      );
    }

    const { data, error } = await supabase
      .from("collected_items")
      .insert({
        user_id: userId,
        url,
        memo: memo || null,
        source,
        is_processed: false,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("Collect API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

변경점 요약:
- `requireBearer` 사용 (timing-safe)
- URL/memo 길이 검증 + 스킴 화이트리스트 추가
- `.single()` → `.maybeSingle()` (없으면 null, 있으면 데이터)

- [ ] **Step 3: 회귀 테스트 (로컬)**

```bash
# 잘못된 토큰
curl -X POST http://localhost:3000/api/collect \
  -H "Authorization: Bearer wrong" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/x"}'
# Expected: {"error":"Unauthorized"} 401

# 올바른 토큰 + 정상 URL
curl -X POST http://localhost:3000/api/collect \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/y"}'
# Expected: 201

# 잘못된 스킴
curl -X POST http://localhost:3000/api/collect \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{"url":"file:///etc/passwd"}'
# Expected: 400 Invalid URL scheme
```

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 컴파일 에러 없이 성공.

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/collect/route.ts
git commit -m "refactor(collect): timing-safe Bearer + URL 입력 검증"
```

---

## Task 8: `/api/inbox/save`에 세션 인증 + 입력 검증

**Files:**
- Modify: `src/app/api/inbox/save/route.ts`

- [ ] **Step 1: 라우트 교체**

`src/app/api/inbox/save/route.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/requireSession";

const MAX_GROUPS = 50;
const MAX_CONTENT = 8192;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session.ok) return session.response;

  try {
    const supabase = getSupabase();
    const body = await request.json();
    const { groups } = body ?? {};

    if (!Array.isArray(groups) || groups.length === 0) {
      return Response.json({ error: "저장할 데이터가 없습니다" }, { status: 400 });
    }
    if (groups.length > MAX_GROUPS) {
      return Response.json({ error: "그룹 수 초과" }, { status: 400 });
    }
    for (const g of groups) {
      if (
        typeof g?.tag !== "string" ||
        typeof g?.content !== "string" ||
        g.content.length > MAX_CONTENT ||
        !Array.isArray(g?.item_ids)
      ) {
        return Response.json({ error: "잘못된 그룹 형식" }, { status: 400 });
      }
    }

    const memoInserts = groups.map((g: { tag: string; content: string }) => ({
      content: g.content,
      tag: g.tag,
    }));

    const { error: memoError } = await supabase.from("memo_entries").insert(memoInserts);
    if (memoError) throw memoError;

    const allItemIds = groups.flatMap((g: { item_ids: string[] }) => g.item_ids);
    if (allItemIds.length > 0) {
      const { error: updateError } = await supabase
        .from("collected_items")
        .update({ is_processed: true })
        .in("id", allItemIds);
      if (updateError) throw updateError;
    }

    return Response.json({ success: true, saved: groups.length });
  } catch (err) {
    console.error("Save error:", err);
    return Response.json({ error: "저장 중 오류 발생" }, { status: 500 });
  }
}
```

변경점:
- `requireSession()` 추가 (미인증 401)
- groups 길이/필드 검증
- `console.error`에 raw error만 (PII 없음 가정)

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 3: 로컬 회귀 테스트**

```bash
# 미인증 (쿠키 없이) → 401
curl -X POST http://localhost:3000/api/inbox/save -H "Content-Type: application/json" -d '{"groups":[]}'
# Expected: {"error":"Unauthorized"} 401
```

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/inbox/save/route.ts
git commit -m "feat(inbox/save): 세션 인증 + 입력 검증 추가"
```

---

## Task 9: `/api/inbox/organize`에 세션 인증 + safeFetch + parseOGMeta 사용

**Files:**
- Modify: `src/app/api/inbox/organize/route.ts`

- [ ] **Step 1: 라우트 교체**

```ts
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { MEMO_TAGS } from "@/lib/constants";
import { requireSession } from "@/lib/auth/requireSession";
import { safeFetch } from "@/lib/og/safeFetch";
import { parseOGMeta } from "@/lib/og/parseMeta";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
}

async function fetchOGMeta(url: string) {
  const result = await safeFetch(url);
  if (result.error) return { title: "", description: "", image: "" };
  return parseOGMeta(result.body);
}

export async function POST() {
  const session = await requireSession();
  if (!session.ok) return session.response;

  try {
    const supabase = getSupabase();
    const anthropic = getAnthropic();

    const { data: items, error } = await supabase
      .from("collected_items")
      .select("*")
      .eq("is_processed", false)
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!items || items.length === 0) {
      return Response.json({ groups: [] });
    }

    const enriched = await Promise.all(
      items.map(async (item) => ({
        ...item,
        og: await fetchOGMeta(item.url),
      }))
    );

    const itemsText = enriched
      .map(
        (item, i) =>
          `[${i + 1}] id: ${item.id}\n    URL: ${item.url}\n    source: ${item.source}\n    memo: ${item.memo || "(없음)"}\n    OG title: ${item.og.title || "(없음)"}\n    OG description: ${item.og.description || "(없음)"}`
      )
      .join("\n\n");

    const tagList = MEMO_TAGS.join(", ");

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `아래는 사용자가 수집한 URL 목록입니다. 이 항목들을 분석해서 주제별로 묶고, 각 그룹에 대해 메모 초안을 작성해주세요.

규칙:
1. 중복 URL이 있으면 하나로 합칩니다
2. 비슷한 주제의 항목을 그룹으로 묶습니다
3. 각 그룹에 대해 한국어 메모 초안을 작성합니다 (간결하고 유용하게)
4. 각 그룹에 가장 적절한 태그를 선택합니다. 사용 가능한 태그: ${tagList}
5. 반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이)

JSON 형식:
{
  "groups": [
    {
      "topic": "주제 이름",
      "tag": "태그",
      "content": "메모 초안 내용 (URL 포함)",
      "item_ids": ["id1", "id2"]
    }
  ]
}

수집된 항목:
${itemsText}`,
        },
      ],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ error: "AI 응답 파싱 실패" }, { status: 500 });
    }

    const result = JSON.parse(jsonMatch[0]);
    return Response.json(result);
  } catch (err) {
    console.error("Organize error:", err);
    return Response.json({ error: "정리 중 오류 발생" }, { status: 500 });
  }
}
```

변경점:
- `requireSession()` 추가
- `safeFetch` + `parseOGMeta` 사용 (SSRF 방어)
- 모델은 그대로 (Phase 2에서 Haiku 4.5로 교체)

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/inbox/organize/route.ts
git commit -m "feat(inbox/organize): 세션 인증 + SSRF 방어 적용"
```

---

## Task 10: `next.config.ts` 보안 헤더 + API Cache-Control

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: 파일 교체**

```ts
// next.config.ts
import type { NextConfig } from "next";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  // Phase 0: 인증 응답이 SW에 캐시되지 않도록 /api/* 제외
  runtimeCaching: [
    {
      urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith("/api/"),
      handler: "NetworkOnly",
    },
    {
      urlPattern: ({ url }: { url: URL }) =>
        url.origin === self.location.origin && !url.pathname.startsWith("/api/"),
      handler: "NetworkFirst",
      options: {
        cacheName: "app-shell",
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
});

const nextConfig: NextConfig = {
  turbopack: {},
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default withPWA(nextConfig);
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공. SW 빌드 시 `runtimeCaching` 설정이 반영됨.

- [ ] **Step 3: 헤더 검증 (로컬)**

```bash
npm run dev
curl -I http://localhost:3000/
# Expected: Strict-Transport-Security, X-Frame-Options: DENY 등이 응답에 포함

curl -I http://localhost:3000/api/collect
# Expected: Cache-Control: no-store
```

- [ ] **Step 4: 커밋**

```bash
git add next.config.ts
git commit -m "feat(security): 보안 헤더 + API Cache-Control + PWA runtime cache 정책"
```

---

## Task 11: `.env.example` 정비

**Files:**
- Create: `.env.example`

- [ ] **Step 1: 파일 생성**

```bash
# .env.example
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# Phase 0~ (현재 사용 중)
COLLECT_API_KEY=
DEFAULT_USER_ID=

# Phase 2 (사전 등록)
CRON_SECRET=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Phase 3 (사전 등록)
BUDGET_API_KEY=
BUDGET_HMAC_SECRET=
```

- [ ] **Step 2: `.gitignore` 점검**

Run:
```bash
git check-ignore -v .env .env.local
```
Expected: 두 파일 모두 ignore 룰에 매치.

- [ ] **Step 3: 커밋**

```bash
git add .env.example
git commit -m "chore(env): .env.example 추가 (Phase 2~3 변수 사전 정의)"
```

---

## Task 12: RLS 정책 SQL 작성 (Phase 1에서 적용)

**Files:**
- Create: `supabase_migration_phase0_rls.sql`

⚠ 이 파일은 **작성만 하고 실행은 Phase 1**과 함께 진행. 클라이언트 직접 호출이 아직 남아있어 활성화하면 페이지가 깨짐.

- [ ] **Step 1: 파일 생성**

```sql
-- supabase_migration_phase0_rls.sql
-- 적용 시점: Phase 1 (클라이언트 supabase 직접 호출이 모두 서버 컴포넌트/API로 이전된 후)
-- 사전 점검:
--   1) docs/superpowers/specs/2026-04-26-client-supabase-usage.md 인벤토리의 모든 항목이 서버 측으로 이전되었는지
--   2) 다마고치 관련 테이블은 Phase 1에서 drop되므로 정책 생략

-- ── memo_entries ───────────────────────────────────────
ALTER TABLE memo_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_all ON memo_entries;
CREATE POLICY authenticated_all ON memo_entries
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── diary_entries ──────────────────────────────────────
ALTER TABLE diary_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_all ON diary_entries;
CREATE POLICY authenticated_all ON diary_entries
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── budget_entries ─────────────────────────────────────
ALTER TABLE budget_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_all ON budget_entries;
CREATE POLICY authenticated_all ON budget_entries
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── salary_entries ─────────────────────────────────────
ALTER TABLE salary_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_all ON salary_entries;
CREATE POLICY authenticated_all ON salary_entries
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── routine_items ──────────────────────────────────────
ALTER TABLE routine_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_all ON routine_items;
CREATE POLICY authenticated_all ON routine_items
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── routine_checks ─────────────────────────────────────
ALTER TABLE routine_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_all ON routine_checks;
CREATE POLICY authenticated_all ON routine_checks
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ── collected_items (user_id 컬럼 존재 → 소유자 격리) ──
ALTER TABLE collected_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_only ON collected_items;
CREATE POLICY owner_only ON collected_items
  FOR ALL USING (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

-- service_role 키는 RLS를 우회하므로 모든 서버 라우트는 영향 없음
```

- [ ] **Step 2: 커밋**

```bash
git add supabase_migration_phase0_rls.sql
git commit -m "feat(db): Phase 0 RLS 정책 SQL 작성 (Phase 1에서 적용)"
```

---

## Task 13: 클라이언트 supabase 호출 인벤토리 작성

**Files:**
- Create: `docs/superpowers/specs/2026-04-26-client-supabase-usage.md`

- [ ] **Step 1: 인벤토리 명령 실행**

```bash
cd /Users/daniel_home/daniel-personal-app
grep -rn 'from "@/lib/supabase' src/ > /tmp/inv-imports.txt
grep -rn 'supabase\.from\|supabase\.auth\|supabase\.rpc' src/ > /tmp/inv-uses.txt
```

- [ ] **Step 2: 결과를 문서로 정리**

`docs/superpowers/specs/2026-04-26-client-supabase-usage.md`:

```markdown
# 클라이언트 Supabase 직접 호출 인벤토리 (2026-04-26)

> Phase 1 마이그레이션 대상. RLS 활성화 전 모두 서버 컴포넌트/API route로 이전 필요.

## 임포트 위치

| 파일 | 임포트 |
|------|--------|
| `src/middleware.ts` | `@/lib/supabase/middleware` (서버 측, 유지) |
| `src/app/(main)/home/page.tsx` | `@/lib/supabase` (브라우저 — 이전 필요) |
| `src/app/(main)/routine/page.tsx` | `@/lib/supabase` (브라우저 — 이전 필요) |
| `src/app/(main)/memo/page.tsx` | `@/lib/supabase/client` (브라우저 — 이전 필요) |
| `src/app/(main)/diary/page.tsx` | `@/lib/supabase` (브라우저 — 이전 필요) |
| `src/app/(main)/budget/page.tsx` | `@/lib/supabase` (브라우저 — 이전 필요) |
| `src/app/(auth)/login/page.tsx` | `@/lib/supabase/client` (브라우저 — auth.signIn 등은 유지 가능) |
| `src/components/RoutineParty.tsx` | `@/lib/supabase/client` (브라우저 — 이전 필요) |
| `src/hooks/useTamagotchi.ts` | `@/lib/supabase` (브라우저 — Phase 1에서 폐기) |

## 호출 패턴 (테이블별)

### memo_entries
- **Read**: `(main)/memo/page.tsx` `fetchMemos()`
- **Write (insert)**: `(main)/memo/page.tsx` `handleSubmit()`

### diary_entries
- **Read**: `(main)/home/page.tsx`, `(main)/diary/page.tsx`
- **Write (upsert)**: `(main)/diary/page.tsx`

### budget_entries
- **Read**: `(main)/home/page.tsx`, `(main)/budget/page.tsx`
- **Write (insert/update/delete)**: `(main)/budget/page.tsx`

### routine_items / routine_checks
- **Read**: `(main)/home/page.tsx`, `(main)/routine/page.tsx`
- **Write (insert/upsert/update/delete)**: `(main)/routine/page.tsx`

### collected_items
- **Read**: `(main)/memo/page.tsx` `fetchInboxCount`, `openInbox`
- **Write (update is_processed)**: 서버 라우트에만 있음 (`/api/inbox/save`) — 안전

### tamagotchi_state (Phase 1에서 drop)
- `useTamagotchi.ts` — Phase 1에서 hook 폐기

### auth
- `(auth)/login/page.tsx` `supabase.auth.*` — 브라우저 측 유지(Auth는 anon key 흐름이 정상)

## Phase 1 마이그레이션 가이드

- **Read 경로**: Server Component(`page.tsx`를 서버 측 default async로) 또는 `/api/<resource>/route.ts` GET
- **Write 경로**: Server Action 또는 `/api/<resource>/route.ts` POST/PATCH/DELETE
- **Auth 호출**(login, signOut)은 브라우저 클라이언트로 유지 가능
- 마이그레이션 완료 후 `supabase_migration_phase0_rls.sql` 실행 → RLS 활성화
- `src/lib/supabase.ts`(전역 브라우저 인스턴스)는 Phase 1 종료 시점에 deprecate 또는 제거
```

- [ ] **Step 3: 커밋**

```bash
git add docs/superpowers/specs/2026-04-26-client-supabase-usage.md
git commit -m "docs(phase0): 클라이언트 supabase 호출 인벤토리"
```

---

## Task 14: gitleaks 시크릿 스캔

**Files:**
- Create: `docs/superpowers/specs/2026-04-26-phase0-gitleaks-report.md`

- [ ] **Step 1: gitleaks 설치 (이미 있으면 skip)**

```bash
which gitleaks || brew install gitleaks
gitleaks version
```
Expected: 버전 출력.

- [ ] **Step 2: 전체 히스토리 스캔**

```bash
cd /Users/daniel_home/daniel-personal-app
gitleaks detect --source . --log-opts="--all" --report-path=/tmp/gitleaks.json --report-format=json --no-banner
echo "Exit: $?"
```
Expected:
- Exit 0 + 빈 결과 → 깨끗
- Exit 1 + JSON에 finding → 누출된 시크릿 존재

- [ ] **Step 3: 결과 정리 문서 작성**

빈 결과면:
```markdown
# Gitleaks 스캔 보고 (2026-04-26)

- 명령: `gitleaks detect --source . --log-opts="--all"`
- 결과: 발견 항목 없음 (clean)
- 후속: 없음
```

발견 항목이 있으면 다음을 포함:
- 각 finding의 파일, 커밋 해시, 시크릿 종류 마스킹된 일부
- 즉시 회전 대상 키 목록
- 히스토리 재작성 여부 결정 (BFG)

- [ ] **Step 4: 커밋**

```bash
git add docs/superpowers/specs/2026-04-26-phase0-gitleaks-report.md
git commit -m "docs(phase0): gitleaks 스캔 결과 기록"
```

---

## Task 15: `COLLECT_API_KEY` 회전 + 신규 시크릿 생성

**Files:**
- Modify (Vercel/Supabase 콘솔, 코드 변경 없음)
- Create: `docs/operations/token-rotation.md`

- [ ] **Step 1: `COLLECT_API_KEY` 신규 값 생성**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```
Output을 안전한 곳에 임시 저장 (1Password / Keychain / 메모).

- [ ] **Step 2: Vercel 환경변수 업데이트**

Vercel Dashboard → Project Settings → Environment Variables → `COLLECT_API_KEY` Edit → 새 값 입력 → Production/Preview/Development 모두 적용 → Save → 재배포.

- [ ] **Step 3: 단축어 측 토큰 갱신**

iPhone 단축어 앱 → 인스타 적재 단축어 열기 → Authorization 헤더의 Bearer 값 교체 → 저장 → 테스트 1회.

Verification:
```bash
curl -X POST https://daniel-personal-app.vercel.app/api/collect \
  -H "Authorization: Bearer <NEW_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/test-rotation","memo":"rotation test"}'
```
Expected: 201 (또는 duplicate면 200).

- [ ] **Step 4: 신규 시크릿 생성 + 등록 (Phase 2/3 사전 준비)**

```bash
# CRON_SECRET (Phase 2)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
# BUDGET_API_KEY (Phase 3)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
# BUDGET_HMAC_SECRET (Phase 3)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

각 값을 Vercel 환경변수에 등록:
- `CRON_SECRET`
- `BUDGET_API_KEY`
- `BUDGET_HMAC_SECRET`

Upstash Ratelimit (Phase 2 준비):
1. https://console.upstash.com → Redis Database → Create database (region: ap-northeast-1 권장)
2. REST URL과 REST Token을 Vercel 환경변수로 등록:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

- [ ] **Step 5: 운영 문서 작성**

`docs/operations/token-rotation.md`:

```markdown
# 토큰 회전 운영 절차

## 정기 회전 주기
- `COLLECT_API_KEY`: 6개월
- `BUDGET_API_KEY`, `BUDGET_HMAC_SECRET`: 6개월
- `CRON_SECRET`: 12개월
- `SUPABASE_SERVICE_ROLE_KEY`: 노출 의심 시 즉시
- `ANTHROPIC_API_KEY`: 노출 의심 시 즉시

## 회전 명령
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## 회전 시 후속 조치 매트릭스

| 키 | Vercel 등록 | 외부 시스템 갱신 |
|----|-------------|------------------|
| COLLECT_API_KEY | ✓ | iPhone Shortcut Authorization 헤더 |
| CRON_SECRET | ✓ | Vercel Cron(자동) |
| BUDGET_API_KEY / HMAC | ✓ | 맥미니 Keychain (`security add-generic-password`) |
| SUPABASE_SERVICE_ROLE_KEY | ✓ | 없음 (Vercel 재배포만) |
| ANTHROPIC_API_KEY | ✓ | 없음 |

## 노출 의심 시 즉시 절차
1. 콘솔에서 키 revoke
2. 새 키 생성 → Vercel 등록
3. 외부 시스템 갱신
4. 액세스 로그 점검
5. 회전 일시·이유를 `docs/operations/security-incidents.md`에 추가
```

- [ ] **Step 6: 커밋**

```bash
git add docs/operations/token-rotation.md
git commit -m "docs(ops): 토큰 회전 운영 절차"
```

---

## Task 16: Anthropic 콘솔 monthly cost limit 설정

⚠ 운영 작업. 코드 변경 없음.

- [ ] **Step 1: Anthropic Console 접속**

https://console.anthropic.com/ → Workspace → **Limits** (또는 **Billing** → **Usage limits**)

- [ ] **Step 2: Monthly spend limit 설정**

- Limit: **$5 / month**
- Email alerts: **80%**, **100%** 활성화

- [ ] **Step 3: 스크린샷 기록**

증빙 스크린샷을 `docs/operations/anthropic-cost-limit-2026-04-26.png`로 저장.

- [ ] **Step 4: 결과 문서화 (커밋)**

`docs/operations/cost-controls.md`:

```markdown
# 비용 통제

## Anthropic
- Monthly spend limit: **$5 / month** (설정일 2026-04-26)
- Alert: 80%, 100%
- 증빙: `anthropic-cost-limit-2026-04-26.png`

## Supabase
- Pro 플랜
- PITR retention 7일 (Task 17 참조)
- Compute: micro (현재)

## Vercel
- Hobby 또는 Pro (확인 필요)
- 함수 실행시간 / 대역폭 모니터링은 매월 1회 점검
```

```bash
git add docs/operations/cost-controls.md docs/operations/anthropic-cost-limit-2026-04-26.png
git commit -m "docs(ops): Anthropic monthly cost limit \$5 + 비용 통제 문서"
```

---

## Task 17: Supabase PITR 활성화 + DR 절차

⚠ 운영 작업. 코드 변경 없음.

- [ ] **Step 1: Supabase 대시보드에서 PITR 활성화**

https://supabase.com/dashboard/project/ghhhftxpcgciqegbpncr/database/backups → **Point-in-Time Recovery** → **Enable** → Retention **7일**.

- [ ] **Step 2: 일반 daily backup도 활성 상태인지 확인**

`Backups` 탭에서 자동 일일 백업 표시 확인. 없으면 활성화.

- [ ] **Step 3: DR 문서 작성**

`docs/operations/disaster-recovery.md`:

```markdown
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
```

- [ ] **Step 4: 커밋**

```bash
git add docs/operations/disaster-recovery.md
git commit -m "docs(ops): Supabase PITR 활성화 + DR 절차"
```

---

## Task 18: Phase 0 완료 회고 + Phase 1 인계

**Files:**
- Create: `docs/superpowers/specs/2026-04-26-phase0-completion.md`

- [ ] **Step 1: 모든 테스트 + 빌드 한 번 더 확인**

```bash
cd /Users/daniel_home/daniel-personal-app
npm test
npm run build
npm run lint
```
Expected:
- 테스트 모두 PASS
- 빌드 성공
- 린트 통과 (또는 사전에 있던 에러만)

- [ ] **Step 2: 완료 보고서 작성**

`docs/superpowers/specs/2026-04-26-phase0-completion.md`:

```markdown
# Phase 0 완료 보고 (2026-04-26)

## 적용된 변경
- Vitest 인프라 + 6개 신규 모듈 (timingSafeEqual, requireBearer, requireSession, safeFetch, parseOGMeta) — 모두 단위 테스트 PASS
- API route 인증 표준화: collect(Bearer), inbox/save·organize(Session)
- next.config.ts 보안 헤더 + API Cache-Control + PWA runtime cache 정책
- .env.example 정비 (Phase 2~3 변수 사전 정의)
- RLS SQL 작성(미적용, Phase 1에서 활성화)
- 클라이언트 supabase 호출 인벤토리 작성
- gitleaks 스캔: <결과 채워넣기>
- COLLECT_API_KEY 회전 완료, 단축어 갱신
- CRON_SECRET, BUDGET_API_KEY, BUDGET_HMAC_SECRET, Upstash 변수 사전 등록
- Anthropic monthly limit $5 설정
- Supabase PITR 활성화 + DR 절차 문서화

## Phase 1 진입 전 체크리스트
- [ ] Phase 1 spec/plan 작성
- [ ] 새 worktree 또는 새 브랜치
- [ ] 마이그레이션 순서: 클라이언트 호출 이전 → RLS 활성화(supabase_migration_phase0_rls.sql) → 다마고치 drop
- [ ] PITR가 켜져 있는 상태에서 마이그레이션 진행

## 알려진 미해결
- 클라이언트 직접 supabase 호출 (Phase 1에서 마이그레이션)
- RLS는 SQL만 있고 미활성 (Phase 1에서 활성화)
- 다마고치 코드/DB drop (Phase 1)
- /api/curation/process, /api/budget/auto (Phase 2/3)
```

- [ ] **Step 3: PR 푸시 (옵션, finishing-a-development-branch에서 결정)**

```bash
cd /Users/daniel_home/daniel-personal-app
git push -u origin phase0-security-baseline
```

- [ ] **Step 4: 커밋 + 마무리**

```bash
git add docs/superpowers/specs/2026-04-26-phase0-completion.md
git commit -m "docs(phase0): 완료 보고 + Phase 1 인계 체크리스트"
```

---

## 검증 (Phase 0 전체 PASS 조건)

- [ ] `npm test` 전체 PASS (timingSafeEqual, requireBearer, requireSession, safeFetch, parseOGMeta)
- [ ] `npm run build` 성공
- [ ] 미인증 `curl /api/inbox/save` → 401
- [ ] 잘못된 Bearer로 `curl /api/collect` → 401
- [ ] `curl -I https://daniel-personal-app.vercel.app/` 응답 헤더에 `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` 모두 존재
- [ ] `curl -I https://daniel-personal-app.vercel.app/api/anything` 응답에 `Cache-Control: no-store` 존재
- [ ] gitleaks 보고서 작성됨 (clean 또는 처리 완료)
- [ ] Anthropic 콘솔 monthly limit $5 스크린샷 존재
- [ ] Supabase PITR 활성 상태 (대시보드 확인)
- [ ] `COLLECT_API_KEY` 회전 후 단축어 정상 동작
- [ ] `CRON_SECRET`, `BUDGET_API_KEY`, `BUDGET_HMAC_SECRET`, `UPSTASH_REDIS_REST_*` 모두 Vercel에 등록 완료
- [ ] RLS 정책 SQL은 작성됐으나 **미적용** 상태 (Phase 1에서 적용)
- [ ] 클라이언트 supabase 호출 인벤토리 문서 존재

---

## 자체 점검 결과 (Self-Review, 작성자 기록)

**Spec coverage:**
- Task 0-1 (RLS) → Task 12
- Task 0-2 (`/api/inbox/*` 인증) → Task 8, 9
- Task 0-3 (미들웨어 매처) → Task 7~9에서 라우트별 명시 인증으로 대응 (미들웨어 변경은 불필요)
- Task 0-4 (timing-safe) → Task 2, 3
- Task 0-5 (SSRF) → Task 5, 6, 9
- Task 0-6 (보안 헤더) → Task 10
- Task 0-7 (gitleaks) → Task 14
- Task 0-8 (토큰 회전) → Task 15
- Task 0-9 (.env.example) → Task 11
- Task 0-10 (PWA cache) → Task 10
- Task 0-11 (PITR) → Task 17
- Task 0-12 (Anthropic limit) → Task 16
- Task 0-13 (클라이언트 인벤토리) → Task 13
- 추가: Vitest 인프라 → Task 1, 완료 보고 → Task 18

모든 spec 항목 커버됨.

**Placeholder scan:** 없음.

**Type consistency:**
- `RequireBearerResult`, `RequireSessionResult`, `SafeFetchResult`, `OGMeta` 정의가 모두 일관됨
- `unauthorized()` 함수는 두 헬퍼에서 각자 정의(중복 — 의도적, 모듈 분리 유지)
