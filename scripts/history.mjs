/* The fight's history, for the GM (Rhea, 2026-11-08): each monster turn's whole plan and reason, then each action with its own reason and what came of
   it, in full detail (totals against AC or DC, degrees, damage, HP), with the GM's own presses, refusals, re-plans and stalls. Built afresh from the
   Combat flag every time, so nothing extra is kept while the fight runs; numbers on chat cards are read through `look`, and the record keeps what a
   card can't say (HP before and after). GM only: never sent to the thinker. Pure: no Foundry globals. */
import { CHECK_OUTCOMES, OUTCOMES, describeChanges, describeStep, isMove } from "./turn.mjs";

const DEGREES = { strike: OUTCOMES, check: CHECK_OUTCOMES };
const same = (a, b) => a?.[0] === b?.[0] && a?.[1] === b?.[1];
const sq = s => s ? `${s[0]}, ${s[1]}` : "?";
const ROUTE = { chat: "Angel (chat)", api: "Angel (API)", gm: "a GM" };

/** Names for the GM: E and M labels in any text become the creatures' names. */
export function namer(labels = {}, names = {}) {
  const byLabel = Object.fromEntries(Object.entries(labels).map(([t, l]) => [l, t]));
  const nameOf = l => names[byLabel[l]] ?? null;
  return { nameOf, named: s => String(s ?? "").replace(/\b[EM]\d{1,3}\b/g, l => nameOf(l) ?? l), tokenOf: l => byLabel[l] ?? null };
}

/** HP before and after, with "Down" at 0. */
const hpWords = (name, hp) => Array.isArray(hp) ? `${name} ${hp[0]} → ${hp[1]} HP${hp[1] <= 0 && hp[0] > 0 ? " (Down)" : ""}` : "";
/** "17 vs AC 15" from a card's numbers. */
const vs = (c, what = "AC") => c?.total != null ? `${c.total}${c.dc != null ? ` vs ${what} ${c.dc}` : ""}` : "";
const join = parts => parts.filter(Boolean).join("; ");

/** What came of one step, in full detail: { text, cards } (cards: chat message ids to link). look.card(id) gives a card's { total, dc, label }, look.save(id,
    tokenId) a save on a spell's card { total, dc, degree }; either may be null when the card is gone, and the line still says what the record knows. */
