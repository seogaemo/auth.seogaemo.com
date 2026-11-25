"use client";

import { Button } from "@/components/console/ui";

/**
 * 화면 안에서 난 오류. 없으면 Next 기본 "Application error" 화면이 뜬다.
 *
 * 가장 흔한 경우는 배포 직후다. 열려 있던 탭은 예전 빌드의 Server Action ID로 저장을 보내는데,
 * 새 빌드에는 그 ID가 없어서 404가 나고 UnrecognizedActionError가 던져진다. 다시 시도해도 같은 ID라
 * 소용없고, 페이지를 새로 받아야 한다.
 */
function isStaleDeployment(error: Error) {
  return error.name === "UnrecognizedActionError" || /Server Action .* was not found on the server/.test(error.message);
}

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStaleDeployment(error);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-headline font-strong text-primary">{stale ? "새 버전이 배포됐어요" : "화면을 보여 주지 못했어요"}</h1>
      <p className="max-w-sm text-footnote text-secondary">
        {stale
          ? "이 화면을 연 뒤에 서비스가 업데이트돼서 방금 한 작업을 처리하지 못했어요. 새로고침한 뒤 다시 해 주세요. 입력한 내용은 다시 넣어야 해요."
          : "잠시 뒤 다시 시도하세요. 계속 안 되면 새로고침하세요."}
      </p>
      <Button type="button" className="mt-4" onClick={() => (stale ? window.location.reload() : reset())}>
        {stale ? "새로고침" : "다시 시도"}
      </Button>
      {error.digest && <p className="mt-2 font-mono text-label text-tertiary">오류 번호 {error.digest}</p>}
    </main>
  );
}
