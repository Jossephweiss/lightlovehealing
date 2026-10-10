const INTERESTS = ['sessions', 'content', 'workshops', 'other'];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const INTEREST_HE = { sessions: 'טיפולים', content: 'תוכן והשראה', workshops: 'סדנאות וקורסים', other: 'אחר' };

function summary(c) {
  return [
    `שם: ${c.name}`,
    c.phone && `טלפון: ${c.phone}`,
    c.email && `אימייל: ${c.email}`,
    `תחום: ${INTEREST_HE[c.interest]}`,
    c.message && `הודעה:\n${c.message}`,
  ]
    .filter(Boolean)
    .join('\n');
}

async function notifyEmail(env, c) {
  await env.NOTIFY.send({
    from: { name: 'Light Love Healing', email: 'notify@lightlovehealing.org' },
    to: 'jw.gandr@gmail.com',
    ...(c.email && { replyTo: c.email }),
    subject: `פנייה חדשה מהאתר: ${c.name}`,
    text: `${summary(c)}\n\n— lightlovehealing.org`,
  });
}

// Optional: set WHATSAPP_PHONE and WHATSAPP_APIKEY secrets (CallMeBot) to enable.
async function notifyWhatsApp(env, c) {
  if (!env.WHATSAPP_PHONE || !env.WHATSAPP_APIKEY) return;
  const url = new URL('https://api.callmebot.com/whatsapp.php');
  url.searchParams.set('phone', env.WHATSAPP_PHONE);
  url.searchParams.set('apikey', env.WHATSAPP_APIKEY);
  url.searchParams.set('text', `🌟 פנייה חדשה מהאתר\n${summary(c)}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CallMeBot ${res.status}`);
}

async function handleContact(request, env, ctx) {
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

  const contact = { name, email, phone, interest, message };
  for (const notify of [notifyEmail, notifyWhatsApp]) {
    ctx.waitUntil(notify(env, contact).catch((err) => console.error(notify.name, err)));
  }

  return json({ ok: true });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/contact') return handleContact(request, env, ctx);
    if (url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    return env.ASSETS.fetch(request);
  },
};
