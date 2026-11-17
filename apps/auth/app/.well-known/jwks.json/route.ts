import { getJwks } from "@/lib/token";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getJwks(), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
