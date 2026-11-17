import { CORS_HEADERS } from "@/lib/oauth/http";
import { getJwks } from "@/lib/token";

export const dynamic = "force-dynamic";

/** 브라우저(SPA)에서 ID 토큰 서명을 검증할 때도 읽으므로 CORS를 연다 (공개키뿐이다) */
export async function GET() {
  return Response.json(await getJwks(), {
    headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=300" },
  });
}

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS_HEADERS });
