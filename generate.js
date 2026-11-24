
const fs = require('fs');
const path = require('path');

const SUBSTACK_BASE = 'https://iq2qq.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
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

  const headers = rows[0].map((h) => h.toLowerCase());
  const idIdx = headers.findIndex((h) => h === 'post_id' || h.includes('id'));
  const titleIdx = headers.findIndex((h) => h === 'title' || h.includes('title'));
  const dateIdx = headers.findIndex((h) => h === 'post_date' || h.includes('date'));
  const slugIdx = headers.findIndex((h) => h === 'slug' || h.includes('slug'));
  const sectionIdx = headers.findIndex((h) => h.includes('section'));

  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 2) continue;
    const rawId = (r[idIdx] || '').trim();
    const numericId = (rawId.match(/^(\d+)/) || [])[1] || rawId;
    const derivedSlug = rawId.includes('.') ? rawId.split('.').slice(1).join('.') : '';
    records.push({
      id: numericId,
      title: (r[titleIdx] || '').trim(),
      date: (r[dateIdx] || '').trim(),
      slug: (slugIdx >= 0 && r[slugIdx] ? r[slugIdx] : derivedSlug).trim(),
      section: sectionIdx >= 0 ? (r[sectionIdx] || '').trim() : '',
    });
  }
  return records;
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function enhanceSubstackEmbeds(html) {
  let out = String(html || '');
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');

  out = out.replace(/<div[^>]*class="[^"]*\btweet\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi, (block) => {
    const attrMatch = block.match(/data-attrs="([^"]+)"/i);
    if (attrMatch) {
      try {
        const attrs = JSON.parse(attrMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
        const tweetUrl = attrs.url || (attrs.id ? `https://x.com{attrs.id}` : '');
        if (tweetUrl) return `<blockquote class="twitter-tweet"><a href="${tweetUrl}">${tweetUrl}</a></blockquote>`;
      } catch (_) {}
    }
    const linkMatch = block.match(/href="(https?:\/\/(?:twitter\.com|x\.com)\/[^"]+)"/i);
    if (linkMatch) return `<blockquote class="twitter-tweet"><a href="${linkMatch[1]}">${linkMatch[1]}</a></blockquote>`;
    return block;
  });

  out = out.replace(/<div[^>]*class="[^"]*\byoutube-wrap\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi, (block) => {
    const attrMatch = block.match(/data-attrs="([^"]+)"/i);
    if (attrMatch) {
      try {
        const attrs = JSON.parse(attrMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
        const videoId = attrs.videoId || attrs.video_id;
        if (videoId) return `<div class="video-embed"><iframe src="https://youtube.com{videoId}" frameborder="0" allowfullscreen loading="lazy"></iframe></div>`;
      } catch (_) {}
    }
    return block;
  });
  return out;
}


async function fetchJsonWithRetry(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', Referer: `${SUBSTACK_BASE}/archive` },
    });
    if (res.ok) return await res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(attempt * 2000);
      continue;
    }
    throw new Error(`Substack API failed (${res.status}) for ${url}`);
  }
}

