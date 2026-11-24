/* Angel's room pick (0.42.0, F-6): the Foundry side. The GM's Preview writes an ask on the scene (`roomAsk`); the bridge's API worker, on the runner's
   page, reads it with `api.room.pending()`, has the map drawn with the rooms numbered (`api.room.show`), looks at that picture and the ask, and hands its
   pick in with `api.room.answer`; the GM's Preview sees the answer arrive and moves to that room unless the GM picked one by hand. */
import { ID, readMap } from "./builder.mjs";
import { ROOM_ASK_TTL_S, ROOM_PROMPT, cleanRoomAnswer, roomAsk, roomList } from "./room.mjs";

const gmOnly = () => { if (!game.user.isGM) throw new Error("Only a GM can do this."); };
const PICTURE = `${ID}-rooms`;

/** Write the ask for this Preview; returns its seq. prep: builder.mjs's prepare(). */
export async function askRoom(scene, prep) {
  gmOnly(); const seq = Date.now(), at = game.time.serverTime;   /* the server's clock: the runner may be another machine (review 5) */
  await scene.update({ [`flags.${ID}.==roomAsk`]: { seq, at, user: game.user.id, model: "sonnet", ask: roomAsk(prep.brief, prep.rooms, prep.roomAuto, prep.list) } });
  return seq;
}
/** At a GM's page load: asks this user left behind (a tab closed mid-Preview) go, so no worker pays for a Preview nobody sees (review 6). */
export async function dropMyRoomAsks() {
  if (!game.user.isGM) return;
  for (const s of game.scenes) if (s.getFlag(ID, "roomAsk")?.user === game.user.id) await s.update({ [`flags.${ID}.-=roomAsk`]: null }).catch(() => {});
}
/** The Preview is over: its ask goes, so no worker answers a Preview that has closed. */
export async function dropRoomAsk(scene, seq) {
  if (!game.user.isGM || scene.getFlag(ID, "roomAsk")?.seq !== seq) return;
  await scene.update({ [`flags.${ID}.-=roomAsk`]: null });
}
/** For the worker: the oldest live ask nobody has answered, as an event { kind: "room", sceneId, seq, model, system, ask }, or null. A read.
    skip: "<sceneId>|<seq>" keys the worker has already taken, so one it couldn't hand in doesn't block the newer ones (review 4). */
export function roomPending(skip = []) {
  if (!game.user.isGM || !game.settings.get(ID, "roomByAngel")) return null;
  const seen = new Set(Array.isArray(skip) ? skip : []), now = game.time.serverTime;
  const asks = game.scenes.map(s => [s, s.getFlag(ID, "roomAsk")]).filter(([s, a]) => a?.seq && !a.answer && now - a.at < ROOM_ASK_TTL_S * 1000 && !seen.has(`${s.id}|${a.seq}`)).sort((a, b) => a[1].at - b[1].at);
  if (!asks.length) return null;
  const [s, a] = asks[0];
  return { kind: "room", sceneId: s.id, scene: s.name, seq: a.seq, model: a.model ?? "sonnet", system: ROOM_PROMPT, ask: a.ask, picture: `#${PICTURE}` };
}
/** Draw the map with the rooms numbered on this page (the runner's), for the worker to look at: the scene's picture, walls in red, each room's number,
    and where the party comes in in blue. Gone when the answer is in, or after ten minutes. */
export async function showRoomPicture(sceneId) {
  gmOnly(); const scene = game.scenes.get(sceneId); if (!scene || typeof document === "undefined") return false;
  const { model } = await readMap(scene), list = roomList(model), d = scene.dimensions, px = scene.grid.size, cols = model.cols, rows = model.rows;
  const cell = Math.max(10, Math.min(28, Math.floor(1100 / Math.max(cols, rows)))), src = scene.levels?.contents?.[0]?.background?.src ?? scene.background?.src ?? null;
  document.getElementById(PICTURE)?.remove();
  const el = document.createElement("div"); el.id = PICTURE; el.style.cssText = "position:fixed;right:8px;top:8px;z-index:100000;background:#fff;color:#000;padding:6px;border:2px solid #333;font:12px sans-serif";
  const c = document.createElement("canvas"); c.width = cols * cell; c.height = rows * cell; const g = c.getContext("2d");
  g.fillStyle = "#ddd"; g.fillRect(0, 0, c.width, c.height);
  if (src) { const img = new Image(); img.src = src; await new Promise(res => { img.onload = res; img.onerror = res; setTimeout(res, 15000); }); if (img.naturalWidth) g.drawImage(img, 0, 0, c.width, c.height); }
  /* walls red, doors a thick orange (live test build 1: a door drawn as a wall hid where the rooms open into each other) */
  for (const w of [...scene.walls].sort((a, b) => !!a.door - !!b.door)) { g.strokeStyle = w.door ? "#f08000" : "#d00"; g.lineWidth = w.door ? 5 : 2; g.beginPath(); g.moveTo((w.c[0] - d.sceneX) / px * cell, (w.c[1] - d.sceneY) / px * cell); g.lineTo((w.c[2] - d.sceneX) / px * cell, (w.c[3] - d.sceneY) / px * cell); g.stroke(); }
  g.fillStyle = "#1e78d0cc"; for (const [i, j] of model.entry.squares) g.fillRect(i * cell, j * cell, cell, cell);
  g.font = `bold ${Math.max(12, Math.min(22, cell))}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  for (const r of list) { const x = (r.centre[0] + .5) * cell, y = (r.centre[1] + .5) * cell, rad = Math.max(10, Math.min(18, cell * .8));
    g.fillStyle = "#fff"; g.strokeStyle = "#000"; g.lineWidth = 2; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = "#000"; g.fillText(String(r.n), x, y + 1); }
  const head = document.createElement("div"); head.textContent = `Angel is picking a room on "${scene.name}": rooms numbered in circles, walls red, doors orange, the party's way in blue.`; head.style.marginBottom = "4px";
  el.append(head, c); document.body.append(el);
  setTimeout(() => { if (document.getElementById(PICTURE) === el) el.remove(); }, 10 * 60000);
  return true;
}
const hidePicture = () => { if (typeof document !== "undefined") document.getElementById(PICTURE)?.remove(); };
/** The worker's pick: checked against the ask's rooms and kept on it, or refused in words ({ error }). Answers once; a later answer is ignored.
    meta: { by: "api", model, cost, seconds, failed }. */
export async function answerRoom(sceneId, seq, answer, meta = {}) {
  gmOnly(); const scene = game.scenes.get(sceneId), a = scene?.getFlag(ID, "roomAsk");
  hidePicture();
  if (!a || a.seq !== seq) return { ignored: true, reason: "That Preview has closed." };
  if (a.answer) return { ignored: true, reason: "That ask has its answer." };
  /* the worker couldn't get an answer at all (meta.failed: its words, e.g. "the API account is out of credit"): the Preview says so */
  const rooms = (a.ask?.rooms ?? []).map(r => ({ n: r.room })), clean = typeof meta.failed === "string" && meta.failed ? { error: meta.failed.slice(0, 200) } : cleanRoomAnswer(answer, rooms);
  const cost = Number(meta.cost), out = clean.error ? { error: clean.error } : { n: clean.n, why: clean.why };
  await scene.update({ [`flags.${ID}.roomAsk.answer`]: { ...out, by: "api", model: typeof meta.model === "string" ? meta.model.slice(0, 60) : null, cost: Number.isFinite(cost) ? Math.round(cost * 10000) / 10000 : null, at: Date.now() } });
  return clean.error ? { state: "refused", error: clean.error } : { state: "picked", room: clean.n };
}
