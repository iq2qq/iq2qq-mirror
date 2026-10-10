
const Parser = require('rss-parser');
const fs = require('fs');

(async () => {
  const parser = new Parser();
  
  // 1. Fetch your Substack RSS index feed
  console.log("Fetching Substack RSS feed items...");
  const feed = await parser.parseURL('https://www.iq2qq.com/feed');

  // Ensure deployment directories exist
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

  // 2. Loop through every single post in your archive feed
  for (const item of feed.items) {
    const slug = item.link.split('/').pop() || item.guid;
    const safeSlug = slug.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const date = new Date(item.pubDate).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    console.log(`Archiving full post content: ${item.title}`);

    let postHtml = '';
    try {
      // 3. Instead of parsing snippet feeds, physically fetch the live post page
      const response = await fetch(item.link, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      const webPageContent = await response.text();
      
      // Keep the complete pristine web page layout if fetched successfully
      postHtml = webPageContent;
    } catch (error) {
      console.error(`Failed live fetch for "${item.title}". Falling back to text generation.`, error);
      
      // Emergency fallback if your individual page cannot be reached
      const summaryContent = item['content:encoded'] || item.content || item.summary || '';
      postHtml = `<!DOCTYPE html><html><head><title>${item.title}</title></head><body><p><a href="/">← Back</a></p><h1>${item.title}</h1>${summaryContent}</body></html>`;
    }

    // Save individual file to disk
    fs.writeFileSync(`posts/${safeSlug}.html`, postHtml);

    // Append to index list
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

  // Save changes
  fs.writeFileSync('public/index.html', index);
  fs.cpSync('posts', 'public/posts', { recursive: true });

  console.log(`Successfully compiled archive deployment: Generated ${feed.items.length} deep posts.`);
})();
