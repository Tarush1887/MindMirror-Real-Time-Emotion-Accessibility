// src/app/layout.tsx
import "./globals.css";
import { ReactNode } from "react";
import { Metadata } from "next";
import { Inter } from "next/font/google";

/* ✅ Font setup (Inter + fallback system fonts)
   Using next/font ensures server/client consistency
   and removes hydration mismatch errors completely.
*/
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

/* ✅ SEO Metadata */
export const metadata: Metadata = {
  title: "MindMirror – Emotion Accessibility for the Deaf/Hard of Hearing",
  description:
    "MindMirror helps the deaf and hard of hearing understand emotions in real-time using AI-powered facial and voice sentiment analysis.",
  keywords: [
    "AI emotion analysis",
    "Deaf accessibility",
    "Facial recognition",
    "MindMirror",
    "Sentiment detection",
  ],
  authors: [{ name: "MindMirror Team" }],
};

/* ✅ Root Layout */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body
        className="font-sans bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center antialiased selection:bg-teal-500 selection:text-white"
        style={{
          fontFamily:
            "var(--font-inter), system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        }}
      >
        {/* Header */}
        <header className="w-full py-4 bg-gray-800 text-center shadow-md border-b border-gray-700">
          <h1 className="text-2xl font-extrabold tracking-wide text-teal-400">
            💫 MindMirror
          </h1>
          <p className="text-sm text-gray-300 mt-1">
            Real-Time Emotion Accessibility for Everyone
          </p>
        </header>

        {/* Main App Content */}
        <main className="grow w-full flex flex-col items-center justify-center p-6 fade-in">
          {children}
        </main>

        {/* Footer */}
        <footer className="w-full py-3 bg-gray-800 text-center text-gray-400 text-sm border-t border-gray-700">
          © {new Date().getFullYear()} MindMirror. All rights reserved.
        </footer>
      </body>
    </html>
  );
}
