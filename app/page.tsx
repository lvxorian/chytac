'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface DomainLog {
  id: number;
  status_code: number;
  rdap_status: string | null;
  is_free: boolean;
  error_message: string | null;
  checked_at: string;
}

interface Domain {
  id: number;
  domain_name: string;
  status: string;
  last_checked_at: string | null;
  first_seen_free_at: string | null;
  created_at: string;
  updated_at: string;
  recent_logs: DomainLog[];
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    monitoring: 'bg-blue-900/40 text-blue-300 border-blue-700',
    caught: 'bg-amber-900/40 text-amber-300 border-amber-700',
    free: 'bg-green-900/40 text-green-300 border-green-700',
    error: 'bg-red-900/40 text-red-300 border-red-700',
  };

  const labels: Record<string, string> = {
    monitoring: 'monitoring',
    caught: 'caught',
    free: 'free',
    error: 'error',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors[status] || 'bg-gray-800 text-gray-300 border-gray-600'}`}
    >
      {labels[status] || status}
    </span>
  );
}

function TimeAgo({ date }: { date: string | null }) {
  if (!date) return <span className="text-gray-600">never</span>;

  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return <span className="text-gray-400">{seconds}s ago</span>;
  if (seconds < 3600) return <span className="text-gray-400">{Math.floor(seconds / 60)}m ago</span>;
  if (seconds < 86400) return <span className="text-gray-400">{Math.floor(seconds / 3600)}h ago</span>;
  return <span className="text-gray-400">{Math.floor(seconds / 86400)}d ago</span>;
}

export default function DashboardPage() {
  const router = useRouter();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch('/api/domains');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setDomains(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError('');

    const trimmed = newDomain.trim();
    if (!trimmed) return;

    setAdding(true);
    try {
      const res = await fetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: trimmed }),
      });

      const data = await res.json();

      if (res.ok) {
        setNewDomain('');
        fetchDomains();
      } else {
        setAddError(data.error || 'Failed to add domain');
      }
    } catch {
      setAddError('Network error');
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await fetch(`/api/domains/${id}`, { method: 'DELETE' });
      fetchDomains();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleStatusChange(id: number, status: string) {
    try {
      await fetch(`/api/domains/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      fetchDomains();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  function toggleLogs(id: number) {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">chytac</h1>
          <p className="text-sm text-gray-400">.cz domain drop catcher</p>
        </div>
        <button
          onClick={handleLogout}
          className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
        >
          Logout
        </button>
      </div>

      <form onSubmit={handleAdd} className="mb-8 flex gap-3">
        <div className="flex-1">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => {
              setNewDomain(e.target.value);
              setAddError('');
            }}
            placeholder="Add domain (e.g. example.cz)"
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {addError && <p className="mt-1 text-xs text-red-400">{addError}</p>}
        </div>
        <button
          type="submit"
          disabled={adding || !newDomain.trim()}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {adding ? 'Adding...' : 'Add'}
        </button>
      </form>

      {domains.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-12 text-center">
          <p className="text-gray-500">No domains yet. Add one above to start monitoring.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/50">
                <th className="px-4 py-3 text-left font-medium text-gray-400">Domain</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Last Check</th>
                <th className="px-4 py-3 text-right font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {domains.map((domain) => (
                <tr key={domain.id} className="hover:bg-gray-900/30 transition-colors">
                  <td className="px-4 py-3">
                    <a
                      href={`https://www.nic.cz/whois/domain/${domain.domain_name}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-blue-400 hover:text-blue-300"
                    >
                      {domain.domain_name}
                    </a>
                    {domain.recent_logs && domain.recent_logs.length > 0 && (
                      <button
                        onClick={() => toggleLogs(domain.id)}
                        className="ml-2 text-xs text-gray-500 hover:text-gray-300"
                      >
                        {expandedLogs.has(domain.id) ? 'hide log' : 'show log'}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={domain.status} />
                  </td>
                  <td className="px-4 py-3">
                    <TimeAgo date={domain.last_checked_at} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {domain.status === 'caught' && (
                        <button
                          onClick={() => handleStatusChange(domain.id, 'monitoring')}
                          className="text-xs text-gray-500 hover:text-gray-300"
                          title="Reset to monitoring"
                        >
                          reset
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(domain.id)}
                        className="text-xs text-red-500 hover:text-red-400"
                      >
                        delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {[...expandedLogs].map((domainId) => {
            const domain = domains.find((d) => d.id === domainId);
            if (!domain) return null;
            return (
              <div key={domainId} className="border-t border-gray-800 bg-gray-950/50 px-4 py-3">
                <h4 className="mb-2 text-xs font-medium text-gray-400">
                  Check log for {domain.domain_name}
                </h4>
                <div className="max-h-48 overflow-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500">
                        <th className="pr-4 text-left font-normal">Time</th>
                        <th className="pr-4 text-left font-normal">HTTP</th>
                        <th className="pr-4 text-left font-normal">Status</th>
                        <th className="text-left font-normal">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(domain.recent_logs || []).map((log) => (
                        <tr key={log.id} className="text-gray-400">
                          <td className="py-1 pr-4 whitespace-nowrap">
                            {new Date(log.checked_at).toLocaleString()}
                          </td>
                          <td className="py-1 pr-4">{log.status_code}</td>
                          <td className="py-1 pr-4">
                            {log.is_free ? (
                              <span className="text-green-400">FREE</span>
                            ) : log.rdap_status ? (
                              <span className="text-gray-300">{log.rdap_status}</span>
                            ) : (
                              <span className="text-gray-600">-</span>
                            )}
                          </td>
                          <td className="py-1">
                            {log.error_message ? (
                              <span className="text-red-400">{log.error_message}</span>
                            ) : (
                              <span className="text-gray-600">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-center text-xs text-gray-600">
        Auto-refresh: reload the page &bull; Cron runs every 5 minutes
      </p>
    </div>
  );
}
