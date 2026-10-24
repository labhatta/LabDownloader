export interface ExtractedLinkItem {
  id: string;
  url: string;
  title: string;
  source: string;
  duplicateCount: number;
}

export interface ExtractionResult {
  items: ExtractedLinkItem[];
  totalRawDetected: number;
  uniqueCount: number;
  duplicateCount: number;
}

/**
 * Normalizes a URL and extracts a canonical deduplication key, clean URL, and detected platform source.
 */
export function getCanonicalKey(rawUrl: string): { key: string; cleanUrl: string; source: string } {
  // Strip outer punctuation and markdown wrappers
  let cleanUrl = rawUrl.trim().replace(/^[<([{"']+|[>)\]}"',;.]+$/g, '');

  let source = 'Generic';
  let key = cleanUrl.toLowerCase().replace(/\/+$/, '');

  try {
    const u = new URL(cleanUrl);
    const host = u.hostname.toLowerCase();

    // YouTube detection & normalization
    if (host === 'youtu.be') {
      const vid = u.pathname.slice(1).split('/')[0].split('?')[0];
      if (vid && vid.length >= 6) {
        return {
          key: `yt:${vid}`,
          cleanUrl: `https://youtu.be/${vid}`,
          source: 'YouTube',
        };
      }
    } else if (host.includes('youtube.com')) {
      let vid = u.searchParams.get('v');
      if (!vid) {
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'v') {
          vid = parts[1];
        }
      }
      if (vid && vid.length >= 6) {
        return {
          key: `yt:${vid}`,
          cleanUrl: `https://youtu.be/${vid}`,
          source: 'YouTube',
        };
      }
      source = 'YouTube';
    } else if (host.includes('scribd.com')) {
      source = 'Scribd';
      const docMatch = u.pathname.match(/\/document\/(\d+)/i);
      if (docMatch) {
        key = `scribd:${docMatch[1]}`;
      }
    } else if (host.includes('academia.edu')) {
      source = 'Academia.edu';
    } else if (host.includes('twitter.com') || host.includes('x.com')) {
      source = 'Twitter / X';
      const statusMatch = u.pathname.match(/\/status\/(\d+)/i);
      if (statusMatch) {
        key = `x:${statusMatch[1]}`;
      }
    } else if (host.includes('instagram.com')) {
      source = 'Instagram';
    } else if (host.includes('tiktok.com')) {
      source = 'TikTok';
    } else if (cleanUrl.toLowerCase().includes('.m3u8')) {
      source = 'HLS Stream';
    } else if (cleanUrl.match(/\.(pdf|epub|docx?)($|\?)/i)) {
      source = 'Document';
    }
  } catch (_) {}

  return { key, cleanUrl, source };
}

/**
 * Clean title text by stripping markdown artifacts, numbered prefixes, bullets, and separators.
 */
function cleanTitle(raw: string): string {
  let s = raw.trim();
  // Remove leading bullets or list numbers like "- ", "* ", "1. ", "Day 1 - " -> keep "Day 1 ..."
  s = s.replace(/^[-*•\s]+/, '');
  s = s.replace(/^\d+[\.\)]\s*/, '');
  // Strip trailing separators
  s = s.replace(/[:\-–—|]+\s*$/, '').trim();
  return s;
}

/**
 * Parses raw text input and extracts all links, identifying duplicates and preserving any line titles/labels.
 */
export function extractLinksFromText(text: string): ExtractionResult {
  if (!text || !text.trim()) {
    return { items: [], totalRawDetected: 0, uniqueCount: 0, duplicateCount: 0 };
  }

  const itemsMap = new Map<string, ExtractedLinkItem>();
  let totalRawDetected = 0;

  const lines = text.split(/\r?\n/);
  const URL_REGEX = /https?:\/\/[^\s<>"'()[\]{}]+(?:\([^\s<>"'()[\]{}]*\))?/gi;
  const MARKDOWN_REGEX = /\[([^\]]*)\]\((https?:\/\/[^\s\)]+)\)/gi;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex].trim();
    if (!rawLine) continue;

    // 1. Check for Markdown link occurrences: e.g. Day 1 Bedah [https://youtu.be/...](https://youtu.be/...)
    // or [Day 1 Bedah](https://youtu.be/...)
    let lineHandled = false;
    let mdMatch: RegExpExecArray | null;
    const mdRegex = new RegExp(MARKDOWN_REGEX);

    while ((mdMatch = mdRegex.exec(rawLine)) !== null) {
      lineHandled = true;
      const fullMatch = mdMatch[0];
      const bracketText = mdMatch[1].trim();
      const parenUrl = mdMatch[2].trim();

      // Check if bracketText itself is a URL
      const bracketIsUrl = /^https?:\/\//i.test(bracketText);

      // Raw URLs detected count
      if (bracketIsUrl) {
        totalRawDetected += 2; // e.g. [https://...](https://...) contains 2 URL strings
      } else {
        totalRawDetected += 1;
      }

      // Title detection:
      // If bracket is a URL, look at text before or after the markdown link
      let titleCandidate = '';
      if (!bracketIsUrl && bracketText) {
        // e.g. [Day 1 Bedah](https://...)
        titleCandidate = cleanTitle(bracketText);
      } else {
        // e.g. Day 1 Bedah [url](url)
        const prefix = rawLine.substring(0, mdMatch.index).trim();
        const suffix = rawLine.substring(mdMatch.index + fullMatch.length).trim();
        titleCandidate = cleanTitle(prefix || suffix);
      }

      const { key, cleanUrl, source } = getCanonicalKey(parenUrl);

      if (itemsMap.has(key)) {
        const existing = itemsMap.get(key)!;
        existing.duplicateCount += bracketIsUrl ? 2 : 1;
        // If existing had no good title but this one does, update it
        if ((!existing.title || existing.title.startsWith('Media #')) && titleCandidate) {
          existing.title = titleCandidate;
        }
      } else {
        itemsMap.set(key, {
          id: key,
          url: cleanUrl,
          title: titleCandidate || `${source} Item ${itemsMap.size + 1}`,
          source,
          duplicateCount: bracketIsUrl ? 1 : 0, // In [url](url), one of them is duplicate
        });
      }
    }

    if (lineHandled) continue;

    // 2. Check for plain URLs in line with title prefixes:
    // e.g. "Day 1 Bedah: https://youtu.be/..." or "Day 1 Bedah - https://youtu.be/..."
    const urlsInLine: string[] = [];
    let urlMatch: RegExpExecArray | null;
    const lineUrlRegex = new RegExp(URL_REGEX);

    while ((urlMatch = lineUrlRegex.exec(rawLine)) !== null) {
      urlsInLine.push(urlMatch[0]);
    }

    if (urlsInLine.length === 1) {
      // Single URL in line with potential title prefix
      totalRawDetected += 1;
      const targetUrl = urlsInLine[0];
      const urlIndex = rawLine.indexOf(targetUrl);
      const prefix = rawLine.substring(0, urlIndex).trim();
      const suffix = rawLine.substring(urlIndex + targetUrl.length).trim();
      const titleCandidate = cleanTitle(prefix || suffix);

      const { key, cleanUrl, source } = getCanonicalKey(targetUrl);
      if (itemsMap.has(key)) {
        const existing = itemsMap.get(key)!;
        existing.duplicateCount += 1;
        if ((!existing.title || existing.title.startsWith('Media #')) && titleCandidate) {
          existing.title = titleCandidate;
        }
      } else {
        itemsMap.set(key, {
          id: key,
          url: cleanUrl,
          title: titleCandidate || `${source} Item ${itemsMap.size + 1}`,
          source,
          duplicateCount: 0,
        });
      }
    } else if (urlsInLine.length > 1) {
      // Multiple URLs in single line
      for (let i = 0; i < urlsInLine.length; i++) {
        totalRawDetected += 1;
        const targetUrl = urlsInLine[i];
        const { key, cleanUrl, source } = getCanonicalKey(targetUrl);

        if (itemsMap.has(key)) {
          itemsMap.get(key)!.duplicateCount += 1;
        } else {
          itemsMap.set(key, {
            id: key,
            url: cleanUrl,
            title: `${source} Item ${itemsMap.size + 1}`,
            source,
            duplicateCount: 0,
          });
        }
      }
    }
  }

  // 3. Fallback: If no links found through line iteration (e.g. single giant paragraph without line breaks)
  if (itemsMap.size === 0) {
    const globalMatches = text.match(URL_REGEX) || [];
    for (const rawUrl of globalMatches) {
      totalRawDetected += 1;
      const { key, cleanUrl, source } = getCanonicalKey(rawUrl);
      if (itemsMap.has(key)) {
        itemsMap.get(key)!.duplicateCount += 1;
      } else {
        itemsMap.set(key, {
          id: key,
          url: cleanUrl,
          title: `${source} Item ${itemsMap.size + 1}`,
          source,
          duplicateCount: 0,
        });
      }
    }
  }

  const items = Array.from(itemsMap.values());
  const uniqueCount = items.length;
  // Calculate duplicates: total detected occurrences minus unique items
  const duplicateCount = Math.max(0, totalRawDetected - uniqueCount);

  return {
    items,
    totalRawDetected,
    uniqueCount,
    duplicateCount,
  };
}
