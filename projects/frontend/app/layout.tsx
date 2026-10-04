import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "edu-cloud · A workspace for engineering judgment",
  description: "Read deeply. Understand principles. Build better software.",
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
