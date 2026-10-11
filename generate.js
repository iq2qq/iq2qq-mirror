const fs = require('fs');
const path = require('path');

function unescapeXML(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
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

  // Track posts chronologically for the home page builder
  const verifiedChronologicalPosts = [];

  // --- STEP 1: FETCH NEW POSTS AUTOMATICALLY FROM THE RSS FEED ---
  try {
    console.log("Checking live RSS feed for brand new posts...");
    const response = await fetch('https://iq2qq.com');
    if (response.ok) {
      const rssText = await response.text();
      const items = rssText.match(/<item>[\s\S]*?<\/item>/g) || [];
      
      for (const item of items) {
        const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || item.match(/<title>([\s\S]*?)<\/title>/);
        const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);
        const pubDateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
        const contentMatch = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/) || item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);
        
        const rawTitle = titleMatch ? titleMatch[1] : '';
        const cleanTitle = unescapeXML(rawTitle.replace(/^"|"\$/g, '')).trim();
        const link = linkMatch ? linkMatch[1].trim() : '';
        const pubDateStr = pubDateMatch ? pubDateMatch[1].trim() : '';
        let bodyContent = contentMatch ? contentMatch[1] : '';
        
        if (link && cleanTitle) {
          const urlParts = link.split('?')[0].split('/');
          const slug = urlParts[urlParts.length - 1] || '';
          const file = `${slug}.html`;
          const localFilePath = path.join(postsDir, file);
          
          // CRITICAL CHECK: Only download if you haven't manually put it in already
          if (!fs.existsSync(localFilePath)) {
            console.log(`New post detected on Substack: "${cleanTitle}". Saving automatically...`);
            
            // Clean scripts from feed data
            bodyContent = bodyContent.split('<script').join('<!--<script');
            bodyContent = bodyContent.split('</script>').join('</script>-->');
            bodyContent = bodyContent.split('<noscript').join('<!--<noscript');
            bodyContent = bodyContent.split('</noscript>').join('</noscript>-->');

            // Apply your Twitter embed fix to the new content
            const tweetLinkRegex = /(?:<a[^>]*href=["']([^"']*(?:twitter|x)\.com\/[a-zA-Z0-9_]+\/status\/[0-9]+[^"']*)["'][^>]*>[\s\S]*?<\/a>)|(https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[a-zA-Z0-9_]+\/status\/[0-9]+)/gi;
            bodyContent = bodyContent.replace(tweetLinkRegex, (match, capturedGroupLink, rawPlainUrl) => {
              const targetUrl = capturedGroupLink || rawPlainUrl;
              return `<blockquote class="twitter-tweet" data-align="center"><a href="${targetUrl}"></a></blockquote>`;
            });

            const cleanDate = new Date(pubDateStr);
            const displayDate = cleanDate.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
            const originalSourceLink = `https://iq2qq.com{slug}`;

            const highFidelityStyles = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${cleanTitle}</title>
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
    .twitter-tweet { margin: 2.5rem auto !important; }
  </style>
  <script async src="https://twitter.com" charset="utf-8"></script>
</head>
<body>
  <div class="archive-header">
    <a href="/">← Back to Archive</a>
    <a href="${originalSourceLink}" target="_blank">View Original Source ↗</a>
  </div>
  <h1 class="post-title">${cleanTitle}</h1>
  <div class="post-meta">Published on ${displayDate} | Deep link: <a href="${originalSourceLink}" target="_blank">://iq2qq.com{slug}</a></div>
  <div class="post-body">${bodyContent}</div>
</body>
</html>`;

            // Save new post to local folder so it's committed safely
            fs.writeFileSync(localFilePath, highFidelityStyles);
          }
        }
      }
    }
  } catch (error) {
    console.error("RSS fetch error (using existing local /posts files only):", error);
  }

  // --- STEP 2: BUILD COMPILATION TRACKER FROM ALL LOCAL HTML FILES ---
  const files = fs.readdirSync(postsDir).filter(file => file.endsWith('.html'));

  if (files.length > 0) {
    for (const file of files) {
      const filePath = path.join(postsDir, file);
      let htmlContent = fs.readFileSync(filePath, 'utf-8');

      // Attempt to pull the title dynamically directly from inside the page markup
      let title = '';
      const titleTagMatch = htmlContent.match(/<title>([\s\S]*?)<\/title>/);
      if (titleTagMatch && titleTagMatch[1]) {
        title = titleTagMatch[1].trim();
      } else {
        title = file.replace('.html', '').replace(/[-_]/g, ' ');
        title = title.charAt(0).toUpperCase() + title.slice(1);
      }

      // Read file timestamp metadata for exact list chronology
      const pubDate = fs.statSync(filePath).mtime;

      // Make sure Twitter conversion runs cleanly over your pre-loaded pages too
      const tweetLinkRegex = /(?:<a[^>]*href=["']([^"']*(?:twitter|x)\.com\/[a-zA-Z0-9_]+\/status\/[0-9]+[^"']*)["'][^>]*>[\s\S]*?<\/a>)|(https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[a-zA-Z0-9_]+\/status\/[0-9]+)/gi;
      htmlContent = htmlContent.replace(tweetLinkRegex, (match, capturedGroupLink, rawPlainUrl) => {
        const targetUrl = capturedGroupLink || rawPlainUrl;
        return `<blockquote class="twitter-tweet" data-align="center"><a href="${targetUrl}"></a></blockquote>`;
      });

      // Inject your global script wrapper to support layouts
      if (!htmlContent.includes('://twitter.com')) {
        if (htmlContent.includes('</head>')) {
          htmlContent = htmlContent.replace('</head>', '<script async src="https://twitter.com" charset="utf-8"></script></head>');
        }
      }

      // Write compiled page to output folder
      fs.writeFileSync(path.join(targetPublicPostsDir, file), htmlContent);
      verifiedChronologicalPosts.push({ file, title, pubDate });
    }

    // Sort all combined items (old manual ones + fresh auto ones) by date
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












