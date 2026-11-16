import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma는 Next 번들에 넣지 않고 node_modules에서 그대로 읽게 한다.
  // 그래야 wrangler가 wasm 쿼리 엔진(query_engine_bg.wasm)을 찾아 묶을 수 있다.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  // 상위 폴더(홈)에 다른 lockfile이 있어도 이 프로젝트를 기준으로 파일을 추적한다
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;

// added by create cloudflare to enable calling `getCloudflareContext()` in `next dev`
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
initOpenNextCloudflareForDev();
