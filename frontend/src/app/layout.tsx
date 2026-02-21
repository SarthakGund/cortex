import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SPIT KAG·RAG — Knowledge Graph Intelligence",
  description:
    "Ask questions about your codebase using a Knowledge-Augmented Graph (KAG) powered RAG pipeline with Gemini LLM.",
  openGraph: {
    title: "SPIT KAG·RAG",
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
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
