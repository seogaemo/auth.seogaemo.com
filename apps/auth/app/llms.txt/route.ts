import { llmsIndex } from "@/lib/integration-guide";
import { CORS_HEADERS } from "@/lib/oauth/http";

export const dynamic = "force-dynamic";

/** AI 코딩 도구가 읽는 연동 안내 (llmstxt.org). 내용은 lib/integration-guide.ts */
export function GET() {
  return new Response(llmsIndex(), {
    headers: { ...CORS_HEADERS, "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
