'use client';

import { useEffect, useState } from 'react';
import type { HealthResponse, HelloResponse } from '@repo/contracts';

export default function Home() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [hello, setHello] = useState<HelloResponse | null>(null);

  useEffect(() => {
    fetch('http://localhost:3001/health')
      .then((res) => res.json())
      .then((data) => setHealth(data))
      .catch((err) => console.error(err));

    fetch('http://localhost:3001/hello')
      .then((res) => res.json())
      .then((data) => setHello(data))
      .catch((err) => console.error(err));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-900 text-white">
      <h1 className="text-4xl font-bold mb-8">Monorepo Test</h1>

      <div className="flex gap-8">
        <div className="p-6 bg-gray-800 rounded-xl shadow-lg border border-gray-700">
          <h2 className="text-2xl font-semibold mb-4 text-green-400">Health Check</h2>
          {health ? (
            <div>
              <p>Status: <span className="text-white font-mono">{health.status}</span></p>
              <p>Time: <span className="text-white font-mono">{new Date(health.timestamp).toLocaleTimeString()}</span></p>
            </div>
          ) : (
            <p className="text-gray-400">Loading...</p>
          )}
        </div>

        <div className="p-6 bg-gray-800 rounded-xl shadow-lg border border-gray-700">
          <h2 className="text-2xl font-semibold mb-4 text-blue-400">Hello API</h2>
          {hello ? (
            <p>Message: <span className="text-white font-mono">{hello.message}</span></p>
          ) : (
            <p className="text-gray-400">Loading...</p>
          )}
        </div>
      </div>
    </main>
  );
}
