import { useState } from 'react';
import { buildShareURL } from '../hooks/index.js';

/**
 * ShareButton — copies the current shareable URL to the clipboard.
 *
 * Self-contained, no props required.
 * Uses CSS custom properties from index.css for consistent theming.
 */
export default function ShareButton() {
  const [copied, setCopied] = useState(false);

  function handleClick() {
    const url = buildShareURL();
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
      // Fallback for environments where clipboard API is unavailable
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // silently fail
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      title="Copy shareable link to clipboard"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35em',
        padding: '0.3em 0.75em',
        fontSize: '0.8rem',
        fontFamily: 'inherit',
        color: copied ? 'var(--success)' : 'var(--frost-blue)',
        background: 'transparent',
        border: `1px solid ${copied ? 'var(--success)' : 'var(--frost-blue)'}`,
        borderRadius: '4px',
        cursor: 'pointer',
        transition: 'color 0.2s, border-color 0.2s',
        whiteSpace: 'nowrap',
        lineHeight: 1,
      }}
    >
      {copied ? '✓ Copied!' : '⧉ Copy Link'}
    </button>
  );
}
