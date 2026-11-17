interface CloudflareEnv {
  DB: D1Database;
  R2: R2Bucket;

  /** OIDC issuer (예: https://auth.seogaemo.com). wrangler.jsonc vars, 로컬은 .dev.vars */
  ISSUER: string;

  /** EC P-256 개인키 JWK (kid 포함). `wrangler secret put JWT_PRIVATE_JWK`로 등록한다. */
  JWT_PRIVATE_JWK: string;

  /** 비어 있으면 해당 로그인 수단은 꺼진 것으로 본다. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** 카카오 REST API 키 */
  KAKAO_CLIENT_ID?: string;
  /** 카카오 콘솔에서 Client Secret을 켠 경우에만 */
  KAKAO_CLIENT_SECRET?: string;

  /** (선택) Gravatar API 키. 없으면 키 없이 공개 API를 부른다 (호출 한도가 낮다). */
  GRAVATAR_API_KEY?: string;

  /** 메일 발송 (smtp2go). 비어 있으면 이메일/비밀번호, 이메일 코드 로그인이 꺼진다. */
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USERNAME?: string;
  SMTP_PASSWORD?: string;
  /** 보내는 사람. 예: Seogaemo <no-reply@seogaemo.com> */
  MAIL_FROM?: string;
  /** "1"이면 메일 대신 로그에 남긴다. ISSUER가 http://localhost일 때만 동작한다. */
  MAIL_DEV_LOG?: string;
}
