export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  pubTimestamp: number;
  description: string;
  isEvent: boolean;
  valueLevel: 'high' | 'standard' | null; // null = not an event
}

const NEWS_URLS: Record<string, string> = {
  EU:   'https://worldoftanks.eu/en/rss/news/',
  NA:   'https://worldoftanks.com/en/rss/news/',
  ASIA: 'https://worldoftanks.asia/en/rss/news/',
};

// Events where you earn/receive something for free
const HIGH_VALUE_KEYWORDS = [
  'earn', 'free', 'gift', 'reward', 'receive', 'win a', 'get a',
  'marathon', 'compensation', 'bonds', 'blueprint', 'crew book',
  'personal reserve', 'premium tank', 'premium vehicle',
  'battle pass', 'bia', 'zero perk', 'rental',
];

// General event/special indicators
const EVENT_KEYWORDS = [
  'event', 'bonus', 'weekend', 'operation', 'discount', 'sale',
  'special', 'challenge', 'mission', 'holiday', 'anniversary',
  'season', 'promotion', 'ranked', 'x2', 'x3', 'x5',
];

export async function fetchNews(region: string): Promise<NewsItem[]> {
  const url = NEWS_URLS[region] || NEWS_URLS.EU;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseRss(await response.text());
}

function extractTag(xml: string, tag: string): string {
  const cdata = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i').exec(xml);
  if (cdata) return cdata[1].trim();
  const plain = new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i').exec(xml);
  return plain ? plain[1].trim() : '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const content = match[1];
    const title = stripHtml(extractTag(content, 'title'));
    const link = extractTag(content, 'link') || extractTag(content, 'guid');
    const pubDate = extractTag(content, 'pubDate');
    const pubTimestamp = pubDate ? new Date(pubDate).getTime() : 0;
    const description = stripHtml(extractTag(content, 'description')).slice(0, 220);
    const combined = (title + ' ' + description).toLowerCase();

    const isHighValue = HIGH_VALUE_KEYWORDS.some(k => combined.includes(k));
    const isEvent = isHighValue || EVENT_KEYWORDS.some(k => combined.includes(k));
    const valueLevel: NewsItem['valueLevel'] = !isEvent ? null : isHighValue ? 'high' : 'standard';

    if (title && link) {
      items.push({ title, link, pubDate, pubTimestamp, description, isEvent, valueLevel });
    }
  }
  return items;
}
