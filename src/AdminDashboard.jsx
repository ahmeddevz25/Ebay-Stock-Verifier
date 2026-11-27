import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import {
  Shield,
  Lock,
  Unlock,
  RefreshCw,
  Search,
  Download,
  Trash2,
  Eye,
  X,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  XCircle,
  FileSpreadsheet,
  Calendar,
  ExternalLink
} from 'lucide-react';

export default function AdminDashboard({ onExit }) {
  const [passcode, setPasscode] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!sessionStorage.getItem('stockline_admin_pin');
  });
  const [authError, setAuthError] = useState('');
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [search, setSearch] = useState('');
  const [activeSession, setActiveSession] = useState(null);
  const [selectedItemFilter, setSelectedItemFilter] = useState('ALL');

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!passcode.trim()) return;
    setIsLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/admin-sessions', {
        headers: {
          'x-admin-passcode': passcode.trim()
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Incorrect Admin PIN. Please try again.');
      }
      sessionStorage.setItem('stockline_admin_pin', passcode.trim());
      setIsAuthenticated(true);
      setSessions(data.sessions || []);
    } catch (err) {
      setAuthError(err.message || 'Incorrect Admin PIN. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('stockline_admin_pin');
    setIsAuthenticated(false);
    setPasscode('');
    setSessions([]);
  };

  const loadSessions = async () => {
    const pin = sessionStorage.getItem('stockline_admin_pin') || passcode;
    if (!pin) return;
    setIsLoading(true);
    setFetchError('');
    try {
      const res = await fetch('/api/admin-sessions', {
        headers: {
          'x-admin-passcode': pin
        }
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          sessionStorage.removeItem('stockline_admin_pin');
          setIsAuthenticated(false);
          throw new Error('Session expired or Invalid PIN');
        }
        throw new Error(data.error || 'Failed to fetch client sessions');
      }
      setSessions(data.sessions || []);
    } catch (err) {
      setFetchError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadSessions();
    }
  }, [isAuthenticated]);

  const handleDeleteSession = async (id) => {
    if (!window.confirm('Delete this client session record?')) return;
    const pin = sessionStorage.getItem('stockline_admin_pin') || passcode;
    try {
      const res = await fetch(`/api/admin-sessions?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          'x-admin-passcode': pin
        }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Delete failed');
      }
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSession?.id === id) setActiveSession(null);
    } catch (e) {
      alert('Delete failed: ' + e.message);
    }
  };

  const exportClientSheet = (session) => {
    const items = session.items_data || [];
    if (items.length === 0) {
      alert('No item records found in this session.');
      return;
    }

    const rows = items.map((it) => ({
      ...(it.rawRow || {}),
      'Item ID': it.id,
      'Product Title': it.title,
      'Price': it.price,
      'Quantity': it.qty,
      'Stock Status': it.status
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Client Verified Stock');
    const baseName = (session.file_name || 'client_sheet').replace(/\.[^/.]+$/, '');
    XLSX.writeFile(wb, `${baseName}_client_verified.xlsx`);
  };

  // Filtered Sessions
  const filteredSessions = sessions.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return (
      (s.file_name && s.file_name.toLowerCase().includes(q)) ||
      (s.id && s.id.toLowerCase().includes(q)) ||
      (s.error_details && s.error_details.toLowerCase().includes(q))
    );
  });

  // Aggregate Stats
  const totalUploads = sessions.length;
  const totalVerifiedLinks = sessions.reduce((sum, s) => sum + (s.total_items || 0), 0);
  const totalInStock = sessions.reduce((sum, s) => sum + (s.in_stock || 0), 0);
  const totalRateLimited = sessions.filter((s) => s.rate_limited).length;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-[#121216] border border-neutral-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-6 mx-auto">
            <Lock className="w-6 h-6" />
          </div>

          <h2 className="text-xl font-bold text-center mb-1">Stockline Admin Portal</h2>
          <p className="text-xs text-neutral-400 text-center mb-6">
            Enter your secret Admin PIN to view live client uploads and verification logs.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Admin Passcode</label>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter Admin PIN"
                className="w-full px-4 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 focus:border-emerald-500 text-white font-mono text-sm outline-none transition"
                autoFocus
              />
            </div>

            {authError && (
              <div className="text-xs text-rose-400 font-semibold bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5">
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition shadow-sm"
            >
              Unlock Dashboard
            </button>

            <button
              type="button"
              onClick={onExit}
              className="w-full py-2 text-xs text-neutral-500 hover:text-neutral-300 transition"
            >
              &larr; Back to Stockline Verifier
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      {/* Admin Top Header */}
      <header className="border-b border-neutral-800 bg-[#0d0d11] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight">Stockline Client Monitor</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                  Supabase Live
                </span>
              </div>
              <p className="text-[11px] text-neutral-500">Real-time log of client Excel sheets and verification results</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={loadSessions}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-semibold transition flex items-center gap-1.5"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-white text-xs font-semibold transition"
            >
              Lock
            </button>

            <button
              onClick={onExit}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition flex items-center gap-1 shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to App</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full space-y-6">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-neutral-800 bg-[#121216] p-5 shadow-sm">
            <div className="text-xs font-semibold text-neutral-400 mb-1">Total Client Uploads</div>
            <div className="text-2xl font-bold font-mono text-white">{totalUploads.toLocaleString()}</div>
            <div className="text-[11px] text-neutral-500 mt-1">Excel sheets processed</div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-[#121216] p-5 shadow-sm">
            <div className="text-xs font-semibold text-neutral-400 mb-1">Total Links Verified</div>
            <div className="text-2xl font-bold font-mono text-emerald-400">{totalVerifiedLinks.toLocaleString()}</div>
            <div className="text-[11px] text-neutral-500 mt-1">Across all client uploads</div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-[#121216] p-5 shadow-sm">
            <div className="text-xs font-semibold text-neutral-400 mb-1">Items In Stock</div>
            <div className="text-2xl font-bold font-mono text-cyan-400">{totalInStock.toLocaleString()}</div>
            <div className="text-[11px] text-neutral-500 mt-1">Available on eBay</div>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-[#121216] p-5 shadow-sm">
            <div className="text-xs font-semibold text-neutral-400 mb-1">Rate Limited Sessions</div>
            <div className={`text-2xl font-bold font-mono ${totalRateLimited > 0 ? 'text-amber-400' : 'text-neutral-400'}`}>
              {totalRateLimited}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">eBay 429 quota hits</div>
          </div>
        </div>

        {/* Error Notice if Supabase table not created yet */}
        {fetchError && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm">Supabase Table Setup Required</div>
                <div className="text-xs text-amber-300/80 mt-1 leading-relaxed">
                  {fetchError}
                </div>
                <div className="text-xs text-amber-400 font-mono mt-2 bg-black/40 p-3 rounded-lg border border-amber-500/20">
                  Run this SQL in Supabase SQL Editor:
                  <br />
                  <code>CREATE TABLE IF NOT EXISTS client_sessions (id text primary key, file_name text, file_size bigint, total_items int, in_stock int, out_of_stock int, ended int, rate_limited boolean, error_details text, items_data jsonb, created_at timestamptz default now());</code>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Client Sessions Table Section */}
        <section className="rounded-2xl border border-neutral-800 bg-[#121216] overflow-hidden shadow-sm">
          {/* Table Header Toolbar */}
          <div className="p-4 border-b border-neutral-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-neutral-900/30">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
              <span className="font-bold text-sm text-white">Client Upload History</span>
              <span className="font-mono text-xs text-neutral-400">({filteredSessions.length})</span>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by file name or error..."
                className="w-full pl-9 pr-4 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 focus:border-emerald-500 text-xs text-white placeholder-neutral-500 outline-none transition"
              />
            </div>
          </div>

          {/* Table Content */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="font-bold text-neutral-400 uppercase tracking-wider bg-neutral-900/60 border-b border-neutral-800">
                <tr>
                  <th className="py-3 px-4 w-40">Date & Time</th>
                  <th className="py-3 px-4">Uploaded File</th>
                  <th className="py-3 px-4 w-28 font-mono">Total Links</th>
                  <th className="py-3 px-4 w-60">Verification Breakdown</th>
                  <th className="py-3 px-4 w-32">Status</th>
                  <th className="py-3 px-4 w-44 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 font-mono">
                {filteredSessions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-neutral-500 font-sans text-xs">
                      {isLoading ? 'Loading client logs from Supabase...' : 'No client uploads recorded yet.'}
                    </td>
                  </tr>
                ) : (
                  filteredSessions.map((session) => {
                    const dateStr = session.created_at ? new Date(session.created_at).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) : '-';

                    return (
                      <tr key={session.id} className="hover:bg-neutral-900/40 transition">
                        <td className="py-3 px-4 text-neutral-400">{dateStr}</td>
                        <td className="py-3 px-4 font-sans font-semibold text-white">
                          <div className="flex items-center gap-1.5 truncate max-w-xs">
                            <FileSpreadsheet className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                            <span className="truncate">{session.file_name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-bold text-neutral-200">
                          {(session.total_items || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-sans text-[11px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-emerald-400 font-mono font-bold">{session.in_stock || 0} In Stock</span>
                            <span className="text-neutral-600">&bull;</span>
                            <span className="text-amber-400 font-mono font-bold">{session.out_of_stock || 0} Out</span>
                            <span className="text-neutral-600">&bull;</span>
                            <span className="text-rose-400 font-mono font-bold">{session.ended || 0} Ended</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {session.rate_limited ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold text-[10px]">
                              Rate Limited (429)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold text-[10px]">
                              Success
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5 font-sans">
                            <button
                              onClick={() => {
                                setActiveSession(session);
                                setSelectedItemFilter('ALL');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition flex items-center gap-1"
                              title="View Items Verified"
                            >
                              <Eye className="w-3.5 h-3.5 text-cyan-400" />
                              <span>View</span>
                            </button>

                            <button
                              onClick={() => exportClientSheet(session)}
                              className="p-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition"
                              title="Download Client Excel Sheet"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleDeleteSession(session.id)}
                              className="p-1 rounded-lg hover:bg-rose-500/20 text-neutral-500 hover:text-rose-400 transition"
                              title="Delete Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Session Detail Modal */}
      <AnimatePresence>
        {activeSession && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="max-w-4xl w-full max-h-[85vh] rounded-3xl border border-neutral-800 bg-[#121216] shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-neutral-800 flex items-center justify-between gap-4 bg-neutral-900/40">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-white truncate max-w-md">{activeSession.file_name}</h3>
                    <p className="text-xs text-neutral-400">
                      Verified {activeSession.total_items} items on {new Date(activeSession.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => exportClientSheet(activeSession)}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Excel</span>
                  </button>

                  <button
                    onClick={() => setActiveSession(null)}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Items List Table */}
              <div className="overflow-y-auto flex-1 p-4">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider bg-neutral-900 sticky top-0 border-b border-neutral-800">
                    <tr>
                      <th className="py-2.5 px-3 w-12 font-mono">#</th>
                      <th className="py-2.5 px-3 w-36 font-mono">Item ID</th>
                      <th className="py-2.5 px-3">Title / Link</th>
                      <th className="py-2.5 px-3 w-28 font-mono">Price</th>
                      <th className="py-2.5 px-3 w-20 font-mono">Qty</th>
                      <th className="py-2.5 px-3 w-36">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60 font-mono text-xs">
                    {(activeSession.items_data || []).map((it, idx) => (
                      <tr key={idx} className="hover:bg-neutral-900/30">
                        <td className="py-2.5 px-3 text-neutral-500">{idx + 1}</td>
                        <td className="py-2.5 px-3 text-neutral-200">{it.id}</td>
                        <td className="py-2.5 px-3 font-sans truncate max-w-xs text-neutral-300">
                          {it.title || it.url}
                        </td>
                        <td className="py-2.5 px-3 text-neutral-200 font-bold">{it.price || '-'}</td>
                        <td className="py-2.5 px-3 text-emerald-400 font-bold">{it.qty ?? '-'}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                              it.status === 'AVAILABLE'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : it.status === 'OUT_OF_STOCK'
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-rose-500/10 text-rose-400'
                            }`}
                          >
                            {it.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
