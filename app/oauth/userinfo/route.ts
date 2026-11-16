import { getPrisma } from "@/cloudflare";
import { json, preflight } from "@/lib/oauth/http";
import { userClaims } from "@/lib/oauth/tokens";
import { verifyAccessToken } from "@/lib/token";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

function unauthorized(error = "invalid_token") {
  return json({ error }, 401, { "WWW-Authenticate": `Bearer error="${error}"` });
}

/** OIDC UserInfo Endpoint */
export async function GET(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return unauthorized("invalid_request");

  let claims;
  try {
    claims = await verifyAccessToken(header.slice(7));
  } catch {
    return unauthorized();
  }

  const user = await getPrisma().user.findUnique({
    where: { id: claims.sub },
    include: { service: true },
  });
  if (!user || user.service.clientId !== claims.client_id) return unauthorized();

  return json(userClaims(user, claims.scope));
}

export const POST = GET;
