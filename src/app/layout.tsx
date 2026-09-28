import type { Metadata } from "next";
import "./globals.css";

// 카카오톡·슬랙에 주소를 붙이면 openGraph 값이 미리보기로 뜬다. title만 두면 앱마다 다르게 보여 둘 다 적는다.
export const metadata: Metadata = {
  title: "포스모스 POSMOS 전산",
  description: "포스 설치 및 가입 대행 전산 시스템",
  openGraph: {
    title: "포스모스 POSMOS 전산",
    description: "포스 설치 및 가입 대행 전산 시스템",
    siteName: "포스모스 POSMOS 전산",
    locale: "ko_KR",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark'||t==='pink')document.documentElement.setAttribute('data-theme',t);}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
