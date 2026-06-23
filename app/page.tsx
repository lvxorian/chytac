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
  availability: string | null;
  last_checked_at: string | null;
  first_seen_free_at: string | null;
  created_at: string;
  updated_at: string;
  recent_logs: DomainLog[];
}

function StatusDot({ type }: { type: 'monitoring' | 'available' | 'registered' | 'error' }) {
  const colors: Record<string, string> = {
    monitoring: 'bg-blue-500 shadow-blue-500/30',
    available: 'bg-emerald-400 shadow-emerald-400/40',
    registered: 'bg-gray-500 shadow-gray-500/20',
    error: 'bg-red-400 shadow-red-400/30',
  };

  return (
    <span
      className={`inline-block h-2 w-2 rounded-full shadow-[0_0_6px] ${colors[type]}`}
    />
  );
}

function StatusLabel({ status, availability }: { status: string; availability: string | null }) {
  if (status === 'monitoring') {
    return (
      <span className="inline-flex items-center gap-2 text-blue-400">
        <StatusDot type="monitoring" />
        <span className="text-xs font-medium">sledována</span>
      </span>
    );
  }

  if (status === 'notified') {
    if (availability === 'available') {
      return (
        <span className="inline-flex items-center gap-2 text-emerald-400">
          <StatusDot type="available" />
          <span className="text-xs font-medium">volná</span>
        </span>
      );
    }
    if (availability === 'registered') {
      return (
        <span className="inline-flex items-center gap-2 text-gray-400">
          <StatusDot type="registered" />
          <span className="text-xs font-medium">zabraná</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-2 text-amber-400">
        <span className="inline-block h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_6px] shadow-amber-400/30" />
        <span className="text-xs font-medium">oznámeno</span>
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-2 text-red-400">
        <StatusDot type="error" />
        <span className="text-xs font-medium">chyba</span>
      </span>
    );
  }

  return <span className="text-xs text-gray-500">{status}</span>;
}

function RelativeTime({ date }: { date: string | null }) {
  if (!date) return <span className="text-gray-700 font-mono text-xs">—</span>;

  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  let value: string;

  if (seconds < 60) value = `${seconds}s`;
  else if (seconds < 3600) value = `${Math.floor(seconds / 60)}m`;
  else if (seconds < 86400) value = `${Math.floor(seconds / 3600)}h`;
  else value = `${Math.floor(seconds / 86400)}d`;

  return (
    <span className="font-mono text-xs tabular-nums text-gray-400" title={date}>
      {value}
    </span>
  );
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
    const interval = setInterval(fetchDomains, 30_000);
    return () => clearInterval(interval);
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

  async function handleReset(id: number) {
    try {
      await fetch(`/api/domains/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'monitoring' }),
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

  // Stats
  const monitoringCount = domains.filter((d) => d.status === 'monitoring').length;
  const availableCount = domains.filter(
    (d) => d.status === 'notified' && d.availability === 'available'
  ).length;
  const registeredCount = domains.filter(
    (d) => d.status === 'notified' && d.availability === 'registered'
  ).length;
  const errorCount = domains.filter((d) => d.status === 'error').length;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080c12]">
        <div className="flex items-center gap-3">
          <div className="glow-dot" />
          <span className="font-mono text-sm text-gray-500">načítání...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080c12]">
      {/* Header */}
      <header className="border-b border-gray-800/50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            {/* Logo */}
            <div className="flex items-center gap-2.5 select-none">
              <div className="glow-dot" />
              <span className="text-lg font-bold tracking-tight text-white">
                chytac
              </span>
            </div>
            <span className="hidden sm:inline-block text-[11px] font-mono text-gray-600 tracking-wider uppercase">
              .cz drop catcher
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors font-mono"
          >
            logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Stats Bar */}
        <div className="mb-8 grid grid-cols-4 gap-3">
          <div className="stat-card">
            <div className="font-mono text-2xl font-medium tabular-nums text-blue-400">
              {monitoringCount}
            </div>
            <div className="mt-1 text-[11px] text-gray-500 uppercase tracking-wider">
              sledováno
            </div>
          </div>
          <div className="stat-card">
            <div className="font-mono text-2xl font-medium tabular-nums text-emerald-400">
              {availableCount}
            </div>
            <div className="mt-1 text-[11px] text-gray-500 uppercase tracking-wider">
              volná
            </div>
          </div>
          <div className="stat-card">
            <div className="font-mono text-2xl font-medium tabular-nums text-gray-400">
              {registeredCount}
            </div>
            <div className="mt-1 text-[11px] text-gray-500 uppercase tracking-wider">
              zabraná
            </div>
          </div>
          <div className="stat-card">
            <div className="font-mono text-2xl font-medium tabular-nums text-red-400">
              {errorCount}
            </div>
            <div className="mt-1 text-[11px] text-gray-500 uppercase tracking-wider">
              chyb
            </div>
          </div>
        </div>

        {/* Add Domain Form */}
        <form onSubmit={handleAdd} className="mb-6 flex gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => {
                setNewDomain(e.target.value);
                setAddError('');
              }}
              placeholder="nová doména (např. example.cz)"
              className="w-full rounded-lg border border-gray-800 bg-[#0d1117] px-4 py-2.5
                         font-mono text-sm text-white placeholder-gray-600
                         focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20
                         transition-colors"
              autoFocus
            />
            {addError && (
              <p className="mt-1.5 text-xs text-red-400">{addError}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={adding || !newDomain.trim()}
            className="rounded-lg border border-accent/30 bg-accent/10 px-5 py-2.5
                       text-sm font-medium text-accent-light
                       hover:bg-accent/20 hover:border-accent/50
                       disabled:opacity-30 disabled:cursor-not-allowed
                       transition-all"
          >
            {adding ? '...' : 'přidat'}
          </button>
        </form>

        {/* Domain Table */}
        {domains.length === 0 ? (
          <div className="rounded-lg border border-gray-800/50 bg-[#0d1117] px-6 py-16 text-center">
            <p className="font-mono text-sm text-gray-600">
              žádné domény. přidej první výše.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-800/50">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800/50 bg-[#0d1117]">
                  <th className="px-5 py-3 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                    doména
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                    stav
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                    poslední scan
                  </th>
                  <th className="px-5 py-3 text-right text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                    akce
                  </th>
                </tr>
              </thead>
              <tbody>
                {domains.map((domain) => (
                  <>
                    <tr key={domain.id} className="table-row">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <a
                            href={`https://www.nic.cz/whois/domain/${domain.domain_name}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-sm text-white hover:text-accent-light transition-colors"
                          >
                            {domain.domain_name}
                          </a>
                          {domain.recent_logs && domain.recent_logs.length > 0 && (
                            <button
                              onClick={() => toggleLogs(domain.id)}
                              className="font-mono text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                            >
                              {expandedLogs.has(domain.id) ? '− log' : '+ log'}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusLabel
                          status={domain.status}
                          availability={domain.availability}
                        />
                        {domain.status === 'notified' && domain.first_seen_free_at && (
                          <div className="mt-0.5 font-mono text-[10px] text-gray-600">
                            {new Date(domain.first_seen_free_at).toLocaleString('cs-CZ', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <RelativeTime date={domain.last_checked_at} />
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-3">
                          {(domain.status === 'notified' || domain.status === 'error') && (
                            <button
                              onClick={() => handleReset(domain.id)}
                              className="font-mono text-[11px] text-gray-500 hover:text-accent-light transition-colors"
                              title="Resetovat do monitoringu"
                            >
                              reset
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(domain.id)}
                            className="font-mono text-[11px] text-gray-600 hover:text-red-400 transition-colors"
                          >
                            smazat
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Logs */}
                    {expandedLogs.has(domain.id) && (
                      <tr key={`log-${domain.id}`}>
                        <td colSpan={4} className="border-t border-gray-800/30 bg-[#0a0f17] px-5 py-3">
                          <div className="max-h-52 overflow-auto">
                            <table className="w-full font-mono text-[11px]">
                              <thead>
                                <tr className="text-gray-600">
                                  <th className="pb-1.5 pr-4 text-left font-normal">čas</th>
                                  <th className="pb-1.5 pr-4 text-left font-normal">http</th>
                                  <th className="pb-1.5 pr-4 text-left font-normal">rdap</th>
                                  <th className="pb-1.5 text-left font-normal">chyba</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(domain.recent_logs || []).map((log) => (
                                  <tr key={log.id} className="text-gray-500">
                                    <td className="py-0.5 pr-4 whitespace-nowrap">
                                      {new Date(log.checked_at).toLocaleString('cs-CZ')}
                                    </td>
                                    <td className="py-0.5 pr-4">{log.status_code}</td>
                                    <td className="py-0.5 pr-4">
                                      {log.is_free ? (
                                        <span className="text-emerald-400">FREE</span>
                                      ) : log.rdap_status ? (
                                        <span className="text-gray-400">{log.rdap_status}</span>
                                      ) : (
                                        <span className="text-gray-700">—</span>
                                      )}
                                    </td>
                                    <td className="py-0.5">
                                      {log.error_message ? (
                                        <span className="text-red-400">{log.error_message}</span>
                                      ) : (
                                        <span className="text-gray-700">—</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </main>
    </div>
  );
}
