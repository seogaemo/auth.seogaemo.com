/** 로고 48 + 두 줄 제목 (모노 24px, 행간 1.35, 자간 -0.04em). 기본은 "{서비스}에 / 로그인하기" */
export function ServiceHeading({
  name,
  logoUrl,
  action = "로그인하기",
  title,
  description,
}: {
  name: string;
  logoUrl?: string | null;
  /** 두 번째 줄 */
  action?: string;
  /** "{서비스}에 / {action}" 대신 쓸 제목 */
  title?: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" width={48} height={48} className="size-12 object-cover" />
      ) : (
        <div aria-hidden className="flex size-12 items-center justify-center bg-black">
          <span className="font-mono text-[22px] font-[600] text-white">{name.slice(0, 1).toUpperCase()}</span>
        </div>
      )}
      <h1 className="font-mono text-[24px] font-[450] leading-[1.35] tracking-[-0.04em] text-black">
        {title ?? (
          <>
            {name}에
            <br />
            {action}
          </>
        )}
      </h1>
      {description && <p className="text-footnote text-secondary">{description}</p>}
    </header>
  );
}
