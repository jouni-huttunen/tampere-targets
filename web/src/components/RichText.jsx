import { useMemo } from 'react';
import { parseRichText } from '../lib/richtext.js';

/**
 * Listing text (Briefing, Lease terms) as paragraphs, line breaks and bold, from plain text or the
 * little HTML some landlords send (lib/richtext.js). Built as elements, never as raw HTML.
 */
export default function RichText({ text, className = '' }) {
  const paragraphs = useMemo(() => parseRichText(text), [text]);
  return (
    <div className={`prose prose-rich ${className}`}>
      {paragraphs.map((lines, i) => (
        <p key={i}>
          {lines.map((runs, j) => (
            <Line key={j} runs={runs} first={j === 0} />
          ))}
        </p>
      ))}
    </div>
  );
}

function Line({ runs, first }) {
  return (
    <>
      {!first && <br />}
      {runs.map((r, k) => (r.bold ? <strong key={k}>{r.text}</strong> : <span key={k}>{r.text}</span>))}
    </>
  );
}
