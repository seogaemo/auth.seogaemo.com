/** 서비스 로고 40 + 제목 20px, 가로로 */
export function ServiceHeader({
  id,
  name,
  hasLogo,
  title,
  subtitle,
}: {
  id: string;
  name: string;
  hasLogo: boolean;
  /** 서비스 이름 대신 보여줄 페이지 제목 */
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {hasLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/service-logo/${id}`} alt="" width={40} height={40} className="size-10 shrink-0 rounded-md object-cover" />
      ) : (
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-md bg-black">
          <span className="font-mono text-[18px] font-[600] text-white">{name.slice(0, 1).toUpperCase()}</span>
        </span>
      )}
      <div className="flex min-w-0 flex-col">
        <h1 className="break-words text-headline font-strong text-primary">{title ?? name}</h1>
        {subtitle && <p className="text-footnote text-tertiary">{subtitle}</p>}
      </div>
    </div>
  );
}
