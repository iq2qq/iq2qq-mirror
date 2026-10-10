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

  const files = fs.readdirSync(postsDir).filter(file => file.endsWith('.html'));

  if (files.length > 0) {
    const parsedPosts = [];

    for (const file of files) {
      const filePath = path.join(postsDir, file);
      const htmlContent = fs.readFileSync(filePath, 'utf-8');

      // 1. Extract clean Title text from html title attributes
      let title = file.replace('.html', '').split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      const titleMatch = htmlContent.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].replace(' - by 777 - The Mirror', '').replace(' - The Mirror', '').trim();
      }

      // 2. Extract actual Substack date from hidden structured markup metadata
      let pubDate = null;
      
      // Check for ISO strings inside standard header variables
      const schemaMatch = htmlContent.match(/"datePublished"\s*:\s*"([^"]+)"/i) || 
                          htmlContent.match(/datePublished"\s*content="\s*([^"]+)"/i) ||
                          htmlContent.match(/"pubDate"\s*:\s*"([^"]+)"/i);
                          
      if (schemaMatch && schemaMatch[1]) {
        pubDate = new Date(schemaMatch[1]);
      }

      // If metadata isn't caught, try parsing a general timestamp match inside scripts
      if (!pubDate || isNaN(pubDate.getTime())) {
        const fallbackMatch = htmlContent.match(/"post_date"\s*:\s*"([^"]+)"/i);
        if (fallbackMatch && fallbackMatch[1]) {
          pubDate = new Date(fallbackMatch[1]);
        }
      }

      // Final fail-safe baseline if no text structures exist
      if (!pubDate || isNaN(pubDate.getTime())) {
        const fileStat = fs.statSync(filePath);
        pubDate = fileStat.birthtime || fileStat.mtime;
      }

      parsedPosts.push({ file, title, pubDate });
    }

    // 3. Sort strictly by real publication datetime values (Newest items explicitly forced on top)
    parsedPosts.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

    console.log(`Successfully mapped and ordered ${parsedPosts.length} post layouts chronologically.`);

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
  } else {
    index += `
    <div style="background: #fdfdfd; padding: 2rem; border: 1px dashed #ccc; text-align: center; border-radius: 4px; color: #666;">
      <h3>Your Mirror Archive is Ready</h3>
      <p>Uploaded posts will populate here.</p>
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
  
  if (fs.existsSync(postsDir)) {
    fs.cpSync(postsDir, targetPublicPostsDir, { recursive: true });
  }

  console.log("Homepage generation successfully mapped with fixed internal content chronological sorting.");
})();
