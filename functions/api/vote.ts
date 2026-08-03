// POST /api/vote
//
// Accepts one submission, then returns the current tallies so the page can
// draw the chart immediately without a second round trip.

import {
  Env,
  MIN_ELAPSED_MS,
  NEUROMODULATORS,
  PALETTE_KEYS,
  RATE_LIMIT_PER_DAY,
  VOTED_COOKIE,
  json,
  makeVotedCookieValue,
  readCookie,
  submitterHash,
  tally,
  verifyVotedCookie,
} from './_shared';

const PALETTE = new Set<string>(PALETTE_KEYS);

async function verifyTurnstile(token: string, secret: string, ip: string | null) {
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  });
  const data = (await res.json()) as { success: boolean };
  return data.success === true;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // --- 1. Already voted in this browser? -----------------------------------
  if (await verifyVotedCookie(readCookie(request, VOTED_COOKIE), env.HASH_SALT)) {
    return json({ error: 'already_voted' }, { status: 409 });
  }

  // --- 2. Parse and validate the payload -----------------------------------
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_json' }, { status: 400 });
  }

  const answers = body?.answers;
  if (typeof answers !== 'object' || answers === null) {
    return json({ error: 'missing_answers' }, { status: 400 });
  }
  for (const nm of NEUROMODULATORS) {
    if (!PALETTE.has(answers[nm])) {
      return json({ error: 'invalid_colour', field: nm }, { status: 400 });
    }
  }

  const neuroWork = body?.neuroWork === true ? 1 : body?.neuroWork === false ? 0 : null;
  if (neuroWork === null) {
    return json({ error: 'missing_background' }, { status: 400 });
  }

  const order: unknown = body?.order;
  const orderOk =
    Array.isArray(order) &&
    order.length === NEUROMODULATORS.length &&
    NEUROMODULATORS.every((nm) => order.includes(nm));
  if (!orderOk) {
    return json({ error: 'invalid_order' }, { status: 400 });
  }

  const elapsed = Number(body?.elapsedMs);
  if (!Number.isFinite(elapsed) || elapsed < MIN_ELAPSED_MS) {
    return json({ error: 'too_fast' }, { status: 400 });
  }

  // --- 3. Turnstile --------------------------------------------------------
  const token = body?.turnstileToken;
  if (typeof token !== 'string' || token.length === 0) {
    return json({ error: 'missing_turnstile' }, { status: 400 });
  }
  const ip = request.headers.get('CF-Connecting-IP');
  if (!(await verifyTurnstile(token, env.TURNSTILE_SECRET, ip))) {
    return json({ error: 'turnstile_failed' }, { status: 403 });
  }

  // --- 4. Rate limit on the pseudonymous hash ------------------------------
  const hash = await submitterHash(request, env.HASH_SALT);
  const recent = await env.DB
    .prepare(
      `SELECT COUNT(*) AS n FROM responses
       WHERE submitter_hash = ?1 AND created_at > datetime('now', '-1 day')`,
    )
    .bind(hash)
    .first<{ n: number }>();

  if ((recent?.n ?? 0) >= RATE_LIMIT_PER_DAY) {
    return json({ error: 'rate_limited' }, { status: 429 });
  }

  // --- 5. Insert -----------------------------------------------------------
  const country = (request as any).cf?.country ?? null;

  await env.DB
    .prepare(
      `INSERT INTO responses
         (serotonin, noradrenaline, dopamine, acetylcholine,
          neuro_work, presentation_order, submitter_hash, country, elapsed_ms)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    )
    .bind(
      answers.serotonin,
      answers.noradrenaline,
      answers.dopamine,
      answers.acetylcholine,
      neuroWork,
      (order as string[]).join(','),
      hash,
      country,
      Math.round(elapsed),
    )
    .run();

  // --- 6. Return the tallies, and mark this browser as having voted --------
  const results = await tally(env.DB);
  const cookie = await makeVotedCookieValue(env.HASH_SALT);

  return json(results, {
    headers: {
      'Set-Cookie': `${VOTED_COOKIE}=${cookie}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
    },
  });
};
