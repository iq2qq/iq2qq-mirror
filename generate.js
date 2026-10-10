const fs = require('fs');
const path = require('path');

(async () => {
  const postsDir = 'posts';
  const publicDir = 'public';
  const targetPublicPostsDir = path.join(publicDir, 'posts');

  // Ensure deployment paths exist
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

  // Read all manually uploaded posts from the directory
  const files = fs.readdirSync(postsDir).filter(file => file.endsWith('.html'));

  if (files.length > 0) {
    // Sort files by creation or modification time so newer posts appear first
    const sortedFiles = files.map(file => {
      const filePath = path.join(postsDir, file);
      const stat = fs.statSync(filePath);
      return { file, mtime: stat.mtime };
    }).sort((a, b) => b.mtime - a.mtime);

    console.log(`Building homepage layouts for ${sortedFiles.length} uploaded essays...`);

    for (const item of sortedFiles) {
      const filename = item.file;
      const cleanName = filename.replace('.html', '');
      
      // Capitalize slug words to create a readable title link
      const title = cleanName
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      index += `
  <div class="post">
    <h2><a href="/posts/${filename}">${title}</a></h2>
  </div>`;
    }
  } else {
    index += `
    <div style="background: #fdfdfd; padding: 2rem; border: 1px dashed #ccc; text-align: center; border-radius: 4px; color: #666;">
      <h3>Your Mirror Archive is Ready</h3>
      <p>Drag and drop your exported Substack HTML files into the <strong>posts</strong> folder on GitHub to populate this list.</p>
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
  
  // Sync your posts into the public web root folder
  if (fs.existsSync(postsDir)) {
    fs.cpSync(postsDir, targetPublicPostsDir, { recursive: true });
  }

  console.log("Homepage generation successfully mapped.");
})();
