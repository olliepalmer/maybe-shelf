// netlify/functions/ingest.js
// Single endpoint for the iOS Share Sheet shortcut.
// Accepts text, a URL, or base64 images — extracts events, deduplicates, saves to Notion.

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
    // body.text: string (caption, URL, or freeform text)
    // body.images: array of { base64, type } (optional)
    // body.sourceUrl: string (optional)

    const { text, images, sourceUrl } = body;

    // ── STEP 1: Extract events via Claude ─────────────────────────────────────
    const userContent = [];

    if (images && images.length > 0) {
      for (const img of images) {
        userContent.push({
          type: 'image',
          source: { type: 'base64', media_type: img.type || 'image/jpeg', data: img.base64 },
        });
      }
    }

    userContent.push({
      type: 'text',
      text: `Extract ALL events from this content.
${text ? `Text/URL: ${text}` : ''}
${sourceUrl ? `Source: ${sourceUrl}` : ''}

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

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
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

    const claudeData = await claudeRes.json();
    const raw = claudeData.content
      .map(b => b.text || '')
      .join('')
      .trim()
      .replace(/```json|```/g, '')
      .trim();

    let extracted = JSON.parse(raw);
    if (!Array.isArray(extracted)) extracted = [extracted];

    // ── STEP 2: Fetch existing events for dedup ───────────────────────────────
    const existingRes = await fetch(
      `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
      {
        method: 'POST',
        headers: notionHeaders,
        body: JSON.stringify({ page_size: 100 }),
      }
    );
    const existingData = await existingRes.json();
    const existing = (existingData.results || []).map(p => ({
      id: p.id,
      name: p.properties?.Name?.title?.[0]?.plain_text?.toLowerCase().trim() || '',
      date: p.properties?.Date?.date?.start || null,
    }));

    // ── STEP 3: For each extracted event, create or merge ─────────────────────
    let created = 0;
    let merged = 0;

    for (const ev of extracted) {
      const evName = (ev.name || '').toLowerCase().trim();
      const evDate = ev.date || null;

      // Check duplicate: same name + same date
      const duplicate = existing.find(e => {
        const nameMatch = e.name === evName;
        const dateMatch = e.date === evDate;
        return nameMatch && dateMatch;
      });

      if (duplicate) {
        // Merge: append description as new block if we have new info
        if (ev.description) {
          await fetch(`https://api.notion.com/v1/blocks/${duplicate.id}/children`, {
            method: 'PATCH',
            headers: notionHeaders,
            body: JSON.stringify({
              children: [{
                object: 'block',
                type: 'paragraph',
                paragraph: {
                  rich_text: [{ type: 'text', text: { content: `[Update] ${ev.description}` } }],
                },
              }],
            }),
          });
        }
        merged++;
      } else {
        // Create new event
        const properties = buildProperties(ev);
        const payload = {
          parent: { database_id: DATABASE_ID },
          properties,
        };
        if (ev.description) {
          payload.children = [{
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content: ev.description } }],
            },
          }];
        }
        await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: notionHeaders,
          body: JSON.stringify(payload),
        });
        created++;
      }
    }

    // ── STEP 4: Return summary ─────────────────────────────────────────────────
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