async function syncFromSubstackApi(postsDir, apiCachePath) {
  let apiCache = {};
  if (fs.existsSync(apiCachePath)) {
    try { apiCache = JSON.parse(fs.readFileSync(apiCachePath, 'utf-8')); } catch (_) {}
  }

  const existingIds = new Set();
  for (const f of fs.readdirSync(postsDir).filter((f) => f.endsWith('.html'))) {
    const m = f.match(/^(\d+)\./);
    if (m) existingIds.add(m[1]);
  }

  console.log('Fetching all sections from Substack API...');
  let offset = 0, newlySaved = 0;

  while (true) {
    const batch = await fetchJsonWithRetry(`${SUBSTACK_BASE}/api/v1/archive?sort=new&search=&offset=${offset}&limit=12`);
    if (!Array.isArray(batch) || batch.length === 0) break;

    for (const item of batch) {
      const id = String(item.id || '').trim();
      const slug = String(item.slug || '').trim();
      const title = String(item.title || '').trim();
      if (!id || !slug || !title) continue;

      apiCache[id] = {
        id,
        slug,
        title,
        date: item.post_date || item.published_at || '',
        section: (item.section && item.section.name) || item.section_name || 'Main',
        canonical_url: item.canonical_url || `${SUBSTACK_BASE}/p/${slug}`,
      };

      if (!existingIds.has(id)) {
        console.log(`Downloading [${id}] ${title}`);
        await sleep(1200);
        const fullPost = await fetchJsonWithRetry(`${SUBSTACK_BASE}/api/v1/posts/${encodeURIComponent(slug)}`);
        const bodyHtml = fullPost && fullPost.body_html ? fullPost.body_html : '';
        if (bodyHtml.trim().length > 0) {
          fs.writeFileSync(path.join(postsDir, `${id}.${slug}.html`), bodyHtml, 'utf-8');
          existingIds.add(id);
          newlySaved++;
        }
      }
    }
    offset += 12;
    await sleep(1500);
  }

  fs.writeFileSync(apiCachePath, JSON.stringify(apiCache, null, 2), 'utf-8');
  console.log(`Sync complete. New posts saved: ${newlySaved}`);
  return apiCache;
}


(async () => {
  const postsDir = 'posts', publicDir = 'public', targetPublicPostsDir = path.join(publicDir, 'posts');
  if (!fs.existsSync(postsDir)) fs.mkdirSync(postsDir, { recursive: true });
  if (!fs.existsSync(targetPublicPostsDir)) fs.mkdirSync(targetPublicPostsDir, { recursive: true });

  const apiCache = await syncFromSubstackApi(postsDir, 'posts_api.json');
  const metaById = {}, metaBySlug = {};

  if (fs.existsSync('posts.csv')) {
    for (const rec of parseCSV(fs.readFileSync('posts.csv', 'utf-8'))) {
      const d = rec.date ? new Date(rec.date) : null;
      const entry = { title: rec.title, date: d && !isNaN(d.getTime()) ? d : null, slug: rec.slug, section: rec.section || 'Main' };
      if (rec.id) metaById[rec.id] = entry;
      if (rec.slug) metaBySlug[rec.slug.toLowerCase()] = entry;
    }
  }

  for (const [id, item] of Object.entries(apiCache)) {
    const d = item.date ? new Date(item.date) : null;
    const ex = metaById[id] || {};
    const merged = {
      title: item.title || ex.title || '',
      date: d && !isNaN(d.getTime()) ? d : ex.date || null,
      slug: item.slug || ex.slug || '',
      section: item.section || ex.section || 'Main',
      canonical_url: item.canonical_url || '',
    };
    metaById[id] = merged;
    if (merged.slug) metaBySlug[merged.slug.toLowerCase()] = merged;
  }

  const seenIds = new Set(), verifiedPosts = [];
  for (const file of fs.readdirSync(postsDir).filter((f) => f.endsWith('.html'))) {
    const filePath = path.join(postsDir, file);
    const rawHtml = fs.readFileSync(filePath, 'utf-8');
    if (!rawHtml || !rawHtml.trim()) continue;

    const idMatch = file.match(/^(\d+)\./);
    const fileId = idMatch ? idMatch[1] : '';
    const fileSlug = file.replace(/^\d+\./, '').replace(/\.html$/i, '');
    if (fileId && seenIds.has(fileId)) continue;
    if (fileId) seenIds.add(fileId);

    const meta = (fileId && metaById[fileId]) || metaBySlug[fileSlug.toLowerCase()] || {};
    const title = (meta.title || '').trim() || fileSlug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').trim();
    if (!title) continue;

    let pubDate = meta.date;
    if (!pubDate || isNaN(pubDate.getTime())) pubDate = fs.statSync(filePath).mtime;

    const slug = meta.slug || fileSlug;
    const section = meta.section || 'Main';
    const srcLink = meta.canonical_url || (slug ? `${SUBSTACK_BASE}/p/${slug}` : `${SUBSTACK_BASE}/`);
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
  console.log(`Archive compiled successfully: ${verifiedPosts.length} total posts.`);
})();























