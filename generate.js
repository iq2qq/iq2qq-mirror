const Parser = require('rss-parser');
const fs = require('fs');
const { marked } = require('marked');

(async () => {
  const parser = new Parser();
  const feed = await parser.parseURL('https://www.iq2qq.com/feed');

  if (!fs.existsSync('posts')) fs.mkdirSync('posts');
  if (!fs.existsSync('public')) fs.mkdirSync('public');

  let index = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>The Mirror – Static Archive</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; }
    h1 { margin-bottom: 0.2rem; }
    .post { margin-bottom: 2rem; border-bottom: 1px solid #eee; padding-bottom: 1.5rem; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .date { color: #666; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>The Mirror</h1>
  <p>Independent static archive of <a href="https://www.iq2qq.com">iq2qq.com</a>. Automatically mirrored from Substack.</p>
  <hr>
`;

  for (const item of feed.items) {
    const slug = item.link.split('/').pop() || item.guid;
    const safeSlug = slug.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const date = new Date(item.pubDate).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const content = item['content:encoded'] || item.content || item.summary || '';
    const htmlContent = marked.parse(content);

    const postHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${item.title}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.7; }
    img { max-width: 100%; height: auto; }
    a { color: #0066cc; }
  </style>
</head>
<body>
  <p><a href="/">← Back to archive</a></p>
  <h1>${item.title}</h1>
  <p class="date">${date}</p>
  ${htmlContent}
  <hr>
  <p><small>Original: <a href="${item.link}">${item.link}</a></small></p>
</body>
</html>`;

    fs.writeFileSync(`posts/${safeSlug}.html`, postHtml);

    index += `
  <div class="post">
    <h2><a href="/posts/${safeSlug}.html">${item.title}</a></h2>
    <div class="date">${date}</div>
  </div>`;
  }

  index += `
  <p style="margin-top:3rem;color:#666;font-size:0.9rem;">
    Last updated: ${new Date().toUTCString()}<br>
    Powered by GitHub Actions + Cloudflare Pages
  </p>
</body>
</html>`;

  fs.writeFileSync('public/index.html', index);
  fs.cpSync('posts', 'public/posts', { recursive: true });

  console.log(`Generated ${feed.items.length} posts`);
})();
