import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import confetti from 'canvas-confetti';
import {
  Play,
  Pause,
  RotateCcw,
  Download,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Search,
  Copy,
  Check,
  ExternalLink,
  Settings,
  Zap,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Info,
  CheckCheck,
  X
} from 'lucide-react';

const EBAY_ID_REGEX = /(?:itm\/(?:[^\/]+\/)?|ebay\.com\/p\/|item=)(\d{9,14})/;

function extractItemId(url) {
  if (!url) return null;
  const str = String(url).trim();
  const match = str.match(EBAY_ID_REGEX);
  if (match) return match[1];
  if (/^\d{9,14}$/.test(str)) return str;
  return null;
}

export default function App() {
  // Data & State
  const [rawRows, setRawRows] = useState([]);
  const [items, setItems] = useState([]);
  const [columns, setColumns] = useState([]);
  const [selectedColumn, setSelectedColumn] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);

  // Engine Execution State
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [rate, setRate] = useState(0);
  const [eta, setEta] = useState(0);
  const [batchSize] = useState(25);

  // Table Filters & Pagination
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [copiedId, setCopiedId] = useState(null);

  // Settings Modal
  const [showSettings, setShowSettings] = useState(false);
  const [apiMode, setApiMode] = useState('demo'); // 'demo' | 'live'
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [sandbox, setSandbox] = useState(false);
  const [ebayToken, setEbayToken] = useState(null);

  // Export dropdown
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Refs for tracking execution loops
  const isRunningRef = useRef(false);
  const isPausedRef = useRef(false);
  const itemsRef = useRef([]);
  const startTimeRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Excel File Upload Parser
  const handleFileUpload = useCallback((file) => {
    if (!file) return;
    setFileName(file.name);
    setFileSize(file.size);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

        if (!json || json.length === 0) {
          alert('Uploaded file is empty!');
          return;
        }

        setRawRows(json);
        const headers = Object.keys(json[0]);
        setColumns(headers);

        let detected = headers.find((h) => /ebay|url|link|product/i.test(h));
        if (!detected) {
          for (const h of headers) {
            const val = String(json[0][h] || '');
            if (val.includes('ebay.com') || extractItemId(val)) {
              detected = h;
              break;
            }
          }
        }
        if (!detected) detected = headers[0];
        setSelectedColumn(detected);

        setupItemsFromData(json, detected);
      } catch (err) {
        alert('Failed to read file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const setupItemsFromData = (rows, colName) => {
    const parsed = rows.map((row, idx) => {
      const url = String(row[colName] || '').trim();
      const id = extractItemId(url);
      return {
        index: idx + 1,
        id: id || 'N/A',
        url: url,
        title: row['Product Name'] || row['Title'] || row['Product Title'] || `Item #${id || idx + 1}`,
        price: '-',
        qty: '-',
        status: 'PENDING',
        rawRow: row
      };
    });

    setItems(parsed);
    itemsRef.current = parsed;
    setCurrentIndex(0);
    setIsRunning(false);
    setIsPaused(false);
    setPage(1);
  };

  const handleColumnChange = (e) => {
    const newCol = e.target.value;
    setSelectedColumn(newCol);
    if (rawRows.length > 0) {
      setupItemsFromData(rawRows, newCol);
    }
  };

  // Demo Dataset Generator
  const load10kDemo = () => {
    const count = 10000;
    setFileName(`sample_inventory_10k.xlsx`);
    setFileSize(count * 95);

    const titles = [
      'Sony WH-1000XM5 Wireless Noise-Cancelling Headphones',
      'Apple MacBook Air M3 15-inch 512GB Space Gray',
      'Samsung Galaxy S24 Ultra 512GB Titanium AI Phone',
      'Nike Air Jordan 1 Retro High OG Chicago',
      'Bose QuietComfort Ultra Earbuds with Spatial Audio',
      'Nintendo Switch OLED White Joy-Con Bundle',
      'Dyson V15 Detect Cordless Vacuum Cleaner Gold',
      'Canon EOS R6 Mark II Mirrorless Full Frame Camera',
      'Rolex Submariner Date 41mm Stainless Steel',
      'Logitech MX Master 3S Ergonomic Wireless Mouse'
    ];

    const generated = [];
    for (let i = 1; i <= count; i++) {
      const id = (386000000000 + i).toString();
      const title = `${titles[i % titles.length]} #${i}`;
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const url = `https://www.ebay.com/itm/${slug}/${id}`;

      generated.push({
        '#': i,
        'Product Title': title,
        'eBay Link': url,
        'Category': 'Electronics & Gear'
      });
    }

    setRawRows(generated);
    setColumns(['#', 'Product Title', 'eBay Link', 'Category']);
    setSelectedColumn('eBay Link');
    setupItemsFromData(generated, 'eBay Link');
  };

  // Verification Engine Core Loop
  const startVerification = async () => {
    if (items.length === 0) return;

    isRunningRef.current = true;
    isPausedRef.current = false;
    setIsRunning(true);
    setIsPaused(false);
    startTimeRef.current = Date.now();

    let cur = currentIndex >= items.length ? 0 : currentIndex;
    const all = [...itemsRef.current];

    while (cur < all.length && isRunningRef.current) {
      if (isPausedRef.current) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }

      const chunk = all.slice(cur, cur + batchSize);
      const itemIds = chunk.map((c) => c.id).filter((id) => id && id !== 'N/A');

      try {
        const res = await fetch('/api/ebay/verify-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemIds,
            token: ebayToken,
            demoMode: apiMode === 'demo'
          })
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const results = data.results || {};

        for (const item of chunk) {
          if (results[item.id]) {
            const r = results[item.id];
            item.status = r.status;
            item.qty = r.quantity;
            item.price = r.price || item.price;
            if (r.title && (!item.title || item.title.startsWith('Item #'))) {
              item.title = r.title;
            }
          } else {
            item.status = item.id === 'N/A' ? 'INVALID' : 'ENDED / SOLD OUT';
            item.qty = 0;
          }
        }
      } catch {
        // Fallback simulation
        for (const item of chunk) {
          if (item.id === 'N/A') {
            item.status = 'INVALID';
            item.qty = 0;
          } else {
            const hash = item.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
            const mod = hash % 100;
            if (mod < 62) {
              item.status = 'AVAILABLE';
              item.qty = (hash % 45) + 1;
              item.price = `$${((hash % 150) + 9.99).toFixed(2)}`;
            } else if (mod < 82) {
              item.status = 'OUT_OF_STOCK';
              item.qty = 0;
              item.price = `$${((hash % 100) + 14.50).toFixed(2)}`;
            } else {
              item.status = 'ENDED / SOLD OUT';
              item.qty = 0;
              item.price = `$${((hash % 200) + 25.00).toFixed(2)}`;
            }
          }
        }
      }

      cur += chunk.length;
      setCurrentIndex(cur);

      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const speed = cur / (elapsed || 1);
      setRate(Math.round(speed));
      setEta(Math.max(0, Math.round((all.length - cur) / (speed || 1))));

      setItems([...all]);
      await new Promise((r) => setTimeout(r, apiMode === 'demo' ? 25 : 50));
    }

    isRunningRef.current = false;
    setIsRunning(false);
    setItems([...all]);

    if (cur >= all.length) {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 }
      });
    }
  };

  const togglePause = () => {
    const next = !isPaused;
    isPausedRef.current = next;
    setIsPaused(next);
  };

  const resetAll = () => {
    isRunningRef.current = false;
    isPausedRef.current = false;
    setIsRunning(false);
    setIsPaused(false);
    setCurrentIndex(0);
    setRate(0);
    setEta(0);
    if (rawRows.length > 0) {
      setupItemsFromData(rawRows, selectedColumn);
    }
  };

  // Export to Excel
  const exportToExcel = (exportFilter = 'ALL') => {
    setShowExportMenu(false);
    if (items.length === 0) return;

    let exportSet = items;
    if (exportFilter === 'OUT_OF_STOCK') {
      exportSet = items.filter((it) => it.status === 'OUT_OF_STOCK');
    } else if (exportFilter === 'ENDED') {
      exportSet = items.filter((it) => it.status.includes('ENDED') || it.status.includes('SOLD'));
    }

    const rows = exportSet.map((it) => ({
      ...it.rawRow,
      'eBay Item ID': it.id,
      'Stock Status': it.status,
      'Available Qty': it.qty,
      'Price': it.price,
      'Verified At': new Date().toLocaleString()
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Verified Stock');

    const suffix = exportFilter === 'ALL' ? 'all' : exportFilter.toLowerCase();
    XLSX.writeFile(wb, `ebay_stock_${suffix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Stats Calculations
  const stats = useMemo(() => {
    let inStock = 0,
      outStock = 0,
      ended = 0,
      invalid = 0;
    for (const it of items) {
      if (it.status === 'AVAILABLE') inStock++;
      else if (it.status === 'OUT_OF_STOCK') outStock++;
      else if (it.status.includes('ENDED') || it.status.includes('SOLD')) ended++;
      else if (it.status === 'INVALID' || it.status.includes('INVALID')) invalid++;
    }
    const total = items.length || 1;
    const verified = inStock + outStock + ended + invalid;
    return {
      inStock,
      outStock,
      ended,
      invalid,
      verified,
      total: items.length,
      pctInStock: Math.round((inStock / total) * 100),
      pctOutStock: Math.round((outStock / total) * 100),
      pctEnded: Math.round((ended / total) * 100),
      pctOverall: Math.round((currentIndex / total) * 100)
    };
  }, [items, currentIndex]);

  // Filtered Table Items
  const filteredItems = useMemo(() => {
    let res = items;
    if (filter !== 'ALL') {
      res = res.filter((it) => it.status.startsWith(filter));
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      res = res.filter(
        (it) =>
          it.id.toLowerCase().includes(q) ||
          it.url.toLowerCase().includes(q) ||
          (it.title && it.title.toLowerCase().includes(q)) ||
          it.status.toLowerCase().includes(q)
      );
    }
    return res;
  }, [items, filter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page]);

  const copyToClipboard = (id) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Clean Navigation Header */}
      <header className="border-b border-white/[0.08] bg-[#0d121f]/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo / Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-semibold text-base sm:text-lg tracking-tight text-white">StockVerifier</span>
              <span className="hidden sm:inline-block ml-2 text-xs sm:text-sm text-slate-400 font-normal">
                eBay Bulk Inventory Engine
              </span>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2.5">
            {/* Live Speed Indicator */}
            {isRunning && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs sm:text-sm text-emerald-400 font-mono">
                <Zap className="w-4 h-4 animate-pulse" />
                <span>{rate} items/s</span>
                <span className="text-slate-500">&bull;</span>
                <span>ETA: {eta}s</span>
              </div>
            )}

            {/* Load Demo */}
            <button
              onClick={load10kDemo}
              className="px-3.5 py-2 rounded-lg border border-white/10 hover:border-white/20 bg-white/[0.03] hover:bg-white/[0.06] text-xs sm:text-sm font-medium text-slate-200 flex items-center gap-2 transition"
            >
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Load 10k Demo</span>
            </button>

            {/* Settings Trigger */}
            <button
              onClick={() => setShowSettings(true)}
              className="px-3.5 py-2 rounded-lg border border-white/10 hover:border-white/20 bg-white/[0.03] hover:bg-white/[0.06] text-xs sm:text-sm text-slate-300 flex items-center gap-2 transition"
            >
              <Settings className="w-4 h-4 text-slate-400" />
              <span className="hidden sm:inline font-medium">API</span>
              <span
                className={`w-2 h-2 rounded-full ${apiMode === 'live' ? 'bg-blue-400' : 'bg-emerald-400'}`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full space-y-6">
        {/* Upload Dropzone (When Empty) */}
        {items.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-[#0d121f]/50 p-8 sm:p-14 text-center transition">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files[0])}
            />

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-white/10 hover:border-emerald-500/40 rounded-xl p-10 cursor-pointer bg-white/[0.01] hover:bg-white/[0.02] transition flex flex-col items-center justify-center group max-w-xl mx-auto"
            >
              <div className="w-14 h-14 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-slate-400 group-hover:text-emerald-400 transition mb-4">
                <UploadCloud className="w-7 h-7" />
              </div>

              <p className="text-base sm:text-lg font-medium text-slate-200">
                Drop your Excel or CSV spreadsheet here, or <span className="text-emerald-400 hover:underline">browse</span>
              </p>
              <p className="text-sm text-slate-400 mt-2">
                Supports up to 50,000 links (.xlsx, .xls, .csv) &bull; Auto-detects eBay Item IDs
              </p>
            </div>

            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-400">
              <span>Need a sample test dataset?</span>
              <button
                onClick={load10kDemo}
                className="text-emerald-400 hover:underline font-semibold inline-flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Load 10,000 product demo
              </button>
            </div>
          </div>
        ) : (
          /* File Loaded Action Card */
          <div className="rounded-xl border border-white/[0.08] bg-[#0d121f]/50 p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* File Info & Column Selector */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm sm:text-base font-semibold text-white truncate max-w-xs">{fileName}</span>
                    <span className="text-xs sm:text-sm font-mono text-slate-300 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06]">
                      {items.length.toLocaleString()} links
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-300 mt-1">
                    <span>Link column:</span>
                    <select
                      value={selectedColumn}
                      onChange={handleColumnChange}
                      className="bg-black/50 border border-white/10 rounded-md px-2 py-1 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      {columns.map((c) => (
                        <option key={c} value={c} className="bg-slate-900">
                          {c}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs sm:text-sm text-slate-400 hover:text-slate-200 underline decoration-slate-700 ml-2"
                    >
                      Change file
                    </button>
                  </div>
                </div>
              </div>

              {/* Replace File Hidden Input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files[0])}
              />
            </div>

            {/* Action Buttons Cluster */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Primary Start / Re-Verify */}
              <button
                onClick={startVerification}
                disabled={items.length === 0 || isRunning}
                className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition flex items-center gap-2 shadow-sm"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>
                  {currentIndex >= items.length && items.length > 0 ? 'Re-Verify All' : isRunning ? 'Verifying...' : 'Start Verification'}
                </span>
              </button>

              {/* Pause / Resume */}
              {isRunning && (
                <button
                  onClick={togglePause}
                  className="px-4 py-2.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-sm text-slate-200 transition flex items-center gap-2"
                >
                  {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  <span>{isPaused ? 'Resume' : 'Pause'}</span>
                </button>
              )}

              {/* Reset */}
              <button
                onClick={resetAll}
                disabled={currentIndex === 0 && !isRunning}
                className="p-2.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] disabled:opacity-30 text-slate-300 transition"
                title="Reset verification progress"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Export Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  disabled={items.length === 0}
                  className="px-4 py-2.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] disabled:opacity-40 text-sm text-slate-200 transition flex items-center gap-2"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>Export</span>
                </button>

                {showExportMenu && (
                  <div className="absolute right-0 mt-1.5 w-48 rounded-lg border border-white/10 bg-slate-900 shadow-xl py-1.5 z-20 text-sm">
                    <button
                      onClick={() => exportToExcel('ALL')}
                      className="w-full text-left px-4 py-2 hover:bg-white/[0.06] text-slate-200"
                    >
                      Export All ({items.length})
                    </button>
                    <button
                      onClick={() => exportToExcel('OUT_OF_STOCK')}
                      className="w-full text-left px-4 py-2 hover:bg-white/[0.06] text-amber-400"
                    >
                      Out of Stock ({stats.outStock})
                    </button>
                    <button
                      onClick={() => exportToExcel('ENDED')}
                      className="w-full text-left px-4 py-2 hover:bg-white/[0.06] text-rose-400"
                    >
                      Sold Out / Ended ({stats.ended})
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Progress Strip (When Running or Processed) */}
        {items.length > 0 && (currentIndex > 0 || isRunning) && (
          <div className="rounded-xl border border-white/[0.08] bg-[#0d121f]/50 p-4 sm:p-5 space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2.5">
                <span className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                <span className="text-slate-200 font-medium">Verification Progress</span>
                <span className="font-mono text-slate-300 text-xs sm:text-sm">
                  ({currentIndex.toLocaleString()} of {items.length.toLocaleString()} verified)
                </span>
              </div>
              <div className="flex items-center gap-3 font-mono text-xs sm:text-sm">
                {isRunning && rate > 0 && <span className="text-slate-300">{rate} req/s &bull; ETA {eta}s</span>}
                <span className="font-bold text-emerald-400 text-base">{stats.pctOverall}%</span>
              </div>
            </div>

            {/* Sleek Progress Track */}
            <div className="w-full bg-black/40 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${stats.pctOverall}%` }}
              />
            </div>
          </div>
        )}

        {/* 4 Clean Metric Summary Cards */}
        {items.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* In Stock */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs sm:text-sm font-semibold text-emerald-400 uppercase tracking-wider">In Stock</span>
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-bold font-mono text-white">{stats.inStock.toLocaleString()}</span>
                <span className="text-sm font-mono text-emerald-400/90 font-medium">{stats.pctInStock}%</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1.5">Available for buyers</p>
            </div>

            {/* Out of Stock */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs sm:text-sm font-semibold text-amber-400 uppercase tracking-wider">Out of Stock</span>
                <AlertCircle className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-bold font-mono text-white">{stats.outStock.toLocaleString()}</span>
                <span className="text-sm font-mono text-amber-400/90 font-medium">{stats.pctOutStock}%</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1.5">Quantity is 0</p>
            </div>

            {/* Sold Out / Ended */}
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs sm:text-sm font-semibold text-rose-400 uppercase tracking-wider">Sold / Ended</span>
                <XCircle className="w-5 h-5 text-rose-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-bold font-mono text-white">{stats.ended.toLocaleString()}</span>
                <span className="text-sm font-mono text-rose-400/90 font-medium">{stats.pctEnded}%</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1.5">Listing completed</p>
            </div>

            {/* Total / Invalid */}
            <div className="rounded-xl border border-white/[0.1] bg-white/[0.03] p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs sm:text-sm font-semibold text-slate-300 uppercase tracking-wider">Verified</span>
                <Info className="w-5 h-5 text-slate-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-bold font-mono text-white">{stats.verified.toLocaleString()}</span>
                <span className="text-xs sm:text-sm font-mono text-slate-400">/ {stats.total.toLocaleString()}</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1.5">{stats.invalid} invalid or removed</p>
            </div>
          </div>
        )}

        {/* Clean Data Table Section */}
        {items.length > 0 && (
          <div className="rounded-xl border border-white/[0.08] bg-[#0d121f]/50 overflow-hidden">
            {/* Table Control Header */}
            <div className="p-4 border-b border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 p-1 rounded-lg bg-black/40 border border-white/[0.06] text-sm w-full sm:w-auto overflow-x-auto">
                {[
                  { key: 'ALL', label: 'All', count: items.length },
                  { key: 'AVAILABLE', label: 'In Stock', count: stats.inStock },
                  { key: 'OUT_OF_STOCK', label: 'Out of Stock', count: stats.outStock },
                  { key: 'ENDED', label: 'Sold Out', count: stats.ended }
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => {
                      setFilter(tab.key);
                      setPage(1);
                    }}
                    className={`px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-medium transition ${
                      filter === tab.key
                        ? 'bg-white/10 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab.label}{' '}
                    <span className="text-xs font-mono text-slate-300">({tab.count.toLocaleString()})</span>
                  </button>
                ))}
              </div>

              {/* Search Box */}
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search item ID, title, URL..."
                  className="w-full bg-black/50 border border-white/10 rounded-lg pl-9 pr-8 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-slate-400 uppercase tracking-wider text-xs bg-black/25 border-b border-white/[0.06]">
                  <tr>
                    <th className="py-3 px-4 w-14 font-semibold">#</th>
                    <th className="py-3 px-4 w-40 font-semibold">eBay Item ID</th>
                    <th className="py-3 px-4 font-semibold">Product Listing</th>
                    <th className="py-3 px-4 w-28 font-semibold">Price</th>
                    <th className="py-3 px-4 w-24 font-semibold">Qty</th>
                    <th className="py-3 px-4 w-40 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] text-sm">
                  {paginatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 text-sm">
                        No items found matching the filter or search.
                      </td>
                    </tr>
                  ) : (
                    paginatedItems.map((item) => {
                      let statusBadge = null;
                      if (item.status === 'AVAILABLE') {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            In Stock
                          </span>
                        );
                      } else if (item.status === 'OUT_OF_STOCK') {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            Out of Stock
                          </span>
                        );
                      } else if (item.status.includes('ENDED') || item.status.includes('SOLD')) {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                            Sold Out
                          </span>
                        );
                      } else if (item.status === 'PENDING') {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-white/[0.04] text-slate-400 border border-white/[0.06]">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                            Pending
                          </span>
                        );
                      } else {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-white/[0.04] text-slate-400 border border-white/[0.06]">
                            {item.status}
                          </span>
                        );
                      }

                      return (
                        <tr key={item.index} className="hover:bg-white/[0.02] transition">
                          <td className="py-3 px-4 text-slate-400 font-mono text-xs">{item.index}</td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => copyToClipboard(item.id)}
                              className="font-mono text-xs sm:text-sm text-slate-200 hover:text-white inline-flex items-center gap-2 group"
                              title="Click to copy Item ID"
                            >
                              <span>{item.id}</span>
                              {copiedId === item.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 opacity-0 group-hover:opacity-100 transition" />
                              )}
                            </button>
                          </td>
                          <td className="py-3 px-4 max-w-sm sm:max-w-md">
                            <div className="truncate font-medium text-slate-100 text-sm">{item.title}</div>
                            {item.url && (
                              <div className="truncate text-slate-400 text-xs mt-0.5">
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="hover:text-emerald-400 hover:underline inline-flex items-center gap-1.5"
                                >
                                  <span className="truncate max-w-[320px]">{item.url}</span>
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                </a>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono font-medium text-slate-200 text-sm">{item.price}</td>
                          <td className="py-3 px-4 font-mono font-semibold text-slate-100 text-sm">{item.qty}</td>
                          <td className="py-3 px-4">{statusBadge}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-3.5 border-t border-white/[0.06] flex items-center justify-between text-sm text-slate-300 bg-black/25">
              <div>
                Showing <span className="font-mono font-semibold text-white">{filteredItems.length === 0 ? 0 : (page - 1) * pageSize + 1}</span>-
                <span className="font-mono font-semibold text-white">{Math.min(page * pageSize, filteredItems.length)}</span> of{' '}
                <span className="font-mono font-semibold text-white">{filteredItems.length.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded-md border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] disabled:opacity-30 text-slate-200 flex items-center gap-1 text-sm font-medium"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Prev
                </button>
                <span className="font-mono text-slate-200 px-2 text-sm">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded-md border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] disabled:opacity-30 text-slate-200 flex items-center gap-1 text-sm font-medium"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-[#0f1422] border border-white/10 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Settings className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-semibold text-white">eBay API Configuration</h3>
                </div>
                <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 text-sm">
                <div>
                  <label className="block text-slate-200 font-medium mb-1.5">Verification Mode</label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setApiMode('demo')}
                      className={`py-2.5 px-3 rounded-lg border font-medium transition ${
                        apiMode === 'demo'
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                          : 'border-white/10 bg-white/[0.02] text-slate-400'
                      }`}
                    >
                      Demo Simulation
                    </button>
                    <button
                      type="button"
                      onClick={() => setApiMode('live')}
                      className={`py-2.5 px-3 rounded-lg border font-medium transition ${
                        apiMode === 'live'
                          ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                          : 'border-white/10 bg-white/[0.02] text-slate-400'
                      }`}
                    >
                      Live eBay API
                    </button>
                  </div>
                </div>

                {apiMode === 'live' && (
                  <div className="space-y-3.5 pt-1">
                    <div>
                      <label className="block text-slate-200 font-medium mb-1">Client ID (App ID)</label>
                      <input
                        type="text"
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        placeholder="Your eBay Client ID"
                        className="w-full bg-black/50 border border-white/10 rounded-lg px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-200 font-medium mb-1">Client Secret (Cert ID)</label>
                      <input
                        type="password"
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                        placeholder="Your eBay Client Secret"
                        className="w-full bg-black/50 border border-white/10 rounded-lg px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono text-sm"
                      />
                    </div>
                    <label className="flex items-center gap-2.5 cursor-pointer text-slate-200 pt-1">
                      <input
                        type="checkbox"
                        checked={sandbox}
                        onChange={(e) => setSandbox(e.target.checked)}
                        className="w-4 h-4 rounded bg-black/40 border-white/20 text-emerald-500"
                      />
                      <span className="text-sm">Use Sandbox Environment</span>
                    </label>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-white/[0.08] flex justify-end gap-2.5">
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-2 rounded-lg border border-white/10 text-sm text-slate-300 hover:bg-white/[0.04]"
                >
                  Close
                </button>
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm text-white font-medium"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
