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
  // 기본 글꼴(LINE Seed Sans KR)은 globals.css에서 DS preset의 Pretendard를 덮어 쓴다.
  return (
    <html lang="ko">
      <body className="bg-base antialiased">{children}</body>
    </html>
  );
}
