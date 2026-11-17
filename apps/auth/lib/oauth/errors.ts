import { endpoint } from "../config";

/** 서비스로 돌려보낼 수 없는 오류. /login/error 화면에서 사람이 읽을 문구로 보여준다. */
export const LOGIN_ERRORS = {
  invalid_client: "등록되지 않은 서비스예요.",
  invalid_redirect_uri: "서비스에 등록되지 않은 주소로 로그인을 요청했어요.",
  invalid_request: "로그인 요청이 올바르지 않아요. 서비스에서 다시 시도하세요.",
  no_provider: "이 서비스에 켜진 로그인 방식이 없어요.",
  expired: "로그인 시간이 지났어요. 서비스에서 다시 시도하세요.",
  provider_failed: "로그인 제공자와 연결하지 못했어요. 잠시 후 다시 시도하세요.",
  not_allowed:
    "이 서비스는 허용된 이메일로만 로그인할 수 있어요. 다른 계정으로 서비스에서 다시 시도하거나 서비스 운영자에게 문의하세요.",
  user_disabled: "이 계정은 정지됐어요. 서비스 운영자에게 문의하세요.",
  signup_closed: "이 서비스는 지금 새로 가입할 수 없어요. 이미 가입한 계정으로 로그인하세요.",
} as const;

export type LoginErrorCode = keyof typeof LOGIN_ERRORS;

export function loginErrorUrl(code: LoginErrorCode) {
  return endpoint(`/login/error?code=${code}`);
}

export function isLoginErrorCode(value: string | undefined): value is LoginErrorCode {
  return !!value && value in LOGIN_ERRORS;
}
