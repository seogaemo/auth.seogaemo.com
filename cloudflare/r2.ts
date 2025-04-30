import { getCloudflareContext } from "@opennextjs/cloudflare";

const r2 = getCloudflareContext().env.R2;
export { r2 };
