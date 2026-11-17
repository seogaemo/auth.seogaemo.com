import { headers } from "next/headers";

/** 기록용 접속 정보. Cloudflare가 붙이는 cf-connecting-ip를 쓴다. */
export async function clientInfo() {
  const h = await headers();
  return {
    ip: h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  };
}

/** User-Agent를 사람이 읽을 이름으로 줄인다 ("Chrome, macOS") */
export function describeUserAgent(userAgent: string | null | undefined) {
  if (!userAgent) return "알 수 없는 기기";
  const browser =
    /Edg\//.test(userAgent) ? "Edge"
    : /Whale\//.test(userAgent) ? "Whale"
    : /SamsungBrowser\//.test(userAgent) ? "삼성 인터넷"
    : /KAKAOTALK/i.test(userAgent) ? "카카오톡"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /Safari\//.test(userAgent) ? "Safari"
    : "브라우저";
  const os =
    /iPhone|iPad/.test(userAgent) ? "iOS"
    : /Android/.test(userAgent) ? "Android"
    : /Mac OS X/.test(userAgent) ? "macOS"
    : /Windows/.test(userAgent) ? "Windows"
    : /Linux/.test(userAgent) ? "Linux"
    : null;
  return os ? `${browser}, ${os}` : browser;
}
