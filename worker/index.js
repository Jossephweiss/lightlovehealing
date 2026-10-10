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

// Optional: set the TELEGRAM_USER secret (CallMeBot, e.g. "@name") to enable.
async function notifyTelegram(env, c) {
  if (!env.TELEGRAM_USER) return;
  const url = new URL('https://api.callmebot.com/text.php');
  url.searchParams.set('user', env.TELEGRAM_USER);
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
  for (const notify of [notifyEmail, notifyWhatsApp, notifyTelegram]) {
    ctx.waitUntil(notify(env, contact).catch((err) => console.error(notify.name, err)));
  }

  return json({ ok: true });
}

const CHAT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const SYSTEM_PROMPT = `You are the friendly assistant on the website of "Light Love Healing" (lightlovehealing.org).
Light Love Healing is a space for healing, spiritual growth and inner connection. It offers three things:
1. Healing sessions — personal sessions to balance body, mind and spirit.
2. Content & inspiration — articles, meditations and tools for a life full of light.
3. Workshops & courses — group gatherings and learning paths.
The full website is still being built.

Rules:
- Reply in the same language the visitor writes in (Hebrew or English). Use natural, correct Hebrew.
- Be warm, calm and concise: 1–4 short sentences.
- Never invent details you were not given: no prices, dates, locations, names, durations or methods. If asked, say these details will be shared soon and invite the visitor to leave their details in the contact form on this page.
- You do not give medical, psychological or legal advice and never suggest healing replaces medical care. In distress or emergency, direct the visitor to a professional or emergency services (in Israel: 101, ERAN 1201).
- Stay on topics related to Light Love Healing. Politely decline unrelated requests.
- When the visitor wants to book, ask a detailed question or be contacted, point them to the contact form below the chat.`;

async function handleChat(request, env) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'invalid' }, 400);
  }

  const history = (Array.isArray(data.messages) ? data.messages : [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }));
  if (history.at(-1)?.role !== 'user') return json({ error: 'invalid' }, 400);

  try {
    const result = await env.AI.run(CHAT_MODEL, {
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
      max_tokens: 400,
      temperature: 0.5,
    });
    const reply = (result.response || '').trim();
    if (!reply) throw new Error('empty reply');
    return json({ reply });
  } catch (err) {
    console.error('chat', err);
    return json({ error: 'ai' }, 502);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/contact') return handleContact(request, env, ctx);
    if (url.pathname === '/api/chat') return handleChat(request, env);
    if (url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    return env.ASSETS.fetch(request);
  },
};
