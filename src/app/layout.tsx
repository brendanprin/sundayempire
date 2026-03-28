import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SundayEmpire | Dynasty League Tool",
  description: "Premium dynasty contract fantasy football commissioner app with comprehensive team management, trade validation, and compliance tools.",
  keywords: ["dynasty football", "fantasy sports", "commissioner tools", "salary cap management", "trade validation", "contract management"],
  authors: [{ name: "SundayEmpire" }],
  creator: "SundayEmpire",
  publisher: "SundayEmpire",
  applicationName: "SundayEmpire Dynasty League Tool",
  generator: "Next.js",
  
  robots: {
    index: false,
    follow: false,
  },
  
  openGraph: {
    type: "website",
    locale: "en_US",
    title: "SundayEmpire | Dynasty League Tool",
    description: "Premium dynasty contract fantasy football commissioner app with comprehensive team management, trade validation, and compliance tools.",
    siteName: "SundayEmpire",
  },
  
  twitter: {
    card: "summary_large_image",
    title: "SundayEmpire | Dynasty League Tool",
    description: "Premium dynasty contract fantasy football commissioner app",
    creator: "@sundayempire",
  },
  
  appleWebApp: {
    title: "SundayEmpire",
    statusBarStyle: "black-translucent",
    capable: true,
  },
  
  formatDetection: {
    telephone: false,
  },
  
  other: {
    "msapplication-TileColor": "#0F172A",
    "theme-color": "#0F172A",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
