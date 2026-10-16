import { sleep, tokenize } from './util.js';
import { LLM } from './llm.js';

/**
 * DreamEngine — replays memories, consolidates them into insights/skills,
 * and decays what no longer matters. Streams every step to the UI.
 */
export class Dreamer {
  /**
   * @param {import('./store.js').Store} store
   * @param {LLM} llm
   * @param {{searcher?: {search:(q:string)=>Promise<any>}|null, account?: string}} [opts]
   */
  constructor(store, llm, { searcher = null, account = 'owner' } = {}) {
    this.store = store;
    this.llm = llm;
    /** @type {{search:(q:string)=>Promise<any>}|null} external search (Tavily) */
    this.searcher = /** @type {{search:(q:string)=>Promise<any>}|null} */ (searcher);
    this.account = account;
    this.running = false;
  }

  /**
   * @param {(ev: any) => void} emit
   * @param {{fast?: boolean, intention?: string}} [opts]
   */
  async run(emit = () => {}, opts = {}) {
    if (this.running) return { error: 'already dreaming' };
    this.running = true;
    const pace = opts.fast ? 60 : 420; // ms between replay events (demo vs real)
    const t0 = Date.now();
    /** @type {{id: string, text: string}[]} */
    const sampled = [];
    try {
      emit({ phase: 'replay', message: 'Sinking into sleep…' });

      // An intention is what makes the dream useful instead of merely strange:
      // the owner says what they are worried about, and tonight's replay leans
      // toward the memories that bear on it.
      const intention = String(opts.intention || '').slice(0, 160);
      const want = tokenize(intention.toLowerCase());

      // 1. REPLAY — sample up to 12 memories weighted toward the strong & recent.
      const mems = [...this.store.vault.memories];
      mems.sort((a, b) => b.strength * 0.6 + (b.lastUsed / 1e12) - (a.strength * 0.6 + a.lastUsed / 1e12));
      let pool = mems.slice(0, Math.max(12, Math.min(30, mems.length)));
      if (want.length) {
        const score = (/** @type {any} */ m) => {
          const hay = `${m.text} ${m.tags.join(' ')}`.toLowerCase();
          return want.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
        };
        pool = [...pool].sort((a, b) => score(b) - score(a)).slice(0, 12);
        emit({ phase: 'replay', message: `dreaming about: “${intention}”` });
      }
      for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      for (const m of pool.slice(0, 12)) {
        sampled.push({ id: m.id.slice(0, 8), text: m.text });
        this.store.reinforce([m.id]);
        emit({ phase: 'replay', star: m.id.slice(0, 8), text: m.text });
        if (pace) await sleep(pace);
      }

    if (!sampled.length) {
      emit({ phase: 'done', message: 'Nothing to dream about yet — memories first, dreams after.' });
      return { insights: 0, decayed: 0, removed: 0, empty: true };
    }

    // 1b. EXTERNAL DREAM — dream about the world, not just the vault. A brace of
    // memories seeds a web search; what comes back is stored as a 'web' memory,
    // so the user's sky accumulates ambient knowledge tied to their own life.
    if (this.searcher && typeof this.searcher.search === 'function') {
      emit({ phase: 'replay', message: 'Drifting outward — dreaming of the world…' });
      try {
        const qSeed = sampled[Math.floor(Math.random() * sampled.length)].text.slice(0, 90);
        /** @type {string} */
        let q = '';
        try {
          const { text: qText } = await this.llm.chat({
            json: true,
            maxTokens: 240, // reasoning models need room even for one JSON line
            account: this.account,
            messages: [
              { role: 'system', content: 'Turn this memory into ONE short web-search query (max 8 words) about a topic the person would love to learn overnight. Reply ONLY JSON: {"query":"…"}' },
              { role: 'user', content: qSeed },
            ],
          });
          let qObj = null;
          try { qObj = LLM.parseJSON(qText); } catch { qObj = null; }
          q = typeof qObj?.query === 'string' ? qObj.query : String(qText || '');
        } catch { /* provider hiccup — the plain ask below still gives us a query */ }
        if (!q.replace(/[^a-z0-9]/gi, '').trim()) {
          // A malformed JSON reply must not cost the outward dream: ask in prose.
          try {
            const { text } = await this.llm.chat({
              maxTokens: 120,
              account: this.account,
              messages: [
                { role: 'system', content: 'Reply with ONE web-search query of at most 8 words. No quotes, no JSON, no explanation.' },
                { role: 'user', content: qSeed },
              ],
            });
            q = String(text || '');
          } catch { q = ''; }
        }
        q = String(q || '')
          .replace(/^[\s{"'`[]+|[\s}"'`\]]+$/g, '')
          .replace(/^\s*query\s*[:=]\s*/i, '')
          .replace(/\s+/g, ' ')
          .slice(0, 120);
        if (q) {
          const found = await this.searcher.search(q);
          const results = (found && Array.isArray(found.results)) ? found.results.filter((/** @type {any} */ r) => r && r.url) : [];
          emit({ phase: 'replay', message: `web dream: “${q}”` });
          let stored = 0;
          for (const r of results.slice(0, 2)) {
            const text = `${(r.title || '').slice(0, 120)}: ${String(r.snippet || '').replace(/\s+/g, ' ').slice(0, 200)} [${r.url}] .`.slice(0, 480);
            const mem = this.store.addMemory(text, 'web');
            if (mem) {
              stored += 1;
              emit({ phase: 'replay', star: mem.id.slice(0, 8), text: `web-dreamed · ${mem.text.slice(0, 80)}…` });
            }
          }
          if (stored) {
            sampled.push(...(this.store.vault.memories.filter((m) => m.source === 'web').slice(0, stored).map((m) => ({ id: m.id.slice(0, 8), text: m.text }))));
            sampled.splice(0, sampled.length - 14); // keep the dream focused
          }
        }
      } catch (e) {
        emit({ phase: 'replay', message: `external dream skipped (${String(/** @type {any} */ (e).message || e).slice(0, 60)})` });
      }
    }

      // 2. CONSOLIDATE — the LLM finds non-obvious cross-memory links.
      emit({ phase: 'consolidate', message: 'Weaving connections…' });
      let addedInsights = 0;
      let addedSkills = 0;
      try {
        const list = sampled.map((s, i) => `${i}. ${s.text}`).join('\n')
          + (intention ? `\n\nTONIGHT'S INTENTION (weigh insights toward this): ${intention}` : '');
        const { text } = await this.llm.chat({
          // The deep-thought step runs on the flagship open model — Nemotron 3
          // Ultra 550B with reasoning on. One dream costs cents, not dollars.
          tier: 'frontier',
          account: this.account,
          maxTokens: 1400,
          messages: [
            {
              role: 'system',
              content:
                'You are the consolidation phase of a dreaming memory system. Find up to 3 non-obvious insights that connect at least two memories each (causal, temporal, contrastive, or emotional links). Also, only if the memories clearly imply a reusable user-specific routine, propose ONE skill. Reply ONLY JSON: {"insights":[{"text":"<=180 chars, name the memories implicitly by content","connects":[0,2]}],"skill":{"name":"short-kebab-or-words","description":"<=120 chars","prompt":"<=500 chars system instructions for running the skill"} | null}',
            },
            { role: 'user', content: list },
          ],
        });
        const obj = LLM.parseJSON(text);
        const insights = Array.isArray(obj?.insights) ? obj.insights.slice(0, 3) : [];
        for (const ins of insights) {
          if (typeof ins?.text !== 'string') continue;
          const idx = Array.isArray(ins.connects)
            ? ins.connects.map((/** @type {any} */ i) => Number(i)).filter((/** @type {number} */ i) => Number.isInteger(i) && i >= 0 && i < sampled.length)
            : [];
          const fromIds = idx.length >= 2
            ? idx.slice(0, 4).map((/** @type {number} */ i) => this.store.vault.memories.find((m) => m.id.startsWith(sampled[i].id))?.id || sampled[i].id)
            : sampled.slice(0, 2).map((/** @type {{id: string}} */ s) => this.store.vault.memories.find((m) => m.id.startsWith(s.id))?.id || s.id);
          if (this.store.addInsight(ins.text, fromIds)) {
            addedInsights += 1;
            emit({ phase: 'insight', text: ins.text, from: fromIds.map((/** @type {string} */ id) => id.slice(0, 8)) });
          }
        }
        // The dream may also suggest a constellation name for its brightest link.
        if (addedInsights > 0) {
          try {
            const link = this.store.vault.insights[0];
            if (link && !link.name && link.fromIds.length >= 2) {
              const { text: nameText } = await this.llm.chat({
                json: true,
                maxTokens: 60,
                account: this.account,
                messages: [
                  { role: 'system', content: 'Invent a poetic constellation name (1-3 words, mythological or celestial feel) for a link between these memories. Reply ONLY JSON: {"name":"..."}' },
                  { role: 'user', content: link.text.slice(0, 200) },
                ],
              });
              const nameObj = LLM.parseJSON(nameText);
              if (nameObj && typeof nameObj.name === 'string') {
                this.store.setInsightName(link.id, nameObj.name);
                emit({ phase: 'constellation', id: link.id, name: nameObj.name, text: link.text });
              }
            }
          } catch { /* naming is cosmetic — never fail the dream */ }
        }
        if (obj?.skill && typeof obj.skill.name === 'string' && typeof obj.skill.prompt === 'string') {
          if (this.store.addSkill(obj.skill)) {
            addedSkills += 1;
            emit({ phase: 'skill', name: obj.skill.name, description: obj.skill.description });
          }
        }
      } catch (e) {
        emit({ phase: 'consolidate', message: `Offline dream (no model reachable): replay + decay only. (${String(/** @type {any} */ (e).message).slice(0, 80)})` });
      }

      // 3. BRIEF — a dream that ends in pretty lines is decoration. This one ends
      // in something the owner can act on when they open the sky next.
      if (addedInsights > 0 || intention) {
        emit({ phase: 'brief', message: 'Writing the morning brief…' });
        try {
          const recent = this.store.vault.insights.slice(0, 4).map((i) => i.text);
          const { text } = await this.llm.chat({
            tier: 'frontier',
            account: this.account,
            maxTokens: 1200,
            messages: [
              {
                role: 'system',
                content: 'You are the waking edge of a dreaming memory system. From these overnight insights, write the owner one short morning paragraph (max 2 sentences, second person, no fluff) and up to 3 concrete actions for today. Reply ONLY JSON: {"brief":"…","next":["…","…"]}',
              },
              {
                role: 'user',
                content: `OWNER: ${this.store.vault.owner || 'your human'}\nINTENTION: ${intention || '(none)'}\nOVERNIGHT INSIGHTS:\n- ${recent.join('\n- ')}`,
              },
            ],
          });
          const obj = LLM.parseJSON(text);
          if (obj && typeof obj.brief === 'string') {
            const brief = this.store.setBrief({
              text: obj.brief,
              next: Array.isArray(obj.next) ? obj.next : [],
              intention,
            });
            if (brief) emit({ phase: 'brief', text: brief.text, next: brief.next, intention: brief.intention });
          }
        } catch { /* the brief is the bonus; the dream already did the work */ }
      }

      // 4. DECAY — forgotten things fade; untouched, weak, never-recalled memories vanish.
      emit({ phase: 'decay', message: 'Letting go of what no longer matters…' });
      const now = Date.now();
      let decayed = 0;
      let removed = 0;
      const keep = new Set();
      for (const s of sampled) keep.add(s.id);
      for (const m of this.store.vault.memories) {
        if (keep.has(m.id.slice(0, 8))) continue; // never decay what the dream just touched
        const days = (now - m.lastUsed) / 86400000;
        if (days > 30 && m.uses === 0) {
          m.strength *= 0.82;
          decayed += 1;
          if (m.strength < 0.045) removed += 1; // fully faded below removal threshold
        } else if (days > 14) {
          m.strength *= 0.94;
          decayed += 1;
        }
      }
      this.store.vault.memories = this.store.vault.memories.filter((m) => m.strength >= 0.045);
      this.store.reindex();

      this.store.countDream();
      await this.store.flush();
      const ms = Date.now() - t0;
      emit({ phase: 'done', insights: addedInsights, skills: addedSkills, decayed, removed, ms, brief: this.store.vault.brief || null });
      return { insights: addedInsights, skills: addedSkills, decayed, removed, ms, brief: !!this.store.vault.brief };
    } finally {
      this.running = false;
    }
  }
}
