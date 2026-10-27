'use client';

import { useEffect, useState } from 'react';
import { type Lang, SNIPPETS, snippetText } from './snippets';

function CopyIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect width="13" height="13" x="8" y="8" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2F80FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function useCopy() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopied(true);
  };
  return { copied, copy };
}

export function CopyButton({ text, label, showLabel }: { text: string; label: string; showLabel?: boolean }) {
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => copy(text)}
      className="flex h-11 flex-none items-center gap-1.5 rounded-md px-3 text-[12.5px] text-fd-muted-foreground transition-colors hover:bg-fd-secondary hover:text-fd-foreground"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {showLabel && <span>{copied ? 'Copied' : 'Copy'}</span>}
    </button>
  );
}

const TOKEN_CLASS: Record<string, string> = { k: 'au-kw', s: 'au-str', p: 'au-pn', '': '' };

export function CodePanel() {
  const [lang, setLang] = useState<Lang>('ts');
  const snippet = SNIPPETS.find((x) => x.id === lang) ?? SNIPPETS[0];

  return (
    <div className="flex flex-col">
      <div className="overflow-hidden rounded-lg border border-fd-border bg-fd-card">
        <div role="tablist" aria-label="Language" className="flex overflow-x-auto border-b border-fd-border px-2 [scrollbar-width:none]">
          {SNIPPETS.map((x) => {
            const active = x.id === lang;
            return (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setLang(x.id)}
                className={`h-11 flex-none whitespace-nowrap px-3.5 text-[13px] font-medium transition-colors ${
                  active
                    ? 'text-fd-foreground shadow-[inset_0_-2px_0_#2F80FF]'
                    : 'text-fd-muted-foreground hover:text-fd-foreground'
                }`}
              >
                {x.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-3 py-2 pl-5 pr-2">
          <span className="min-w-0 text-[13px] text-fd-muted-foreground">{snippet.caption}</span>
          <CopyButton text={snippetText(snippet)} label="Copy snippet" showLabel />
        </div>
        <pre
          role="tabpanel"
          className="m-0 h-[286px] overflow-auto px-5 pb-5 pt-1 font-mono text-[13px] leading-[1.75] text-fd-foreground"
        >
          {snippet.lines.map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static snippet lines
            <div key={i}>
              {line.length === 0
                ? ' '
                : line.map((t, j) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static tokens
                    <span key={j} className={TOKEN_CLASS[t.t]}>
                      {t.v}
                    </span>
                  ))}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
