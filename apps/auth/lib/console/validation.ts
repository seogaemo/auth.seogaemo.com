import { isProvider, type Provider } from "../config";
import { isAppSchemeUrl } from "../redirect-uri";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * 줄마다 하나씩 받은 redirect URI를 검사한다. fragment(#)는 금지 (RFC 6749 3.1.2).
 * 웹은 https만, 개발용으로 localhost만 http를 허용한다.
 * 네이티브 앱은 역도메인 스킴(com.example.app:/callback, RFC 8252 7.1)을 허용한다.
 */
export function parseRedirectUris(input: string, label = "Redirect URI"): { uris: string[] } | { error: string } {
  const lines = [...new Set(input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))];
  if (lines.length > 20) return { error: `${label}는 20개까지 등록할 수 있어요. 안 쓰는 주소를 지우세요.` };

  for (const line of lines) {
    let url: URL;
    try {
      url = new URL(line);
    } catch {
      return { error: `https://example.com/auth/callback이나 com.example.app:/callback 형식으로 입력하세요: ${line}` };
    }
    if (url.hash || line.includes("#")) return { error: `# 뒤 부분을 빼고 입력하세요: ${line}` };
    if (url.username || url.password) return { error: `주소에서 아이디와 비밀번호(user:pass@)를 빼고 입력하세요: ${line}` };
    if (url.protocol === "http:" && !LOCAL_HOSTS.has(url.hostname)) {
      return { error: `http는 localhost에서만 쓸 수 있어요. https로 바꿔 입력하세요: ${line}` };
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      if (!isAppSchemeUrl(url)) {
        return {
          error: `웹은 https로, 앱은 com.example.app:/callback처럼 앱 도메인을 뒤집은 스킴으로 입력하세요: ${line}`,
        };
      }
      if (!url.host && (url.pathname === "" || url.pathname === "/")) {
        return { error: `스킴 뒤에 경로를 붙여 입력하세요. 예: ${url.protocol}/oauth/callback` };
      }
    }
  }

  return { uris: lines };
}

export function parseProviders(values: FormDataEntryValue[]): Provider[] {
  return [...new Set(values.map(String).filter(isProvider))];
}

export function parseServiceName(value: FormDataEntryValue | null): { name: string } | { error: string } {
  const name = String(value ?? "").trim();
  if (!name) return { error: "앱 이름을 입력하세요." };
  if (name.length > 40) return { error: "앱 이름은 40자까지 쓸 수 있어요." };
  return { name };
}

/** #rrggbb 또는 빈 값(기본값으로 되돌리기) */
export function parseHexColor(value: FormDataEntryValue | null): { color: string | null } | { error: string } {
  const color = String(value ?? "").trim();
  if (!color) return { color: null };
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return { error: "색은 #2C73F4 같은 형식으로 입력하세요." };
  return { color: color.toLowerCase() };
}

/** 비워 두면 null. 있으면 https 주소여야 한다. */
export function parseOptionalHttpsUrl(value: FormDataEntryValue | null, label: string): { url: string | null } | { error: string } {
  const text = String(value ?? "").trim();
  if (!text) return { url: null };
  try {
    const url = new URL(text);
    if (url.protocol !== "https:") return { error: `${label} 주소는 https로 시작하게 입력하세요.` };
    return { url: url.toString() };
  } catch {
    return { error: `${label} 주소를 https://example.com/terms 형식으로 입력하세요.` };
  }
}

/** 웹 Redirect URI들의 origin. 새 앱의 "로그아웃 후 이동 주소" 기본값 */
export function webOrigins(uris: string[]) {
  const origins = uris.flatMap((uri) => {
    try {
      const url = new URL(uri);
      return url.protocol === "https:" || url.protocol === "http:" ? [url.origin] : [];
    } catch {
      return [];
    }
  });
  return [...new Set(origins)];
}

/**
 * back-channel logout 주소. 서버가 직접 POST하니 웹 주소만 받는다 (https, 개발용 localhost만 http).
 * 비우면 null (알림을 끈다).
 */
export function parseBackchannelUri(input: string): { uri: string | null } | { error: string } {
  const value = input.trim();
  if (!value) return { uri: null };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { error: `https://api.example.com/auth/backchannel-logout 형식으로 입력하세요: ${value}` };
  }
  if (url.hash || value.includes("#")) return { error: `# 뒤 부분을 빼고 입력하세요: ${value}` };
  if (url.username || url.password) return { error: `주소에서 아이디와 비밀번호(user:pass@)를 빼고 입력하세요: ${value}` };
  if (url.protocol === "http:" && !LOCAL_HOSTS.has(url.hostname)) {
    return { error: `http는 localhost에서만 쓸 수 있어요. https로 바꿔 입력하세요: ${value}` };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { error: `서버 주소(https://...)를 입력하세요. 앱 스킴으로는 보낼 수 없어요: ${value}` };
  }
  return { uri: url.toString() };
}
