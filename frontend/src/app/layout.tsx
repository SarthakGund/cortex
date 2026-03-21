import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./context/AuthContext";
import AuthGate from "./components/AuthGate";



export const metadata: Metadata = {
  title: "Weavr — Knowledge Graph Intelligence",
  description:
    "Ask questions about your codebase using a Knowledge-Augmented Graph (KAG) powered RAG pipeline with Gemini LLM.",
  openGraph: {
    title: "Weavr",
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
      <body className="antialiased">
        <AuthProvider>
          <AuthGate>{children}</AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
