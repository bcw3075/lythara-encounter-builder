/* Hooks, settings, the left-bar group and the API. The work is in builder.mjs (Foundry) and the pure files. */
import { ID, build, clear, findCreatures, markDrawn, markReady, nextToParty, place, prepare, readMap, submitBrief, summary } from "./builder.mjs";
import { BuildApp, askClear, askReplace } from "./ui/build.mjs";
import { TurnsApp } from "./ui/turns.mjs";
import { HistoryApp, onPreDeleteCombat, saveHistory } from "./ui/history.mjs";
import { onReactionPrompt } from "./ui/react.mjs";
import { askAngel, changePlan, onSocket, noteReactionRoll, busy, untickParty, checkOnly, keepTurn, saveTurn, currentRequest, doIt, fightState, hold, onCombatUpdate, onCreateMessage, onMessageUpdate, onPreCreateMessage, onRenderMessage, onRunnerReady, onTokenFlag, perceived, playMyself, reportFailure, rollFor, submitPlan, waitForEvent, watchStalls } from "./fight.mjs";

const CONTROL = "encounters", apps = new Map(); let turnsApp = null, historyApp = null, historyTimer = null;
/* the history window fills in live; many flag writes come in a burst during a turn, so one redraw per quarter second */
const redrawHistory = () => { if (!historyApp?.rendered || historyTimer) return; historyTimer = setTimeout(() => { historyTimer = null; if (historyApp?.rendered) historyApp.render(); }, 250); };
const openHistory = () => { historyApp ??= new HistoryApp(); historyApp.render(true); };
/* The Monster Turns window shows the fight on the scene this browser is looking at, so it redraws when that scene, its fight or a ticked box changes. */
const redrawTurns = () => { if (turnsApp?.rendered) turnsApp.render(); redrawHistory(); };
Hooks.once("init", () => {
  game.settings.register(ID, "partySize", { name: "Party size for balance", hint: "How many PCs threat is worked out for. The campaign's rules say how many; PF2e's Low budget differs from the published one away from 4.", scope: "world", config: true, type: Number, default: 4 });
  game.settings.register(ID, "applyMonsterDamage", { name: "Apply monster damage automatically", hint: "A monster's hit changes HP at once, with PF2e's undo card. Off: damage is rolled and you apply it from the card.", scope: "world", config: true, type: Boolean, default: true });
  game.settings.register(ID, "autoPause", { name: "Pause between a monster's actions (seconds)", hint: "With a monster's Auto ticked, how long to wait after each action before the next, so each roll can be followed. Without Auto, Do it does one action and then shows Next step.", scope: "world", config: true, type: Number, range: { min: 0, max: 15, step: 0.5 }, default: 3 });
  game.settings.register(ID, "reactionTimer", { name: "Time to answer a reaction (seconds)", hint: "When a monster's action lets a player react (Reactive Strike and the like), how long their React / Pass window waits before the reaction passes. 0: no countdown; the turn waits for them or your Continue.", scope: "world", config: true, type: Number, range: { min: 0, max: 60, step: 5 }, default: 20 });
  game.settings.register(ID, "runner", { name: "Account that runs monster turns", hint: "The GM account whose page carries out monster turns: its name, exactly. It targets for real on its own account, so yours are never touched. If it's offline, turns wait and the card says so.", scope: "world", config: true, type: String, default: "Claude Bridge" });
  /* who is thinking for the monsters: the chat's generation and when it last asked for an event. A newer chat retires an older one. */
  game.settings.register(ID, "brain", { scope: "world", config: false, type: Object, default: { generation: 0, at: 0 }, onChange: () => { redrawTurns(); } });
  /* when the thinker last asked, on the server clock: its own setting, so a wait renewing it never writes the generation back (a page's copy of
     "brain" can be a moment old, and an old chat renewing it just after a new chat's hello would undo the takeover) */
  game.settings.register(ID, "brainAt", { scope: "world", config: false, type: Number, default: 0, onChange: () => { redrawTurns(); } });
  game.settings.register(ID, "treasure", { scope: "world", config: false, type: Object, default: { manual: {}, builds: {} } });
});
function openBuild() { const scene = canvas.scene; if (!scene) return; apps.get(scene.id)?.close?.(); const app = new BuildApp(scene); apps.set(scene.id, app); app.render(true); }
const guard = fn => () => { const s = canvas.scene; if (!s) return; fn(s).catch(e => { ui.notifications.error(e.message); console.error(e); }); };
Hooks.on("getSceneControlButtons", controls => {
  if (!game.user.isGM) return;
  controls[CONTROL] = { name: CONTROL, title: "Encounters", icon: "fa-solid fa-dragon", layer: "tokens", order: (controls.notes?.order ?? 10) + .6, activeTool: "select",
    tools: {
      select: { name: "select", title: "Select tokens", icon: "fa-solid fa-expand", order: 1 },
      build: { name: "build", title: "Build Encounter on this map", icon: "fa-solid fa-dragon", button: true, order: 2, onChange: () => openBuild() },
      replace: { name: "replace", title: "Re-place the build around the party", icon: "fa-solid fa-people-arrows", button: true, order: 3, onChange: guard(askReplace) },
      turns: { name: "turns", title: "Monster Turns", icon: "fa-solid fa-list-check", button: true, order: 3.5, onChange: () => { turnsApp ??= new TurnsApp(); turnsApp.render(true); } },
      journal: { name: "journal", title: "Open this build's journal", icon: "fa-solid fa-book-open", button: true, order: 4, onChange: () => { const id = canvas.scene?.getFlag(ID, "build")?.entry; const e = id && game.journal.get(id); if (e) e.sheet.render(true); else ui.notifications.info("This map has no build."); } },
      clear: { name: "clear", title: "Clear this build", icon: "fa-solid fa-trash", button: true, order: 5, onChange: guard(askClear) }
    } };
});
/* a redraw makes any earlier read stale */
/* canvasReady goes through Hooks.call, so a handler returning false stops every later module's handler. No handler here returns anything. */
Hooks.on("lythara-survey-sheet.encounterDrawn", scene => { markDrawn(scene); });
Hooks.on("canvasReady", c => { markReady(c.scene?.id); redrawTurns(); });
/* a party member's ticks last one fight (0.18.0): the runner clears them when the fight is deleted */
Hooks.on("deleteCombat", combat => { untickParty(combat).catch(e => console.warn(`${ID} | untick`, e)); });
for (const h of ["createCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant", "deleteToken"]) Hooks.on(h, () => { redrawTurns(); });
/* a brief sent from a chat shows up in an open window */
Hooks.on("updateScene", (scene, change) => { if (foundry.utils.hasProperty(change, `flags.${ID}.brief`) && !scene.getFlag(ID, "build")) { const app = apps.get(scene.id); if (app?.rendered) { app.loadBrief(); app.render(); } } });
/* the party landing beside a hidden monster is worth a word; nothing moves on its own */
Hooks.on("createToken", (tok, opts, userId) => { if (game.users.activeGM?.id !== game.user.id || !tok.parent?.getFlag(ID, "build") || !tok.isOwner) return; if (!game.actors.party?.members.some(m => m.id === tok.actorId)) return; setTimeout(() => { for (const w of nextToParty(tok.parent)) ui.notifications.warn(w); }, 200); });
/* a clue's page is OBSERVER but its journal has no ownership, so the journal stays out of the player's sidebar. A build's clue opens on
   its own instead of through the journal's sheet. */