export function stepResult(step, rec = {}, look = {}, n = namer(), done = false) {
  const card = id => (id && look.card?.(id)) || null, cards = [], tag = id => { if (id) cards.push(id); };
  const target = step.target ? n.nameOf(step.target) ?? step.targetName ?? step.target : null, tid = step.target ? n.tokenOf(step.target) : null;
  const flat = rec.flat ? `flat check ${rec.flat.total} vs DC ${rec.flat.dc}: ${rec.flat.ok ? "passed" : "failed, the action is spent"}` : rec.flatStarted ? "flat check rolled, result not recorded" : "";
  const damage = () => { if (!rec.damage) return ""; tag(rec.damage.message); const c = card(rec.damage.message); return `damage ${c?.total ?? "?"}${c?.label ? ` ${c.label}` : ""}${rec.applied ? (Array.isArray(rec.hp) ? `, applied: ${hpWords(target ?? "target", rec.hp)}` : ", applied") : rec.applying ? ", applying (not confirmed)" : ", not applied (apply it from the card)"}`; };
  let text = "";
  if (step.do === "strike") {
    if (rec.attack) { tag(rec.attack.message); }
    const atk = rec.attack ? `${vs(card(rec.attack.message))}${card(rec.attack.message)?.total != null ? ": " : ""}${OUTCOMES[rec.attack.degree] ?? "unknown"}${rec.attack.ammoLeft != null ? ` (${rec.attack.ammoLeft} left)` : ""}` : rec.started ? "attack started, no result recorded" : "";
    text = join([flat, atk, damage()]);
  } else if (isMove(step)) {
    const got = rec.moved?.to;
    text = !got ? (rec.started ? "move started, not finished" : "") : `${same(got, step.to) ? "arrived at" : `stopped at`} ${sq(got)}${rec.moved.cost != null ? ` (${rec.moved.cost} ft charged)` : ""}${!same(got, step.to) ? `, short of ${sq(step.to)}` : ""}`;
    if (step.do === "swim") { tag(rec.swim?.message); const c = card(rec.swim?.message); text = rec.swim ? join([`Athletics ${c?.total ?? "?"} vs DC ${rec.swim.dc}: ${CHECK_OUTCOMES[rec.swim.degree] ?? "unknown"}`, rec.swum ? text : "no progress"]) : same(step.from ?? step.to, step.to) && rec.swum ? "trod water" : text; }
    if (step.do === "sneak") { tag(rec.card?.message); text = join([text, rec.applied === "applied" ? "Visioner applied the secret result" : rec.applied === "none" ? "Visioner changed nothing" : rec.gm ? "left to you on its card" : ""]); }
  } else if (step.do === "stand" || step.do === "drop-prone") text = rec.changed || rec.stood ? (step.do === "stand" ? "stood up" : "dropped prone") : rec.started ? "started, not confirmed" : "";
  else if (step.do === "take-cover") text = rec.covered ? "took cover" : rec.gm ? "left to you" : "";
  else if (step.do === "interact") { tag(rec.posted?.message); text = join([flat, rec.posted ? "its card posted for you to apply" : rec.started ? "card started, not confirmed" : ""]); }
  else if (step.do === "delay") text = rec.moved ? `turn ended; back in the order right after ${n.nameOf(step.after) ?? step.after}` : rec.ended ? "turn ended; its place in the order may not have moved (check the tracker)" : "";
  else if (step.do === "hide" || step.do === "seek") { tag(rec.card?.message); const c = card(rec.card?.message); text = join([c?.total != null ? `secret roll ${c.total}` : "", rec.applied === "applied" ? "Visioner applied the result" : rec.applied === "none" ? "Visioner changed nothing" : rec.gm ? "left to you on its card" : ""]); }
  else if (step.do === "ability") {
    tag(rec.posted?.message); if (rec.check) tag(rec.check.message);
    const c = card(rec.check?.message), eff = rec.effects ? join([rec.effects.target?.length ? `${target ?? "target"}: ${rec.effects.target.join(", ")}` : "", rec.effects.self?.length ? `itself: ${rec.effects.self.join(", ")}` : "", rec.effects.gm ? "the rest is yours" : ""]) : "";
    text = join([flat, rec.check ? `${vs(c, "DC")}${c?.total != null ? ": " : ""}${CHECK_OUTCOMES[rec.check.degree] ?? "unknown"}` : "", eff, damage(), rec.posted ? (step.mode === "hold" ? "kept hold" : "its card posted for you to apply") : ""]);
  } else if (step.do === "spell") {
    tag(rec.cast?.message);
    const parts = [rec.cast ? "cast" : rec.castStarted ? "casting started" : "", flat];
    if (rec.attack) { tag(rec.attack.message); const c = card(rec.attack.message); parts.push(`${vs(c)}${c?.total != null ? ": " : ""}${OUTCOMES[rec.attack.degree] ?? "unknown"}`); }
    if (rec.save) { const s = tid && look.save?.(rec.cast?.message, tid); parts.push(`${target ?? "target"}'s save ${s?.total != null ? `${vs(s, "DC")}: ` : ""}${CHECK_OUTCOMES[rec.save.degree] ?? "unknown"}`); }
    if (rec.saves) parts.push(`saves: ${Object.entries(rec.saves).map(([t, d]) => { const s = look.save?.(rec.cast?.message, t); return `${look.name?.(t) ?? "someone"} ${s?.total != null ? `${vs(s, "DC")} ` : ""}${CHECK_OUTCOMES[d] ?? "no result"}`; }).join(", ") || "nobody caught"}`);
    else if (rec.waiting?.length) parts.push(`waiting for ${rec.waiting.map(t => look.name?.(t) ?? "someone").join(", ")}`);
    if (rec.damage) { tag(rec.damage.message); const c = card(rec.damage.message);
      const hp = rec.hp && !Array.isArray(rec.hp) ? Object.entries(rec.hp).map(([t, h]) => hpWords(look.name?.(t) ?? "someone", h)).join(", ") : Array.isArray(rec.hp) ? hpWords(target ?? "target", rec.hp) : "";
      parts.push(`damage ${c?.total ?? "?"}${c?.label ? ` ${c.label}` : ""}${hp ? `, applied: ${hp}` : rec.applied ? ", applied" : ""}`); }
    if (step.mode === "card" || rec.noRows) parts.push("the rest is yours from its card");
    text = join(parts);
  }
  return { text: text || (step.do === "none" ? "did nothing" : Object.keys(rec).length || done ? "done" : "not reached"), cards: [...new Set(cards)] };
}

