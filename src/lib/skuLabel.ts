import type { Product } from '../types';
import { openPrintDocument } from './browser-actions';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildBarcodeBars = (seed: string) =>
  seed
    .split('')
    .map((char, index) => {
      const width = (char.charCodeAt(0) % 4) + 1;
      const dark = index % 2 === 0 ? '#111827' : '#374151';
      return `<span style="display:block;width:${width * 2}px;height:56px;background:${dark};border-radius:1px;"></span>`;
    })
    .join('');

const formatLabelPrice = (price: number) =>
  new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 0,
  }).format(Number(price || 0));

const openPrintWindow = (title: string, html: string, width = 420, height = 640) => {
  const opened = openPrintDocument(html, `width=${width},height=${height}`);
  if (!opened) {
    throw new Error('Unable to open print window. Please allow popups and try again.');
  }

  return opened;
};

export const printSkuLabel = (product: Pick<Product, 'name' | 'sku' | 'category' | 'price'>) => {
  if (typeof window === 'undefined') return;

  const sku = String(product.sku || '').trim();
  if (!sku) {
    throw new Error('SKU is not available for this product yet.');
  }

  const productName = escapeHtml(product.name);
  const productCategory = escapeHtml(product.category || 'General');
  const productSku = escapeHtml(sku);
  const productPrice = formatLabelPrice(Number(product.price || 0));

  openPrintWindow(`SKU Label - ${productSku}`, `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>SKU Label - ${productSku}</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 24px;
        font-family: Arial, sans-serif;
        background: #f3f4f6;
        color: #111827;
      }
      .sheet {
        width: 100%;
        max-width: 320px;
        margin: 0 auto;
      }
      .label {
        background: white;
        border: 1px solid #d1d5db;
        border-radius: 18px;
        padding: 18px;
        box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);
      }
      .eyebrow {
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #6b7280;
        margin-bottom: 10px;
      }
      .name {
        font-size: 18px;
        font-weight: 700;
        line-height: 1.3;
        margin-bottom: 8px;
      }
      .meta {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 12px;
        color: #4b5563;
        margin-bottom: 14px;
      }
      .sku {
        font-family: "Courier New", monospace;
        font-size: 24px;
        font-weight: 700;
        letter-spacing: 0.08em;
        padding: 12px 14px;
        border-radius: 12px;
        background: #f9fafb;
        border: 1px dashed #cbd5e1;
        text-align: center;
        margin-bottom: 14px;
      }
      .barcode {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        gap: 2px;
        padding: 14px 10px 6px;
        border-radius: 12px;
        background: #fff;
        border: 1px solid #e5e7eb;
      }
      .barcode-text {
        margin-top: 8px;
        text-align: center;
        font-family: "Courier New", monospace;
        font-size: 12px;
        letter-spacing: 0.18em;
        color: #374151;
      }
      .footer {
        margin-top: 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
        color: #6b7280;
      }
      .price {
        font-size: 16px;
        font-weight: 700;
        color: #111827;
      }
      @media print {
        body {
          background: white;
          padding: 0;
        }
        .sheet {
          max-width: none;
        }
        .label {
          border-radius: 0;
          border: none;
          box-shadow: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="label">
        <div class="eyebrow">Inventory SKU Label</div>
        <div class="name">${productName}</div>
        <div class="meta">
          <span>${productCategory}</span>
          <span class="price">${escapeHtml(productPrice)}</span>
        </div>
        <div class="sku">${productSku}</div>
        <div class="barcode">${buildBarcodeBars(productSku)}</div>
        <div class="barcode-text">${productSku}</div>
        <div class="footer">
          <span>LofiMart</span>
          <span>Print for SKU search</span>
        </div>
      </div>
    </div>
    <script>
      window.onload = function () {
        window.print();
      };
    </script>
  </body>
</html>`);
};

export const printSkuLabelSheet = (products: Array<Pick<Product, 'name' | 'sku' | 'category' | 'price'>>) => {
  if (typeof window === 'undefined') return;

  const printableProducts = products
    .filter((product) => String(product.sku || '').trim())
    .slice(0, 48);

  if (printableProducts.length === 0) {
    throw new Error('No printable SKU labels found in the current product list.');
  }

  const cards = printableProducts
    .map((product) => {
      const sku = escapeHtml(String(product.sku || '').trim());
      const name = escapeHtml(product.name);
      const category = escapeHtml(product.category || 'General');
      const price = escapeHtml(formatLabelPrice(Number(product.price || 0)));

      return `
        <article class="label">
          <div class="head">
            <span class="brand">LofiMart</span>
            <span class="category">${category}</span>
          </div>
          <div class="name">${name}</div>
          <div class="sku">${sku}</div>
          <div class="barcode">${buildBarcodeBars(sku)}</div>
          <div class="barcode-text">${sku}</div>
          <div class="price">${price}</div>
        </article>
      `;
    })
    .join('');

  openPrintWindow(
    `SKU Label Sheet (${printableProducts.length})`,
    `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>SKU Label Sheet</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 18px;
        font-family: Arial, sans-serif;
        background: #f3f4f6;
        color: #111827;
      }
      .sheet-title {
        margin: 0 0 14px;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #475569;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .label {
        background: white;
        border: 1px solid #d1d5db;
        border-radius: 14px;
        padding: 12px;
        break-inside: avoid;
      }
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }
      .brand {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #6b7280;
      }
      .category {
        font-size: 10px;
        color: #6b7280;
      }
      .name {
        min-height: 34px;
        font-size: 13px;
        font-weight: 700;
        line-height: 1.3;
        margin-bottom: 8px;
      }
      .sku {
        font-family: "Courier New", monospace;
        font-size: 18px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-align: center;
        padding: 8px 10px;
        border: 1px dashed #cbd5e1;
        border-radius: 10px;
        background: #f8fafc;
        margin-bottom: 8px;
      }
      .barcode {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        gap: 2px;
        height: 46px;
      }
      .barcode-text {
        margin-top: 6px;
        text-align: center;
        font-size: 10px;
        font-family: "Courier New", monospace;
        letter-spacing: 0.16em;
        color: #4b5563;
      }
      .price {
        margin-top: 8px;
        text-align: right;
        font-size: 12px;
        font-weight: 700;
      }
      @media print {
        body {
          background: white;
          padding: 8px;
        }
        .grid {
          gap: 8px;
        }
        .label {
          border-radius: 10px;
        }
      }
    </style>
  </head>
  <body>
    <h1 class="sheet-title">SKU Label Sheet • ${printableProducts.length} items</h1>
    <section class="grid">${cards}</section>
    <script>
      window.onload = function () {
        window.print();
      };
    </script>
  </body>
</html>`,
    980,
    900,
  );
};
