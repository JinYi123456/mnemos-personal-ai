/**
 * Mnemos evaluation harness — dataset generator.
 *
 * Emits `eval/dataset.json`, built deterministically from this file:
 *
 *   • a 59-memory vault covering one person's life over ~14 months in 9 sessions
 *     (Ola: cognitive-science master student in Kraków and freelance UI designer
 *     who moves to Wrocław, changes job and design tool, starts a relationship,
 *     revises her coffee habit and adopts a cat named after a star);
 *   • 40 questions organised along the LongMemEval ability taxonomy
 *     (Wu et al., arXiv:2410.10813, ICLR 2025): single-session-user,
 *     multi-session, temporal-reasoning, knowledge-update, abstention.
 *
 * Nothing is hand-typed twice. Memory ids are the same sha256-of-normalised-text
 * ids `Store.addMemory()` produces, and every gold reference is resolved from a
 * human-readable ref, so ids and gold can never drift apart.
 *
 * `validateDataset()` is deliberately strict. Besides structure it re-plays the
 * deterministic mock reader from `eval/lib.mjs` on every question:
 *   - each answer-bearing gold memory must share an informative term with its
 *     own question (otherwise no arm could ever surface it);
 *   - given ONLY its gold memories, the reader must produce an answer that
 *     satisfies that question's oracle;
 *   - the reader's primary must be a gold memory (and the NEW one for updates);
 *   - no abstention question may be fully covered by any single memory.
 * A question that is only hard because of its phrasing therefore cannot enter
 * the dataset.
 *
 * Dates are relative: each memory carries `day` = age in days before an injected
 * `now`. The emitted JSON uses a fixed clock (reproducible); the runner
 * re-anchors the vault on the live clock so the 21-day decay half-life still
 * behaves the same whenever the benchmark is actually executed.
 *
 * Regenerate:  node eval/build-vault.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, safeText, tokenize } from '../src/util.js';
import { GENERIC_TERMS, tokenMatch, mockAnswer, scoreQuestion } from './lib.mjs';

export const DEFAULT_NOW_ISO = '2026-10-16T12:00:00.000Z';
export const DATASET_VERSION = '1.0.0';
export const DATASET_NAME = 'mnemos-longmemeval-style-40';
const DAY = 86400000;

/* ------------------------------------------------------------------- vault  */

/**
 * `day` = age in days before `now`; `last` = days before `now` the memory was
 * last used (drives the 21-day decay half-life in `Store.recall`).
 * @type {Array<{ref:string, s:string, day:number, last:number, strength:number, text:string}>}
 */
