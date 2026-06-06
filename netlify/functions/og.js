// netlify/functions/og.js
const SITE_TOKEN = process.env.SITE_TOKEN;
// Fetches Open Graph metadata from a URL to get preview image + title

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }

  // ── AUTH ───────────────────────────────────────────────────────────────────
  const token = event.headers['x-site-token'];
  if (!token || token !== SITE_TOKEN) {
    return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const { url } = JSON.parse(event.body);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MaybeShelf/1.0)' },
      redirect: 'follow',
    });
    const html = await res.text();

    const get = (prop) => {
      const match =
        html.match(new RegExp(`<meta[^>]*property=["']og:${prop}["'][^>]*content=["']([^"']+)["']`, 'i')) ||
        html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:${prop}["']`, 'i'));
      return match ? match[1] : null;
    };

    const og = {
      title: get('title') || null,
      description: get('description') || null,
      image: get('image') || null,
      siteName: get('site_name') || null,
    };

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify(og),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: null, image: null, description: null }),
    };
  }
};
