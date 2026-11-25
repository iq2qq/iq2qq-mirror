const fs = require('fs');
const path = require('path');

const SUBSTACK_BASE = 'https://iq2qq.com';
const USER_AGENT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://google.com)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SECTIONS = [
  { name: 'Rogue State', slug: 'rogue-state' },
  { name: '1984', slug: '1984' },
  { name: 'Q-Keys', slug: 'q-keys' },
  { name: 'Important Issues & Events', slug: 'important-issues-and-events' },
  { name: 'OWO', slug: 'owo' },
  { name: 'Epstein', slug: 'epstein' },
  { name: 'MSM Watch', slug: 'msm-watch' },
];

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeEntities(str) {
  return String(str || '')
    .replace(/&quot;/g, '"').replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&').replace(/&#38;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

function normalizeSection(raw) {
  const s = decodeEntities(String(raw || '')).trim();
  if (!s || s.toLowerCase() === 'main' || s.toLowerCase() === 'newsletter') return '';
  const match = SECTIONS.find(
    (sec) => sec.name.toLowerCase() === s.toLowerCase() || sec.slug.toLowerCase() === s.toLowerCase()
  );
  return match ? match.name : s;
}

function parseCSV(csvText) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText.charAt(i), next = csvText.charAt(i + 1);
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(field.trim()); field = ''; }
      else if (ch === '\r' && next === '\n') { row.push(field.trim()); rows.push(row); row = []; field = ''; i++; }
      else if (ch === '\n' || ch === '\r') { row.push(field.trim()); rows.push(row); row = []; field = ''; }
      else field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field.trim()); rows.push(row); }
  if (rows.length < 2) return [];

  const headers = rows.at(0).map((h) => h.toLowerCase());
  const idIdx = headers.findIndex((h) => h === 'post_id' || h.includes('id'));
  const titleIdx = headers.findIndex((h) => h === 'title' || h.includes('title'));
  const dateIdx = headers.findIndex((h) => h === 'post_date' || h.includes('date'));
  const slugIdx = headers.findIndex((h) => h === 'slug' || h.includes('slug'));
  const sectionIdx = headers.findIndex((h) => h.includes('section'));
  const pubIdx = headers.findIndex((h) => h === 'is_published');

  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows.at(i);
    if (!r || r.length < 2) continue;
    if (pubIdx >= 0 && String(r.at(pubIdx)).toLowerCase() === 'false') continue;
    const rawId = (r.at(idIdx) || '').trim();
    const idMatch = rawId.match(/^(\d+)/);
    const numericId = idMatch ? idMatch.at(1) : rawId;
    const derivedSlug = rawId.includes('.') ? rawId.split('.').slice(1).join('.') : '';
    records.push({
      id: numericId,
      title: (r.at(titleIdx) || '').trim(),
      date: (r.at(dateIdx) || '').trim(),
      slug: (slugIdx >= 0 && r.at(slugIdx) ? r.at(slugIdx) : derivedSlug).trim(),
      section: sectionIdx >= 0 ? normalizeSection(r.at(sectionIdx)) : '',
    });
  }
  return records;
}
function replaceDivBlocksByClass(html, classRegex, replacer) {
  let out = html, searchPos = 0;
  while (true) {
    const match = out.slice(searchPos).match(classRegex);
    if (!match) break;
    const divStart = searchPos + match.index;
    const openEnd = out.indexOf('>', divStart);
    if (openEnd === -1) break;
    let depth = 1, pos = openEnd + 1;
    while (depth > 0 && pos < out.length) {
      const nextOpen = out.indexOf('<div', pos);
      const nextClose = out.indexOf('</div>', pos);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) { depth++; pos = nextOpen + 4; }
      else { depth--; pos = nextClose + 6; }
    }
    const fullBlock = out.slice(divStart, pos);
    const replacement = replacer(fullBlock);
    out = out.slice(0, divStart) + replacement + out.slice(pos);
    searchPos = divStart + replacement.length;
  }
  return out;
}