const MEMORIES = [
  // ---- s01 arriving in Kraków ----
  { ref: 'origin_gdansk', s: 's01', day: 420, last: 412, strength: 0.78, text: 'Ola lived her whole childhood in Gdańsk near the Shipyard Square and her family is still there.' },
  { ref: 'mother_aneta', s: 's01', day: 418, last: 400, strength: 0.7, text: 'Her mother Aneta lives in the Gdańsk flat and gardens at the weekend.' },
  { ref: 'move_krakow', s: 's01', day: 400, last: 390, strength: 0.8, text: 'Ola lived in Kraków after moving from Gdańsk for a master of cognitive science at Jagiellonian University.' },
  { ref: 'flat_krakow', s: 's01', day: 395, last: 388, strength: 0.75, text: 'Ola lives in Kraków, in a shared flat on Floreńska street with two lab roommates.' },
  { ref: 'brother_kuba', s: 's01', day: 365, last: 120, strength: 0.72, text: 'Her younger brother Kuba studies dentistry in Lublin and calls every Sunday evening.' },
  { ref: 'friend_mateusz', s: 's01', day: 240, last: 150, strength: 0.68, text: 'Mateusz, her friend since Gdańsk, works as a live sound engineer.' },

  // ---- s02 studies ----
  { ref: 'thesis_topic', s: 's02', day: 380, last: 300, strength: 0.82, text: 'Her master thesis studies cognitive load in navigation apps for elderly drivers.' },
  { ref: 'advisor_ewa', s: 's02', day: 375, last: 280, strength: 0.8, text: 'Her supervisor Dr. Ewa Zielińska expects a written update every Friday.' },
  { ref: 'polish_drafts', s: 's02', day: 280, last: 200, strength: 0.7, text: 'Ola drafts every thesis chapter in Polish and translates the abstract into English last.' },
  { ref: 'desktop_windows', s: 's02', day: 175, last: 160, strength: 0.66, text: 'The machine Ola wrote her thesis on was the university Windows desktop, because it ran the eye tracking software.' },
  { ref: 'lab_internship', s: 's02', day: 300, last: 290, strength: 0.72, text: "Ola's job was a research internship at the cognitive science lab, coding eye tracking pilots in Python." },
  { ref: 'deadline_may', s: 's02', day: 140, last: 130, strength: 0.7, text: 'Ola set her thesis submission deadline for May.' },

  // ---- s03 rhythm and health ----
  { ref: 'birthday', s: 's03', day: 370, last: 40, strength: 0.85, text: "Ola's birthday is 14 March." },
  { ref: 'coffee_flatwhite', s: 's03', day: 330, last: 300, strength: 0.75, text: "Ola's coffee habit in Kraków was three flat whites a day, and she could not start work without them." },
  { ref: 'guitar', s: 's03', day: 160, last: 140, strength: 0.6, text: 'Ola plays a little acoustic guitar, only three chords, mostly at parties.' },
  { ref: 'walks_evening', s: 's03', day: 45, last: 6, strength: 0.72, text: 'She walks along the Oława river after work to calm down; twenty minutes clears her head.' },
  { ref: 'late_notes', s: 's03', day: 235, last: 60, strength: 0.7, text: 'Reading notes after midnight wrecks her writing block and she sleeps badly.' },
  { ref: 'morning_block', s: 's03', day: 210, last: 30, strength: 0.78, text: 'The best writing of the day happens between 6 and 9, so Ola protects that morning block.' },

  // ---- s04 freelance design ----
  { ref: 'freelance_start', s: 's04', day: 350, last: 330, strength: 0.75, text: 'Ola took her first freelance client, a bike rental startup in Kazimierz, while still a student.' },
  { ref: 'tool_figma', s: 's04', day: 340, last: 320, strength: 0.8, text: 'Ola prefers Figma for all her design work and calls it the only design tool she trusts.' },
  { ref: 'client_nordwind', s: 's04', day: 270, last: 250, strength: 0.7, text: 'Freelance client Nordwind Books still owes an invoice of 2,400 PLN for a cover redesign.' },
  { ref: 'client_zielone', s: 's04', day: 265, last: 245, strength: 0.7, text: 'Client Zielone Podróże paid a 3,800 PLN invoice for a booking flow redesign.' },
  { ref: 'client_astro', s: 's04', day: 260, last: 240, strength: 0.7, text: 'Client Astro Collective sent an invoice for a brand refresh quote of 5,000 PLN.' },
  { ref: 'tool_penpot', s: 's04', day: 30, last: 12, strength: 0.8, text: 'Ola switched her design work to Penpot and calls it the design tool she trusts, because she can self host it.' },
  { ref: 'tool_vscode', s: 's04', day: 28, last: 10, strength: 0.65, text: 'She writes design tokens in a code editor instead of a separate design app.' },

  // ---- s05 things she owns ----
  { ref: 'camera_fuji', s: 's05', day: 290, last: 250, strength: 0.72, text: 'Ola bought a used Fujifilm X-T30 camera to photograph the city at night.' },
  { ref: 'lens_saving', s: 's05', day: 100, last: 70, strength: 0.68, text: 'She is saving 3,000 PLN for a proper 35mm lens.' },
  { ref: 'coffee_v60', s: 's05', day: 35, last: 8, strength: 0.78, text: "Ola's coffee now is a V60 filter brewed at home, two cups at most." },
  { ref: 'flat_wroclaw', s: 's05', day: 55, last: 20, strength: 0.82, text: 'Ola lives in Wrocław now, alone in a one bedroom flat on Powstańców Śląskich; she moved there in September.' },

  // ---- s06 Vega, hobbies, relationship ----
  { ref: 'bouldering', s: 's06', day: 320, last: 200, strength: 0.74, text: 'Ola joined a bouldering gym near her old flat and climbed twice a week.' },
  { ref: 'stray_cat', s: 's06', day: 180, last: 170, strength: 0.68, text: 'A grey stray cat kept appearing by the bakery door on Kalwaryjska and Ola left food out for the cat.' },
  { ref: 'vega_adopt', s: 's06', day: 120, last: 15, strength: 0.88, text: 'Ola adopted the grey stray cat and named her Vega, after the star in the Lyra constellation.' },
  { ref: 'vega_sills', s: 's06', day: 80, last: 25, strength: 0.62, text: 'Vega chews cable sleeves, so Ola hides her laptop charger before working on the train.' },
  { ref: 'status_single', s: 's06', day: 200, last: 190, strength: 0.66, text: 'Ola says her relationship status is single, with no time for dating while the thesis runs.' },
  { ref: 'partner_piotr', s: 's06', day: 90, last: 20, strength: 0.84, text: 'Ola updated her relationship status: she is with Piotr, a paramedic she met at the bouldering gym.' },
  { ref: 'vega_vet', s: 's06', day: 115, last: 100, strength: 0.65, text: 'Vega passed her first vet check and needs a dental cleaning next spring.' },

  // ---- s07 city life ----
  { ref: 'workshop_ux', s: 's07', day: 245, last: 230, strength: 0.7, text: 'Ola teaches an Intro to UX workshop on Wednesdays, an evening class at a coding school in Kraków.' },
  { ref: 'balcony_pots', s: 's07', day: 190, last: 170, strength: 0.6, text: 'She keeps cherry tomatoes and basil in pots on the balcony.' },
  { ref: 'neighbour_dog', s: 's07', day: 250, last: 210, strength: 0.6, text: 'Her neighbour Pan Henryk has an old beagle called Bursztynek.' },
  { ref: 'winter_krakow', s: 's07', day: 200, last: 190, strength: 0.55, text: 'Ola says the Kraków winters were the worst part of living there.' },
  { ref: 'sunday_run', s: 's07', day: 310, last: 300, strength: 0.6, text: 'She ran six kilometres along the Vistula every Sunday morning.' },
  { ref: 'half_marathon', s: 's07', day: 60, last: 55, strength: 0.62, text: 'Ola ran her first half marathon in Wrocław in 2 hours 14 minutes.' },

  // ---- s08 the new job ----
  { ref: 'job_skyward', s: 's08', day: 40, last: 10, strength: 0.88, text: "Ola's new job is full time product designer at Skyward, an aviation analytics startup." },
  { ref: 'team_tomasz', s: 's08', day: 38, last: 12, strength: 0.6, text: 'Her team at Skyward is two designers and a research lead named Tomasz.' },
  { ref: 'commute_train', s: 's08', day: 36, last: 9, strength: 0.66, text: 'She commutes by train and writes on the ride using only the laptop battery.' },
  { ref: 'defence_dec', s: 's08', day: 34, last: 8, strength: 0.7, text: 'Her thesis defence is booked for 10 December in the psychology building.' },
  { ref: 'rent_raise', s: 's08', day: 32, last: 6, strength: 0.6, text: 'The Wrocław landlord raised the rent, so she looks for a new flat near the office.' },
  { ref: 'macbook', s: 's08', day: 70, last: 14, strength: 0.8, text: 'The machine Ola writes her thesis on is a used MacBook Air with Apple silicon.' },

  // ---- s09 present week ----
  { ref: 'cycling_club', s: 's09', day: 25, last: 4, strength: 0.76, text: 'She joined a Thursday cycling club in Wrocław and stopped the Sunday runs of Kraków.' },
  { ref: 'class_sat', s: 's09', day: 22, last: 5, strength: 0.72, text: 'After the move Ola teaches a Saturday design class in Wrocław, a morning workshop for juniors.' },
  { ref: 'deadline_nov', s: 's09', day: 20, last: 3, strength: 0.86, text: "Ola's thesis submission deadline is now 18 November, after the original date slipped." },
  { ref: 'sister_kaja', s: 's09', day: 18, last: 7, strength: 0.68, text: "Ola's older sister Kaja is a physiotherapist in Poznań and expects her first baby in February." },
  { ref: 'wedding_june', s: 's09', day: 15, last: 4, strength: 0.66, text: "She will be a bridesmaid at her cousin's wedding in Zakopane next June." },
  { ref: 'birthday_dinner', s: 's09', day: 12, last: 2, strength: 0.7, text: 'Ola plans a small birthday dinner on 14 March with Piotr and Mateusz.' },
  { ref: 'vega_window', s: 's09', day: 10, last: 1, strength: 0.64, text: 'Vega sleeps on the windowsill above the bike path and watches the crows.' },
  { ref: 'gouache_sky', s: 's09', day: 8, last: 1, strength: 0.58, text: 'She started painting small gouache studies of the night sky at the weekend.' },
  { ref: 'desk_stand', s: 's09', day: 6, last: 1, strength: 0.6, text: 'Ola bought a standing desk converter and works standing when her back aches.' },
  { ref: 'piotr_easter', s: 's09', day: 5, last: 1, strength: 0.62, text: "Piotr cooks the Easter dinner at her mother's flat in Gdańsk this year." },
  { ref: 'late_messages', s: 's09', day: 4, last: 1, strength: 0.6, text: 'She is answering design messages late at night again, which wrecks her morning writing block.' },
];

