import React, { useMemo, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Loader2, UploadCloud, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from '@/src/lib/navigation';
import { useUser } from '@/src/context/UserContext';

type UploadRow = {
  name: string;
  description: string;
  price: number;
  old_price?: number;
  image?: string;
  category: string;
  stock: number;
  video_url?: string;
  reseller_enabled?: boolean;
  reseller_base_price?: number;
  reseller_suggested_price?: number;
  reseller_notes?: string;
};

type RowResult = {
  index: number;
  name: string;
  status: 'success' | 'error';
  message: string;
};

const templateHeaders = [
  'name',
  'description',
  'price',
  'old_price',
  'image',
  'category',
  'stock',
  'video_url',
  'reseller_enabled',
  'reseller_base_price',
  'reseller_suggested_price',
  'reseller_notes',
];

function parseBoolean(value: string) {
  return ['1', 'true', 'yes', 'y'].includes(value.trim().toLowerCase());
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(input: string) {
  const normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];

  const lines = normalized.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('Add a header row and at least one product row.');
  }

  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  const missingHeaders = ['name', 'description', 'price', 'category'].filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`);
  }

  return lines.slice(1).map((line, index) => {
    const cells = splitCsvLine(line);
    const record = Object.fromEntries(headers.map((header, headerIndex) => [header, cells[headerIndex] || '']));
    const price = Number(record.price || 0);
    const stock = Number(record.stock || 0);

    if (!record.name || !record.description || !record.category || !Number.isFinite(price) || price <= 0) {
      throw new Error(`Row ${index + 2} has missing or invalid required fields.`);
    }

    const oldPrice = record.old_price ? Number(record.old_price) : undefined;
    const resellerBasePrice = record.reseller_base_price ? Number(record.reseller_base_price) : undefined;
    const resellerSuggestedPrice = record.reseller_suggested_price ? Number(record.reseller_suggested_price) : undefined;

    return {
      name: record.name,
      description: record.description,
      price,
      old_price: Number.isFinite(oldPrice) ? oldPrice : undefined,
      image: record.image || undefined,
      category: record.category,
      stock: Number.isFinite(stock) ? stock : 0,
      video_url: record.video_url || undefined,
      reseller_enabled: record.reseller_enabled ? parseBoolean(record.reseller_enabled) : false,
      reseller_base_price: Number.isFinite(resellerBasePrice) ? resellerBasePrice : undefined,
      reseller_suggested_price: Number.isFinite(resellerSuggestedPrice) ? resellerSuggestedPrice : undefined,
      reseller_notes: record.reseller_notes || undefined,
    } satisfies UploadRow;
  });
}

export const SellerBulkUploadPage = () => {
  const { token } = useUser();
  const [csvText, setCsvText] = useState('');
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<RowResult[]>([]);

  const summary = useMemo(
    () => ({
      total: rows.length,
      ready: rows.filter((row) => row.stock > 0).length,
      resellerEnabled: rows.filter((row) => row.reseller_enabled).length,
    }),
    [rows],
  );

  const parseInput = (value: string) => {
    setCsvText(value);
    setResults([]);
    if (!value.trim()) {
      setRows([]);
      setError('');
      return;
    }

    try {
      setRows(parseCsv(value));
      setError('');
    } catch (requestError: unknown) {
      setRows([]);
      setError(requestError instanceof Error ? requestError.message : 'Failed to read CSV data.');
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    parseInput(await file.text());
  };

  const downloadTemplate = () => {
    const sample = [
      templateHeaders.join(','),
      '"Classic Panjabi","Soft cotton panjabi for Eid",1890,2190,"https://example.com/image.jpg","Mens Fashion",18,"",true,1450,1690,"Best margin for repeat resellers"',
    ].join('\n');
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'seller-bulk-upload-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleUpload = async () => {
    if (!token) {
      toast.error('Log in as a seller to upload products.');
      return;
    }
    if (rows.length === 0) {
      toast.error('Paste a valid CSV before uploading.');
      return;
    }

    setUploading(true);
    setResults([]);
    const nextResults: RowResult[] = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      try {
        const response = await fetch('/api/products', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(row),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || 'Upload failed');
        }
        nextResults.push({
          index,
          name: row.name,
          status: 'success',
          message: payload?.sku ? `Created with SKU ${payload.sku}` : 'Created successfully',
        });
      } catch (requestError: unknown) {
        nextResults.push({
          index,
          name: row.name,
          status: 'error',
          message: requestError instanceof Error ? requestError.message : 'Upload failed',
        });
      }
      setResults([...nextResults]);
    }

    setUploading(false);
    const successCount = nextResults.filter((item) => item.status === 'success').length;
    const errorCount = nextResults.length - successCount;
    if (successCount > 0) toast.success(`${successCount} product${successCount > 1 ? 's' : ''} uploaded.`);
    if (errorCount > 0) toast.error(`${errorCount} row${errorCount > 1 ? 's' : ''} need review.`);
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-sm">
        <div className="bg-[linear-gradient(135deg,rgba(42,133,255,0.08),rgba(15,23,42,0.02))] px-5 py-6 sm:px-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary/70">Catalog operations</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Bulk Upload</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Import multiple products at once using a production-safe CSV flow that writes to your live seller catalog.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                <Download size={16} />
                Download template
              </button>
              <Link to="/seller/products/add" className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
                <UploadCloud size={16} />
                Add single product
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Upload source</h2>
              <p className="mt-1 text-sm text-slate-500">Paste CSV rows directly or import a `.csv` file from your supplier sheet.</p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              <FileSpreadsheet size={16} />
              Choose CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
            </label>
          </div>

          <textarea
            value={csvText}
            onChange={(event) => parseInput(event.target.value)}
            className="mt-5 min-h-[320px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm outline-none transition focus:border-primary focus:bg-white"
            placeholder={templateHeaders.join(',')}
          />

          {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading || rows.length === 0 || Boolean(error)}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
              Upload {rows.length > 0 ? rows.length : ''} product{rows.length === 1 ? '' : 's'}
            </button>
            <button type="button" onClick={() => { setCsvText(''); setRows([]); setError(''); setResults([]); }} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              Clear
            </button>
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Import summary</h2>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Rows</p><p className="mt-2 text-2xl font-black text-slate-950">{summary.total}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">In stock</p><p className="mt-2 text-2xl font-black text-slate-950">{summary.ready}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Reseller</p><p className="mt-2 text-2xl font-black text-slate-950">{summary.resellerEnabled}</p></div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Latest upload results</h2>
            <div className="mt-5 space-y-3">
              {results.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  Upload results will appear here after live catalog creation starts.
                </div>
              ) : (
                results.map((result) => (
                  <div key={`${result.index}-${result.name}`} className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-sm ${result.status === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                    {result.status === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                    <div>
                      <p className="font-semibold">{result.name}</p>
                      <p className="mt-1 text-xs opacity-80">{result.message}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default SellerBulkUploadPage;