function sanitizeAndEnhanceHtml(rawHtml) {
  let out = String(rawHtml || '');

  const bodyMarker = out.indexOf('class="body markup"');
  if (bodyMarker !== -1) {
    const startTag = out.lastIndexOf('<div', bodyMarker);
    const contentStart = out.indexOf('>', startTag) + 1;
    let depth = 1, pos = contentStart;
    while (depth > 0 && pos < out.length) {
      const nextOpen = out.indexOf('<div', pos);
      const nextClose = out.indexOf('</div>', pos);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) { depth++; pos = nextOpen + 4; }
      else { depth--; pos = nextClose + 6; }
    }
    out = out.slice(contentStart, pos - 6).trim();
  } else {
    out = out.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
    const bodyMatch = out.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) out = bodyMatch.at(1);
  }

  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');

  out = replaceDivBlocksByClass(
    out,
    /<div[^>]*class="[^"]*\b(subscription-widget-wrap|subscribe-widget|captioned-button-wrap|post-footer|share-dialog)\b[^"]*"[^>]*>/i,
    () => ''
  );

  out = out.replace(/\sstyle="[^"]*background(?:-color)?\s*:[^"]*"/gi, '');

  out = replaceDivBlocksByClass(out, /<div[^>]*class="[^"]*\btweet\b[^"]*"[^>]*>/i, (block) => {
    const attrMatch = block.match(/data-attrs=(["'])([\s\S]*?)\1/i);
    if (attrMatch) {
      try {
        const attrs = JSON.parse(decodeEntities(attrMatch.at(2)));
        const tweetUrl = attrs.url || (attrs.id ? ['https://x.com', 'i', 'web', 'status', attrs.id].join('/') : '');
        if (tweetUrl) return `<blockquote class="twitter-tweet"><a href="${tweetUrl}">${tweetUrl}</a></blockquote>`;
      } catch (_) {}
    }
    const linkMatch = block.match(/href="(https?:\/\/(?:twitter\.com|x\.com)\/[^"]+)"/i);
    if (linkMatch) return `<blockquote class="twitter-tweet"><a href="${linkMatch.at(1)}">${linkMatch.at(1)}</a></blockquote>`;
    return block;
  });

  out = replaceDivBlocksByClass(out, /<div[^>]*class="[^"]*\byoutube(?:-wrap|2)?\b[^"]*"[^>]*>/i, (block) => {
    const attrMatch = block.match(/data-attrs=(["'])([\s\S]*?)\1/i);
    if (attrMatch) {
      try {
        const attrs = JSON.parse(decodeEntities(attrMatch.at(2)));
        const videoId = attrs.videoId || attrs.video_id;
        if (videoId) {
          const embedSrc = ['https://youtube.com', 'embed', videoId].join('/');
          return `<div class="video-embed"><iframe src="${embedSrc}" referrerpolicy="strict-origin-when-cross-origin" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe></div>`;
        }
      } catch (_) {}
    }
    const ytMatch = block.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
    if (ytMatch) {
      const embedSrc = ['https://youtube.com', 'embed', ytMatch.at(1)].join('/');
      return `<div class="video-embed"><iframe src="${embedSrc}" referrerpolicy="strict-origin-when-cross-origin" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe></div>`;
    }
    return block;
  });

  return out;
}

async function fetchTextWithRetry(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/json,application/xml;q=0.9,*/*;q=0.8' },
    });
    if (res.ok) return await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(attempt * 2000);
      continue;
    }
    throw new Error(`Fetch failed (${res.status}) for ${url}`);
  }
}

function extractSectionFromPageHtml(pageHtml) {
  const objMatch = pageHtml.match(/"section"\s*:\s*\{[^}]*?"name"\s*:\s*"([^"]+)"/i);
  if (objMatch) return normalizeSection(objMatch.at(1));
  const flatMatch = pageHtml.match(/"section_name"\s*:\s*"([^"]+)"/i);
  if (flatMatch) return normalizeSection(flatMatch.at(1));
  const linkMatch = pageHtml.match(/\/s\/([a-z0-9-]+)["'][^>]*>([^<]+)</i);
  if (linkMatch) return normalizeSection(linkMatch.at(2));
  return '';
}

function extractArticleFromHtml(pageHtml, fallbackSlug) {
  let title = '';
  const ogTitle = pageHtml.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || pageHtml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (ogTitle) title = decodeEntities(ogTitle.at(1)).replace(/\s*-\s*by\s+.*$/i, '').trim();

  let pubDate = '';
  const timeMatch = pageHtml.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i)
    || pageHtml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:published_time["']/i)
    || pageHtml.match(/"datePublished"\s*:\s*"([^"]+)"/i);
  if (timeMatch) pubDate = timeMatch.at(1).trim();

  const section = extractSectionFromPageHtml(pageHtml);

  let bodyHtml = '';
  const bodyMarker = pageHtml.indexOf('class="body markup"');
  if (bodyMarker !== -1) {
    const startTag = pageHtml.lastIndexOf('<div', bodyMarker);
    const contentStart = pageHtml.indexOf('>', startTag) + 1;
    let depth = 1, pos = contentStart;
    while (depth > 0 && pos < pageHtml.length) {
      const nextOpen = pageHtml.indexOf('<div', pos);
      const nextClose = pageHtml.indexOf('</div>', pos);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) { depth++; pos = nextOpen + 4; }
      else { depth--; pos = nextClose + 6; }
    }
    bodyHtml = pageHtml.slice(contentStart, pos - 6).trim();
  }

  const idMatch = pageHtml.match(/"post_id"\s*:\s*(\d+)/i) || pageHtml.match(/data-post-id=["'](\d+)["']/i);
  const id = idMatch ? idMatch.at(1) : String(Date.now());
  return { id, slug: fallbackSlug, title, date: pubDate, section, bodyHtml };
}
(async () => {
  const postsDir = 'posts', publicDir = 'public', targetPublicPostsDir = path.join(publicDir, 'posts');
  if (!fs.existsSync(postsDir)) fs.mkdirSync(postsDir, { recursive: true });
  if (!fs.existsSync(targetPublicPostsDir)) fs.mkdirSync(targetPublicPostsDir, { recursive: true });

  console.log('Fetching Substack sitemap.xml...');
  const sitemapXml = await fetchTextWithRetry([SUBSTACK_BASE, 'sitemap.xml'].join('/'));
  const urlBlocks = sitemapXml.match(/<url>[\s\S]*?<\/url>/gi) || [];
  const publishedSlugs = new Set();
  const sitemapDates = {};

  for (const block of urlBlocks) {
    const loc = (block.match(/<loc>(.*?)<\/loc>/i) || []).at(1) || '';
    const lastmod = (block.match(/<lastmod>(.*?)<\/lastmod>/i) || []).at(1) || '';
    const pMatch = loc.match(/\/p\/([^/?#<]+)/i);
    if (pMatch) {
      const slug = decodeURIComponent(pMatch.at(1)).toLowerCase();
      publishedSlugs.add(slug);
      if (lastmod) sitemapDates[slug] = lastmod.trim();
    }
  }

  const metaBySlug = {};
  if (fs.existsSync('posts.csv')) {
    for (const rec of parseCSV(fs.readFileSync('posts.csv', 'utf-8'))) {
      if (!rec.slug) continue;
      const d = rec.date ? new Date(rec.date) : null;
      metaBySlug[rec.slug.toLowerCase()] = {
        id: rec.id,
        title: rec.title,
        date: d && !isNaN(d.getTime()) ? d : null,
        section: rec.section || '',
      };
    }
  }

  const titleCachePath = 'titles-cache.json';
  const savedTitles = fs.existsSync(titleCachePath) ? JSON.parse(fs.readFileSync(titleCachePath, 'utf-8')) : {};
  for (const [s, cached] of Object.entries(savedTitles)) {
    const existing = metaBySlug[s] || {};
    metaBySlug[s] = {
      id: existing.id || '',
      title: existing.title || cached.title,
      date: existing.date || (cached.date ? new Date(cached.date) : null),
      section: existing.section || normalizeSection(cached.section),
    };
  }

  try {
    console.log('Fetching Substack RSS feed...');
    const feedXml = await fetchTextWithRetry([SUBSTACK_BASE, 'feed'].join('/'));
    const items = feedXml.match(/<item>[\s\S]*?<\/item>/gi) || [];
    for (const item of items) {
      const link = (item.match(/<link>(.*?)<\/link>/i) || []).at(1) || '';
      const pMatch = link.match(/\/p\/([^/?#<]+)/i);
      const rawTitle = (item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) || item.match(/<title>([\s\S]*?)<\/title>/i) || []).at(1) || '';
      const pubStr = (item.match(/<pubDate>(.*?)<\/pubDate>/i) || []).at(1) || '';
      if (pMatch && rawTitle) {
        const s = decodeURIComponent(pMatch.at(1)).toLowerCase();
        const fullTitle = decodeEntities(rawTitle).trim();
        const existing = metaBySlug[s] || {};
        metaBySlug[s] = {
          id: existing.id || '',
          title: fullTitle,
          date: existing.date || (pubStr ? new Date(pubStr) : null),
          section: existing.section || '',
        };
        savedTitles[s] = { title: fullTitle, date: metaBySlug[s].date, section: metaBySlug[s].section };
      }
    }
  } catch (err) {
    console.warn(`RSS sync skipped: ${err.message}`);
  }

  console.log('Syncing section assignments across all Substack sections...');
  for (const sec of SECTIONS) {
    let offset = 0;
    const limit = 50;
    while (true) {
      try {
        const apiUrl = `${SUBSTACK_BASE}/api/v1/archive?sort=new&section_slug=${encodeURIComponent(sec.slug)}&offset=${offset}&limit=${limit}`;
        const jsonText = await fetchTextWithRetry(apiUrl);
        const posts = JSON.parse(jsonText);
        if (!Array.isArray(posts) || posts.length === 0) break;

        for (const p of posts) {
          if (!p.slug) continue;
          const pSlug = String(p.slug).toLowerCase();
          const existing = metaBySlug[pSlug] || {};
          metaBySlug[pSlug] = {
            id: existing.id || (p.id ? String(p.id) : ''),
            title: existing.title || (p.title ? decodeEntities(p.title).trim() : ''),
            date: existing.date || (p.post_date ? new Date(p.post_date) : null),
            section: sec.name,
          };
          savedTitles[pSlug] = {
            title: metaBySlug[pSlug].title,
            date: metaBySlug[pSlug].date,
            section: sec.name,
          };
        }

        if (posts.length < limit) break;
        offset += limit;
        await sleep(300);
      } catch (err) {
        try {
          const secHtml = await fetchTextWithRetry([SUBSTACK_BASE, 's', sec.slug].join('/'));
          const postLinks = secHtml.match(/\/p\/([a-z0-9-]+)/gi) || [];
          for (const pl of postLinks) {
            const pSlug = pl.replace(/^\/p\//i, '').toLowerCase();
            if (!metaBySlug[pSlug]) metaBySlug[pSlug] = { id: '', title: '', date: null, section: sec.name };
            else metaBySlug[pSlug].section = sec.name;
            if (savedTitles[pSlug]) savedTitles[pSlug].section = sec.name;
          }
        } catch (_) {}
        break;
      }
    }
  }

  const existingFilesBySlug = {};
  for (const f of fs.readdirSync(postsDir).filter((f) => f.endsWith('.html'))) {
    const s = f.replace(/^\d+\./, '').replace(/\.html$/i, '').toLowerCase();
    existingFilesBySlug[s] = f;
  }

  let downloadedCount = 0;
  for (const slug of publishedSlugs) {
    if (!existingFilesBySlug[slug]) {
      console.log(`Downloading new post: ${slug}`);
      await sleep(1000);
      try {
        const html = await fetchTextWithRetry([SUBSTACK_BASE, 'p', encodeURIComponent(slug)].join('/'));
        const art = extractArticleFromHtml(html, slug);
        if (art.bodyHtml && art.title) {
          const fname = `${art.id}.${slug}.html`;
          fs.writeFileSync(path.join(postsDir, fname), art.bodyHtml, 'utf-8');
          existingFilesBySlug[slug] = fname;
          const existingSec = (metaBySlug[slug] && metaBySlug[slug].section) || art.section;
          metaBySlug[slug] = {
            id: art.id,
            title: art.title,
            date: art.date ? new Date(art.date) : (sitemapDates[slug] ? new Date(sitemapDates[slug]) : new Date()),
            section: existingSec,
          };
          savedTitles[slug] = { title: art.title, date: metaBySlug[slug].date, section: existingSec };
          downloadedCount++;
        }
      } catch (err) {
        console.warn(`Skipped ${slug}: ${err.message}`);
      }
    }
  }

  fs.writeFileSync(titleCachePath, JSON.stringify(savedTitles, null, 2), 'utf-8');
  console.log(`New posts downloaded: ${downloadedCount}`);
  const sharedThemeScript = `<script>
    (function() {
      const saved = localStorage.getItem('mirror-theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const theme = saved || (prefersDark ? 'dark' : 'light');
      if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    })();
    function toggleTheme() {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('mirror-theme', next);
      const btn = document.getElementById('themeBtn');
      if (btn) btn.textContent = next === 'dark' ? '☀️ Light' : '🌙 Dark';
    }
    window.addEventListener('DOMContentLoaded', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const btn = document.getElementById('themeBtn');
      if (btn) btn.textContent = isDark ? '☀️ Light' : '🌙 Dark';
      if (isDark) {
        document.querySelectorAll('blockquote.twitter-tweet').forEach(el => el.setAttribute('data-theme', 'dark'));
      }
    });
  </script>`;

  const verifiedPosts = [];
  for (const slug of publishedSlugs) {
    const file = existingFilesBySlug[slug];
    if (!file) continue;
    const filePath = path.join(postsDir, file);
    const rawHtml = fs.readFileSync(filePath, 'utf-8');
    if (!rawHtml || !rawHtml.trim()) continue;

    const meta = metaBySlug[slug] || {};
    const title = (meta.title || '').trim() || slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').trim();
    if (!title) continue;

    let pubDate = meta.date || (sitemapDates[slug] ? new Date(sitemapDates[slug]) : null);
    if (!pubDate || isNaN(pubDate.getTime())) pubDate = fs.statSync(filePath).mtime;

    const section = normalizeSection(meta.section);
    const srcLink = [SUBSTACK_BASE, 'p', slug].join('/');
    const aboutLink = [SUBSTACK_BASE, 'about'].join('/');
    const twitterWidgetsUrl = ['https://twitter.com', 'widgets.js'].join('/');
    const displayDate = pubDate.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
    const pillHtml = section ? `<div class="section-pill">${escapeHtml(section)}</div>` : '';

    const postPageHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="referrer" content="strict-origin-when-cross-origin"><title>${escapeHtml(title)} – The Mirror</title>${sharedThemeScript}<style>
  :root { --bg: #ffffff; --text: #1c1c1e; --heading: #000000; --muted: #636366; --border: #e5e5ea; --pill-bg: #f2f2f7; --pill-text: #3a3a3c; --accent: #0066cc; --quote-text: #48484a; }
  [data-theme="dark"] { --bg: #121214; --text: #e5e5ea; --heading: #ffffff; --muted: #98989d; --border: #2c2c2e; --pill-bg: #2c2c2e; --pill-text: #d1d1d6; --accent: #4da3ff; --quote-text: #aeaeb2; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 720px; margin: 0 auto; padding: 2rem 1.5rem 6rem; line-height: 1.75; color: var(--text); background: var(--bg); transition: background 0.2s, color 0.2s; }
  .archive-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 1rem; margin-bottom: 2.5rem; font-size: 0.95rem; font-weight: 500; gap: 1rem; flex-wrap: wrap; }
  .archive-header a, .post-meta a, .post-body a { color: var(--accent); text-decoration: none; }
  .archive-header a:hover, .post-meta a:hover, .post-body a:hover { text-decoration: underline; }
  .header-right { display: flex; align-items: center; gap: 1rem; }
  .theme-btn { background: var(--pill-bg); color: var(--pill-text); border: 1px solid var(--border); padding: 0.35rem 0.75rem; border-radius: 999px; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
  .section-pill { display: inline-block; background: var(--pill-bg); color: var(--pill-text); font-size: 0.8rem; font-weight: 600; padding: 0.2rem 0.65rem; border-radius: 999px; margin-bottom: 0.75rem; text-transform: uppercase; }
  .post-title { font-size: 2.4rem; font-weight: 700; line-height: 1.18; margin: 0 0 0.75rem; color: var(--heading); }
  .post-meta { font-size: 0.95rem; color: var(--muted); margin-bottom: 2.5rem; border-bottom: 1px solid var(--border); padding-bottom: 1.25rem; }
  .post-body, .post-body div:not(.video-embed), .post-body section { background-color: transparent !important; color: inherit !important; }
  .post-body img, .post-body video, .post-body figure { max-width: 100%; height: auto; border-radius: 6px; display: block; margin: 1.75rem auto; }
  .post-body p { margin-bottom: 1.4rem; font-size: 1.1rem; }
  .post-body blockquote { border-left: 3px solid var(--heading); padding-left: 1.25rem; margin: 2rem 0; font-style: italic; color: var(--quote-text); }
  .post-body hr { border: 0; border-top: 1px solid var(--border); margin: 2.5rem 0; }
  .video-embed { position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; margin: 2rem 0; border-radius: 8px; }
  .video-embed iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
  .twitter-tweet { margin: 2rem auto !important; }
</style><script async src="${twitterWidgetsUrl}" charset="utf-8"></script></head><body><div class="archive-header"><a href="/">← Back to Full Archive</a><div class="header-right"><a href="${aboutLink}" target="_blank">About</a><a href="${escapeHtml(srcLink)}" target="_blank">View on Substack ↗</a><button id="themeBtn" class="theme-btn" onclick="toggleTheme()">🌙 Dark</button></div></div>${pillHtml}<h1 class="post-title">${escapeHtml(title)}</h1><div class="post-meta">Published on ${escapeHtml(displayDate)} · <a href="${escapeHtml(srcLink)}" target="_blank">${escapeHtml(srcLink)}</a></div><article class="post-body">${sanitizeAndEnhanceHtml(rawHtml)}</article></body></html>`;

    fs.writeFileSync(path.join(targetPublicPostsDir, file), postPageHtml, 'utf-8');
    verifiedPosts.push({ file, title, section, timestamp: pubDate.getTime(), displayDate });
  }
  verifiedPosts.sort((a, b) => b.timestamp - a.timestamp);
  if (verifiedPosts.length === 0) throw new Error('Aborting build: 0 valid posts compiled.');

  const sectionCounts = {};
  for (const p of verifiedPosts) {
    if (p.section) sectionCounts[p.section] = (sectionCounts[p.section] || 0) + 1;
  }

  const knownNames = SECTIONS.map((s) => s.name);
  const orderedSections = [
    ...knownNames.filter((name) => sectionCounts[name] > 0),
    ...Object.keys(sectionCounts).filter((name) => !knownNames.includes(name)).sort(),
  ];

  const sectionTabsHtml = [
    `<button class="sec-tab active" data-sec="" onclick="selectSection(this, '')">All Sections (${verifiedPosts.length})</button>`,
    ...orderedSections.map(
      (s) =>
        `<button class="sec-tab" data-sec="${escapeHtml(s)}" onclick="selectSection(this, '${escapeHtml(s).replace(/'/g, "\\'")}')">${escapeHtml(s)} (${sectionCounts[s]})</button>`
    ),
  ].join('');

  const postCardsHtml = verifiedPosts
    .map(
      (p) =>
        `<div class="post" data-section="${escapeHtml(p.section)}" data-title="${escapeHtml(p.title.toLowerCase())}"><div class="card-meta"><span class="date">${escapeHtml(p.displayDate)}</span>${p.section ? `<span class="badge">${escapeHtml(p.section)}</span>` : ''}</div><h2><a href="/posts/${encodeURIComponent(p.file)}">${escapeHtml(p.title)}</a></h2></div>`
    )
    .join('\n');

  const aboutUrl = [SUBSTACK_BASE, 'about'].join('/');
  const qBadge = '<svg width="14" height="14" viewBox="0 0 24 24" style="vertical-align:-2px;display:inline-block;" aria-label="Q"><circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" stroke-width="2.2"/><text x="12" y="15.8" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="13.5" font-weight="700" fill="currentColor">Q</text></svg>';

  const indexHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>The Mirror – Complete Static Archive (${verifiedPosts.length} Posts)</title>${sharedThemeScript}<style>
  :root { --bg: #fafafa; --card: #ffffff; --text: #151515; --heading: #000000; --muted: #666666; --border: #e5e5e5; --input-border: #d1d1d6; --pill-bg: #f2f2f7; --pill-text: #3a3a3c; --accent: #0066cc; }
  [data-theme="dark"] { --bg: #121214; --card: #1c1c1e; --text: #e5e5ea; --heading: #ffffff; --muted: #98989d; --border: #2c2c2e; --input-border: #3a3a3c; --pill-bg: #2c2c2e; --pill-text: #d1d1d6; --accent: #4da3ff; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 720px; margin: 3rem auto; padding: 0 1.5rem; line-height: 1.6; color: var(--text); background: var(--bg); transition: background 0.2s, color 0.2s; }
  .top-bar { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 0.4rem; flex-wrap: wrap; }
  h1 { font-size: 2.5rem; font-weight: 700; margin: 0; color: var(--heading); }
  .nav-actions { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.4rem; }
  .nav-btn { background: var(--card); color: var(--text); border: 1px solid var(--input-border); padding: 0.45rem 0.85rem; border-radius: 999px; font-size: 0.88rem; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 0.3rem; }
  .nav-btn:hover { border-color: var(--accent); color: var(--accent); }
  .subtitle { color: var(--muted); font-size: 1.05rem; margin-bottom: 1.25rem; }
  .subtitle a { color: var(--accent); text-decoration: none; }
  .subtitle a:hover { text-decoration: underline; }
  .about-drawer { display: none; background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 1.5rem 1.75rem; margin-bottom: 1.75rem; line-height: 1.7; }
  .about-drawer.open { display: block; }
  .about-footer { margin-top: 1.1rem; padding-top: 0.9rem; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; font-size: 0.9rem; }
  .about-footer a { color: var(--accent); font-weight: 600; text-decoration: none; }
  .section-tabs { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.25rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border); }
  .sec-tab { background: var(--card); color: var(--text); border: 1px solid var(--input-border); padding: 0.4rem 0.85rem; border-radius: 999px; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.15s; }
  .sec-tab:hover { border-color: var(--accent); color: var(--accent); }
  .sec-tab.active { background: var(--accent); color: #ffffff; border-color: var(--accent); }
  .controls { display: flex; gap: 0.75rem; margin-bottom: 1.25rem; }
  .controls input { flex: 1; padding: 0.65rem 0.9rem; border: 1px solid var(--input-border); border-radius: 8px; font-size: 0.95rem; background: var(--card); color: var(--text); }
  .count { font-size: 0.9rem; color: var(--muted); margin-bottom: 1.5rem; font-weight: 500; }
  .post { margin-bottom: 1.25rem; background: var(--card); padding: 1.5rem 1.75rem; border: 1px solid var(--border); border-radius: 8px; }
  .card-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; }
  .date { color: var(--muted); font-size: 0.88rem; }
  .badge { background: var(--pill-bg); color: var(--pill-text); font-size: 0.75rem; font-weight: 600; padding: 0.15rem 0.55rem; border-radius: 999px; }
  .post h2 { margin: 0; font-size: 1.3rem; }
  .post h2 a { color: var(--heading); text-decoration: none; font-weight: 700; }
  .post h2 a:hover { color: var(--accent); }
  .footer { margin-top: 4rem; color: var(--muted); font-size: 0.85rem; border-top: 1px solid var(--border); padding-top: 1.5rem; text-align: center; }
</style></head><body>
  <div class="top-bar"><h1>The Mirror</h1><div class="nav-actions"><button class="nav-btn" onclick="toggleAbout()">About</button><a class="nav-btn" href="${aboutUrl}" target="_blank">Substack ↗</a><button id="themeBtn" class="nav-btn" onclick="toggleTheme()">🌙 Dark</button></div></div>
  <div class="subtitle">Complete static archive of <a href="${SUBSTACK_BASE}" target="_blank">iq2qq.com</a> across all sections.</div>
  <div id="aboutDrawer" class="about-drawer"><p>An archive supporting community resilience and the Great Awakening initiative.</p><div class="about-footer"><span>Reality Revolution · ${qBadge} 777</span><a href="${aboutUrl}" target="_blank">Subscribe &amp; Read Full About Page on Substack ↗</a></div></div>
  <div class="section-tabs" id="sectionTabs">${sectionTabsHtml}</div>
  <div class="controls"><input type="search" id="searchInput" placeholder="Search ${verifiedPosts.length} archived posts..." oninput="filterPosts()"></div>
  <div class="count" id="postCount">Showing ${verifiedPosts.length} posts (newest first)</div>
  <div id="postList">${postCardsHtml}</div>
  <p class="footer">Last updated: ${new Date().toUTCString()}<br>Powered by GitHub Actions + Cloudflare Pages</p>
  <script>
    let activeSection = '';
    function toggleAbout() { document.getElementById('aboutDrawer').classList.toggle('open'); }
    function selectSection(btn, sec) {
      activeSection = sec;
      document.querySelectorAll('.sec-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      filterPosts();
    }
    function filterPosts() {
      const q = document.getElementById('searchInput').value.toLowerCase().trim();
      const cards = document.querySelectorAll('#postList .post');
      let v = 0;
      cards.forEach(c => {
        const s = (!q || c.dataset.title.includes(q)) && (!activeSection || c.dataset.section === activeSection);
        c.style.display = s ? '' : 'none';
        if (s) v++;
      });
      const label = activeSection ? ' in ' + activeSection : '';
      document.getElementById('postCount').textContent = 'Showing ' + v + ' of ' + cards.length + ' posts' + label + ' (newest first)';
    }
  </script>
</body></html>`;

  fs.writeFileSync(path.join(publicDir, 'index.html'), indexHtml, 'utf-8');
  console.log(`Archive compiled successfully: ${verifiedPosts.length} published posts across ${orderedSections.length} sections.`);
})();
