/** 로고 64 + "{서비스}에 / 로그인하기" (Monoplex Text 32px, 모바일 28px, 행간 1.4, 자간 -0.04em) */
export function ServiceHeading({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  return (
    <header className="flex flex-col gap-2">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" width={64} height={64} className="size-16 object-cover" />
      ) : (
        <div
          aria-hidden
          className="flex size-16 items-center justify-center bg-black font-mono text-[32px] font-[600] text-white"
        >
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <h1 className="font-mono text-[28px] font-[450] leading-[1.4] tracking-[-0.04em] text-black sm:text-[32px]">
        {name}에
        <br />
        로그인하기
      </h1>
    </header>
  );
}
