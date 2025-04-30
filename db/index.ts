import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const adapter = new PrismaD1(getCloudflareContext().env.DB);
const prisma = new PrismaClient({ adapter });

export { prisma };
