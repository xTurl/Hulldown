/** Formats an RSS pubDate string as e.g. "Jul 8, 2026"; returns the raw string when unparseable. */
export function formatPubDate(pubDate: string): string {
  if (!pubDate) return '';
  const d = new Date(pubDate);
  return isNaN(d.getTime())
    ? pubDate
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
