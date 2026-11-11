/* Fight memory (0.25.0, monster minds release 2): the rules of a monster's notebook, with no Foundry in them.
   A notebook is a map of key → line on the Combat's flag, one key per line, written once (the runner adds lines, a GM's page crosses one out or
   adds her own). A line holds labels and fixed words only: never a name, a number off someone else's sheet, or free text from a card.
   fight.mjs decides who perceived what at the moment it happened and calls `witnessLines`; `render` turns a notebook into what its Mind may use. */

export const NOTEBOOK_SCHEMA = 1;
/** Stored lines a notebook may hold; lines sent as "remembers"; allies' deeds sent; a GM's line at most this long. */
export const STORE_MAX = 40, SEND_MAX = 10, DEEDS_MAX = 6, GM_LINE_MAX = 120, DEED_MAX = 80;
/** The ladder (Rhea, 2026-11-11): what each Mind can make of what it perceived. */
export const RUNGS = ["mindless", "animal", "simple", "cunning", "tactician"];
const NEEDS = { hurt: 1, gap: 1, miss: 2, saved: 2, nothing: 2, heal: 3, cast: 3, reactive: 4, block: 4, weak: 4, resist: 4, immune: 4, gm: 1, deed: 1 };
export const KINDS = Object.keys(NEEDS);
/** How high a Mind stands on the ladder: 0 (mindless) to 4. A creature with no Mind picked (a party member Angel plays) is cunning. */
export const rungOf = mind => { const i = RUNGS.indexOf(mind); return i < 0 ? 3 : i; };
/** May a Mind of this rung use a line of this kind? */
export const canUse = (kind, rung) => rung > 0 && (NEEDS[kind] ?? 99) <= rung;

/** Who did it, as the witness perceived them then: its label when it saw them, else words. `state` is perceive.mjs's. */
export const UNSEEN = "someone it couldn't see", UNKNOWN = "something unseen";
export const whoWords = (state, label) => (state === "observed" || state === "concealed" || state === "ally" || state === "self") && label ? label : state === "hidden" ? UNSEEN : UNKNOWN;

/** How badly a hit hurt, against the creature's own hit points (its own sheet is its own knowledge): 1 a scratch, 2 hurt, 3 badly hurt. */
export function severity(amount, max) { const part = max > 0 ? amount / max : 1; return part >= 0.3 ? 3 : part >= 0.1 ? 2 : 1; }

/** A sortable key for a new line: later lines sort after earlier ones. `n` breaks ties inside one event. */
export const lineKey = (at, n = 0, salt = "") => `${Math.max(0, Math.floor(at)).toString(36).padStart(9, "0")}${n.toString(36).padStart(2, "0")}${salt}`;

const DAMAGE_WORDS = { vitality: "vitality (healing magic)", void: "void (death magic)", untyped: "an attack" };
export const damageWord = type => { const t = String(type ?? "").toLowerCase().replace(/[^a-z-]/g, ""); return t ? (DAMAGE_WORDS[t] ?? t) : null; };
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

/** What a spell visibly did, without its name: its damage or element traits and its area ("fire, in a 15-foot cone"). */
const SHOWY = ["fire", "cold", "electricity", "acid", "sonic", "force", "mental", "poison", "vitality", "void", "spirit", "light", "darkness", "fear", "healing", "illusion", "water", "earth", "air", "wood", "metal", "plant", "sleep", "summon", "teleportation", "polymorph", "curse", "death"];
export function spellWords({ traits = [], area = null, attack = false, save = null } = {}) {
  const seen = SHOWY.filter(t => traits.includes(t)).slice(0, 3), shape = area?.type && area?.value ? `in a ${Number(area.value)}-foot ${String(area.type).replace(/[^a-z]/gi, "")}` : null;
  const how = attack ? "aimed at one creature" : save && !shape ? "that one creature had to resist" : null;
  return [seen.length ? seen.join(" and ") : "magic of a kind it couldn't tell", shape ?? how].filter(Boolean).join(", ").slice(0, DEED_MAX);
}

/** The lines one event writes, for each witness. `event`:
     { kind: "damage", target, actor|null, amount, max, types: [..], iwr: [{ category, type }], sure, persistent? }
     { kind: "heal", target, actor }      { kind: "cast", actor, slug, words }
     { kind: "attack", actor, target, degree (0..3) }      { kind: "saved", actor, target, item }
     { kind: "reactive" | "block", actor }      { kind: "deed", actor, target?, pre, post?, hasTarget }      { kind: "gap" }
   `witnesses`: [{ id, isActor, isTarget, actorIs: "self" | "ally" | "enemy" | null, targetIs: same, actor: { state, label }, target: { state, label }, knows: [slugs of its own spells] }]
   where `state` is how the witness perceived that creature when the effect landed. Out: [{ id, line }]. Lines carry `r` (round) and `at` from `stamp`. */
