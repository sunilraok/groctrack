import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GrocTrack",
  description:
    "A secure foundation for shared household grocery inventory.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
