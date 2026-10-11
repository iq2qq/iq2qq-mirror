const fs = require('fs');
const path = require('path');

// Simple, clear line splitter with zero complex symbols
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

    records.push({
      id: fields[postIdIdx] || '',
      title: fields[titleIdx] || '',
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
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #222; }
    h1 { margin-bottom: 0.2rem; font-size: 2.2rem; }
    .post { margin-bottom: 2.5rem; border-bottom: 1px solid #eee; padding-bottom: 1.5rem; }
    a { color: #0066cc; text-decoration: none; font-weight: 600; }
    a:hover { text-decoration: underline; }
    .date { color: #666; font-size: 0.9rem; margin-top: 0.3rem; }
  </style>
</head>
<body>
  <h1>The Mirror</h1>
  <p>Independent static archive of <a href="https://iq2qq.com">iq2qq.com</a>. Automatically mirrored from Substack.</p>
  <hr style="border: 0; border-top: 1px solid #ccc; margin: 2rem 0;">
`;

  const csvPath = 'posts.csv';
  let csvIdMap = {};
  let csvSlugMap = {};

  if (fs.existsSync(csvPath)) {
    console.log("Loading metadata spreadsheet map...");
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parseCSV(csvContent);
    
    records.forEach(rec => {
      const cleanTitle = rec.title.replace(/^"|"\$/g, '').trim();
      const cleanDate = new Date(rec.date);

      if (rec.id) {
        csvIdMap[rec.id.trim()] = { title: cleanTitle, date: cleanDate };
      }
      if (rec.slug) {
        csvSlugMap[rec.slug.trim().toLowerCase()] = { title: cleanTitle, date: cleanDate };
      }
    });
  }

  const files = fs.readdirSync(postsDir).filter(file => file.endsWith('.html'));

  if (files.length > 0) {
    const parsedPosts = [];

    for (const file of files) {
      const filePath = path.join(postsDir, file);
      let htmlContent = fs.readFileSync(filePath, 'utf-8');

      htmlContent = htmlContent.replace(/<script\\b[^<]*(?:(?!<\\/script>)<[^<]*)*<\\/script>/gi, '');
      htmlContent = htmlContent.replace(/<noscript\\b[^<]*(?:(?!<\\/noscript>)<[^<]*)*<\\/noscript>/gi, '');
      htmlContent = htmlContent.replace(/id="substack-app"/gi, 'id="clean-archive-root"');

      let title = file.replace('.html', '').split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      let pubDate = null;

      const idMatch = file.match(/(\\d+)/);
      const fileNumericId = idMatch ? idMatch[1] : null;
      const fileSlugPart = file.replace('.html', '').toLowerCase();

      if (fileNumericId && csvIdMap[fileNumericId]) {
        title = csvIdMap[fileNumericId].title;
        pubDate = csvIdMap[fileNumericId].date;
      } else if (csvSlugMap[fileSlugPart]) {
        title = csvSlugMap[fileSlugPart].title;
        pubDate = csvSlugMap[fileSlugPart].date;
      } else {
        const matchedIdKey = Object.keys(csvIdMap).find(idKey => file.includes(idKey));
        if (matchedIdKey) {
          title = csvIdMap[matchedIdKey].title;
          pubDate = csvIdMap[matchedIdKey].date;
        }
      }

      if (!pubDate || isNaN(pubDate.getTime())) {
        const titleMatch = htmlContent.match(/<title>([^<]+)<\\/title>/i);
        if (titleMatch) {
          title = titleMatch[1].replace(' - by 777 - The Mirror', '').replace(' - The Mirror', '').trim();
        }
        const datePrefixMatch = file.match(/^(\\d{4}-\\d{2}-\\d{2})/);
        pubDate = datePrefixMatch ? new Date(datePrefixMatch[1]) : fs.statSync(filePath).mtime;
      }

      fs.writeFileSync(path.join(targetPublicPostsDir, file), htmlContent);
      parsedPosts.push({ file, title, pubDate });
    }

    parsedPosts.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

    for (const post of parsedPosts) {
      const displayDate = post.pubDate.toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      index += `
  <div class="post">
    <h2><a href="/posts/${post.file}">${post.title}</a></h2>
    <div class="date">${displayDate}</div>
  </div>`;
    }
  }

  index += `
  <p style="margin-top:4rem;color:#777;font-size:0.85rem;border-top:1px solid #eee;padding-top:1.5rem;">
    Last updated: ${new Date().toUTCString()}<br>
    Powered by GitHub Actions + Cloudflare Pages
  </p>
</body>
</html>`;

  fs.writeFileSync('public/index.html', index);
  console.log("Process complete.");
})();
