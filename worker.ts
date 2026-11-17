/**
 * Worker 진입점. OpenNext가 만든 .open-next/worker.js(Next 요청 처리)를 그대로 쓰고,
 * Cron으로 도는 scheduled만 덧붙인다. 빌드(opennextjs-cloudflare build) 뒤에 wrangler가 함께 묶는다.
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- 빌드 전(CI의 tsc)에는 파일이 없고, 빌드 뒤에는 있다
// @ts-ignore
import handler from "./.open-next/worker.js";

import { cleanupExpired } from "./lib/cleanup";

export default {
  fetch: handler.fetch,

  async scheduled(_controller: ScheduledController, env: CloudflareEnv, ctx: ExecutionContext) {
    ctx.waitUntil(
      cleanupExpired(env.DB).then(
        (deleted) => console.log("cleanup", JSON.stringify(deleted)),
        (error) => console.error("cleanup failed", error),
      ),
    );
  },
} satisfies ExportedHandler<CloudflareEnv>;