/** One request (a plan, or a re-plan of the same turn) as lines. */
function partOf(id, r, look, n) {
  /* a refused plan stays in r.plan until the next one lands: while the turn waits for that, it isn't the plan */
  const asking = r.state === "requested" || r.state === "submitted" && !r.steps, plan = r.plan && typeof r.plan === "object" && !asking ? r.plan : null, steps = r.steps ?? [], pos = r.pos ?? 0, lines = [];
  const presses = Object.entries(r.presses ?? {}).map(([at, p]) => ({ at: Number(at), ...p })).sort((a, b) => a.at - b.at);
  const pressLine = p => ({ kind: "press", at: p.at, text: `${p.user ?? "A GM"} pressed ${p.do}${p.for ? ` for ${look.name?.(p.for) ?? "someone"}` : ""}.` });
  for (const [k, ref] of Object.entries(r.refused ?? {}).sort((a, b) => a[0] - b[0])) lines.push({ kind: "refused", text: `${Number(k) >= 2 ? "Turned down again" : "Turned down"}: ${n.named(ref.reason)}`, plan: ref.plan ? { reason: n.named(ref.plan.reason), steps: (ref.plan.steps ?? []).map(s => n.named(`${s.do}${s.item ? ` ${s.item}` : ""}${s.target ? ` at ${s.target}` : ""}${s.to ? ` to ${sq(s.to)}` : ""}`)) } : null });
  steps.forEach((s, i) => {
    for (const p of presses.filter(p => (p.pos ?? 0) === i)) lines.push(pressLine(p));
    const rec = r.log?.[i]; if (i >= pos && !(rec && Object.keys(rec).length)) return;
    const res = stepResult(s, rec ?? {}, look, n, i < pos);
    lines.push({ kind: "step", n: i + 1, text: n.named(describeStep(s)), why: plan?.steps?.[i]?.why ? n.named(plan.steps[i].why) : null, result: n.named(res.text), cards: res.cards });
  });
  for (const p of presses.filter(p => (p.pos ?? 0) >= steps.length)) lines.push(pressLine(p));
  if (r.stall) lines.push({ kind: "stall", text: `Stalled ${Math.round((r.stall.waited ?? 0) / 1000)} s (${r.stall.state}).` });
  if (r.escaped) lines.push({ kind: "end", text: `Escaped: ${r.escaped.name ?? "it"} got away${r.escaped.xp != null ? ` (${r.escaped.xp} XP not earned)` : ""}.` });
  else if (r.extended) lines.push({ kind: "note", text: `You extended the map to the ${r.extended}; the monster kept its turn.` });
  else if (r.state === "fled") lines.push({ kind: "note", text: "At the map's edge, waiting for you." });
  if (r.note && !r.escaped) lines.push({ kind: "note", text: n.named(r.note) });
  if (r.why && !r.parent && !r.replanned) lines.push({ kind: "end", text: `The turn ended: ${n.named(describeChanges(r.why, n.nameOf))}` });
  const end = r.state === "manual" ? "You played the rest yourself." : r.gaveUp ? `Angel gave up: ${n.named(r.verdict ?? "")}` : r.replanned ? "Asked again (below)." : /^Couldn't do/.test(r.verdict ?? "") ? `${n.named(r.verdict)} You played the turn.` : null;
  if (end) lines.push({ kind: "end", text: end });
  return { id, at: r.at ?? 0, by: r.by ? `${ROUTE[r.by.by] ?? "a GM"}${r.by.model ? `, ${r.by.model}` : ""}` : null, reason: plan?.reason ? n.named(plan.reason) : null,
    asked: r.why && r.parent ? n.named(describeChanges(r.why, n.nameOf)) : null, plan: steps.map((s, i) => ({ text: n.named(describeStep(s)), why: plan?.steps?.[i]?.why ? n.named(plan.steps[i].why) : null })),
    lines, state: r.state, waiting: asking && !r.gaveUp };
}

