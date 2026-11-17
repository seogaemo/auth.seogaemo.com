import { getCloudflareContext } from "@opennextjs/cloudflare";

import { clientInfo } from "./request";

/**
 * IP 하나가 로그인 단계(이메일 확인, 비밀번호, 코드 요청, 코드 확인)를 너무 자주 부르면 막는다.
 * 기준은 wrangler.jsonc의 LOGIN_LIMITER (1분에 30번). 바인딩이 없으면 막지 않는다.
 * 계정별 제한(비밀번호 5번, 코드 5번)과 별개로, 여러 계정을 돌아가며 시도하는 것을 막는다.
 */
export async function isRateLimited() {
  const limiter = getCloudflareContext().env.LOGIN_LIMITER;
  if (!limiter) return false;
  const { ip } = await clientInfo();
  if (!ip) return false;
  try {
    const { success } = await limiter.limit({ key: `login:${ip}` });
    return !success;
  } catch (error) {
    console.error("rate limit failed", error);
    return false;
  }
}

export const RATE_LIMITED_MESSAGE = "요청이 너무 많아요. 1분 뒤에 다시 시도하세요.";
