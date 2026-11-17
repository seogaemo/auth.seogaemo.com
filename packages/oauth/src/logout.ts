import type { ServerMetadata } from "./metadata.js";

export interface LogoutRequest {
  /** 로그인 때 받은 ID 토큰. 어느 앱의 로그인을 끝낼지 서버가 알 수 있다 */
  idTokenHint?: string;
  /** id_token_hint가 없을 때 앱을 알려준다 */
  clientId?: string;
  /** 로그아웃 뒤 돌아갈 주소. 등록한 Redirect URI와 origin이 같아야 한다 */
  postLogoutRedirectUri?: string;
  /** post_logout_redirect_uri로 그대로 돌려준다 */
  state?: string;
}

/**
 * RP-Initiated Logout 1.0. 브라우저를 이 주소로 보내면 Seogaemo의 로그인 세션이 끝난다.
 * 앱의 토큰은 따로 지워야 하니 revokeToken으로 refresh token도 폐기한다.
 */
export function buildLogoutUrl(metadata: Pick<ServerMetadata, "end_session_endpoint">, request: LogoutRequest = {}): URL {
  if (!metadata.end_session_endpoint) throw new TypeError("server has no end_session_endpoint");
  const url = new URL(metadata.end_session_endpoint);
  const params: Record<string, string | undefined> = {
    id_token_hint: request.idTokenHint,
    client_id: request.clientId,
    post_logout_redirect_uri: request.postLogoutRedirectUri,
    state: request.state,
  };
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url;
}
