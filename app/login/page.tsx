'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push('/');
      } else {
        const data = await res.json();
        setError(data.error || 'Login failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#080c12] px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-10 text-center">
          <div className="flex items-center justify-center gap-2.5 select-none">
            <div className="glow-dot" />
            <span className="text-2xl font-bold tracking-tight text-white">
              chytac
            </span>
          </div>
          <p className="mt-2 font-mono text-[11px] text-gray-600 uppercase tracking-widest">
            .cz domain catcher
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-[11px] font-medium text-gray-500 uppercase tracking-wider"
            >
              heslo
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-800 bg-[#0d1117] px-4 py-2.5
                         font-mono text-sm text-white placeholder-gray-600
                         focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20
                         transition-colors"
              placeholder="········"
              autoFocus
              required
            />
          </div>

          {error && (
            <p className="font-mono text-xs text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg border border-accent/30 bg-accent/10 px-4 py-2.5
                       text-sm font-medium text-accent-light
                       hover:bg-accent/20 hover:border-accent/50
                       disabled:opacity-30 disabled:cursor-not-allowed
                       transition-all"
          >
            {loading ? 'přihlašování...' : 'přihlásit'}
          </button>
        </form>
      </div>
    </div>
  );
}