export function witnessLines(event, witnesses = [], stamp = {}) {
  const out = [], put = (w, line) => { out.push({ id: w.id, line: { ...line, r: stamp.round ?? 0, at: stamp.at ?? 0 } }); };
  const sees = p => p?.state === "observed" || p?.state === "concealed" || p?.state === "ally" || p?.state === "self", senses = p => sees(p) || p?.state === "hidden";
  for (const w of witnesses) {
    const a = w.actor ?? {}, t = w.target ?? {}, who = whoWords(a.state, a.label);
    if (event.kind === "gap") { put(w, { k: "gap" }); continue; }
    if (event.kind === "damage") {
      const types = (event.types ?? []).map(damageWord).filter(Boolean), iwr = (event.iwr ?? []).filter(x => damageWord(x.type));
      if (w.isTarget && event.amount > 0) put(w, event.sure === false ? { k: "hurt", s: severity(event.amount, event.max), sure: 0 } : event.persistent ? { k: "hurt", s: severity(event.amount, event.max), p: damageWord(event.persistent) ?? "lasting" } : { k: "hurt", a: event.actor ? who : null, s: severity(event.amount, event.max), ...(event.actor ? {} : { sure: 0 }) });
      /* its own attack came to nothing: something it tried that failed */
      if (w.isActor && !w.isTarget && event.amount <= 0 && sees(t)) put(w, { k: "nothing", t: t.label, ...(types[0] ? { d: types[0] } : {}) });
      /* a weakness, resistance or immunity it saw applied to an enemy (Rhea's exception, review 3: words only, from an outcome it perceived) */
      if (!w.isTarget && w.targetIs === "enemy" && sees(t)) for (const x of iwr) { const k = x.category === "weakness" ? "weak" : x.category === "resistance" ? "resist" : x.category === "immunity" ? "immune" : null; if (k) put(w, { k, t: t.label, d: damageWord(x.type) }); }
      continue;
    }
    if (event.kind === "heal") { if (!w.isActor && w.actorIs === "enemy" && (w.isTarget || sees(t))) put(w, { k: "heal", a: who, ...(w.isTarget ? {} : { t: t.label }) }); continue; }
    if (event.kind === "cast") { if (!w.isActor && w.actorIs === "enemy" && senses(a)) put(w, { k: "cast", a: who, w: String(event.words ?? "").slice(0, DEED_MAX), ...(event.slug && (w.knows ?? []).includes(event.slug) ? { n: event.slug } : {}) }); continue; }
    if (event.kind === "attack") {
      if (w.isActor) { if (event.degree < 2 && sees(t)) put(w, { k: "miss", t: t.label }); continue; }
      /* an ally's deed, for those of its side that perceived it (review 2: the ally passes the same test an enemy would) */
      if (w.actorIs === "ally" && sees(a)) put(w, { k: "deed", a: a.label, w: `${event.degree === 3 ? "critically hit" : event.degree === 2 ? "hit" : "missed"} ${w.isTarget ? "it" : sees(t) ? t.label : w.targetIs === "enemy" || w.targetIs === "ally" ? UNSEEN : "something"}` });
      continue;
    }
    if (event.kind === "deed") { if (w.actorIs === "ally" && sees(a)) put(w, { k: "deed", a: a.label, w: `${event.pre ?? ""}${event.hasTarget ? ` ${w.isTarget ? "it" : sees(t) ? t.label : UNSEEN}` : ""}${event.post ?? ""}`.slice(0, DEED_MAX) }); continue; }
    if (event.kind === "saved") { if (w.isActor && sees(t)) put(w, { k: "saved", t: t.label, ...(event.item ? { i: String(event.item).slice(0, 40) } : {}) }); continue; }
    if (event.kind === "reactive" || event.kind === "block") { if (w.actorIs === "enemy" && sees(a)) put(w, { k: event.kind, a: a.label }); continue; }
  }
  return out;
}

/** An ally's deed from the module's own step log, in the same words (`doneWords` is turn.mjs's line for the step, already in labels). */
export const deedLine = (label, doneWords, stamp = {}) => ({ k: "deed", a: label, w: String(doneWords ?? "").replace(/\s+/g, " ").trim().slice(0, DEED_MAX), r: stamp.round ?? 0, at: stamp.at ?? 0 });
/** A GM's own line, already through the name gate (labels only). */
export const gmLine = (text, stamp = {}) => ({ k: "gm", by: "gm", text: String(text ?? "").replace(/\s+/g, " ").trim().slice(0, GM_LINE_MAX), r: stamp.round ?? 0, at: stamp.at ?? 0 });

