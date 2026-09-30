function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function applyInlineFormatting(value: string) {
  return value
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function renderTable(lines: string[]) {
  const rows = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line
        .split('|')
        .map((cell) => cell.trim())
        .filter(Boolean),
    )
    .filter((cells) => cells.length > 0);

  if (rows.length < 2) return '';

  const [header, ...body] = rows;
  const bodyRows = body.filter((cells) => !cells.every((cell) => /^-+$/.test(cell.replace(/\s+/g, ''))));
  if (header.length === 0 || bodyRows.length === 0) return '';

  return `
    <div class="overflow-x-auto">
      <table class="min-w-full border-collapse overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm">
        <thead class="bg-slate-50">
          <tr>${header.map((cell) => `<th class="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">${applyInlineFormatting(escapeHtml(cell))}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${bodyRows
            .map(
              (cells) =>
                `<tr>${cells
                  .map(
                    (cell) =>
                      `<td class="border-b border-slate-100 px-4 py-3 align-top text-slate-600 last:border-b-0">${applyInlineFormatting(escapeHtml(cell))}</td>`,
                  )
                  .join('')}</tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

export function renderProductDescription(description: string) {
  const normalized = String(description || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';

  const blocks: string[] = [];
  const lines = normalized.split('\n');
  let index = 0;

  while (index < lines.length) {
    const current = lines[index].trim();
    if (!current) {
      index += 1;
      continue;
    }

    if (current.includes('|') && index + 1 < lines.length && lines[index + 1].includes('|')) {
      const tableLines: string[] = [];
      while (index < lines.length && lines[index].includes('|')) {
        tableLines.push(lines[index]);
        index += 1;
      }
      const tableHtml = renderTable(tableLines);
      if (tableHtml) {
        blocks.push(tableHtml);
        continue;
      }
    }

    if (current.startsWith('- ') || current.startsWith('* ')) {
      const items: string[] = [];
      while (index < lines.length) {
        const listLine = lines[index].trim();
        if (!listLine.startsWith('- ') && !listLine.startsWith('* ')) break;
        items.push(listLine.slice(2));
        index += 1;
      }
      blocks.push(
        `<ul class="space-y-2 pl-5 text-sm leading-7 text-slate-700">${items
          .map((item) => `<li class="list-disc">${applyInlineFormatting(escapeHtml(item))}</li>`)
          .join('')}</ul>`,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const paragraphLine = lines[index].trim();
      if (!paragraphLine) break;
      if (paragraphLine.includes('|') || paragraphLine.startsWith('- ') || paragraphLine.startsWith('* ')) break;
      paragraphLines.push(paragraphLine);
      index += 1;
    }

    blocks.push(
      `<p class="text-sm leading-7 text-slate-700">${applyInlineFormatting(
        escapeHtml(paragraphLines.join(' ')),
      )}</p>`,
    );
  }

  return blocks.join('');
}

export function insertAroundSelection(value: string, selectionStart: number, selectionEnd: number, before: string, after = before) {
  const selected = value.slice(selectionStart, selectionEnd);
  const next = `${value.slice(0, selectionStart)}${before}${selected}${after}${value.slice(selectionEnd)}`;
  return {
    nextValue: next,
    nextSelectionStart: selectionStart + before.length,
    nextSelectionEnd: selectionEnd + before.length,
  };
}

/**
 * Serialize an object for embedding inside a <script type="application/ld+json">
 * block. Escapes the `</script>` breakout sequence and control characters so a
 * value containing markup cannot break out of the script element and inject
 * HTML/JavaScript.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

