import type { Metadata } from "next";

export const metadata: Metadata = { title: "페이지를 찾을 수 없어요" };

/** 없는 주소. 기본 404에는 main 영역이 없어서 직접 둔다 (스크린 리더가 본문으로 바로 가게) */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-headline font-strong text-primary">페이지를 찾을 수 없어요</h1>
      <p className="text-footnote text-secondary">주소가 바뀌었거나 지워졌어요. 주소를 다시 확인하세요.</p>
    </main>
  );
}
