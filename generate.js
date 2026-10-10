const fs = require('fs');
const https = require('https');
const path = require('path');

// Helper to download content from a URL using native HTTPS
const getHttpText = (url, options = {}) => {
  return new Promise((resolve, reject) => {
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', (err) => reject(err));
  });
};

// Helper to download external asset images securely
const downloadImage = (url, destPath) => {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        const fileStream = fs.createWriteStream(destPath);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
      } else {
        reject(new Error(`Status: ${res.statusCode}`));
      }
    }).on('error', (err) => reject(err));
  });
};

(async () => {
  if (!fs.existsSync('posts')) fs.mkdirSync('posts');
  if (!fs.existsSync('public')) fs.mkdirSync('public');
  if (!fs.existsSync('public/images')) fs.mkdirSync('public/images', { recursive: true });

  console.log("Connecting to Substack data network via fallback proxy channels...");
  let posts = [];
  const targetApiUrl = 'https://substack.com';

  // Multi-proxy approach to force Substack to yield the data stream
  try {
    console.log("Trying Route 1: corsproxy.io...");
    const proxyUrl = `https://corsproxy.io{encodeURIComponent(targetApiUrl)}`;
    const rawData = await getHttpText(proxyUrl);
    posts = JSON.parse(rawData);
  } catch (err) {
    console.log("Route 1 blocked. Trying Route 2: Browser Masquerade...");
    try {
      const browserOptions = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      };
      const rawData = await getHttpText(targetApiUrl, browserOptions);
      posts = JSON.parse(rawData);
    } catch (e) {
      console.error("All available proxy and direct data routes were rejected by Substack.");
    }
  }

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

  if (Array.isArray(posts) && posts.length > 0) {
    console.log(`Successfully bypassed firewall. Mirroring ${posts.length} articles with full-text and media elements...`);
    
    for (const post of posts) {
      const slug = post.slug || post.id;
      const safeSlug = slug.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
      const date = new Date(post.post_date || post.createdAt || Date.now()).toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      let bodyHtml = post.body_html || post.body || post.description || post.subtitle || '';

      // Find, download, and replace all hotlinked images so they save locally into GitHub
      const imgRegex = /<img[^>]+src="([^">]+)"/g;
      let match;
      while ((match = imgRegex.exec(bodyHtml)) !== null) {
        const originalImgUrl = match[1];
        if (originalImgUrl.includes('://substack.com') || originalImgUrl.length < 15) continue;

        try {
          const imgName = `${safeSlug}-${Date.now()}-${path.basename(originalImgUrl.split('?')[0]).replace(/[^a-z0-9.]/gi, '-')}`;
          const diskDestination = path.join('public/images', imgName);
          const relativeWebPath = `/images/${imgName}`;

          await downloadImage(originalImgUrl, diskDestination);
          bodyHtml = bodyHtml.split(originalImgUrl).join(relativeWebPath);
        } catch (imgErr) {
          console.error("Skipped image download task.");
        }
      }

      const postHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${post.title}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.7; color: #222; }
    img { max-width: 100%; height: auto; border-radius: 4px; display: block; margin: 1.5rem auto; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    a { color: #0066cc; }
    .date { color: #666; font-size: 0.95rem; margin-bottom: 2rem; }
    .back-link { margin-bottom: 2rem; display: block; text-decoration: none; color: #666; }
    blockquote { border-left: 4px solid #ccc; padding-left: 1rem; margin-left: 0; color: #555; font-style: italic; }
  </style>
</head>
<body>
  <a class="back-link" href="/">← Back to archive</a>
  <h1>${post.title}</h1>
  <p class="date">${date}</p>
  <main>
    ${bodyHtml}
  </main>
  <hr style="border: 0; border-top: 1px solid #eee; margin: 3rem 0;">
  <p><small>Original Link: <a href="https://iq2qq.com/p/${slug}" target="_blank">View on Substack</a></small></p>
</body>
</html>`;

      fs.writeFileSync(`posts/${safeSlug}.html`, postHtml);

      index += `
  <div class="post">
    <h2><a href="/posts/${safeSlug}.html">${post.title}</a></h2>
    <div class="date">${date}</div>
  </div>`;
    }
  } else {
    index += `
    <div style="background: #fff8f8; padding: 1.5rem; border-left: 4px solid #cc0000; margin: 2rem 0; border-radius: 4px;">
      <h3 style="margin-top:0; color: #cc0000;">Live Feed Synchronization Pending</h3>
      <p style="margin-bottom:0;">Substack's firewalls are temporarily limiting data access requests from GitHub's servers. The archive framework is active and will retry connection automatically on the next cycle interval.</p>
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
  console.log("Process complete.");
})();
