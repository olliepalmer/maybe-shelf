// netlify/functions/notion.js
const NOTION_KEY = process.env.NOTION_API_KEY;
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const NOTION_VERSION = '2022-06-28';

const headers = {
  'Authorization': `Bearer ${NOTION_KEY}`,
  'Notion-Version': NOTION_VERSION,
  'Content-Type': 'application/json',
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }

  const action = event.queryStringParameters?.action;

  try {
    // ── DEBUG ────────────────────────────────────────────────────────────────
    if (action === 'debug') {
      const testRes = await fetch(
        `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
        { method: 'POST', headers, body: JSON.stringify({ page_size: 1 }) }
      );
      const testData = await testRes.json();
      return {
        statusCode: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hasKey: !!NOTION_KEY,
          keyPrefix: NOTION_KEY ? NOTION_KEY.slice(0, 14) : null,
          databaseId: DATABASE_ID,
          notionStatus: testRes.status,
          notionResponse: testData,
        }),
      };
    }

    // ── LIST ─────────────────────────────────────────────────────────────────
    if (action === 'list') {
      const res = await fetch(
        `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            sorts: [{ property: 'Date', direction: 'ascending' }],
            page_size: 100,
          }),
        }
      );
      const data = await res.json();
      const events = (data.results || []).map(mapPage);
      return {
        statusCode: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify(events),
      };
    }

    // ── CREATE ───────────────────────────────────────────────────────────────
    if (action === 'create' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const properties = buildProperties(body);
      const payload = { parent: { database_id: DATABASE_ID }, properties };
      if (body.description) {
        payload.children = [{
          object: 'block', type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content: body.description } }] },
        }];
      }
      if (body.imageUrl) {
        payload.cover = { type: 'external', external: { url: body.imageUrl } };
      }
      const res = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST', headers, body: JSON.stringify(payload),
      });
      const data = await res.json();
      return {
        statusCode: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify(mapPage(data)),
      };
    }

    // ── UPDATE ───────────────────────────────────────────────────────────────
    if (action === 'update' && event.httpMethod === 'POST') {
      const { id, ...body } = JSON.parse(event.body);
      const res = await fetch(`https://api.notion.com/v1/pages/${id}`, {
        method: 'PATCH', headers, body: JSON.stringify({ properties: buildProperties(body) }),
      });
      const data = await res.json();
      return {
        statusCode: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify(mapPage(data)),
      };
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (action === 'delete' && event.httpMethod === 'POST') {
      const { id } = JSON.parse(event.body);
      await fetch(`https://api.notion.com/v1/pages/${id}`, {
        method: 'PATCH', headers, body: JSON.stringify({ archived: true }),
      });
      return {
        statusCode: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true }),
      };
    }

    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Unknown action' }) };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};

function mapPage(page) {
  const p = page.properties || {};
  return {
    id: page.id,
    name: p.Name?.title?.[0]?.plain_text || '',
    date: p.Date?.date?.start || null,
    location: p.Location?.rich_text?.[0]?.plain_text || null,
    status: p.Status?.select?.name || 'Maybe',
    type: p.Type?.select?.name || null,
    people: p.People?.rich_text?.[0]?.plain_text || null,
    imageUrl: p['Image URL']?.url || page.cover?.external?.url || null,
    sourceUrl: p['Source URL']?.url || null,
    venueUrl: p['Venue URL']?.url || null,
    addedAt: page.created_time || null,
  };
}

function buildProperties(body) {
  const props = {};
  if (body.name !== undefined) props.Name = { title: [{ text: { content: body.name } }] };
  if (body.date !== undefined) props.Date = body.date ? { date: { start: body.date } } : { date: null };
  if (body.location !== undefined) props.Location = { rich_text: [{ text: { content: body.location || '' } }] };
  if (body.status !== undefined) props.Status = { select: { name: body.status } };
  if (body.type !== undefined) props.Type = body.type ? { select: { name: body.type } } : { select: null };
  if (body.people !== undefined) props.People = { rich_text: [{ text: { content: body.people || '' } }] };
  if (body.imageUrl !== undefined) props['Image URL'] = { url: body.imageUrl || null };
  if (body.sourceUrl !== undefined) props['Source URL'] = { url: body.sourceUrl || null };
  if (body.venueUrl !== undefined) props['Venue URL'] = { url: body.venueUrl || null };
  return props;
}
