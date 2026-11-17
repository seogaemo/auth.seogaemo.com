import { redirect } from "next/navigation";

/** 관리자 아래로 옮긴 옛 주소 */
export default async function Moved({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/console/services/${(await params).id}/members/activity`);
}