/** The whole fight, by round. t: the Combat's turns flag. fight: { round, turn (index), order: [{ id, name, npc }] } in initiative order (npc: a monster, not one on the party's side); names: tokenId → name.
    Monsters with no request in a round that has passed them were played by the GM (one line each), so the rounds read in order. */
export function historyOf(t = {}, fight = {}, names = {}, look = {}) {
  const n = namer(t.labels ?? {}, names), reqs = Object.entries(t.requests ?? {}).filter(([, r]) => r && Number.isFinite(r.round));
  const order = fight.order ?? [], at = id => { const i = order.findIndex(c => c.id === id); return i < 0 ? 999 : i; };
  const rounds = new Map();
  for (const [id, r] of reqs) {
    const turns = rounds.get(r.round) ?? new Map(); rounds.set(r.round, turns);
    /* a turn taken after a Delay in the same round is its own turn (0.12.0), listed after the one it delayed on */
    const key = `${r.round}.${r.combatantId}${r.afterDelay ? ".back" : ""}`, c = order.find(x => x.id === r.combatantId);
    const turn = turns.get(key) ?? { key, combatantId: r.combatantId, name: `${c?.name ?? names[r.tokenId] ?? "A monster"}${r.afterDelay ? " (back after delaying)" : ""}`, angel: true, parts: [], idx: r.delayed && Number.isFinite(r.turn) ? r.turn : at(r.combatantId) + (r.afterDelay ? 0.5 : 0), delayedOn: !!r.delayed };   /* the turn it delayed on sits where it was then, not where it is now */
    turn.parts.push(partOf(id, r, look, n)); turns.set(key, turn);
  }
  /* a monster brought back (Rhea, 2026-11-08): one line in the round it returned, under its name; the escape line stays with the turn it fled on */
  for (const [reqId, e] of Object.entries(t.escaped ?? {})) { if (!e?.returned || !Number.isFinite(e.returned.round)) continue;
    const turns = rounds.get(e.returned.round) ?? new Map(); rounds.set(e.returned.round, turns);
    turns.set(`${e.returned.round}.back.${reqId}`, { key: `${e.returned.round}.back.${reqId}`, combatantId: null, name: e.name ?? names[e.tokenId] ?? "A monster", angel: false, returned: true, parts: [], idx: 998 }); }
  for (let round = 1; round <= (fight.round ?? 0); round++) {
    const turns = rounds.get(round) ?? new Map();
    order.forEach((c, i) => { if (!c.npc || turns.has(`${round}.${c.id}`)) return; if (round === fight.round && i >= (fight.turn ?? 0)) return;
      turns.set(`${round}.${c.id}`, { key: `${round}.${c.id}`, combatantId: c.id, name: c.name, angel: false, parts: [], idx: i }); });
    if (turns.size) rounds.set(round, turns);
  }
  return [...rounds.entries()].sort((a, b) => a[0] - b[0]).map(([round, turns]) => ({ round, turns: [...turns.values()].sort((a, b) => a.idx - b.idx || (a.parts[0]?.at ?? 0) - (b.parts[0]?.at ?? 0))
    .map(x => ({ ...x, parts: x.parts.sort((a, b) => a.at - b.at), current: round === fight.round && x.combatantId === fight.current && !x.delayedOn })) }));
}

