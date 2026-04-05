import type { Metadata, Viewport } from "next";
import "../globals.css";
import BottomNav from "@/components/ui/BottomNav";

export const metadata: Metadata = {
  title: "My App",
  description: "가계부, 일기, 메모, 루틴 관리",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "My App",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/webfontworld/gmarket/GmarketSans.css"
        />
      </head>
      <body className="h-full bg-white text-black antialiased">
        <main className="max-w-md mx-auto h-full pb-14">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
