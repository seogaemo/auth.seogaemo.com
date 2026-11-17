import { isProvider, type Provider } from "../config";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * 줄마다 하나씩 받은 redirect URI를 검사한다.
 * https만 허용하고, 개발용으로 localhost만 http를 허용한다. fragment(#)는 금지 (RFC 6749 3.1.2).
 */
export function parseRedirectUris(input: string): { uris: string[] } | { error: string } {
  const lines = [...new Set(input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))];
  if (lines.length > 20) return { error: "Redirect URI는 20개까지 등록할 수 있어요. 안 쓰는 주소를 지우세요." };

  for (const line of lines) {
    let url: URL;
    try {
      url = new URL(line);
    } catch {
      return { error: `https://example.com/auth/callback 형식으로 입력하세요: ${line}` };
    }
    if (url.hash || line.includes("#")) return { error: `# 뒤 부분을 빼고 입력하세요: ${line}` };
    if (url.username || url.password) return { error: `주소에서 아이디와 비밀번호(user:pass@)를 빼고 입력하세요: ${line}` };
    if (url.protocol === "http:" && !LOCAL_HOSTS.has(url.hostname)) {
      return { error: `http는 localhost에서만 쓸 수 있어요. https로 바꿔 입력하세요: ${line}` };
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { error: `https로 시작하는 주소를 입력하세요: ${line}` };
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