/* --------------------------------------------------------- update topology  */

/**
 * Knowledge updates. The vault keeps BOTH sides and both sides compete for the
 * same slot, so surfacing the stale one is a realistic failure.
 * `stale` phrases occur in exactly one memory (the old one) — the generator
 * asserts that, which makes them a sound answer-level staleness detector.
 * @type {Array<{topic:string, old:string, new:string, stale:string[], answer:string[]}>}
 */
const UPDATES = [
  { topic: 'city', old: 'flat_krakow', new: 'flat_wroclaw', stale: ['floreńska'], answer: ['wrocław'] },
  { topic: 'job', old: 'lab_internship', new: 'job_skyward', stale: ['internship'], answer: ['skyward'] },
  { topic: 'design-tool', old: 'tool_figma', new: 'tool_penpot', stale: ['figma'], answer: ['penpot'] },
  { topic: 'teaching', old: 'workshop_ux', new: 'class_sat', stale: ['wednesday'], answer: ['saturday'] },
  { topic: 'relationship', old: 'status_single', new: 'partner_piotr', stale: ['single'], answer: ['piotr'] },
  { topic: 'cat', old: 'stray_cat', new: 'vega_adopt', stale: ['kalwaryjska'], answer: ['vega'] },
  { topic: 'laptop', old: 'desktop_windows', new: 'macbook', stale: ['windows desktop'], answer: ['macbook'] },
  { topic: 'deadline', old: 'deadline_may', new: 'deadline_nov', stale: ['for may'], answer: ['18 november'] },
  { topic: 'coffee', old: 'coffee_flatwhite', new: 'coffee_v60', stale: ['three flat whites'], answer: ['v60'] },
];

/* ---------------------------------------------------------------- questions */

/**
 * @type {Array<{id:string, ability:string, query:string, answerable:boolean, gold:string[],
 *   update?:string, mustAll?:string[], mustAny?:string[], mustNot?:string[],
 *   fromAge?:boolean, absent?:string[], goldAnswer:string, why:string}>}
 */
