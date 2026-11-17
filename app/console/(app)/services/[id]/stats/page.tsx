import { redirect } from "next/navigation";

/** 개요로 합쳐진 옛 주소 */
export default async function Moved({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/console/services/${(await params).id}`);
}
