/**
 * 서버가 돌려준 OAuth 오류 (RFC 6749 4.1.2.1, 5.2).
 * `error`는 표준 코드(`invalid_grant`, `login_required` 등)라 분기에 쓰고, `description`은 사람용이다.
 */
export class OAuthError extends Error {
  override readonly name = "OAuthError";

  constructor(
    readonly error: string,
    readonly description?: string,
    /** 토큰 엔드포인트 등 HTTP 응답에서 온 오류면 상태 코드 */
    readonly status?: number,
  ) {
    super(description ? `${error}: ${description}` : error);
  }
}

/**
 * 서버 응답이나 토큰이 표준이 요구하는 검사를 통과하지 못했다.
 * state, iss, nonce 불일치, 서명 오류, 만료 같은 것. 공격일 수 있으니 재시도하지 말고 로그인을 처음부터 다시 한다.
 */
export class ValidationError extends Error {
  override readonly name = "ValidationError";

  constructor(
    readonly code:
      | "state_mismatch"
      | "issuer_mismatch"
      | "missing_code"
      | "invalid_response"
      | "invalid_metadata"
      | "invalid_id_token",
    message: string,
  ) {
    super(message);
  }
}