const QUESTIONS = [
  // ---- single-session-user (9): one memory holds the answer ----
  { id: 'q01', ability: 'single-session-user', query: 'When is my birthday?', answerable: true,
    gold: ['birthday'], mustAll: ['14 march'], goldAnswer: 'Your birthday is 14 March.', why: 'one stored fact' },
  { id: 'q02', ability: 'single-session-user', query: 'What topic does my thesis study?', answerable: true,
    gold: ['thesis_topic'], mustAll: ['cognitive load', 'navigation'],
    goldAnswer: 'Cognitive load in navigation apps for elderly drivers.', why: 'one stored fact' },
  { id: 'q03', ability: 'single-session-user', query: 'Who supervises my thesis?', answerable: true,
    gold: ['advisor_ewa'], mustAll: ['zielińska', 'friday'],
    goldAnswer: 'Dr. Ewa Zielińska, who expects a written update every Friday.', why: 'one stored fact' },
  { id: 'q04', ability: 'single-session-user', query: 'What does my brother Kuba study?', answerable: true,
    gold: ['brother_kuba'], mustAll: ['dentistry', 'lublin'], goldAnswer: 'Dentistry in Lublin.', why: 'one stored fact' },
  { id: 'q05', ability: 'single-session-user', query: 'Which camera do I use for night photographs?', answerable: true,
    gold: ['camera_fuji'], mustAll: ['fujifilm'], goldAnswer: 'A used Fujifilm X-T30.', why: 'one stored fact' },
  { id: 'q06', ability: 'single-session-user', query: 'What language do I draft my thesis chapters in?', answerable: true,
    gold: ['polish_drafts'], mustAll: ['polish'], goldAnswer: 'Polish, with the English abstract last.', why: 'one stored fact' },
  { id: 'q07', ability: 'single-session-user', query: 'What dog does my neighbour Henryk have?', answerable: true,
    gold: ['neighbour_dog'], mustAll: ['beagle', 'bursztynek'], goldAnswer: 'An old beagle called Bursztynek.', why: 'one stored fact' },
  { id: 'q08', ability: 'single-session-user', query: 'What instrument do I play?', answerable: true,
    gold: ['guitar'], mustAll: ['guitar'], goldAnswer: 'A little acoustic guitar, three chords.', why: 'one stored fact' },
  { id: 'q09', ability: 'single-session-user', query: 'When is my thesis defence?', answerable: true,
    gold: ['defence_dec'], mustAll: ['december'], goldAnswer: '10 December, in the psychology building.', why: 'one stored fact' },

  // ---- multi-session (8): the answer needs two or more memories ----
  { id: 'q10', ability: 'multi-session', query: 'Where have I lived?', answerable: true,
    gold: ['origin_gdansk', 'move_krakow', 'flat_wroclaw'], mustAll: ['gdańsk', 'kraków', 'wrocław'],
    goldAnswer: 'Gdańsk, then Kraków, now Wrocław.', why: 'three separate sessions' },
  { id: 'q11', ability: 'multi-session', query: 'Which client invoices do I have open or paid?', answerable: true,
    gold: ['client_nordwind', 'client_zielone', 'client_astro'], mustAll: ['nordwind', 'zielone', 'astro'],
    goldAnswer: 'Nordwind 2,400 PLN unpaid, Zielone 3,800 PLN paid, Astro a 5,000 PLN quote.', why: 'three client memories' },
  { id: 'q12', ability: 'multi-session', query: 'What do you know about my brother and my sister?', answerable: true,
    gold: ['brother_kuba', 'sister_kaja'], mustAll: ['dentistry', 'physiotherapist'],
    goldAnswer: 'Kuba studies dentistry in Lublin; Kaja is a physiotherapist in Poznań, expecting a baby.', why: 'two family memories, two sessions' },
  { id: 'q13', ability: 'multi-session', query: 'How does my morning writing block work, and what wrecks it?', answerable: true,
    gold: ['morning_block', 'late_notes', 'late_messages'], mustAll: ['6 and 9', 'midnight'],
    goldAnswer: '6-9am is protected; notes after midnight and late design messages wreck it.', why: 'three habit memories' },
  { id: 'q14', ability: 'multi-session', query: 'Which invoices do I have, and how much am I saving for?', answerable: true,
    gold: ['lens_saving', 'client_nordwind'], mustAll: ['3,000', '2,400'],
    goldAnswer: '3,000 PLN being saved for a lens; a 2,400 PLN invoice still owed to her.', why: 'numbers from two sessions' },
  { id: 'q15', ability: 'multi-session', query: 'Where and how often do I climb or walk?', answerable: true,
    gold: ['bouldering', 'walks_evening'], mustAll: ['bouldering', 'walk'],
    goldAnswer: 'Bouldering twice a week at the gym; walks along the Oława after work.', why: 'two habits' },
  { id: 'q16', ability: 'multi-session', query: 'What have I told you about my cat Vega?', answerable: true,
    gold: ['vega_adopt', 'vega_sills', 'vega_window', 'vega_vet'], mustAll: ['vega', 'cable'],
    goldAnswer: 'Adopted stray, chews cable sleeves, sleeps on the windowsill, vet check passed.', why: 'four cat memories' },
  { id: 'q17', ability: 'multi-session', query: 'Which workshops or classes do I teach?', answerable: true,
    gold: ['workshop_ux', 'class_sat'], mustAll: ['wednesday', 'saturday'],
    goldAnswer: 'The Wednesday Intro to UX workshop in Kraków and now a Saturday design class in Wrocław.', why: 'before and after across sessions' },

  // ---- temporal-reasoning (7): order or elapsed time decides the answer ----
  { id: 'q18', ability: 'temporal-reasoning', query: 'Which did I take up first, the bouldering gym or the acoustic guitar?', answerable: true,
    gold: ['bouldering', 'guitar'], mustAll: ['bouldering'],
    goldAnswer: 'Bouldering, about five months before the guitar.', why: 'ordering by age' },
  { id: 'q19', ability: 'temporal-reasoning', query: 'Which came first, the move to Wrocław or the new job?', answerable: true,
    gold: ['flat_wroclaw', 'job_skyward'], mustAll: ['september'],
    goldAnswer: 'The September move came first; Skyward started two weeks later.', why: 'ordering by age' },
  { id: 'q20', ability: 'temporal-reasoning', query: 'Roughly how many days ago did I adopt Vega?', answerable: true, fromAge: true,
    gold: ['vega_adopt'], mustAll: ['120'], goldAnswer: 'About 120 days ago.', why: 'elapsed time read off the memory age' },
  { id: 'q21', ability: 'temporal-reasoning', query: 'Which came earlier, my first freelance client or the research internship?', answerable: true,
    gold: ['freelance_start', 'lab_internship'], mustAll: ['freelance'],
    goldAnswer: 'The first freelance client, about 50 days earlier.', why: 'ordering by age' },
  { id: 'q22', ability: 'temporal-reasoning', query: 'How many days ago did I start living alone in Wrocław?', answerable: true, fromAge: true,
    gold: ['flat_wroclaw'], mustAll: ['55'], goldAnswer: 'About 55 days ago.', why: 'elapsed time' },
  { id: 'q23', ability: 'temporal-reasoning', query: 'Which is older, my Fujifilm camera or the evening UX workshop?', answerable: true,
    gold: ['camera_fuji', 'workshop_ux'], mustAll: ['fujifilm'],
    goldAnswer: 'The camera — bought 45 days before the workshop started.', why: 'ordering by age' },
  { id: 'q24', ability: 'temporal-reasoning', query: 'My Kraków flat, my Wrocław flat and Piotr — which came first?', answerable: true,
    gold: ['flat_krakow', 'flat_wroclaw', 'partner_piotr'], mustAll: ['floreńska'],
    goldAnswer: 'The Kraków flat on Floreńska, long before Wrocław and before Piotr.', why: 'three-way ordering' },

  // ---- knowledge-update (9): both values in the vault, only the new one is right ----
  // gold lists the NEW memory first, then the SUPERSEDED one, so a run that
  // surfaces only the stale memory scores as a knowledge-update failure.
  { id: 'q25', ability: 'knowledge-update', update: 'city', query: 'Which city do I live in now?', answerable: true,
    gold: ['flat_wroclaw', 'flat_krakow'], mustAll: ['wrocław'],
    goldAnswer: 'Wrocław — the Kraków flat is superseded.', why: 'city changed' },
  { id: 'q26', ability: 'knowledge-update', update: 'job', query: 'What is my current job?', answerable: true,
    gold: ['job_skyward', 'lab_internship'], mustAll: ['skyward'],
    goldAnswer: 'Full-time product designer at Skyward.', why: 'job changed' },
  { id: 'q27', ability: 'knowledge-update', update: 'design-tool', query: 'Which design tool do I use now?', answerable: true,
    gold: ['tool_penpot', 'tool_figma'], mustAll: ['penpot'],
    goldAnswer: 'Penpot, self-hosted for client projects.', why: 'tool preference changed' },
  { id: 'q28', ability: 'knowledge-update', update: 'teaching', query: 'Which weekday do I teach on?', answerable: true,
    gold: ['class_sat', 'workshop_ux'], mustAll: ['saturday'],
    goldAnswer: 'Saturday — the Wrocław design class.', why: 'teaching slot changed' },
  { id: 'q29', ability: 'knowledge-update', update: 'relationship', query: 'What is my relationship status?', answerable: true,
    gold: ['partner_piotr', 'status_single'], mustAll: ['piotr'],
    goldAnswer: 'In a relationship with Piotr.', why: 'status changed' },
  { id: 'q30', ability: 'knowledge-update', update: 'cat', query: 'What is my cat called?', answerable: true,
    gold: ['vega_adopt', 'stray_cat'], mustAll: ['vega'],
    goldAnswer: 'Vega, named after the star in Lyra.', why: 'an unnamed stray became a named cat' },
  { id: 'q31', ability: 'knowledge-update', update: 'laptop', query: 'Which machine do I write my thesis on?', answerable: true,
    gold: ['macbook', 'desktop_windows'], mustAll: ['macbook'],
    goldAnswer: 'A used MacBook Air with Apple silicon.', why: 'machine changed' },
  { id: 'q32', ability: 'knowledge-update', update: 'deadline', query: 'When is my thesis submission deadline now?', answerable: true,
    gold: ['deadline_nov', 'deadline_may'], mustAll: ['18 november'],
    goldAnswer: '18 November — the May plan slipped.', why: 'deadline changed' },
  { id: 'q33', ability: 'knowledge-update', update: 'coffee', query: 'How do I drink my coffee now?', answerable: true,
    gold: ['coffee_v60', 'coffee_flatwhite'], mustAll: ['v60'],
    goldAnswer: 'V60 filter at home, two cups at most.', why: 'coffee habit changed' },

  // ---- abstention (7): the vault has no answer; the system must say so ----
  { id: 'q34', ability: 'abstention', query: 'What kind of vehicle do I own?', answerable: false,
    absent: ['vehicle', 'driving licence'], gold: [],
    goldAnswer: '(unanswerable — no vehicle was ever mentioned)', why: 'clean abstention' },
  { id: 'q35', ability: 'abstention', query: 'What is my height in centimetres?', answerable: false,
    absent: ['height', 'centimetres'], gold: [],
    goldAnswer: '(unanswerable — no body measurements stored)', why: 'clean abstention' },
  { id: 'q36', ability: 'abstention', query: 'What was the name of my primary school?', answerable: false,
    absent: ['primary school', 'grade school'], gold: [],
    goldAnswer: '(unanswerable — schools were never discussed)', why: 'near-miss abstention' },
  { id: 'q37', ability: 'abstention', query: 'Which hotel did you suggest for the conference?', answerable: false,
    absent: ['hotel', 'conference'], gold: [],
    goldAnswer: '(unanswerable — no hotel or conference data)', why: 'clean abstention' },
  { id: 'q38', ability: 'abstention', query: 'When does Piotr celebrate his birthday?', answerable: false,
    absent: ['piotr was born', 'birthday of piotr'], gold: [],
    goldAnswer: '(unanswerable — Piotr is known, his birthday is not)', why: 'near-miss abstention' },
  { id: 'q39', ability: 'abstention', query: 'What is the serial number of my MacBook Air?', answerable: false,
    absent: ['serial'], gold: [],
    goldAnswer: '(unanswerable — the laptop is known, its serial is not)', why: 'near-miss abstention' },
  { id: 'q40', ability: 'abstention', query: 'What is my bank account password?', answerable: false,
    absent: ['password', 'passphrase', 'credential'], gold: [],
    goldAnswer: '(unanswerable — credentials are never stored)', why: 'clean abstention' },
];

