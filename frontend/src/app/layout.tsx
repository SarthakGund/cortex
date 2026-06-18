import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./context/AuthContext";
import AppShell from "./components/AppShell";

export const metadata: Metadata = {
  title: "Cortex — Knowledge Graph Intelligence",
  description:
    "Ask questions about your codebase using a Knowledge-Augmented Graph (KAG) powered RAG pipeline with Gemini LLM.",
  openGraph: {
    title: "Cortex",
    description: "AI-powered codebase intelligence powered by Neo4j + ChromaDB + Gemini.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
