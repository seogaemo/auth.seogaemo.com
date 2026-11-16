import { getPrisma, getR2 } from "@/cloudflare";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/** 서비스 로고 (R2). 로그인 화면에서 쓴다. */
export async function GET(_request: Request, { params }: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await params;
  const service = await getPrisma().service.findUnique({
    where: { id: serviceId },
    select: { logoKey: true },
  });
  if (!service?.logoKey) return new Response(null, { status: 404 });

  const object = await getR2().get(service.logoKey);
  const type = object?.httpMetadata?.contentType ?? "";
  // SVG는 스크립트를 품을 수 있어 받지 않는다
  if (!object || !ALLOWED_TYPES.has(type)) return new Response(null, { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