/* ------------------------------------------------------------------ builder */

/** `Store.addMemory()` hashes the safeText(600) form of the text. */
function cleanText(/** @type {string} */ text) {
  return safeText(text, 600);
}

/** @param {string} text @returns {string} */
export function memoryIdFor(text) {
  return sha256(cleanText(text).toLowerCase().replace(/\s+/g, ' '));
}

/** @param {string[]} terms @returns {string[]} */
function contentTerms(terms) {
  return Array.from(new Set(terms.filter((t) => t.length > 2)));
}

/** informative = content terms that can carry the topic of a query */
function informativeOf(/** @type {string} */ query) {
  return contentTerms(tokenize(query)).filter((t) => !GENERIC_TERMS.has(t));
}

/** how many informative query terms a memory matches (fuzzy, like the reader) */
function covered(/** @type {string[]} */ informative, /** @type {string[]} */ memoryTerms) {
  return informative.filter((q) => memoryTerms.some((t) => tokenMatch(q, t))).length;
}

/**
 * @param {{now?: number}} [opts]
 * @returns {any} JSON-ready dataset
 */
export function buildDataset(opts = {}) {
  const now = Number(opts.now) || new Date(DEFAULT_NOW_ISO).getTime();

  const memories = MEMORIES.map((m) => {
    const text = cleanText(m.text);
    const id = memoryIdFor(text);
    return {
      ref: m.ref,
      id,
      short: id.slice(0, 8),
      text,
      session: m.s,
      day: m.day,
      lastUsedDay: m.last,
      strength: m.strength,
      uses: 2,
      source: 'user',
      created: now - m.day * DAY,
      lastUsed: now - m.last * DAY,
      tokens: contentTerms(tokenize(text)),
    };
  });

  const byRef = new Map(memories.map((m) => [m.ref, m]));
  const idOf = (/** @type {string} */ ref) => /** @type {any} */ (byRef.get(ref)).id;

  const questions = QUESTIONS.map((q) => {
    const informative = informativeOf(q.query);
    const gold = q.gold.map(idOf);
    const goldMems = q.gold.map((/** @type {string} */ ref) => /** @type {any} */ (byRef.get(ref)));
    const best = Math.max(0, ...memories.map((m) => covered(informative, m.tokens)));
    const pair = q.update ? /** @type {any} */ (UPDATES.find((u) => u.topic === q.update)) : null;
    // the superseded memory is bookkeeping, not evidence: only the answer-bearing
    // memories must be reachable from the query
    const answerRefs = q.update ? [q.gold[0]] : q.gold;
    return {
      id: q.id,
      ability: q.ability,
      update: q.update || null,
      query: q.query,
      answerable: q.answerable,
      fromAge: !!q.fromAge,
      absent: (q.absent || []).map((s) => s.toLowerCase()),
      gold,
      goldShort: gold.map((i) => i.slice(0, 8)),
      goldRefs: q.gold,
      superseded: pair ? pair.old : null,
      supersededRef: pair ? pair.old : null,
      supersededId: pair ? idOf(pair.old) : null,
      supersededShort: pair ? idOf(pair.old).slice(0, 8) : null,
      stale: pair ? pair.stale.map((/** @type {string} */ s) => s.toLowerCase()) : [],
      mustAll: (q.mustAll || []).map((s) => s.toLowerCase()),
      mustAny: (q.mustAny || []).map((s) => s.toLowerCase()),
      mustNot: (q.mustNot || []).map((s) => s.toLowerCase()),
      goldAnswer: q.goldAnswer,
      why: q.why,
      informativeTerms: informative,
      reachableRefs: q.answerable
        ? answerRefs.filter((/** @type {string} */ ref) => covered(informative, /** @type {any} */ (byRef.get(ref)).tokens) > 0)
        : [],
      bestMemoryCoverage: q.answerable ? null : best,
      abstainClass: q.answerable ? null : best === 0 ? 'clean' : 'near-miss',
    };
  });

  const byAbility = /** @type {Record<string, number>} */ ({});
  for (const q of questions) byAbility[q.ability] = (byAbility[q.ability] || 0) + 1;

  const updates = UPDATES.map((u) => ({
    topic: u.topic,
    oldRef: u.old,
    newRef: u.new,
    oldId: idOf(u.old),
    newId: idOf(u.new),
    oldDay: /** @type {any} */ (byRef.get(u.old)).day,
    newDay: /** @type {any} */ (byRef.get(u.new)).day,
    stale: u.stale,
    answer: u.answer,
  }));

  return {
    meta: {
      name: DATASET_NAME,
      version: DATASET_VERSION,
      protocol:
        'LongMemEval-style ability taxonomy (Wu et al., arXiv:2410.10813) applied to an in-house 40-question set. NOT score-comparable with published LongMemEval numbers.',
      persona:
        'Ola — cognitive-science master student and freelance UI designer; moves Kraków to Wrocław, changes job, design tool, teaching slot, relationship status and coffee habit, adopts a cat named after a star.',
      nowIso: new Date(now).toISOString(),
      clockNote:
        'Memory dates are day offsets from an injected now. This file uses nowIso; the runner re-anchors the vault on the live clock so the 21-day decay half-life behaves the same whenever the benchmark is run.',
      oracle:
        'lowercased substring mustAll / mustAny / mustNot over the answer text; abstention graded by the I-dont-remember pattern; fromAge questions are graded on the memory age the prompt shows.',
      counts: {
        memories: memories.length,
        questions: questions.length,
        sessions: new Set(memories.map((m) => m.session)).size,
        byAbility,
        updatePairs: updates.length,
        abstainClean: questions.filter((q) => q.abstainClass === 'clean').length,
        abstainNearMiss: questions.filter((q) => q.abstainClass === 'near-miss').length,
      },
    },
    memories,
    questions,
    updates,
  };
}

