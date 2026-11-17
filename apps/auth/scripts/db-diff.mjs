// 로컬 D1과 prisma/schema.prisma의 차이를 SQL로 출력한다. 사용: pnpm db:diff > migrations/000N_name.sql
// wrangler가 같은 폴더에 metadata.sqlite를 만들어서 prisma의 --from-local-d1이 DB를 못 고르므로 직접 지정한다.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const db = readdirSync(dir).find((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite");
if (!db) throw new Error("로컬 D1이 없어요. pnpm db:migrate:local을 먼저 실행하세요.");

execFileSync(
  "npx",
  ["prisma", "migrate", "diff", "--from-url", `file:${join(dir, db)}`, "--to-schema-datamodel", "./prisma/schema.prisma", "--script"],
  { stdio: "inherit" },
);
