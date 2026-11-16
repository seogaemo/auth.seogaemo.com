/** 서비스 로고 64 + 이름 display, 간격 8 (Wireframe 28:1019) */
export function ServiceHeader({
  id,
  name,
  hasLogo,
  title,
}: {
  id: string;
  name: string;
  hasLogo: boolean;
  /** 서비스 이름 대신 보여줄 페이지 제목 */
  title?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {hasLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/service-logo/${id}`} alt="" width={64} height={64} className="size-16 rounded-sm object-cover" />
      ) : (
        <span
          aria-hidden
          className="flex size-16 items-center justify-center rounded-sm bg-black font-mono text-[32px] font-[600] text-white"
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <h1 className="text-display font-strong text-primary">{title ?? name}</h1>
    </div>
  );
}
