"use client";

import { useState } from "react";

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus("Starting ingestion...");

    try {
      const response = await fetch("http://localhost:8000/ingest/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ repo_url: repoUrl }),
      });

      const data = await response.json();
      setStatus(`Success: ${data.message}`);
    } catch (error) {
      setStatus(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-24 bg-gray-50 text-gray-900">
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-md">
        <h1 className="text-3xl font-bold mb-6">SPIT Knowledge Graph Ingestion</h1>
        <p className="mb-6 text-gray-600">
          Enter a GitHub repository URL to clone, parse its AST, and ingest it into the Neo4j Knowledge Graph.
        </p>
        
        <form onSubmit={handleIngest} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              GitHub Repository URL
            </label>
            <input
              type="url"
              required
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/username/repo"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
          >
            {loading ? "Ingesting..." : "Ingest Repository"}
          </button>
        </form>

        {status && (
          <div className={`mt-6 p-4 rounded-md ${status.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {status}
          </div>
        )}
      </div>
    </main>
  );
}
