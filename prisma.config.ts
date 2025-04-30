import path from "node:path";
import type { PrismaConfig } from "prisma";
import { PrismaD1HTTP } from "@prisma/adapter-d1";

// import your .env file
import "dotenv/config";

type Env = {
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_DATABASE_ID: string;
  CLOUDFLARE_D1_TOKEN: string;
};

export default {
  earlyAccess: true,
  schema: path.join("prisma", "schema.prisma"),
  migrate: {
    async adapter(env: Env) {
      return new PrismaD1HTTP({
        CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
        CLOUDFLARE_DATABASE_ID: env.CLOUDFLARE_DATABASE_ID,
        CLOUDFLARE_D1_TOKEN: env.CLOUDFLARE_D1_TOKEN,
      });
    },
  },
} satisfies PrismaConfig<Env>;
