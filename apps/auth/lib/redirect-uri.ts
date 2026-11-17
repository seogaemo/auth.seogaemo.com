/**
 * Redirect URI 종류. 웹은 http(s), 네이티브 앱은 RFC 8252 7.1의 private-use URI scheme이다.
 *
 * 앱 스킴은 앱이 가진 도메인을 뒤집은 이름이어야 한다 (com.example.app). 점이 없는 짧은 스킴(myapp:)은
 * 다른 앱과 겹치기 쉬워서 받지 않는다. 같은 스킴을 다른 앱이 가로채도 PKCE 때문에 code를 쓸 수 없다.
 */

/** URL.protocol은 소문자로 바뀌고 끝에 ":"가 붙는다 */
const APP_SCHEME = /^[a-z][a-z0-9+-]*(\.[a-z0-9+-]+)+:$/;

export function isWebUrl(url: URL) {
  return url.protocol === "https:" || url.protocol === "http:";
}

export function isAppSchemeUrl(url: URL) {
  return !isWebUrl(url) && APP_SCHEME.test(url.protocol);
}

export function parseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
