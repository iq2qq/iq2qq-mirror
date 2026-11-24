const fs = require('fs');
const path = require('path');

const SUBSTACK_BASE = 'https://www.iq2qq.com';
const USER_AGENT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://google.com)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseCSV(csvText) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i], next = csvText[i + 1];
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
      section: sectionIdx >= 0 ? (r.at(sectionIdx) || '').trim() : '',
    });
  }
  return records;
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function decodeEntities(str) {
  return String(str || '')
    .replace(/&quot;/g, '"').replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&').replace(/&#38;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'");
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

function enhanceSubstackEmbeds(html) {
  let out = String(html || '');
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');

  // 1. Convert Substack tweet blocks into live X/Twitter embeds
  out = replaceDivBlocksByClass(out, /<div[^>]*class="[^"]*\btweet\b[^"]*"[^>]*>/i, (block) => {
    let tweetUrl = '';
    block.replace(/data-attrs="([^"]+)"/i, (_, rawAttrs) => {
      try {
        const attrs = JSON.parse(decodeEntities(rawAttrs));
        tweetUrl = attrs.url || (attrs.id ? `https://x.com{attrs.id}` : '');
      } catch (_) {}
    });
    if (!tweetUrl) {
      block.replace(/href="(https?:\/\/(?:twitter\.com|x\.com)\/[^"]+)"/i, (_, href) => {
        tweetUrl = href;
      });
    }
    return tweetUrl ? `<blockquote class="twitter-tweet"><a href="${tweetUrl}">${tweetUrl}</a></blockquote>` : block;
  });

  // 2. Inject playable YouTube iframe directly before every youtube-wrap container (immune to > inside data-attrs)
  out = out.replace(/<div\b[^>]*class="[^"]*youtube-wrap[^"]*"[\s\S]{0,4000}/gi, (chunk) => {
    const decoded = decodeEntities(chunk).replace(/\\"/g, '"');
    let videoId = '';
    decoded.replace(/"(?:videoId|video_id)"\s*:\s*"([a-zA-Z0-9_-]{8,15})"/i, (_, id) => {
      videoId = id;
    });
    if (!videoId) {
      decoded.replace(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/|vi\/)([a-zA-Z0-9_-]{8,15})/i, (_, id) => {
        videoId = id;
      });
    }
    if (videoId) {
      return `<div class="video-embed"><iframe src="https://youtube.com{videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>${chunk}`;
    }
    return chunk;
  });

  // 3. Wrap any standalone YouTube iframes from older posts
  out = out.replace(/<iframe[^>]+src="https?:\/\/(?:www\.)?(?:youtube\.com|youtube-nocookie\.com)\/embed\/([a-zA-Z0-9_-]{8,15})[^"]*"[^>]*><\/iframe>/gi, (_, videoId) => {
    return `<div class="video-embed"><iframe src="https://youtube.com{videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
  });

  return out;
}
async function fetchTextWithRetry(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    });
    if (res.ok) return await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(attempt * 2000);
      continue;
    }
    throw new Error(`Fetch failed (${res.status}) for ${url}`);
  }
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

  let section = 'Main';
  const secMatch = pageHtml.match(/"section_name"\s*:\s*"([^"]+)"/i);
  if (secMatch) section = decodeEntities(secMatch.at(1)).trim();

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

  console.log('Fetching Substack sitemap.xml (published posts across all sections)...');
  const sitemapXml = await fetchTextWithRetry(`${SUBSTACK_BASE}/sitemap.xml`);
  const urlBlocks = sitemapXml.match(/<url>[\s\S]*?<\/url>/gi) || [];
  const publishedSlugs = new Set();
  const sitemapDates = {};

  for (const block of urlBlocks) {
    const locMatch = block.match(/<loc>(.*?)<\/loc>/i);
    const modMatch = block.match(/<lastmod>(.*?)<\/lastmod>/i);
    const loc = locMatch ? locMatch.at(1) : '';
    const lastmod = modMatch ? modMatch.at(1) : '';
    const pMatch = loc.match(/\/p\/([^/?#<]+)/i);
    if (pMatch) {
      const slug = decodeURIComponent(pMatch.at(1)).toLowerCase();
      publishedSlugs.add(slug);
      if (lastmod) sitemapDates[slug] = lastmod.trim();
    }
  }
  console.log(`Found ${publishedSlugs.size} published posts in sitemap.xml.`);
  const metaBySlug = {};
  if (fs.existsSync('posts.csv')) {
    for (const rec of parseCSV(fs.readFileSync('posts.csv', 'utf-8'))) {
      if (!rec.slug) continue;
      const d = rec.date ? new Date(rec.date) : null;
      metaBySlug[rec.slug.toLowerCase()] = {
        id: rec.id,
        title: rec.title,
        date: d && !isNaN(d.getTime()) ? d : null,
        section: rec.section || 'Main',
      };
    }
  }

  const existingFilesBySlug = {};
  for (const f of fs.readdirSync(postsDir).filter((f) => f.endsWith('.html'))) {
    const s = f.replace(/^\d+\./, '').replace(/\.html$/i, '').toLowerCase();
    const hasNumericId = /^\d+\./.test(f);
    if (!existingFilesBySlug[s] || hasNumericId) {
      existingFilesBySlug[s] = f;
    }
  }

  let downloadedCount = 0;
  for (const slug of publishedSlugs) {
    if (!existingFilesBySlug[slug]) {
      console.log(`Downloading new published post: ${slug}`);
      await sleep(1000);
      try {
        const html = await fetchTextWithRetry(`${SUBSTACK_BASE}/p/${encodeURIComponent(slug)}`);
        const art = extractArticleFromHtml(html, slug);
        if (art.bodyHtml && art.title) {
          const fname = `${art.id}.${slug}.html`;
          fs.writeFileSync(path.join(postsDir, fname), art.bodyHtml, 'utf-8');
          existingFilesBySlug[slug] = fname;
          metaBySlug[slug] = {
            id: art.id,
            title: art.title,
            date: art.date ? new Date(art.date) : (sitemapDates[slug] ? new Date(sitemapDates[slug]) : new Date()),
            section: art.section || 'Main',
          };
          downloadedCount++;
        }
      } catch (err) {
        console.warn(`Skipped ${slug}: ${err.message}`);
      }
    }
  }
  console.log(`New posts downloaded: ${downloadedCount}`);

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

    const section = meta.section || 'Main';
    const srcLink = `${SUBSTACK_BASE}/p/${slug}`;
    const displayDate = pubDate.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });

    const postPageHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(title)} – The Mirror</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 720px; margin: 0 auto; padding: 2rem 1.5rem 6rem; line-height: 1.75; color: #1c1c1e; background: #fff; }
  .archive-header { display: flex; justify-content: space-between; border-bottom: 1px solid #e5e5ea; padding-bottom: 1rem; margin-bottom: 2.5rem; font-size: 0.95rem; font-weight: 500; }
  .archive-header a, .post-meta a, .post-body a { color: #0066cc; }
  .section-pill { display: inline-block; background: #f2f2f7; color: #3a3a3c; font-size: 0.8rem; font-weight: 600; padding: 0.2rem 0.65rem; border-radius: 999px; margin-bottom: 0.75rem; text-transform: uppercase; }
  .post-title { font-size: 2.4rem; font-weight: 700; line-height: 1.18; margin: 0 0 0.75rem; color: #000; }
  .post-meta { font-size: 0.95rem; color: #636366; margin-bottom: 2.5rem; border-bottom: 1px solid #f2f2f7; padding-bottom: 1.25rem; }
  .post-body img, .post-body video, .post-body figure { max-width: 100%; height: auto; border-radius: 6px; display: block; margin: 1.75rem auto; }
  .post-body p { margin-bottom: 1.4rem; font-size: 1.1rem; }
  .post-body blockquote { border-left: 3px solid #000; padding-left: 1.25rem; margin: 2rem 0; font-style: italic; color: #48484a; }
  .youtube-wrap { display: none !important; }
  .video-embed { position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; margin: 2rem 0; border-radius: 8px; }
  .video-embed iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
  .twitter-tweet { margin: 2rem auto !important; }
</style><script async src="https://twitter.com" charset="utf-8"></script></head><body>
<div class="archive-header"><a href="/">← Back to Full Archive</a><a href="${escapeHtml(srcLink)}" target="_blank">View on Substack ↗</a></div>
<div class="section-pill">${escapeHtml(section)}</div><h1 class="post-title">${escapeHtml(title)}</h1>
<div class="post-meta">Published on ${escapeHtml(displayDate)} · <a href="${escapeHtml(srcLink)}" target="_blank">${escapeHtml(srcLink)}</a></div>
<article class="post-body">${enhanceSubstackEmbeds(rawHtml)}</article></body></html>`;

    fs.writeFileSync(path.join(targetPublicPostsDir, file), postPageHtml, 'utf-8');
    verifiedPosts.push({ file, title, section, timestamp: pubDate.getTime(), displayDate });
  }

  verifiedPosts.sort((a, b) => b.timestamp - a.timestamp);
  if (verifiedPosts.length === 0) throw new Error('Aborting build: 0 valid posts compiled.');

  const sectionOptions = Array.from(new Set(verifiedPosts.map((p) => p.section))).sort().map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  const postCardsHtml = verifiedPosts.map((p) => `<div class="post" data-section="${escapeHtml(p.section)}" data-title="${escapeHtml(p.title.toLowerCase())}"><div class="card-meta"><span class="date">${escapeHtml(p.displayDate)}</span><span class="badge">${escapeHtml(p.section)}</span></div><h2><a href="/posts/${encodeURIComponent(p.file)}">${escapeHtml(p.title)}</a></h2></div>`).join('\n');

  const indexHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>The Mirror – Complete Static Archive (${verifiedPosts.length} Posts)</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 720px; margin: 3rem auto; padding: 0 1.5rem; line-height: 1.6; color: #151515; background: #fafafa; }
  h1 { font-size: 2.5rem; font-weight: 700; margin-bottom: 0.4rem; color: #000; }
  .subtitle { color: #666; font-size: 1.05rem; margin-bottom: 1.5rem; }
  .controls { display: flex; gap: 0.75rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
  .controls input, .controls select { padding: 0.65rem 0.9rem; border: 1px solid #d1d1d6; border-radius: 8px; font-size: 0.95rem; background: #fff; }
  .controls input { flex: 1; min-width: 220px; }
  .count { font-size: 0.9rem; color: #666; margin-bottom: 1.5rem; font-weight: 500; }
  .post { margin-bottom: 1.25rem; background: #fff; padding: 1.5rem 1.75rem; border: 1px solid #e5e5e5; border-radius: 8px; }
  .card-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; }
  .date { color: #666; font-size: 0.88rem; }
  .badge { background: #f2f2f7; color: #3a3a3c; font-size: 0.75rem; font-weight: 600; padding: 0.15rem 0.55rem; border-radius: 999px; }
  .post h2 { margin: 0; font-size: 1.3rem; }
  .post h2 a { color: #000; text-decoration: none; font-weight: 700; }
  .post h2 a:hover { color: #0066cc; }
</style></head><body>
<h1>The Mirror</h1>
<div class="subtitle">Complete static archive of <a href="https://iq2qq.com" style="color:#0066cc;">iq2qq.com</a> across all sections.</div>
<div class="controls"><input type="search" id="searchInput" placeholder="Search ${verifiedPosts.length} archived posts..." oninput="filterPosts()"><select id="sectionFilter" onchange="filterPosts()"><option value="">All Sections</option>${sectionOptions}</select></div>
<div class="count" id="postCount">Showing ${verifiedPosts.length} posts (newest first)</div>
<div id="postList">${postCardsHtml}</div>
<p style="margin-top:4rem;color:#777;font-size:0.85rem;border-top:1px solid #eee;padding-top:1.5rem;text-align:center;">Last updated: ${new Date().toUTCString()}<br>Powered by GitHub Actions + Cloudflare Pages</p>
<script>function filterPosts(){const q=document.getElementById('searchInput').value.toLowerCase().trim(),sec=document.getElementById('sectionFilter').value,cards=document.querySelectorAll('#postList .post');let v=0;cards.forEach(c=>{const s=(!q||c.dataset.title.includes(q))&&(!sec||c.dataset.section===sec);c.style.display=s?'':'none';if(s)v++;});document.getElementById('postCount').textContent='Showing '+v+' of '+cards.length+' posts (newest first)';}</script>
</body></html>`;

  fs.writeFileSync(path.join(publicDir, 'index.html'), indexHtml, 'utf-8');
  console.log(`Archive compiled successfully: ${verifiedPosts.length} published posts.`);
})();





























