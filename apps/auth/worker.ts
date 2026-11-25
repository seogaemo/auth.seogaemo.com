/**
 * Worker 진입점. OpenNext가 만든 .open-next/worker.js(Next 요청 처리)를 그대로 쓰고,
 * Cron으로 도는 scheduled만 덧붙인다. 빌드(opennextjs-cloudflare build) 뒤에 wrangler가 함께 묶는다.
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- 빌드 전(CI의 tsc)에는 파일이 없고, 빌드 뒤에는 있다
// @ts-ignore
import handler from "./.open-next/worker.js";

import { deliverDue } from "./lib/backchannel";
import { cleanupExpired } from "./lib/cleanup";

/** wrangler.jsonc의 crons와 같아야 한다 */
const DAILY_CLEANUP = "17 18 * * *";

export default {
  fetch: handler.fetch,

  async scheduled(controller: ScheduledController, env: CloudflareEnv, ctx: ExecutionContext) {
    if (controller.cron === DAILY_CLEANUP) {
      ctx.waitUntil(
        cleanupExpired(env.DB).then(
          (deleted) => console.log("cleanup", JSON.stringify(deleted)),
          (error) => console.error("cleanup failed", error),
        ),
      );
      return;
    }
    // 매분: 실패한 back-channel logout 알림을 다시 보낸다
    ctx.waitUntil(
      deliverDue(env).then(
        (count) => count > 0 && console.log("backchannel retry", count),
        (error) => console.error("backchannel retry failed", error),
      ),
    );
  },
} satisfies ExportedHandler<CloudflareEnv>;
