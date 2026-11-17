/* The reaction prompt in a player's browser (0.20.0): "The Sod Hound is moving out of a square in your reach. React with Reactive Strike?" React or
   Pass, with the countdown the GM set (Rhea, 2026-11-09: 5 to 60 s, 0 = none). React on Reactive Strike asks the player to roll their Strike as usual
   (PF2e HUD or the sheet) and press Done; the other known reactions are used by pressing React. One window per reaction row, or one for a group of
   rows that are one choice (0.27.0: Glimpse of Redemption when an area hurts several allies, a button for each ally); a row can name its own two
   buttons and its own lines (Weight of Guilt: Stupefied 2 or Enfeebled 2, with what each does). Answers go to the runner by the module's socket.
   Foundry's DialogV2 runs `submit` before it closes (checked in foundry.mjs, 14.370), so a React is never sent as a Pass. */
import { esc } from "../journal.mjs";
import { answerReaction, answerStepsQuestion } from "../fight.mjs";
import { makesItself, stepsQuestion } from "../react.mjs";

const open = new Map();
/* a group's buttons are one under the other: three names side by side wrapped inside their buttons (seen live, 2026-11-11) */
const STYLE = ".leb-rx .leb-count{opacity:.8}.leb-rx .form-footer{flex-wrap:wrap}.leb-rx.leb-many .form-footer{flex-direction:column;align-items:stretch}.leb-rx.leb-many .form-footer button{width:100%;flex:0 0 auto}";
/** "ask" and "close" from the runner. A close can name one row (its creature's reaction went on another row). */
export function onReactionPrompt(data) {
  if (!data || game.user.isGM) return;
  if (data.t === "close") { for (const [k, w] of open) if (k.startsWith(`${data.request}.${data.key}.`) && (!data.row || w.rows.includes(data.row))) { open.delete(k); w.quiet(); w.dlg.close().catch(() => {}); } return; }   /* closed by the runner: no answer sent (review finding 19) */
  if (data.t === "steps") return askSteps(data).catch(e => console.warn("steps question", e));
  if (data.t === "told") { if ((data.users ?? []).includes(game.user.id)) told(data).catch(e => console.warn("reaction result", e)); return; }   /* Recognize Spell's result, to that player only (0.36.0) */
  if (data.t === "stepsClose") { const w = open.get(`steps.${data.key}`); if (w) { open.delete(`steps.${data.key}`); w.quiet(); w.dlg.close().catch(() => {}); } return; }
  if (data.t !== "ask") return;
  const groups = new Map();
  /* one window per character and moment (0.36.0; the pass's sample 1, approved 2026-11-16): every row of one character in this question, a button
     each, since a character has one reaction; a champion's choice of ally (`group`) stays a window of its own */
  for (const x of data.list ?? []) if ((x.users ?? []).includes(game.user.id)) { const g = x.group ?? `c:${x.token ?? x.id}`; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(x); }
  for (const [g, rows] of groups) show(data, g, rows).catch(e => console.warn("reaction prompt", e));
}
async function show(data, group, rows) {
  const k = `${data.request}.${data.key}.${group}`; if (open.has(k)) return;
  if (!document.getElementById("leb-rx-style")) document.head.insertAdjacentHTML("beforeend", `<style id="leb-rx-style">${STYLE}</style>`);
  const x = rows[0], many = rows.length > 1, ids = rows.map(r => r.id), mixed = many && !x.group;
  const left = () => data.until ? Math.max(0, Math.ceil((data.until - game.time.serverTime) / 1000)) : null;
  const send = (row, answer) => answerReaction(data.combat, data.request, data.key, row, answer).catch(e => ui.notifications.error(e.message));
  let answered = false; const quiet = () => { answered = true; };
  const D = foundry.applications.api.DialogV2;
  /* a group: what each row is about, then one question with a button for each */
  const say = r => String(r.words ?? "").replace(/\s*React with .*$/, "").replace(/\s*Counterspell\? .*$/, "");
  const body = mixed ? [...new Set(rows.map(say))].map(w => `<p>${esc(w)}</p>`).join("") + "<p>You have one reaction. Use one?</p>" + rows.map(r => `<p><b>${esc(r.reaction)}</b>${r.detail ?? r.numbers ? `: ${esc(r.detail ?? r.numbers)}` : ""}</p>`).join("")
    : many ? rows.map(r => `<p>${esc(say(r))}</p>`).join("") + `<p>React with ${esc(x.reaction)}? Choose one.</p>`
    : (x.lines?.length ? x.lines : [x.words]).map(w => `<p>${esc(w)}</p>`).join("");
  const buttons = many ? [...rows.map((r, n) => ({ action: `react:${n}`, label: mixed ? `${r.reaction}${makesItself(r.slug) ? " (then make it yourself)" : ""}` : `React: ${r.label ?? r.name}`, icon: "fa-solid fa-bolt", default: n === 0 })), { action: "pass", label: "Pass", icon: "fa-solid fa-xmark" }]
    : [{ action: "react", label: x.labels?.react ?? (x.slug?.startsWith("counterspell") ? "Counterspell" : "React"), icon: "fa-solid fa-bolt", default: !x.labels }, { action: "pass", label: x.labels?.pass ?? "Pass", icon: x.labels ? "fa-solid fa-bolt" : "fa-solid fa-xmark", default: !!x.labels }];
  const ask = new D({ window: { title: x.reaction }, classes: many ? ["leb-rx", "leb-many"] : ["leb-rx"], position: { width: x.lines?.length || many ? 440 : 360 },
    content: `${body}${data.until ? `<p class="leb-count">${x.labels ? `${esc(x.labels.pass)} in` : "It passes in"} <b>${left()}</b> s.</p>` : ""}`,
    buttons,
    submit: async result => { answered = true;
      if (result === "pass") { for (const id of ids) await send(id, "pass"); return; }
      const row = many ? rows[Number(String(result).split(":")[1])] ?? x : x;
      if (!makesItself(row.slug)) return send(row.id, "done");
      await send(row.id, "react");
      let finished = false;
      const done = new D({ window: { title: row.reaction }, classes: ["leb-rx"], position: { width: 360 }, content: `<p>${KNOWN_SPELL(row) ? `Cast ${esc(row.reaction)} now from your sheet` : `Make your ${esc(row.reaction)} now (PF2e HUD or your sheet)`}, then press Done.${row.cast?.monster && row.gate === "cast" ? ` ${esc(row.cast.monster)}'s turn waits.` : ""}</p>`,
        buttons: [{ action: "done", label: "Done", icon: "fa-solid fa-check", default: true }], submit: () => { finished = true; open.delete(k); return send(row.id, "done"); } });
      /* closing this window counts as Done; the runner closing it sends nothing */
      done.addEventListener?.("close", () => { if (!finished) { finished = true; open.delete(k); send(row.id, "done"); } });
      open.set(k, { dlg: done, rows: [row.id], quiet: () => { finished = true; } }); await done.render({ force: true }); } });
  /* closing the question without a button is a Pass */
  ask.addEventListener?.("close", () => { if (open.get(k)?.dlg === ask) open.delete(k); if (!answered) { answered = true; for (const id of ids) send(id, "pass"); } });
  /* a second window open at the same time (a champion's pick of ally beside the player's own question) steps down and right, so none hides another
     (0.37.1, seen live 2026-11-17: two windows opened on the same spot and the lower one couldn't be seen or clicked). Its place is counted before
     its render: the windows of one question start together, so counting rendered ones afterwards would move them all alike (review 1). */
  const under = [...open.values()].filter(w => w.dlg !== ask).length;
  open.set(k, { dlg: ask, rows: ids, quiet }); await ask.render({ force: true });
  if (under) { const p = ask.position ?? {}; ask.setPosition({ top: (Number(p.top) || 0) + 40 * under, left: (Number(p.left) || 0) + 40 * under }); }
  if (data.until) { const tick = setInterval(() => { const n = left(), b = ask.element?.querySelector(".leb-count b"); if (b) b.textContent = n; if (!ask.rendered || n <= 0) { clearInterval(tick); if (ask.rendered && !answered) { answered = true; open.delete(k); ask.close(); } } }, 500); }
}

