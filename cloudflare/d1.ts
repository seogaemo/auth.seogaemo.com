import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// getCloudflareContext()는 요청 처리 중에만 동작하므로 모듈 최상단에서 부르면 안 된다.
// 같은 D1 바인딩에 대해서는 클라이언트를 재사용한다.
const clients = new WeakMap<D1Database, PrismaClient>();

export function getPrisma() {
  const db = getCloudflareContext().env.DB;

  let client = clients.get(db);
  if (!client) {
    client = new PrismaClient({ adapter: new PrismaD1(db) });
    clients.set(db, client);
  }

  return client;
}
