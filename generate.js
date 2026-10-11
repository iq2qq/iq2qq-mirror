const fs = require('fs');
const path = require('path');

// Simple XML helper to unescape character entities from RSS feeds
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

  // Ensure our processing directories exist
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

  const verifiedChronologicalPosts = [];

  try {
    console.log("Connecting to Substack live stream pipeline...");
    const response = await fetch('https://iq2qq.com');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const rssText = await response.text();
    
    // Extract individual items from the XML feed
    const items = rssText.match(/<item>[\s\(\S\)]*?<\/item>/g) || [];
    console.log(`Discovered ${items.length} items on live feed. Synchronizing content...`);
    
    for (const item of items) {
      // Safely scrape content fields out of the XML structure
      const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || item.match(/<title>([\s\(\S\)]*?)<\/title>/);
      const linkMatch = item.match(/<link>([\s\(\S\)]*?)<\/link>/);
      const pubDateMatch = item.match(/<pubDate>([\s\(\S\)]*?)<\/pubDate>/);
      // Grab full text content directly from the RSS item payload 
      const contentMatch = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/) || item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || item.match(/<description>([\s\(\S\)]*?)<\/description>/);
      
      const rawTitle = titleMatch ? titleMatch[1] : '';
      const cleanTitle = unescapeXML(rawTitle.replace(/^"|"\$/g, '')).trim();
      const link = linkMatch ? linkMatch[1].trim() : '';
      const pubDateStr = pubDateMatch ? pubDateMatch[1].trim() : '';
      let bodyContent = contentMatch ? contentMatch[1] : '';
      
      if (link && cleanTitle) {
        // Parse out the trailing slug text string (e.g. from https://iq2qq.com)
        const urlParts = link.split('?')[0].split('/');
        const slug = urlParts[urlParts.length - 1] || '';
        const file = `${slug}.html`;
        const cleanDate = new Date(pubDateStr);
        
        if (isNaN(cleanDate.getTime())) continue;

        // --- SAFE SCRIPT NEUTRALIZATION ---
        // Scrub out tracking pixels or raw script payloads attached inside feed strings
        bodyContent = bodyContent.split('<script').join('<!--<script');
        bodyContent = bodyContent.split('</script>').join('</script>-->');
        bodyContent = bodyContent.split('<noscript').join('<!--<noscript');
        bodyContent = bodyContent.split('</noscript>').join('</noscript>-->');

        // --- ROBUST TWITTER ANCHOR TO EMBED CONVERTER ---
        const tweetLinkRegex = /(?:<a[^>]*href=["']([^"']*(?:twitter|x)\.com\/[a-zA-Z0-9_]+\/status\/[0-9]+[^"']*)["'][^>]*>[\s\(\S\)]*?<\/a>)|(https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[a-zA-Z0-9_]+\/status\/[0-9]+)/gi;
        bodyContent = bodyContent.replace(tweetLinkRegex, (match, capturedGroupLink, rawPlainUrl) => {
          const targetUrl = capturedGroupLink || rawPlainUrl;
          return `<blockquote class="twitter-tweet" data-align="center"><a href="${targetUrl}"></a></blockquote>`;
        });

        const displayDate = cleanDate.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
        const originalSourceLink = `https://iq2qq.com{slug}`;

        // --- STYLING & HIGH-FIDELITY INJECTION SHEET ---
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
  <div class="post-body">
    ${bodyContent}
  </div>
</body>
</html>`;

        // Write the dynamically generated post directly into the static output folder
        fs.writeFileSync(path.join(targetPublicPostsDir, file), highFidelityStyles);
        
        // Cache data memory structures for the home index builder
        verifiedChronologicalPosts.push({ file, title: cleanTitle, pubDate: cleanDate });
      }
    }
  } catch (error) {
    console.error("Critical Stream Interruption: Live RSS pipeline build crashed.", error);
  }

  // Build out chronological landing index page links
  if (verifiedChronologicalPosts.length > 0) {
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
    Last updated: ${new Date().toUTCString()}<br>
    Powered by GitHub Actions + Cloudflare Pages
  </p>
</body>
</html>`;

  fs.writeFileSync('public/index.html', index);
  console.log("High fidelity formatting layer successfully deployed via automated stream pipelines.");
})();











