import https from 'https';
import { app } from 'electron';

export interface UpdateInfo {
  version: string;
  releaseUrl: string;
  downloadUrl: string | null;
}

const GITHUB_REPO = 'xTurl/Hulldown-releases';

/**
 * Fetches the latest GitHub release and returns update info if a newer version is available.
 * Returns null when up to date, on network error, or when running in dev mode.
 */
export function checkForUpdates(): Promise<UpdateInfo | null> {
  // Skip update checks in dev (unless HULLDOWN_FAKE_UPDATE is set for local testing)
  if (!app.isPackaged && !process.env.HULLDOWN_FAKE_UPDATE) return Promise.resolve(null);

  if (process.env.HULLDOWN_FAKE_UPDATE) {
    return Promise.resolve({
      version: '999.0.0',
      releaseUrl: 'https://github.com/xTurl/Hulldown-releases/releases',
      downloadUrl: null,
    });
  }

  return new Promise((resolve) => {
    const req = https.get(
      {
        hostname: 'api.github.com',
        path: `/repos/${GITHUB_REPO}/releases/latest`,
        headers: { 'User-Agent': `hulldown/${app.getVersion()}` },
      },
      (res) => {
        if (res.statusCode !== 200) { resolve(null); return; }
        let body = '';
        res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        res.on('end', () => {
          try {
            const release = JSON.parse(body) as {
              tag_name: string;
              html_url: string;
              assets?: { name: string; browser_download_url: string }[];
            };
            const latest = (release.tag_name ?? '').replace(/^v/, '');
            const current = app.getVersion();
            if (latest && isNewer(latest, current)) {
              const asset = release.assets?.find(a => /setup\.exe$/i.test(a.name));
              resolve({
                version: latest,
                releaseUrl: release.html_url,
                downloadUrl: asset?.browser_download_url ?? null,
              });
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
  });
}

function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.split('.').map(n => parseInt(n, 10) || 0);
  const [lMaj, lMin, lPat] = parse(latest);
  const [cMaj, cMin, cPat] = parse(current);
  return lMaj > cMaj
    || (lMaj === cMaj && lMin > cMin)
    || (lMaj === cMaj && lMin === cMin && lPat > cPat);
}