Hooks.on("activateNote", note => {
  const { entry, page } = note.document; if (game.user.isGM || !page || !entry?.getFlag(ID, "built") || entry.testUserPermission(game.user, "LIMITED") || !page.testUserPermission(game.user, "LIMITED")) return;
  foundry.applications.ux.TextEditor.implementation.enrichHTML(page.text.content, { secrets: false, relativeTo: page }).then(content => foundry.applications.api.DialogV2.prompt({ window: { title: page.name }, position: { width: 420 }, content, ok: { label: "Close" }, rejectClose: false }));
  return false;
});
/* the fight */
Hooks.on("preCreateChatMessage", message => { onPreCreateMessage(message); });
Hooks.on("createChatMessage", message => { onCreateMessage(message); noteReactionRoll(message); });
Hooks.on("updateChatMessage", (message, change) => { onMessageUpdate(message, change); });
Hooks.on("preUpdateCombatant", (combatant, change, options) => { keepTurn(combatant, change, options); });
Hooks.on("updateCombatant", (combatant, change, options, userId) => { saveTurn(combatant, options, userId); });
Hooks.on("renderChatMessageHTML", (message, html) => { onRenderMessage(message, html); });
Hooks.on("pauseGame", () => { redrawTurns(); });   /* the card says when Auto is waiting on the pause */
Hooks.on("updateCombat", (combat, change) => { if (foundry.utils.hasProperty(change, `flags.${ID}`) || "turn" in change || "round" in change) redrawHistory(); if (turnsApp?.rendered && (foundry.utils.hasProperty(change, `flags.${ID}`) || "turn" in change || "round" in change)) turnsApp.render(); onCombatUpdate(combat, change); });
Hooks.on("updateToken", (tok, change) => { if (foundry.utils.hasProperty(change, `flags.${ID}`)) redrawTurns(); onTokenFlag(tok, change); });
Hooks.on("userConnected", () => { redrawTurns(); });
/* the history: opened from Monster Turns; at End Encounter a GM is asked Save or Discard. This pre-hook returns false only to cancel that one delete
   (it then deletes again once asked); otherwise it returns nothing, like every other handler here. */
Hooks.on(`${ID}.openHistory`, () => { openHistory(); });
/* player reactions (0.20.0): the runner's questions and the players' answers go through the module's socket */
Hooks.on(`${ID}.reactionPrompt`, data => { onReactionPrompt(data); });
Hooks.on("preDeleteCombat", (combat, options, userId) => { if (onPreDeleteCombat(combat, options, userId) === false) return false; });
Hooks.once("ready", () => {
  onRunnerReady().catch(e => console.error(`${ID} | runner`, e));
  watchStalls();
  game.socket.on(`module.${ID}`, (data, senderId) => { onSocket(data, senderId); });
  game.modules.get(ID).api = { readMap, summary, findCreatures, submitBrief, prepare, place, build, clear, nextToParty, fight: { current: currentRequest, busy, perceived, submitPlan, doIt, hold, playMyself, askAngel, changePlan, rollFor, waitForEvent, checkPlan: checkOnly, reportFailure, state: fightState, saveHistory, openHistory } };
});
