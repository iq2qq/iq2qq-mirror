const fs = require('fs');
const path = require('path');

function parseCSV(csvText) {
  const records = [];
  const lines = csvText.split('\n');
  if (lines.length < 2) return records;

  const headers = splitCSVLine(lines[0]);
  const postIdIdx = headers.findIndex(h => h.toLowerCase().includes('id'));
  const titleIdx = headers.findIndex(h => h.toLowerCase().includes('title'));
  const dateIdx = headers.findIndex(h => h.toLowerCase().includes('date'));
  const slugIdx = headers.findIndex(h => h.toLowerCase().includes('slug'));

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = splitCSVLine(line);
    if (fields.length < 2) continue;

    const rawTitle = fields[titleIdx] || '';
    const cleanTitle = rawTitle.replace(/^"|"\$/g, '').trim();

    if (!cleanTitle || cleanTitle.length === 0) continue;

    records.push({
      id: fields[postIdIdx] || '',
      title: cleanTitle,
      date: fields[dateIdx] || '',
      slug: fields[slugIdx] || ''
    });
  }
  return records;
}

function splitCSVLine(line) {
  const result = [];
  let insideQuote = false;
  let currentField = '';

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      insideQuote = !insideQuote;
    } else if (char === ',' && !insideQuote) {
      result.push(currentField.trim());
      currentField = '';
    } else {
      currentField += char;
    }
  }
  result.push(currentField.trim());
  return result;
}

