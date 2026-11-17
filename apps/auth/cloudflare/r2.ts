import { getCloudflareContext } from "@opennextjs/cloudflare";

export function getR2() {
  return getCloudflareContext().env.R2;
}
