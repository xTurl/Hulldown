import { fetchNews } from './news';
import type { PatchItem } from '../../shared/types';

const PATCH_KEYWORDS = ['update', 'hotfix', 'micropatch', 'patch notes'];
const VERSION_REGEX = /\b(\d+\.\d+(?:\.\d+)*)\b/;

function isPatchArticle(title: string, description: string): boolean {
  const lower = (title + ' ' + description).toLowerCase();
  return PATCH_KEYWORDS.some(k => lower.includes(k));
}

function extractVersion(title: string): string | null {
  const m = VERSION_REGEX.exec(title);
  return m ? m[1] : null;
}

function detectPatchType(title: string): PatchItem['patchType'] {
  const lower = title.toLowerCase();
  if (lower.includes('hotfix')) return 'hotfix';
  if (lower.includes('micropatch')) return 'micropatch';
  return 'update';
}

export async function fetchPatches(region: string): Promise<PatchItem[]> {
  const allNews = await fetchNews(region);
  return allNews
    .filter(item => isPatchArticle(item.title, item.description))
    .map(item => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      pubTimestamp: item.pubTimestamp,
      description: item.description,
      version: extractVersion(item.title),
      patchType: detectPatchType(item.title),
    }));
}
