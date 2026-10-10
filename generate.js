const fs = require('fs');
const path = require('path');

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

  // Explicit hardcoded absolute date structure for tracking order sequences
  const absoluteDates = {
    'the-closed-loop-how-the-permanent.html': new Date('2026-10-10T12:00:00Z'),
    'the-slop-detector-is-the-slop-inside.html': new Date('2026-10-09T12:00:00Z'),
    'the-rolling-cascade-how-elite-ai.html': new Date('2026-10-08T12:00:00Z'),
    'the-mirror-methodology.html': new Date('2026-10-07T12:00:00Z'),
    'the-1884-protocol-the-babylonian.html': new Date('2026-10-06T12:00:00Z'),
    'the-clacton-spectacle-how-the-establishment.html': new Date('2026-10-05T12:00:00Z'),
    'prime-suspects-how-the-fauci-era.html': new Date('2026-10-04T12:00:00Z'),
    'manifesto-for-the-idioteological.html': new Date('2026-10-03T12:00:00Z'),
    'nicola-what-a-mug-sturgeon-me-me.html': new Date('2026-10-02T12:00:00Z'),
    'james-how-to-be-wrong-obrien-fallacies.html': new Date('2026-10-01T12:00:00Z'),
    'declaration-of-humanai-sovereignty.html': new Date('2026-09-30T12:00:00Z'),
    'bought-from-the-shop-pepper-sprayed.html': new Date('2026-09-29T12:00:00Z'),
    '1984-zoomers-cops-leave-live-biometric.html': new Date('2026-09-28T12:00:00Z')
  };

  const files = fs.readdirSync(postsDir).filter(file => file.endsWith('.html'));

  if (files.length > 0) {
    const parsedPosts = [];

    for (const file of files) {
      const filePath = path.join(postsDir, file);
      let htmlContent = fs.readFileSync(filePath, 'utf-8');

      // --- THE ANTI-HIJACK FILTER: Forcefully strip out all dynamic scripts ---
      htmlContent = htmlContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      
      // Clean up target attribute objects or noscript frame overrides
      htmlContent = htmlContent.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');
      htmlContent = htmlContent.replace(/id="substack-app"/gi, 'id="clean-archive-root"');

      // Extract the clean title text from HTML title tags
      let title = file.replace('.html', '').split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      const titleMatch = htmlContent.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].replace(' - by 777 - The Mirror', '').replace(' - The Mirror', '').trim();
      }

      // Map dates based on absolute registry or fallback patterns
      let pubDate = null;
      if (absoluteDates[file]) {
        pubDate = absoluteDates[file];
      } else {
        const fileNameDateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/);
        if (fileNameDateMatch && fileNameDateMatch[1]) {
          pubDate = new Date(fileNameDateMatch[1]);
        }
      }

      if (!pubDate || isNaN(pubDate.getTime())) {
        const fileStat = fs.statSync(filePath);
        pubDate = fileStat.birthtime || fileStat.mtime;
      }

      // Save the stripped clean HTML file back down to public folder target trees
      fs.writeFileSync(path.join(targetPublicPostsDir, file), htmlContent);

      parsedPosts.push({ file, title, pubDate });
    }

    // Sort strictly by real publication datetime values (Newest items on top)
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
  console.log("Anti-hijack scrubbing and sorting configurations active.");
})();
