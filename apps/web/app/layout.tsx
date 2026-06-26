import type { Metadata } from "next";
import { Orbitron } from "next/font/google";
import "./globals.css";

const display = Orbitron({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "700", "900"],
});

export const metadata: Metadata = {
  title: "GPU Arena — GPUs battle, best answer wins",
  description:
    "Competitive GPU lending on Solana. Post a bounty, GPUs in the pool fight over it, the best answer takes the prize.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} text-slate-100 antialiased`}>
        <div className="grid-overlay min-h-screen">{children}</div>
      </body>
    </html>
  );
}
