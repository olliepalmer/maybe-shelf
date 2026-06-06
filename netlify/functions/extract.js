// netlify/functions/extract.js
// Calls Anthropic API server-side to extract event details from text or image

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }

  try {
    const { text, imageBase64, imageType } = JSON.parse(event.body);

    const userContent = [];

    if (imageBase64) {
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageType || 'image/jpeg',
          data: imageBase64,
        },
      });
    }

    userContent.push({
      type: 'text',
      text: `Extract event details from this ${imageBase64 ? 'screenshot' : 'text'}.

Return ONLY a JSON object with these fields:
- name: event name (string, required)
- date: ISO date YYYY-MM-DD if mentioned, null otherwise. If only month/year use 1st of month.
- location: venue or city if mentioned, null otherwise
- type: one of Music, Film, Art, Food, Market, Sport, Other — pick the best fit, null if unclear
- description: 1-3 sentence summary of what this event is, capturing its vibe. null if nothing to add.
- venueUrl: website URL if mentioned, null otherwise
- sourceUrl: Instagram or original URL if visible, null otherwise
- imageUrl: if there's a clear event poster image URL mentioned, null otherwise
- people: null (leave blank, user fills this in)

${text ? `Text: "${text}"` : 'Extract from the screenshot above.'}

Return only the raw JSON object. No markdown, no explanation.`,
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
        max_tokens: 600,
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

    const parsed = JSON.parse(raw);

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
