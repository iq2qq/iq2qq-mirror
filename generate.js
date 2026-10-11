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
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #222; }
    h1 { margin-bottom: 0.2rem; font-size: 2.2rem; }
    .post { margin-bottom: 2.5rem; border-bottom: 1px solid #eee; padding-bottom: 1.5rem; }
    a { color: #0066cc; text-decoration: none; font-weight: 600; }
    a:hover { text-decoration: underline; }
    .date { color: #666; font-size: 0.9rem; margin-top: 0.3rem; }
    .section-title { margin-top: 4rem; color: #555; border-bottom: 2px solid #555; padding-bottom: 0.5rem; }
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
      const cleanDate = new Date(rec.date);
      if (rec.id) csvIdMap[rec.id.trim()] = { title: rec.title, date: cleanDate };
      if (rec.slug) csvSlugMap[rec.slug.trim().toLowerCase()] = { title: rec.title, date: cleanDate };
    });
  }

  const files = fs.readdirSync(postsDir).filter(file => file.endsWith('.html'));

  if (files.length > 0) {
    const verifiedChronologicalPosts = [];
    const olderLegacyArchivePosts = [];

    for (const file of files) {
      const filePath = path.join(postsDir, file);
      let htmlContent = fs.readFileSync(filePath, 'utf-8');

      // Prevent script tracking hijacking execution loops
      htmlContent = htmlContent.split('<script').join('<!--<script');
      htmlContent = htmlContent.split('</script>').join('</script>-->');
      htmlContent = htmlContent.split('<noscript').join('<!--<noscript');
      htmlContent = htmlContent.split('</noscript>').join('</noscript>-->');

      let pubDate = null;
      let title = '';
      let isLegacy = false;

      // Extract raw numeric ID references to match rows
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

      // --- CLEANUP MASK LAYER: Strip remaining hashes and dots ---
      if (!pubDate || isNaN(pubDate.getTime())) {
        isLegacy = true;
        pubDate = new Date(0); // Shift them cleanly to base historical layers

        // Clean out digits and structural delimiters up to the first alphanumeric title character
        let scrubbedName = file.replace('.html', '');
        if (fileNumericId && scrubbedName.startsWith(fileNumericId)) {
          scrubbedName = scrubbedName.slice(fileNumericId.length);
          if (scrubbedName.startsWith('.') || scrubbedName.startsWith('-')) {
            scrubbedName = scrubbedName.slice(1);
          }
        }

        // Map layout text casing strings beautifully
        title = scrubbedName
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
          .split('.')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
          .trim();

        if (!title) title = "Archived Essay Link";
      }

      fs.writeFileSync(path.join(targetPublicPostsDir, file), htmlContent);

      if (isLegacy) {
        olderLegacyArchivePosts.push({ file, title, pubDate });
      } else {
        verifiedChronologicalPosts.push({ file, title, pubDate });
      }
    }

    // Sort active publications chronologically
    verifiedChronologicalPosts.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
    
    // Sort unmapped text assets alphabetically by title
    olderLegacyArchivePosts.sort((a, b) => a.title.localeCompare(b.title));

    // Append Newest Verified Posts
    for (const post of verifiedChronologicalPosts) {
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

    // Append Cleaned Up Older Document Layers
    if (olderLegacyArchivePosts.length > 0) {
      index += `<h2 class="section-title">Older Investigative Archives</h2>`;
      
      for (const post of olderLegacyArchivePosts) {
        index += `
  <div class="post">
    <h2><a href="/posts/${post.file}">${post.title}</a></h2>
    <div class="date">Historical Archive Entry</div>
  </div>`;
      }
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





