import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CFAO Team Tool",
  description: "Shared Cut / Fix / Add / Outperform analysis dashboard",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