const times = n => n === 1 ? "once" : n === 2 ? "twice" : `${n} times`;
const sorted = book => Object.entries(book ?? {}).filter(([, l]) => l && typeof l === "object" && KINDS.includes(l.k)).sort((x, y) => x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0);

/** A notebook as words, for the packet and the fold-out. In: the stored lines; `rung` (0..4); `since`: the time of its last turn (deeds older than
    that aren't "this round"). Out: { remembers: [{ text, keys, kind, by }], allies: [{ text, keys }], unused: [{ text, keys, kind }], crossed: [..] }.
    `remembers` is what its Mind can use, most important first, capped; `unused` is what it perceived and makes nothing of (the fold-out greys it).
    Tallies, not a log: several hits by one creature are one line. Nothing here reads anything but the lines. */
export function render(book, { rung = 3, since = 0 } = {}) {
  const all = sorted(book), live = all.filter(([, l]) => !l.x), crossed = all.filter(([, l]) => l.x).map(([key, l]) => ({ text: wordsOf(l), keys: [key], kind: l.k, by: l.by ?? "module" }));
  const groups = [], group = (kind, id, key, l) => { let g = groups.find(x => x.kind === kind && x.id === id); if (!g) { g = { kind, id, keys: [], lines: [] }; groups.push(g); } g.keys.push(key); g.lines.push(l); };
  let lastHurt = null; const hurters = new Set();
  for (const [key, l] of live) {
    if (l.k === "deed") continue;
    if (l.k === "hurt") { group("hurt", l.p ? `p:${l.p}` : l.sure === 0 && !l.a ? "?" : `a:${l.a}`, key, l); if (l.a && l.sure !== 0) { lastHurt = l.a; hurters.add(l.a); } }
    else if (l.k === "gm") group("gm", key, key, l);
    else if (l.k === "gap") group("gap", `r:${l.r}`, key, l);
    else if (l.k === "cast") group("cast", `${l.a}|${l.n ?? l.w}`, key, l);
    else if (l.k === "heal") group("heal", `${l.a}`, key, l);
    else if (l.k === "saved") group("saved", `${l.t}|${l.i ?? ""}`, key, l);
    else if (l.k === "reactive" || l.k === "block") group(l.k, `${l.a}`, key, l);
    else group(l.k, `${l.t}|${l.d ?? ""}`, key, l);
  }
  const text = g => { const l = g.lines.at(-1), n = g.lines.length;
    switch (g.kind) {
      case "gm": return l.text;
      case "hurt": { const worst = Math.max(...g.lines.map(x => x.s ?? 1)), bad = g.lines.filter(x => (x.s ?? 1) === 3).length;
        const who = l.p ? `Its own ${l.p} damage that keeps on` : g.id === "?" ? "Something (unsure what)" : l.a;
        const how = n === 1 ? (worst === 3 ? "hurt it badly" : worst === 2 ? "hurt it" : "scratched it") : `hurt it ${times(n)}${bad ? `, badly ${times(bad)}` : ""}`;
        return `${who} ${how}${hurters.size > 1 && l.a === lastHurt && !l.p && g.id !== "?" ? " and was the last to hurt it" : ""}.`; }
      case "gap": return `It missed part of round ${l.r}.`;
      case "miss": return n === 1 ? `It missed ${l.t}.` : `It keeps missing ${l.t}.`;
      case "saved": return n === 1 ? `${l.t} shrugged off its ${l.i ?? "magic"}.` : `${l.t} keeps shrugging off its ${l.i ?? "magic"}.`;
      case "nothing": return `Its ${l.d ? `${l.d} ` : ""}attack did nothing to ${l.t}.`;
      case "heal": return n === 1 ? `${l.a} healed ${l.t ?? "the one it was fighting"}.` : `${l.a} keeps healing its side.`;
      case "cast": return `${l.a} cast ${l.n ? `the spell it knows as ${l.n.replace(/-/g, " ")}` : `a spell: ${l.w}`}${n > 1 ? ` (${times(n)})` : ""}.`;
      case "reactive": return `${l.a} strikes at those who move away from it or lower their guard beside it.`;
      case "block": return `${l.a} blocks blows with a shield.`;
      case "weak": return `${cap(l.d)} hurt ${l.t} far more than it should.`;
      case "resist": return `${cap(l.d)} did little to ${l.t}.`;
      case "immune": return `${cap(l.d)} did nothing to ${l.t}.`;
      default: return ""; } };
  /* most useful first: her lines, who hurt it, what failed, healers and casters, the finer things, gaps; the newest of each kind first */
  const order = ["gm", "hurt", "miss", "saved", "nothing", "heal", "cast", "reactive", "block", "weak", "resist", "immune", "gap"];
  const ranked = groups.map(g => ({ kind: g.kind, keys: g.keys, text: text(g), by: g.kind === "gm" ? "gm" : "module", sure: !g.lines.some(l => l.sure === 0), last: g.keys.at(-1) })).filter(g => g.text)
    .sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind) || (x.last < y.last ? 1 : -1));
  const usable = ranked.filter(g => canUse(g.kind, rung)), remembers = usable.slice(0, SEND_MAX), unused = [...ranked.filter(g => !canUse(g.kind, rung)), ...usable.slice(SEND_MAX)];
  /* allies' deeds since its last turn: the latest of each ally, oldest ally first */
  const deeds = new Map(); if (rung > 0) for (const [key, l] of live) if (l.k === "deed" && (l.at ?? 0) > since) { const d = deeds.get(l.a) ?? { keys: [], words: [] }; d.keys.push(key); d.words.push(l.w); deeds.set(l.a, d); }
  const allies = [...deeds.entries()].slice(-DEEDS_MAX).map(([a, d]) => ({ text: `${a}: ${d.words.slice(-2).join("; ")}.`, keys: d.keys }));
  return { remembers, allies, unused, crossed };
}
/** One stored line in words, for a crossed-out line in the fold-out. */
function wordsOf(l) { const r = render({ a: { ...l, x: undefined } }, { rung: 4 }); return r.remembers[0]?.text ?? r.allies[0]?.text ?? (l.k === "deed" ? `${l.a}: ${l.w}.` : ""); }

