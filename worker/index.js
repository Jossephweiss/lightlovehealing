const INTERESTS = ['sessions', 'content', 'workshops', 'other'];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function handleContact(request, env) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'invalid' }, 400);
  }

  // Honeypot: real visitors never fill this hidden field.
  if (clean(data.website, 200)) return json({ ok: true });

  const name = clean(data.name, 100);
  const email = clean(data.email, 200);
  const phone = clean(data.phone, 40);
  const interest = INTERESTS.includes(data.interest) ? data.interest : 'other';
  const message = clean(data.message, 3000);
  const lang = data.lang === 'en' ? 'en' : 'he';

  if (!name) return json({ error: 'name' }, 400);
  if (!email && !phone) return json({ error: 'contact' }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'email' }, 400);

  await env.DB.prepare(
    'INSERT INTO contacts (name, email, phone, interest, message, lang) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(name, email || null, phone || null, interest, message || null, lang)
    .run();

  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/contact') return handleContact(request, env);
    if (url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    return env.ASSETS.fetch(request);
  },
};