/* --------------------------------------------------------------- validation */

/** recall block in the exact format `Brain.formatRecall` produces */
function recallBlockFor(/** @type {any[]} */ mems, /** @type {number} */ now) {
  return mems.map((m) => `[M${m.short}] ${m.text} (${Math.floor((now - m.created) / DAY)}d old)`).join('\n');
}

/**
 * Structural + semantic integrity. Returns problems; empty means sound.
 * @param {any} ds
 * @returns {string[]}
 */
export function validateDataset(ds) {
  /** @type {string[]} */
  const errs = [];
  if (!ds?.memories || !ds?.questions) return ['dataset has no memories or questions'];

  const ids = new Set();
  const shorts = new Map();
  const refs = new Set();
  const seenText = new Map();
  for (const m of ds.memories) {
    if (refs.has(m.ref)) errs.push(`duplicate ref ${m.ref}`);
    refs.add(m.ref);
    if (m.text.length < 8) errs.push(`memory ${m.ref} is below the Store minimum length`);
    if (ids.has(m.id)) errs.push(`duplicate memory id ${m.short}`);
    ids.add(m.id);
    if (memoryIdFor(m.text) !== m.id) errs.push(`id mismatch for ${m.ref}`);
    const key = m.text.toLowerCase().replace(/\s+/g, ' ');
    if (seenText.has(key)) errs.push(`duplicate text: ${m.ref} and ${seenText.get(key)}`);
    seenText.set(key, m.ref);
    const prev = shorts.get(m.short);
    if (prev) errs.push(`short-id collision ${m.short}: ${prev} vs ${m.ref}`);
    shorts.set(m.short, m.ref);
  }

  const abstu = ds.questions.filter((/** @type {any} */ q) => !q.answerable);
  if (ds.questions.length !== 40) errs.push(`expected 40 questions, got ${ds.questions.length}`);
  if (abstu.length < 6) errs.push(`expected >= 6 abstention questions, got ${abstu.length}`);
  if ((ds.updates || []).length < 6) errs.push(`expected >= 6 update pairs, got ${(ds.updates || []).length}`);

  const now = new Date(ds.meta.nowIso).getTime();
  for (const q of ds.questions) {
    for (const g of q.gold) if (!ids.has(g)) errs.push(`${q.id}: gold ${g.slice(0, 8)} is not in the vault`);
    const goldMems = q.gold.map((/** @type {string} */ i) => ds.memories.find((/** @type {any} */ m) => m.id === i));
    const joined = goldMems.map((/** @type {any} */ m) => m.text.toLowerCase()).join(' ');

    if (q.answerable) {
      if (!q.gold.length) errs.push(`${q.id}: answerable without gold evidence`);
      if (!q.mustAll.length && !q.mustAny.length) errs.push(`${q.id}: answerable without an oracle`);
      for (const needle of [...q.mustAll, ...q.mustAny]) {
        const inText = goldMems.some((/** @type {any} */ m) => m.text.toLowerCase().includes(needle));
        const inAge = q.fromAge === true && goldMems.some((/** @type {any} */ m) => String(m.day) === needle);
        if (!inText && !inAge) errs.push(`${q.id}: oracle "${needle}" is in no gold memory ${q.fromAge ? 'text or age' : 'text'}`);
      }
      for (const bad of q.mustNot) if (joined.includes(bad)) errs.push(`${q.id}: mustNot "${bad}" is inside its own gold memory`);
      for (const ref of q.goldRefs.slice(0, q.update ? 1 : q.goldRefs.length)) {
        const m = ds.memories.find((/** @type {any} */ x) => x.ref === ref);
        if (!m) {
          errs.push(`${q.id}: unknown gold ref ${ref}`);
        } else if (covered(q.informativeTerms, m.tokens) === 0) {
          errs.push(`${q.id}: answer memory ${ref} shares no informative term with the question`);
        }
      }
      if (q.update && !q.goldRefs.slice(1).some((/** @type {string} */ ref) => {
        const m = ds.memories.find((/** @type {any} */ x) => x.ref === ref);
        const answerM = ds.memories.find((/** @type {any} */ x) => x.ref === q.goldRefs[0]);
        return !!m && !!answerM && m.day > answerM.day;
      })) {
        errs.push(`${q.id}: knowledge-update gold[1] must be the older (superseded) memory`);
      }
      if (q.reachableRefs.length < (q.update ? 1 : q.gold.length)) {
        errs.push(`${q.id}: only ${q.reachableRefs.length} of ${q.gold.length} gold memories are reachable`);
      }

      const block = recallBlockFor(goldMems, now);
      const a = mockAnswer({ messages: [{ role: 'user', content: `MEMORY RECALL (auto):\n${block}\n\nQuestion: ${q.query}` }] });
      if (a.abstained) errs.push(`${q.id}: the mock reader abstains even with only gold memories in context`);
      else {
        if (!q.goldShort.includes(a.primary)) errs.push(`${q.id}: reader primary ${a.primary} is not a gold memory`);
        if (q.update && a.primary !== q.goldShort[0]) errs.push(`${q.id}: knowledge-update primary should be the new memory, got ${a.primary}`);
        const scored = scoreQuestion(q, {
          arm: 'dataset-check', retrieved: q.goldShort, answer: a.text, cites: a.cited, recalled: q.goldShort, mode: 'mock',
        });
        if (!scored.answer_correct) errs.push(`${q.id}: gold-only recall does not satisfy the oracle — ${a.text.slice(0, 180)}`);
        if (q.update && scored.update_stale_answer) errs.push(`${q.id}: gold-only recall is flagged as a stale answer`);
      }
    } else {
      if (q.gold.length) errs.push(`${q.id}: abstention item must have no gold`);
      if (q.mustAll.length || q.mustAny.length) errs.push(`${q.id}: abstention item must have no positive oracle`);
      const hay = ds.memories.map((/** @type {any} */ m) => m.text.toLowerCase()).join('\n');
      for (const needle of q.absent) if (hay.includes(needle)) errs.push(`${q.id}: unanswerable but the vault contains "${needle}"`);
      if (!q.informativeTerms.length) errs.push(`${q.id}: unanswerable query has no informative term`);
      if (q.bestMemoryCoverage >= q.informativeTerms.length) {
        errs.push(`${q.id}: some memory covers every informative term, so it is answerable`);
      }
      if (q.abstainClass === 'near-miss' && q.bestMemoryCoverage === 0) {
        errs.push(`${q.id}: labelled near-miss but nothing in the vault matches it`);
      }
    }
  }

  const lowerTexts = ds.memories.map((/** @type {any} */ m) => m.text.toLowerCase());
  for (const u of ds.updates) {
    const oldM = ds.memories.find((/** @type {any} */ m) => m.id === u.oldId);
    const newM = ds.memories.find((/** @type {any} */ m) => m.id === u.newId);
    if (!oldM) errs.push(`update ${u.topic}: old memory missing`);
    if (!newM) errs.push(`update ${u.topic}: new memory missing`);
    if (oldM && newM && !(newM.day < oldM.day)) {
      errs.push(`update ${u.topic}: new (day ${newM.day}) is not more recent than old (day ${oldM.day})`);
    }
    for (const stale of u.stale) {
      const s = stale.toLowerCase();
      if (oldM && !oldM.text.toLowerCase().includes(s)) errs.push(`update ${u.topic}: stale marker "${s}" not in the old memory`);
      const owners = lowerTexts.filter((/** @type {string} */ t) => t.includes(s)).length;
      if (owners !== 1) errs.push(`update ${u.topic}: stale marker "${s}" occurs in ${owners} memories (must be exactly 1)`);
    }
    for (const marker of u.answer) {
      const s = marker.toLowerCase();
      if (newM && !newM.text.toLowerCase().includes(s)) errs.push(`update ${u.topic}: new marker "${s}" not in the new memory`);
      if (oldM && oldM.text.toLowerCase().includes(s)) errs.push(`update ${u.topic}: new marker "${s}" is also in the old memory`);
    }
    const ku = ds.questions.filter((/** @type {any} */ q) => q.ability === 'knowledge-update' && q.update === u.topic);
    if (!ku.length) errs.push(`update ${u.topic}: no knowledge-update question covers it`);
    for (const q of ku) {
      if (q.gold[0] !== u.newId) errs.push(`${q.id}: gold[0] must be the new memory of ${u.topic}`);
      if (!q.gold.includes(u.oldId)) errs.push(`${q.id}: gold misses the superseded memory of ${u.topic}`);
      if (q.superseded !== u.oldRef) errs.push(`${q.id}: superseded ref does not match update ${u.topic}`);
      if (!q.stale.length) errs.push(`${q.id}: no stale markers carried from update ${u.topic}`);
    }
  }
  const topics = new Set(ds.questions.filter((/** @type {any} */ q) => q.update).map((/** @type {any} */ q) => q.update));
  if (topics.size < 6) errs.push(`need >= 6 distinct knowledge-update topics, got ${topics.size}`);

  const c = ds.meta?.counts || {};
  if (c.questions !== ds.questions.length) errs.push('meta.counts.questions out of sync');
  if (c.memories !== ds.memories.length) errs.push('meta.counts.memories out of sync');
  return errs;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const ds = buildDataset();
  const errs = validateDataset(ds);
  if (errs.length) {
    console.error(`dataset integrity FAILED (${errs.length} problem(s)):`);
    for (const e of errs) console.error(`  - ${e}`);
    process.exitCode = 1;
  } else {
    const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dataset.json');
    fs.writeFileSync(out, `${JSON.stringify(ds, null, 2)}\n`, 'utf8');
    const c = ds.meta.counts;
    console.log(`wrote ${out}`);
    console.log(`  ${c.memories} memories in ${c.sessions} sessions, ${c.questions} questions, ${c.updatePairs} update pairs`);
    console.log(`  abilities: ${Object.entries(c.byAbility).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    console.log(`  abstention: ${c.abstainClean} clean, ${c.abstainNearMiss} near-miss`);
  }
}
