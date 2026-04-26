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
