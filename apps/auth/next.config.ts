import { join } from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma는 Next 번들에 넣지 않고 node_modules에서 그대로 읽게 한다.
  // 그래야 wrangler가 wasm 쿼리 엔진(query_engine_bg.wasm)을 찾아 묶을 수 있다.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  // pnpm workspace라 의존성 실체는 저장소 루트의 node_modules/.pnpm에 있다.
  // 추적 기준을 루트로 둬야 빌드가 그 파일들을 묶는다 (홈 폴더의 다른 lockfile도 무시한다).
  outputFileTracingRoot: join(process.cwd(), "../.."),
};

export default nextConfig;

// added by create cloudflare to enable calling `getCloudflareContext()` in `next dev`
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
initOpenNextCloudflareForDev();
