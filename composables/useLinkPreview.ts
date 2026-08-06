import type { LinkPreview } from '~/server/api/link-preview.get';

const cache = new Map<string, LinkPreview | null>();
const inflight = new Map<string, Promise<LinkPreview | null>>();

export function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  if (cache.has(url)) {
    return Promise.resolve(cache.get(url) ?? null);
  }

  const pending = inflight.get(url);

  if (pending) {
    return pending;
  }

  const request = $fetch<LinkPreview>('/api/link-preview', { query: { url } })
    .then((preview) => (preview.ok ? preview : null))
    .catch(() => null)
    .then((preview) => {
      cache.set(url, preview);
      inflight.delete(url);
      return preview;
    });

  inflight.set(url, request);

  return request;
}
