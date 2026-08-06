import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface LinkPreview {
  ok: boolean;
  url: string;
  host: string;
  title?: string;
  description?: string;
  image?: string;
}

const FETCH_TIMEOUT = 6000;
const MAX_BYTES = 512 * 1024;
const USER_AGENT = 'Mozilla/5.0 (compatible; blog.szeroki.fr link preview)';

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&[a-z]+;|&#39;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity);
}

function isPrivateAddress(address: string): boolean {
  if (address.includes(':')) {
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80');
  }

  const [a, b] = address.split('.').map(Number);

  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a >= 224;
}

async function assertPublicHost(hostname: string): Promise<void> {
  const addresses = isIP(hostname)
    ? [hostname]
    : (await lookup(hostname, { all: true })).map((entry) => entry.address);

  if (!addresses.length || addresses.some(isPrivateAddress)) {
    throw createError({ statusCode: 400, statusMessage: 'Host non autorisé' });
  }
}

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();

  if (!reader) {
    return '';
  }

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let size = 0;

  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    size += value.byteLength;
    chunks.push(decoder.decode(value, { stream: true }));
  }

  await reader.cancel().catch(() => undefined);

  return chunks.join('');
}

function extractMeta(html: string): Record<string, string> {
  const meta: Record<string, string> = {};

  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1];
    const content = tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];

    if (key && content && !meta[key.toLowerCase()]) {
      meta[key.toLowerCase()] = decodeEntities(content.trim());
    }
  }

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];

  if (title) {
    meta.title = decodeEntities(title.replace(/\s+/g, ' ').trim());
  }

  return meta;
}

export default defineCachedEventHandler(async (event): Promise<LinkPreview> => {
  const target = getQuery(event).url;

  if (typeof target !== 'string' || !target) {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre url manquant' });
  }

  let parsed: URL;

  try {
    parsed = new URL(target);
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'URL invalide' });
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw createError({ statusCode: 400, statusMessage: 'Protocole non autorisé' });
  }

  await assertPublicHost(parsed.hostname);

  const host = parsed.hostname.replace(/^www\./, '');
  const fallback: LinkPreview = { ok: false, url: parsed.href, host };

  let html = '';

  try {
    const response = await fetch(parsed.href, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'fr,en;q=0.8',
      },
    });

    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('html')) {
      return fallback;
    }

    html = await readCapped(response);
  } catch {
    return fallback;
  }

  const meta = extractMeta(html);
  const title = meta['og:title'] || meta['twitter:title'] || meta.title;
  const description = meta['og:description'] || meta['twitter:description'] || meta.description;
  const image = meta['og:image'] || meta['twitter:image'];

  if (!title && !description) {
    return fallback;
  }

  return {
    ok: true,
    url: parsed.href,
    host,
    title,
    description,
    image: image ? new URL(image, parsed.href).href : undefined,
  };
}, {
  maxAge: 60 * 60 * 24,
  swr: true,
  name: 'link-preview',
  getKey: (event) => String(getQuery(event).url ?? ''),
});
