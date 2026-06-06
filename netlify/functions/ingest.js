// netlify/functions/ingest.js
const NOTION_KEY = process.env.NOTION_API_KEY;
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const SITE_TOKEN = process.env.SITE_TOKEN;
const NOTION_VERSION = '2022-06-28';

const notionHeaders = {
  'Authorization': `Bearer ${NOTION_KEY}`,
  'Notion-Version': NOTION_VERSION,
  'Content-Type': 'application/json',
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-site-token',
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
    const body = JSON.parse(event.body);
    const { text, sourceUrl } = body;

    // ── Normalise images ───────────────────────────────────────────────────────
    // Shortcuts sends ImagesJSON as a string like:
    // {"base64":"...","type":"image/jpeg"}
    // or multiple items separated by newlines (since Add to Variable joins with newline)
    // We need to turn this into an array of {base64, type} objects
    let images = [];
    const rawImages = body.images;

    if (rawImages) {
      if (Array.isArray(rawImages)) {
        images = rawImages;
      } else if (typeof rawImages === 'string' && rawImages.trim().length > 0) {
        // Try splitting by newline first (Shortcuts joins list items with \n)
        const lines = rawImages.split('\n').map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.base64) images.push(parsed);
          } catch {
            // Plain base64 string
            if (line.length > 100) images.push({ base64: line, type: 'image/jpeg' });
          }
        }
        // If that didn't work, try parsing the whole thing as JSON
        if (images.length === 0) {
          try {
            const parsed = JSON.parse(rawImages);
            images = Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            // Give up on images, just use text
          }
        }
      }
    }

    // ── Build Claude content ───────────────────────────────────────────────────
    const userContent = [];

    for (const img of images) {
      const base64 = typeof img === 'string' ? img : img.base64;
      const mediaType = img.type || 'image/jpeg';
      if (base64 && base64.length > 100) {
        userContent.push({
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64.replace(/\s/g, '') },
        });
      }
    }

    // Always add text prompt
    userContent.push({
      type: 'text',
      text: `Extract ALL events from this content.
${text ? `Text/URL: ${text}` : ''}
${sourceUrl ? `Source: ${sourceUrl}` : ''}
${userContent.length === 1 ? 'No images provided — extract from text only.' : ''}

Return ONLY a JSON array. Each event object must have:
- name: string (required)
- date: ISO date YYYY-MM-DD or null
- location: string or null
- type: one of Music, Film, Art, Food, Market, Sport, Other, or null
- description: 1-2 sentence summary of the event vibe, or null
- venueUrl: URL if mentioned, or null
- sourceUrl: "${sourceUrl || text || null}"

Return ALL events found. If one event, return array of one.
Raw JSON array only — no markdown, no explanation.`,
    });

    // ── Call Claude ────────────────────────────────────────────────────────────
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    const claudeData = await claudeRes.json();

    if (!claudeData.content || !Array.isArray(claudeData.content)) {
      return {
        statusCode: 500,
        headers: cors,
        body: JSON.stringify({ error: 'Claude API error', detail: claudeData }),
      };
    }

    const raw = claudeData.content
      .map(b => b.text || '')
      .join('')
      .trim()
      .replace(/```json|```/g, '')
      .trim();

    let extracted;
    try {
      extracted = JSON.parse(raw);
      if (!Array.isArray(extracted)) extracted = [extracted];
    } catch {
      return {
        statusCode: 500,
        headers: cors,
        body: JSON.stringify({ error: 'Could not parse Claude response', raw }),
      };
    }

    // ── Fetch existing events for dedup ────────────────────────────────────────
    const existingRes = await fetch(
      `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
      { method: 'POST', headers: notionHeaders, body: JSON.stringify({ page_size: 100 }) }
    );
    const existingData = await existingRes.json();
    const existing = (existingData.results || []).map(p => ({
      id: p.id,
      name: p.properties?.Name?.title?.[0]?.plain_text?.toLowerCase().trim() || '',
      date: p.properties?.Date?.date?.start || null,
    }));

    // ── Create or merge each event ─────────────────────────────────────────────
    let created = 0;
    let merged = 0;

    for (const ev of extracted) {
      const evName = (ev.name || '').toLowerCase().trim();
      const evDate = ev.date || null;

      const duplicate = existing.find(e => e.name === evName && e.date === evDate);

      if (duplicate) {
        if (ev.description) {
          await fetch(`https://api.notion.com/v1/blocks/${duplicate.id}/children`, {
            method: 'PATCH',
            headers: notionHeaders,
            body: JSON.stringify({
              children: [{
                object: 'block', type: 'paragraph',
                paragraph: { rich_text: [{ type: 'text', text: { content: `[Update] ${ev.description}` } }] },
              }],
            }),
          });
        }
        merged++;
      } else {
        const payload = {
          parent: { database_id: DATABASE_ID },
          properties: buildProperties(ev),
        };
        if (ev.description) {
          payload.children = [{
            object: 'block', type: 'paragraph',
            paragraph: { rich_text: [{ type: 'text', text: { content: ev.description } }] },
          }];
        }
        await fetch('https://api.notion.com/v1/pages', {
          method: 'POST', headers: notionHeaders, body: JSON.stringify(payload),
        });
        created++;
      }
    }

    const parts = [];
    if (created > 0) parts.push(`${created} event${created > 1 ? 's' : ''} added`);
    if (merged > 0) parts.push(`${merged} duplicate${merged > 1 ? 's' : ''} updated`);
    const summary = parts.length > 0 ? parts.join(', ') : 'Nothing new found';

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, summary, created, merged }),
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

function buildProperties(ev) {
  const props = {};
  if (ev.name) props.Name = { title: [{ text: { content: ev.name } }] };
  if (ev.date) props.Date = { date: { start: ev.date } };
  if (ev.location) props.Location = { rich_text: [{ text: { content: ev.location } }] };
  if (ev.type) props.Type = { select: { name: ev.type } };
  props.Status = { select: { name: 'Maybe' } };
  if (ev.venueUrl) props['Venue URL'] = { url: ev.venueUrl };
  if (ev.sourceUrl) props['Source URL'] = { url: ev.sourceUrl };
  return props;
}