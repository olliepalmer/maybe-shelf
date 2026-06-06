// netlify/functions/notion.js
const NOTION_KEY = process.env.NOTION_API_KEY;
const SITE_TOKEN = process.env.SITE_TOKEN;
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

  // ── AUTH ─────────────────────────────────────────────────────────────────
  const token = event.headers['x-site-token'] || event.queryStringParameters?.token;
  if (!token || token !== SITE_TOKEN) {
    return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

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

      // Fetch page content (descriptions) for all pages in parallel
      const pages = data.results || [];
      const withContent = await Promise.all(pages.map(async (page) => {
        try {
          const blockRes = await fetch(
            `https://api.notion.com/v1/blocks/${page.id}/children?page_size=5`,
            { headers }
          );
          const blockData = await blockRes.json();
          const description = (blockData.results || [])
            .filter(b => b.type === 'paragraph')
            .map(b => b.paragraph.rich_text.map(t => t.plain_text).join(''))
            .filter(Boolean)
            .join(' ')
            || null;
          return { ...page, _description: description };
        } catch {
          return { ...page, _description: null };
        }
      }));

      const events = withContent.map(mapPage);
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
        body: JSON.stringify(mapPage({ ...data, _description: body.description || null })),
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


    // ── MERGE (update existing with new info, append to description) ──────────
    if (action === 'merge' && event.httpMethod === 'POST') {
      const { id, description, ...body } = JSON.parse(event.body);
      // Update properties with any new non-null values
      const cleanBody = Object.fromEntries(
        Object.entries(body).filter(([_, v]) => v !== null && v !== undefined && v !== '')
      );
      if (Object.keys(cleanBody).length > 0) {
        await fetch(`https://api.notion.com/v1/pages/${id}`, {
          method: 'PATCH', headers, body: JSON.stringify({ properties: buildProperties(cleanBody) }),
        });
      }
      // Append new description as a new paragraph block if provided
      if (description) {
        await fetch(`https://api.notion.com/v1/blocks/${id}/children`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            children: [{
              object: 'block', type: 'paragraph',
              paragraph: { rich_text: [{ type: 'text', text: { content: `[Update] ${description}` } }] },
            }],
          }),
        });
      }
      return {
        statusCode: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, merged: true }),
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
    description: page._description || null,
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
