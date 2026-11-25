/**
 * 로그인 수단을 amr(Authentication Methods References) 값으로 바꾼다.
 * 값은 RFC 8176 등록 목록에서 고르고, 목록에 없는 외부 로그인은 Okta, Entra처럼 "fed"를 쓴다.
 * 바꾸면 lib/integration-guide.ts의 설명도 같이 바꾼다 (앱이 이 값으로 판단한다).
 */
const AMR: Record<string, string[]> = {
  password: ["pwd"],
  // 메일로 받은 일회용 코드
  email: ["otp"],
  // 기기의 키 + 생체 인식이나 화면 잠금 (WebAuthn user verification)
  passkey: ["hwk", "user"],
  google: ["fed"],
  kakao: ["fed"],
};

export function amrFor(method: string | null | undefined): string[] | undefined {
  return method ? AMR[method] : undefined;
}
