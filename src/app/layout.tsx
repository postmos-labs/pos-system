import type { Metadata } from "next";
import "./globals.css";

// 카카오톡·슬랙에 주소를 붙이면 openGraph 값이 미리보기로 뜬다. title만 두면 앱마다 다르게 보여 둘 다 적는다.
// 미리보기 이미지 주소는 절대경로여야 해서 metadataBase가 필요하다. 환경변수가 없으면 운영 주소를 쓴다.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://pos-system-ten-phi.vercel.app"),
  title: "포스모스 POSMOS 전산",
  description: "포스 설치 및 가입 대행 전산 시스템",
  openGraph: {
    title: "포스모스 POSMOS 전산",
    description: "포스 설치 및 가입 대행 전산 시스템",
    siteName: "포스모스 POSMOS 전산",
    locale: "ko_KR",
    type: "website",
    // 카카오톡·슬랙이 SVG는 미리보기로 쓰지 않아 로고를 PNG 카드로 만들어 둔다.
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "포스모스 POSMOS 전산" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "포스모스 POSMOS 전산",
    description: "포스 설치 및 가입 대행 전산 시스템",
    images: ["/og-image.png"],
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
