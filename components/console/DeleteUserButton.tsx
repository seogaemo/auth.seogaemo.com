"use client";

/** 사용자 삭제. 연결된 로그인 수단과 토큰도 같이 지워져서 한 번 더 묻는다. */
export function DeleteUserButton({ action, label }: { action: () => Promise<void>; label: string }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`${label} 사용자를 지울까요? 로그인 기록과 토큰도 같이 지워져요.`)) e.preventDefault();
      }}
    >
      <button type="submit" aria-label={`삭제 ${label}`} className="text-footnote text-content-negative hover:underline">
        삭제
      </button>
    </form>
  );
}
