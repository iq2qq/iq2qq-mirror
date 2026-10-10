const Parser = require('rss-parser');
const fs = require('fs');

(async () => {
  // Use a standard browser header to mask the automated GitHub runner
  const parser = new Parser({
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    },
    customFields: {
      item: [
        ['content:encoded', 'contentEncoded'],
        ['description', 'description']
      ]
    }
  });
  
  // Bypassing the domain wrapper by hitting the core Substack engine feed directly
  console.log("Connecting directly to Substack engine feed...");
  
  let feed;
  try {
    feed = await parser.parseURL('https://substack.com');
  } catch (err) {
    console.error("Primary engine feed blocked. Trying fallback secure feed...");
    try {
      feed = await parser.parseURL('https://iq2qq.com');
    } catch (finalErr) {
      console.error("Substack is aggressively blocking automated requests. Content dump:");
      throw new Error("Build halted: Substack anti-bot walls are blocking the RSS parse stream.");
    }
  }

  if (!fs.existsSync('posts')) fs.mkdirSync('posts');
  if (!fs.existsSync('public')) fs.mkdirSync('public');

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
  <p>Independent static archive of <a href="https://www.iq2qq.com">iq2qq.com</a>. Automatically mirrored from Substack.</p>
  <hr style="border: 0; border-top: 1px solid #ccc; margin: 2rem 0;">
`;

  for (const item of feed.items) {
    const slug = item.link.split('/').pop() || item.guid;
    const safeSlug = slug.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const date = new Date(item.pubDate).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    console.log(`Archiving full post body: ${item.title}`);

    // Read full embedded content directly from Substack feed parameters
    const articleBody = item.contentEncoded || item.content || item.description || 'Content temporarily unavailable.';

    const postHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${item.title}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.7; color: #222; }
    img { max-width: 100%; height: auto; border-radius: 4px; display: block; margin: 1.5rem auto; }
    a { color: #0066cc; }
    .date { color: #666; font-size: 0.95rem; margin-bottom: 2rem; }
    .back-link { margin-bottom: 2rem; display: block; text-decoration: none; color: #666; }
    iframe { max-width: 100%; }
  </style>
</head>
<body>
  <a class="back-link" href="/">← Back to archive</a>
  <h1>${item.title}</h1>
  <p class="date">${date}</p>
  <main>
    ${articleBody}
  </main>
  <hr style="border: 0; border-top: 1px solid #eee; margin: 3rem 0;">
  <p><small>Original Link: <a href="${item.link}" target="_blank">${item.link}</a></small></p>
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
  <p style="margin-top:4rem;color:#777;font-size:0.85rem;border-top:1px solid #eee;padding-top:1.5rem;">
    Last updated: ${new Date().toUTCString()}<br>
    Powered by GitHub Actions + Cloudflare Pages
  </p>
</body>
</html>`;

  fs.writeFileSync('public/index.html', index);
  fs.cpSync('posts', 'public/posts', { recursive: true });

  console.log(`Successfully completed static mapping for ${feed.items.length} deep posts.`);
})();
