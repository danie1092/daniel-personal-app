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