(async () => {
  const postsDir = 'posts';
  const publicDir = 'public';
  const targetPublicPostsDir = path.join(publicDir, 'posts');

  if (!fs.existsSync(postsDir)) fs.mkdirSync(postsDir);
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);
  if (!fs.existsSync(targetPublicPostsDir)) fs.mkdirSync(targetPublicPostsDir, { recursive: true });

  let index = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>The Mirror – Static Archive</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 680px; margin: 3rem auto; padding: 0 1.5rem; line-height: 1.6; color: #151515; background-color: #fafafa; }
    h1 { font-size: 2.5rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 0.5rem; color: #000; }
    .subtitle { color: #666; font-size: 1.1rem; margin-bottom: 2rem; }
    .post { margin-bottom: 2rem; background: #fff; padding: 2rem; border: 1px solid #e5e5e5; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
    a { color: #1a1a1a; text-decoration: none; font-weight: 600; }
    .post h2 a { color: #000; font-size: 1.5rem; font-weight: 700; }
    .post h2 a:hover { color: #0066cc; }
    .date { color: #666; font-size: 0.9rem; margin-top: 0.5rem; font-weight: 500; }
    hr { border: 0; border-top: 1px solid #e5e5e5; margin: 2.5rem 0; }
  </style>
</head>
<body>
  <h1>The Mirror</h1>
  <div class="subtitle">Independent static archive of <a href="https://iq2qq.com" style="color:#0066cc;text-decoration:underline;">iq2qq.com</a>. Automatically mirrored from Substack.</div>
  <hr>
`;

  const csvPath = 'posts.csv';
  let csvIdMap = {};
  let csvSlugMap = {};

  if (fs.existsSync(csvPath)) {
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parseCSV(csvContent);
    
    records.forEach(rec => {
      const cleanDate = new Date(rec.date);
      if (rec.id) csvIdMap[rec.id.trim()] = { title: rec.title, date: cleanDate, slug: rec.slug };
      if (rec.slug) csvSlugMap[rec.slug.trim().toLowerCase()] = { title: rec.title, date: cleanDate, slug: rec.slug };
    });
  }

  const files = fs.readdirSync(postsDir).filter(file => file.endsWith('.html'));

  if (files.length > 0) {
    const verifiedChronologicalPosts = [];

    for (const file of files) {
      const filePath = path.join(postsDir, file);
      let htmlContent = fs.readFileSync(filePath, 'utf-8');

      let pubDate = null;
      let title = '';
      let postSlug = '';

      let fileNumericId = '';
      for (let i = 0; i < file.length; i++) {
        if (file[i] >= '0' && file[i] <= '9') {
          fileNumericId += file[i];
        } else if (fileNumericId.length > 0) {
          break;
        }
      }

      const fileSlugPart = file.replace('.html', '').toLowerCase();

      if (fileNumericId && csvIdMap[fileNumericId]) {
        title = csvIdMap[fileNumericId].title;
        pubDate = csvIdMap[fileNumericId].date;
        postSlug = csvIdMap[fileNumericId].slug;
      } else if (csvSlugMap[fileSlugPart]) {
        title = csvSlugMap[fileSlugPart].title;
        pubDate = csvSlugMap[fileSlugPart].date;
        postSlug = csvSlugMap[fileSlugPart].slug;
      } else {
        const matchedIdKey = Object.keys(csvIdMap).find(idKey => file.includes(idKey));
        if (matchedIdKey) {
          title = csvIdMap[matchedIdKey].title;
          pubDate = csvIdMap[matchedIdKey].date;
          postSlug = csvIdMap[matchedIdKey].slug;
        }
      }

      if (!pubDate || isNaN(pubDate.getTime())) continue; // Ignore drafts entirely

      // Safe script neutralization
      htmlContent = htmlContent.split('<script').join('<!--<script');
      htmlContent = htmlContent.split('</script>').join('</script>-->');
      htmlContent = htmlContent.split('<noscript').join('<!--<noscript');
      htmlContent = htmlContent.split('</noscript>').join('</noscript>-->');

      const displayDate = pubDate.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
      const originalSourceLink = postSlug ? `https://iq2qq.com{postSlug}` : `https://iq2qq.com`;

      // --- STYLING & CORE INFO INJECTION SHEET ---
      const highFidelityStyles = `
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 680px; margin: 0 auto; padding: 2rem 1.5rem 6rem 1.5rem; line-height: 1.75; color: #1c1c1e; background-color: #ffffff; -webkit-font-smoothing: antialiased; }
  .archive-header { display: flex; justify-content: space-between; border-bottom: 1px solid #e5e5ea; padding-bottom: 1rem; margin-bottom: 3rem; font-size: 0.95rem; font-weight: 500; }
  .archive-header a { color: #0066cc; text-decoration: none; }
  .post-title { font-size: 2.6rem; font-weight: 700; line-height: 1.15; letter-spacing: -0.025em; margin-bottom: 0.5rem; color: #000000; }
  .post-meta { font-size: 0.95rem; color: #636366; margin-bottom: 3rem; font-weight: 500; }
  .post-meta a { color: #0066cc; text-decoration: underline; }
  img { max-width: 100%; height: auto; border-radius: 4px; display: block; margin: 2rem auto; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
  p { margin-bottom: 1.5rem; font-size: 1.1rem; }
  blockquote { border-left: 3px solid #000; padding-left: 1.25rem; margin: 2rem 0; font-style: italic; color: #48484a; }
  h2, h3, h4 { font-weight: 700; color: #000; margin-top: 2.5rem; margin-bottom: 1rem; line-height: 1.3; }
  h2 { font-size: 1.6rem; }
</style>

<!-- Manually inject Twitter widgets engine ignored by the script scrubber -->
<script async src="https://twitter.com" charset="utf-8"></script>

</head>
<body>
  <div class="archive-header">
    <a href="/">← Back to Archive</a>
    <a href="${originalSourceLink}" target="_blank">View Original Source ↗</a>
  </div>
  <h1 class="post-title">${title}</h1>
  <div class="post-meta">Published on ${displayDate} | Deep link: <a href="${originalSourceLink}" target="_blank">://iq2qq.com{postSlug || ''}</a></div>
`;

      // Inject clean structures straight into Substack's header body tags
      if (htmlContent.includes('</head>')) {
        htmlContent = htmlContent.replace('</head>', highFidelityStyles);
      } else {
        htmlContent = highFidelityStyles + htmlContent;
      }

      fs.writeFileSync(path.join(targetPublicPostsDir, file), htmlContent);
      verifiedChronologicalPosts.push({ file, title, pubDate });
    }

    verifiedChronologicalPosts.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

    for (const post of verifiedChronologicalPosts) {
      const displayDate = post.pubDate.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
      index += `
  <div class="post">
    <h2><a href="/posts/${post.file}">${post.title}</a></h2>
    <div class="date">${displayDate}</div>
  </div>`;
    }
  }

  index += `
  <p style="margin-top:4rem;color:#777;font-size:0.85rem;border-top:1px solid #eee;padding-top:1.5rem;text-align:center;">
    Last updated: ${new Date().toUTCString()}<br>
    Powered by GitHub Actions + Cloudflare Pages
  </p>
</body>
</html>`;

  fs.writeFileSync('public/index.html', index);
  console.log("High fidelity formatting layer successfully deployed.");
})();








