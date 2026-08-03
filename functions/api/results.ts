// GET /api/results
//
// Returns the tallies, but only to someone who has already voted. The gate is
// a signed cookie issued by /api/vote — decided on the server, so flipping a
// localStorage flag in devtools does not get you in.
//
// This is deliberately low-stakes: the only person harmed by seeing results
// early is that person, whose own answer is then anchored. It is worth doing
// properly because it is cheap, not because it is critical.

import { Env, VOTED_COOKIE, json, readCookie, tally, verifyVotedCookie } from './_shared';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const voted = await verifyVotedCookie(readCookie(request, VOTED_COOKIE), env.HASH_SALT);
  if (!voted) {
    return json({ error: 'not_voted' }, { status: 403 });
  }

  const results = await tally(env.DB);

  return json(results, {
    headers: {
      // Per-visitor response, so this must not be cached by a shared cache.
      // The tally query is trivial; if this page ever gets real traffic,
      // move the aggregate into a public, edge-cached endpoint instead.
      'Cache-Control': 'private, max-age=30',
    },
  });
};
