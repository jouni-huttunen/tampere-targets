// Listing text (Briefing, Lease terms) into paragraphs, lines and bold runs. Some landlords send
// HTML (<p>, <b>, <br>: 48 of 380 descriptions, 4 lease texts on 2026-11-12), the rest plain text
// with newlines; both end up in the same shape, so every briefing looks alike. The result is plain
// data that components/RichText.jsx turns into elements: the ad's markup is never put into the
// page as HTML, so nothing in an ad can add scripts, links or styles. Pure, covered by node:test.
//
//   parseRichText(text) → Paragraph[]   Paragraph = Line[]   Line = Run[]   Run = { text, bold }
//
// HTML (any tag present): <p>, <div>, headings and lists start a new paragraph (a list item is a
// line starting "• "), <br> a new line, <b>/<strong> bold; other tags are dropped, their words kept;
// a blank line in the text is a paragraph break and a single newline a line break, as in plain
// text. Entities (&amp;, &nbsp;, &#228; …) are decoded. Empty lines at the edges of a paragraph and
// empty paragraphs are dropped, so stray newlines next to tags never make double gaps.

const TAG = /<\/?[a-z][a-z0-9]*\b[^>]*>/i;
const TOKEN = /<(\/?)([a-z][a-z0-9]*)\b[^>]*>|([^<]+)|(<)/gi;
const BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'blockquote', 'table', 'tr']);
const BOLD = new Set(['b', 'strong']);

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  auml: 'ä', ouml: 'ö', aring: 'å', Auml: 'Ä', Ouml: 'Ö', Aring: 'Å', euro: '€',
  ndash: '–', mdash: '—', hellip: '…', bull: '•', sup2: '²', deg: '°',
};

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return NAMED[e] ?? m;
  });
}

export function parseRichText(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  const src = text.replace(/\r\n?/g, '\n');
  const paragraphs = [[[]]];
  let bold = 0;
  const para = () => paragraphs[paragraphs.length - 1];
  const newParagraph = () => paragraphs.push([[]]);
  const newLine = () => para().push([]);
  const addText = (s) => {
    // Inside text, a blank line is a paragraph break and a newline a line break.
    s.split(/\n[ \t]*\n\s*/).forEach((chunk, i) => {
      if (i) newParagraph();
      chunk.split('\n').forEach((line, j) => {
        if (j) newLine();
        if (line) para()[para().length - 1].push({ text: line, bold: bold > 0 });
      });
    });
  };

  if (!TAG.test(src)) {
    addText(src);
  } else {
    for (const [, close, name, body, lone] of src.matchAll(TOKEN)) {
      if (body != null) addText(decodeEntities(body));
      else if (lone != null) addText('<');
      else {
        const tag = name.toLowerCase();
        if (tag === 'br') newLine();
        else if (BOLD.has(tag)) bold = Math.max(0, bold + (close ? -1 : 1));
        else if (tag === 'li') {
          if (!close) {
            newLine();
            para()[para().length - 1].push({ text: '• ', bold: false });
          }
        } else if (BLOCK.has(tag)) newParagraph();
      }
    }
  }
  return paragraphs.map(tidyParagraph).filter((p) => p.length);
}

/** Trim each line, drop empty lines at the paragraph's edges, merge neighbouring runs alike. */
function tidyParagraph(lines) {
  const out = lines.map(tidyLine);
  while (out.length && !out[0].length) out.shift();
  while (out.length && !out[out.length - 1].length) out.pop();
  return out;
}

function tidyLine(runs) {
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && last.bold === r.bold) last.text += r.text;
    else merged.push({ ...r });
  }
  if (merged.length) {
    merged[0].text = merged[0].text.replace(/^\s+/, '');
    merged[merged.length - 1].text = merged[merged.length - 1].text.replace(/\s+$/, '');
  }
  return merged.filter((r) => r.text);
}
