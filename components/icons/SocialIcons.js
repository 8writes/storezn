// Shared brand icons, lucide-react doesn't ship these (Instagram/Twitter/
// Facebook/TikTok logos aren't exported by the installed version). Used by
// the site footer and by the per-organizer social links on event pages.
export function XIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function InstagramIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FacebookIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.23.2 2.23.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94z" />
    </svg>
  );
}

export function TikTokIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M16.5 2h-3v13.5a3 3 0 1 1-3-3c.17 0 .33.01.5.04V9.4a6.1 6.1 0 0 0-.5-.02A6.02 6.02 0 0 0 4.5 15.4 6.02 6.02 0 0 0 10.5 21.4 6.02 6.02 0 0 0 16.5 15.4V9.03A8.16 8.16 0 0 0 21 10.5v-3a5.2 5.2 0 0 1-3.5-1.36A5.2 5.2 0 0 1 16.5 2z" />
    </svg>
  );
}
