// netlify/functions/batch-extract.js
const SITE_TOKEN = process.env.SITE_TOKEN;
// Accepts multiple images + optional text, extracts multiple events in one Claude call

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
    const { images, text, sourceUrl } = JSON.parse(event.body);
    // images: array of { base64, type } objects
    // text: optional extra context string
    // sourceUrl: optional original URL

    const userContent = [];

    // Add all images
    if (images && images.length > 0) {
      for (const img of images) {
        userContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.type || 'image/jpeg',
            data: img.base64,
          },
        });
      }
    }

    userContent.push({
      type: 'text',
      text: `Extract ALL events from ${images?.length > 1 ? 'these images' : 'this content'}.
${text ? `Extra context: ${text}` : ''}
${sourceUrl ? `Source URL: ${sourceUrl}` : ''}

Return ONLY a JSON array of event objects. Each object must have:
- name: event name (string, required)
- date: ISO date YYYY-MM-DD if mentioned, null if not. If only month/year, use 1st of that month.
- location: venue or city if mentioned, null otherwise
- type: one of Music, Film, Art, Food, Market, Sport, Other — best fit, null if unclear
- description: 1-2 sentence summary capturing the vibe and key details. null if nothing useful.
- venueUrl: website URL if mentioned, null otherwise
- sourceUrl: "${sourceUrl || null}"
- imageUrl: null

If multiple events are present (e.g. a weekly programme), return ALL of them as separate objects in the array.
If only one event, return an array with one object.

Return only the raw JSON array. No markdown, no explanation, no preamble.`,
    });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    const data = await res.json();
    const raw = data.content
      .map((b) => b.text || '')
      .join('')
      .trim()
      .replace(/```json|```/g, '')
      .trim();

    let parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) parsed = [parsed];

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
