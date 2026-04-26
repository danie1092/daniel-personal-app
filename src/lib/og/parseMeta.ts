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
