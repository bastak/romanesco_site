// Shared helpers for the neuromodulator colour poll.
//
// Files prefixed with an underscore are NOT routable in Pages Functions —
// this is importable by vote.ts and results.ts but is not a public endpoint.

// ---------------------------------------------------------------------------
// IMPORTANT: this list is duplicated in src/pages/neuromodulator-colors.astro.
// The Astro build and the Pages Functions build are separate bundles and cannot
// safely share an import across that boundary, so the palette lives in two
// places. If you change one, change the other — the server rejects any colour
// key it does not recognise, so a mismatch shows up immediately as failed votes.
// ---------------------------------------------------------------------------
export const PALETTE_KEYS = [
  'red', 'orange', 'yellow', 'lime',
  'green', 'teal', 'cyan', 'blue',
  'indigo', 'violet', 'magenta', 'pink',
  'brown', 'grey', 'black', 'white',
] as const;

export const NEUROMODULATORS = [
  'serotonin',
  'noradrenaline',
  'dopamine',
  'acetylcholine',
] as const;

/** Max submissions accepted per submitter hash per 24h.
 *  Deliberately NOT 1: an entire institute can share one outbound IP, and
 *  blocking after the first vote would lock out everyone behind that NAT. */
export const RATE_LIMIT_PER_DAY = 5;

/** Submissions faster than this are almost certainly not a human reading
 *  four questions. */
export const MIN_ELAPSED_MS = 1500;

export const VOTED_COOKIE = 'nmc_voted';

export interface Env {
  DB: D1Database;
  TURNSTILE_SECRET: string;
  HASH_SALT: string;
}

/** Hex-encode an ArrayBuffer. */
function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Pseudonymous identifier for a submitter.
 *
 * SHA-256 over (ip + user-agent + secret salt). The salt matters: there are
 * only ~4 billion IPv4 addresses, so an unsalted hash could be reversed by
 * brute force. Salted, it cannot be reversed by anyone who does not hold the
 * salt. The raw IP never touches the database.
 */
export async function submitterHash(request: Request, salt: string): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const ua = request.headers.get('User-Agent') ?? 'unknown';
  const data = new TextEncoder().encode(`${ip}|${ua}|${salt}`);
  return toHex(await crypto.subtle.digest('SHA-256', data));
}

/** HMAC-SHA256, used to sign the "has voted" cookie so it cannot be forged. */
async function hmac(message: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return toHex(sig);
}

export async function makeVotedCookieValue(salt: string): Promise<string> {
  const issued = Date.now().toString();
  return `${issued}.${await hmac(issued, salt)}`;
}

export async function verifyVotedCookie(value: string | null, salt: string): Promise<boolean> {
  if (!value) return false;
  const [issued, sig] = value.split('.');
  if (!issued || !sig) return false;
  const expected = await hmac(issued, salt);
  // Constant-time-ish comparison. Lengths are fixed, so a simple XOR fold is fine.
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

/**
 * Tally every (neuromodulator, colour, neuro_work) cell in one query.
 * The page aggregates client-side, which lets it toggle between
 * "everyone" / "works in neuroscience" / "does not" with no extra requests.
 */
export async function tally(db: D1Database) {
  const sql = NEUROMODULATORS.map(
    (nm) => `SELECT '${nm}' AS nm, ${nm} AS color, neuro_work, COUNT(*) AS n
             FROM responses GROUP BY ${nm}, neuro_work`,
  ).join(' UNION ALL ');

  const [cells, totals] = await Promise.all([
    db.prepare(sql).all(),
    db.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN neuro_work = 1 THEN 1 ELSE 0 END) AS neuro
       FROM responses`,
    ).first<{ total: number; neuro: number | null }>(),
  ]);

  return {
    cells: cells.results,
    total: totals?.total ?? 0,
    neuro: totals?.neuro ?? 0,
  };
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}
