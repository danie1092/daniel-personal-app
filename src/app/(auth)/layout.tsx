import "../globals.css";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="h-full">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/webfontworld/gmarket/GmarketSans.css"
        />
      </head>
      <body className="h-full bg-white text-black antialiased">
        {children}
      </body>
    </html>
  );
}