/** Its side's tally, so "gives up when half are down" can be judged (design review 15). Counts only. */
export function sideWords({ started = 0, standing = 0, down = 0, fled = 0 } = {}) {
  if (started <= 1 && !down && !fled) return null;
  return `Its side, counting itself: ${started} at the start, ${standing} standing${down ? `, ${down} down` : ""}${fled ? `, ${fled} fled` : ""}.`;
}

/** The packet's `notebook` (schema 3): only what its Mind may use; blank parts left out; null when there is nothing. */
export function forPacket(book, { rung = 3, since = 0, side = null } = {}) {
  if (rung <= 0) return null;   /* mindless: nothing; it goes on as its mind says */
  const r = render(book, { rung, since }), tally = side ? sideWords(side) : null;
  const out = { ...(r.remembers.length ? { remembers: r.remembers.map(x => x.sure ? x.text : `${x.text} (unsure)`) } : {}), ...(r.allies.length ? { alliesDid: r.allies.map(x => x.text) } : {}), ...(tally ? { side: tally } : {}) };
  return Object.keys(out).length ? out : null;
}

/** Which stored lines to drop when a notebook is over its cap: old deeds first, then the oldest unsure lines, then the oldest scratches, then the
    oldest of the rest; a GM's line and a crossed-out line of hers never. Out: keys. */
export function evict(book, max = STORE_MAX, since = 0) {
  const all = sorted(book), over = all.length - max; if (over <= 0) return [];
  const rank = ([, l]) => l.k === "gm" ? 99 : l.k === "deed" ? ((l.at ?? 0) > since ? 3 : 0) : l.sure === 0 ? 1 : l.k === "hurt" && (l.s ?? 1) === 1 ? 2 : l.k === "gap" ? 2 : 4;
  return all.map((e, i) => ({ key: e[0], rank: rank(e), i })).filter(x => x.rank < 99).sort((x, y) => x.rank - y.rank || x.i - y.i).slice(0, over).map(x => x.key);
}

/** New lines of others' doing that make a monster think again mid-turn (review 4): a heal or a casting it perceived, of a kind its Mind uses,
    written after `after`. Its own misses, a block against it and a strike on its move never count: they follow from its own step. */
export function rethinkFor(book, { rung = 3, after = 0 } = {}) {
  return sorted(book).filter(([, l]) => !l.x && (l.k === "heal" || l.k === "cast") && (l.at ?? 0) > after && canUse(l.k, rung)).map(([key, l]) => ({ key, who: l.a, what: l.k === "heal" ? "sawHeal" : "sawCast" }));
}

/** The whole notebooks flag as a short signature, so the history can tell whether what it saved still matches. */
export function bookPrint(books) { let n = 0, x = 0, last = ""; for (const b of Object.values(books ?? {})) for (const [k, l] of Object.entries(b ?? {})) { if (!l) continue; n++; if (l.x) x++; if (k > last) last = k; } return `${n}.${x}.${last}`; }