/* ---------- HTML: the window and the journal page ---------- */
const clock = ms => { if (!ms) return ""; const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
function partHTML(p, esc, { links }) {
  const link = cards => links && cards?.length ? ` ${cards.map(id => `<a class="leb-h-card" data-message="${esc(id)}" title="Show this roll's card in chat"><i class="fa-solid fa-comment-dots"></i></a>`).join("")}` : "";
  const head = `<p class="leb-h-plan">${p.asked ? `<span class="leb-h-warn">Asked again: ${esc(p.asked)}</span><br>` : ""}${p.reason ? `<b>Plan:</b> ${esc(p.reason)}` : p.waiting ? "<em>Waiting for a plan.</em>" : ""}${p.by ? ` <span class="leb-h-by">(${esc(p.by)}${p.at ? `, ${clock(p.at)}` : ""})</span>` : ""}</p>`;
  const plan = p.plan.length ? `<ol class="leb-h-steps">${p.plan.map(s => `<li>${esc(s.text)}${s.why ? ` <span class="leb-h-why">— ${esc(s.why)}</span>` : ""}</li>`).join("")}</ol>` : "";
  const lines = p.lines.map(l => l.kind === "step" ? `<li class="leb-h-act"><b>${l.n}.</b> ${esc(l.text)}${l.why ? ` <span class="leb-h-why">— ${esc(l.why)}</span>` : ""}<br><span class="leb-h-res">→ ${esc(l.result)}</span>${link(l.cards)}</li>`
    : l.kind === "refused" ? `<li class="leb-h-warn">${esc(l.text)}${l.plan ? `<br><span class="leb-h-by">Its plan: ${esc(l.plan.reason || "")} ${esc(l.plan.steps.join("; "))}</span>` : ""}</li>`
    : `<li class="leb-h-${l.kind}">${esc(l.text)}</li>`).join("");
  return `${head}${plan}${lines ? `<ul class="leb-h-lines">${lines}</ul>` : ""}`;
}
/** The window's HTML. open(key) says whether a turn is unfolded. */
export function historyHTML(rounds, esc, { links = true, open = () => true } = {}) {
  if (!rounds.length) return "<p><em>Nothing yet: monster turns show here as they happen.</em></p>";
  return rounds.map(rd => `<section class="leb-h-round"><h3>Round ${rd.round}</h3>${rd.turns.map(t => t.angel
    ? `<details class="leb-h-turn${t.current ? " leb-h-cur" : ""}" data-key="${esc(t.key)}" ${open(t.key, t) ? "open" : ""}><summary><b>${esc(t.name)}</b>${t.current ? " (now)" : ""}${t.parts.length > 1 ? ` <span class="leb-h-by">· asked ${t.parts.length - 1} more time${t.parts.length > 2 ? "s" : ""}</span>` : ""}</summary>${t.parts.map(p => partHTML(p, esc, { links })).join('<hr class="leb-h-sep">')}</details>`
    : `<p class="leb-h-gm"><b>${esc(t.name)}</b>: ${t.returned ? "brought back into the fight." : "played by the GM."}</p>`).join("")}</section>`).join("");
}
/** The journal page: the same, plain, everything unfolded, no buttons. */
export function journalHTML(rounds, esc, { title = "", when = "" } = {}) {
  const body = rounds.map(rd => `<h2>Round ${rd.round}</h2>${rd.turns.map(t => t.angel
    ? `<h3>${esc(t.name)}</h3>${t.parts.map(p => partHTML(p, esc, { links: false })).join("<hr>")}`
    : `<p><b>${esc(t.name)}</b>: ${t.returned ? "brought back into the fight." : "played by the GM."}</p>`).join("")}`).join("");
  return `<p><em>${esc(title)}${when ? ` · ${esc(when)}` : ""}</em></p>${body || "<p>No monster turns were recorded.</p>"}`;
}
