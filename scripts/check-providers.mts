// 로그인 수단마다 필요한 파일과 설정이 다 있는지 확인한다. 타입 검사로 못 잡는 것만 본다.
// 실행: pnpm check:providers (Node 22.6+의 TypeScript 타입 제거로 바로 실행된다)
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PROVIDER_META, PROVIDERS, SOCIAL_PROVIDERS, providerIcon, socialMeta } from "../lib/provider-meta.ts";

const root = join(import.meta.dirname, "..");
const problems: string[] = [];
const publicFile = (path: string) => existsSync(join(root, "public", path));

for (const provider of PROVIDERS) {
  for (const on of [true, false]) {
    const icon = providerIcon(provider, on);
    if (!publicFile(icon)) problems.push(`${provider}: 콘솔 아이콘 public${icon} 없음`);
  }
}

const envTypes = readFileSync(join(root, "cloudflare-env.d.ts"), "utf8");
for (const provider of SOCIAL_PROVIDERS) {
  const { logo } = socialMeta(provider);
  if (!publicFile(logo)) problems.push(`${provider}: 로그인 버튼 로고 public${logo} 없음`);

  const key = `${provider.toUpperCase()}_CLIENT_ID`;
  if (!envTypes.includes(key)) problems.push(`${provider}: cloudflare-env.d.ts에 ${key} 없음`);
}

if (problems.length > 0) {
  console.error(problems.map((p) => `- ${p}`).join("\n"));
  process.exit(1);
}
console.log(`로그인 수단 ${PROVIDERS.length}개 확인: ${Object.keys(PROVIDER_META).join(", ")}`);
