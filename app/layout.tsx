import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seogaemo SSO",
  description: "Seogaemo 계정으로 여러 서비스에 로그인하세요.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 폰트(Pretendard)는 @seogaemo/ds-tailwind preset이 base 스타일로 넣어준다.
  return (
    <html lang="ko">
      <body className="bg-base antialiased">{children}</body>
    </html>
  );
}
