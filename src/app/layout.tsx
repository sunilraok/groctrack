import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import { RegisterServiceWorker } from "./register-service-worker";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "GrocTrack — Receipt to pantry",
    template: "%s · GrocTrack",
  },
  description:
    "Scan grocery receipts, learn store aliases, and keep a shared household inventory.",
  manifest: "/manifest.webmanifest",
  applicationName: "GrocTrack",
  appleWebApp: {
    capable: true,
    title: "GrocTrack",
    statusBarStyle: "default",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
