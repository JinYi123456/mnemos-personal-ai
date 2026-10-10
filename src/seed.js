import { uuid } from './util.js';

/**
 * Seed a rich demo vault so the galaxy is instantly beautiful and the agent
 * has something to recall on first run. Ids are real sha256 hashes generated
 * at seed time (so they are stable within a vault but unique per install).
 * @param {import('./store.js').Store} store
 */
export function seedDemoVault(store) {
  const now = Date.now();
  const items = [
    ['Works on a personal knowledge app called "Nebula Notes" as a side project', 0.8, 2],
    ['Prefers concise answers with concrete next steps over long explanations', 0.9, 5],
    ['Is preparing a demo of Nebula Notes for a small meetup on November 12', 0.75, 1],
    ['Loves stargazing; keeps a small telescope on the balcony', 0.7, 3],
    ['Is learning to play the keyboard, practicing ~20 minutes after dinner', 0.65, 4],
    ['Drinks oat milk flat whites; allergic to dairy', 0.95, 8],
    ['Is planning a trip to Kyoto next spring, wants to see the cherry blossoms', 0.7, 2],
    ['Runs every Tuesday and Thursday morning with friend Sam from the climbing gym', 0.6, 6],
    ['Is nervous about presenting; feels calmer after rehearsing aloud twice', 0.68, 3],
    ['Uses a paper notebook for morning pages, phone app for tasks', 0.6, 5],
    ['Wants to read one book per month; currently reading "The Overstory"', 0.62, 4],
    ['Cat named Pixel sleeps on the keyboard during video calls', 0.75, 3],
    ['Saving for a new camera lens; skipped buying it twice last quarter', 0.55, 2],
    ['Prefers Voicememos style: short bullet updates over long paragraphs', 0.7, 4],
    ['Teaches a small robotics class for kids on Saturday mornings', 0.65, 3],
    ['Hates being interrupted during deep work blocks (mornings)', 0.85, 7],
    ['Birthday is March 3', 0.9, 1],
    ['Is trying to reduce late-night screen time after 11pm', 0.6, 2],
  ];
  let i = 0;
  for (const [text, strength, uses] of items) {
    const m = store.addMemory(/** @type {string} */ (text), 'user', true);
    if (!m) continue;
    m.strength = /** @type {number} */ (strength);
    m.uses = /** @type {number} */ (uses);
    m.created = now - (i * 1.7 + 0.5) * 86400000;
    m.lastUsed = now - ((i % 7) + 1) * 86400000;
    i += 1;
  }
  /** @type {[string, string[]][]} */
  const seeds = [
    ['Presentation nerves ease when you rehearse aloud twice — schedule rehearsals before the Nov 12 demo.', ['Works on a personal knowledge app called "Nebula Notes" as a side project', 'Is nervous about presenting; feels calmer after rehearsing aloud twice']],
    ['Deep-work mornings are sacred; schedule meetups and calls after lunch.', ['Hates being interrupted during deep work blocks (mornings)', 'Is preparing a demo of Nebula Notes for a small meetup on November 12']],
    ['For the Kyoto trip, remember the dairy allergy when researching food and cafés.', ['Drinks oat milk flat whites; allergic to dairy', 'Is planning a trip to Kyoto next spring, wants to see the cherry blossoms']],
  ];
  for (const [text, fromTexts] of seeds) {
    const fromIds = fromTexts.map((/** @type {string} */ t) => store.vault.memories.find((m) => m.text === t)?.id)
      .filter(Boolean);
    if (fromIds.length >= 2) store.addInsight(/** @type {string} */ (text), /** @type {string[]} */ (fromIds));
  }
  store.addSkill({
    name: 'morning-briefing',
    description: 'Greets the user with a 5-line daily brief: calendar-ish plans from memory, one follow-up, one encouragement.',
    prompt: 'Produce a compact morning briefing for the user: 1) greet them by name, 2) list up to 3 things from memory they said they were preparing or doing soon, 3) add one gentle follow-up question about the most important one, 4) end with one short encouragement. Max 5 lines, warm tone.',
  });
  store.addSkill({
    name: 'trip-planner',
    description: 'Builds a light travel outline from remembered preferences (no bookings).',
    prompt: 'Create a lightweight travel outline for the destination the user names: 3 phases (before, during, after), each with 2-3 bullets drawn from their remembered preferences (food restrictions, interests, energy patterns). No bookings, no prices. Keep it under 120 words.',
  });
  return store.vault.memories.length;
}