/* "Two Steps, or a Stride?" (0.34.0; Rhea, 2026-11-15, q-33): one walk of 10 or 15 ft on the player's own turn left a monster's reach, and the
   module can't tell Steps from a Stride. Asked only of the player who owns the mover; closing it or no answer in time leaves it to the GM. */
async function askSteps(data) {
  if (!(data.users ?? []).includes(game.user.id)) return;
  const k = `steps.${data.key}`; if (open.has(k)) return;
  if (!document.getElementById("leb-rx-style")) document.head.insertAdjacentHTML("beforeend", `<style id="leb-rx-style">${STYLE}</style>`);
  const q = stepsQuestion(data.n, data.monsters ?? []), name = canvas.scene?.tokens.get(data.token)?.name ?? game.scenes.find(s => s.tokens.has(data.token))?.tokens.get(data.token)?.name ?? "";
  const left = () => data.until ? Math.max(0, Math.ceil((data.until - game.time.serverTime) / 1000)) : null;
  let answered = false; const D = foundry.applications.api.DialogV2;
  const dlg = new D({ window: { title: name ? `${q.title}: ${name}` : q.title }, classes: ["leb-rx", "leb-steps"], position: { width: 400 },
    content: `${q.lines.map(l => `<p>${esc(l)}</p>`).join("")}${data.until ? `<p class="leb-count">No answer in <b>${left()}</b> s: the GM decides.</p>` : `<p class="leb-count">If you don't answer, the GM decides.</p>`}`,
    /* no default button: an Enter or Space meant for something else must not answer it (review 3) */
    buttons: [{ action: "steps", label: q.steps, icon: "fa-solid fa-shoe-prints" }, { action: "stride", label: q.stride, icon: "fa-solid fa-person-running" }],
    submit: async result => { answered = true; open.delete(k); if (["steps", "stride"].includes(result)) await answerStepsQuestion(data.key, result); } });
  dlg.addEventListener?.("close", () => { answered = true; if (open.get(k)?.dlg === dlg) open.delete(k); });   /* closing it sends nothing: the GM decides */
  open.set(k, { dlg, rows: [], quiet: () => { answered = true; } }); await dlg.render({ force: true });
  if (data.until) { const tick = setInterval(() => { const n = left(), b = dlg.element?.querySelector(".leb-count b"); if (b) b.textContent = n; if (!dlg.rendered || n <= 0) { clearInterval(tick); if (dlg.rendered && !answered) { answered = true; open.delete(k); dlg.close(); } } }, 500); }
}

const KNOWN_SPELL = row => !!row.spell;
/** A result told to one player only (Recognize Spell, 0.36.0): a small window, never a whispered card. */
async function told(data) {
  const D = foundry.applications.api.DialogV2;
  await new D({ window: { title: data.title ?? "Reaction" }, classes: ["leb-rx"], position: { width: 360 }, content: (data.lines ?? []).map(l => `<p>${esc(l)}</p>`).join(""),
    buttons: [{ action: "ok", label: "OK", icon: "fa-solid fa-check", default: true }] }).render({ force: true });
}
