import { sleep } from './util.js';
import { LLM } from './llm.js';

/**
 * DreamEngine — replays memories, consolidates them into insights/skills,
 * and decays what no longer matters. Streams every step to the UI.
 */
export class Dreamer {
  /**
   * @param {import('./store.js').Store} store
   * @param {LLM} llm
   */
  constructor(store, llm) {
    this.store = store;
    this.llm = llm;
    this.running = false;
  }

  /**
   * @param {(ev: any) => void} emit
   * @param {{fast?: boolean}} [opts]
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

      // 1. REPLAY — sample up to 12 memories weighted toward the strong & recent.
      const mems = [...this.store.vault.memories];
      mems.sort((a, b) => b.strength * 0.6 + (b.lastUsed / 1e12) - (a.strength * 0.6 + a.lastUsed / 1e12));
      const pool = mems.slice(0, Math.max(12, Math.min(30, mems.length)));
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

      // 2. CONSOLIDATE — the LLM finds non-obvious cross-memory links.
      emit({ phase: 'consolidate', message: 'Weaving connections…' });
      let addedInsights = 0;
      let addedSkills = 0;
      try {
        const list = sampled.map((s, i) => `${i}. ${s.text}`).join('\n');
        const { text } = await this.llm.chat({
          json: true,
          reasoning: true,
          maxTokens: 900,
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

      // 3. DECAY — forgotten things fade; untouched, weak, never-recalled memories vanish.
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
      emit({ phase: 'done', insights: addedInsights, skills: addedSkills, decayed, removed, ms });
      return { insights: addedInsights, skills: addedSkills, decayed, removed, ms };
    } finally {
      this.running = false;
    }
  }
}
