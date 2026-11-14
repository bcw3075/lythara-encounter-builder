/* Hooks, settings, the left-bar group and the API. The work is in builder.mjs (Foundry) and the pure files. */
import { ID, build, clear, findCreatures, markDrawn, markReady, nextToParty, place, prepare, readMap, submitBrief, summary } from "./builder.mjs";
import { BuildApp, askClear, askReplace } from "./ui/build.mjs";
import { TurnsApp } from "./ui/turns.mjs";
import { HistoryApp, onPreDeleteCombat, saveHistory } from "./ui/history.mjs";
import { onReactionPrompt } from "./ui/react.mjs";
import { drawChip, registerChip } from "./ui/chip.mjs";
import { MindsApp, openLibrary, redrawLibrary } from "./ui/minds.mjs";
import { LINES, MIND_SCHEMA } from "./minds.mjs";
import { bandOf, bandViews, joinBand, removeBand, setBand } from "./bandlib.mjs";
import { hasMarker, pro } from "./pronoun.mjs";
import { dropLibraryCache, dropOwn, giveOwn, kindFacts, libraryEntries, libraryExport, libraryGet, libraryImport, libraryPut, libraryRemove, mindLayers, mindOf, mindRows, pronounOf, rowProfile, setLines } from "./library.mjs";
import { bandLog, bandLogWords, giveOrder, onRenderOrder, orderCard, orderPreview, setHearCall } from "./fight.mjs";
import { acceptYield, backInFight, gmSpeak, onRenderSay, prisonerList, refuseYield, speakPreview, yieldedList } from "./fight.mjs";
import { answerCommand, checkSides, commandList, dropBeliefs, onSideChange, pointCard, sideList } from "./fight.mjs";
import { apiAlive, apiSpend, apiWanted, fightRoute, fixRoute, handOff, modelOf, setApiNote, setModelPick, setRoute, wakeAngel } from "./fight.mjs";
import { acceptEscapeLines, answerLook, dismissLook, escapeOffers, lookNow } from "./fight.mjs";
import { chooseFor, onReactionCard, partyReactors, setReactionUsed, doReaction, skipReaction, openReactions, onTokenMoved, onActionCard, onItemHands, onConditionGone, askAngel, changePlan, onSocket, noteReactionRoll, busy, untickParty, checkOnly, keepTurn, saveTurn, noteChange, currentRequest, doIt, fightState, hold, onCombatUpdate, onTurnHandedOn, onCombatGone, onCreateMessage, onMessageUpdate, onPreCreateMessage, onRenderMessage, onRunnerReady, onTokenFlag, onMemoryCard, onMemoryUpdate, onMemoryHp, notebookOf, previewRemember, rememberAdd, rememberCross, perceived, playMyself, reportFailure, rollFor, submitPlan, waitForEvent, watchStalls } from "./fight.mjs";

const CONTROL = "encounters", apps = new Map(), mindsApps = new Map(); let turnsApp = null, historyApp = null, historyTimer = null;
/* the history window fills in live; many flag writes come in a burst during a turn, so one redraw per quarter second */
const redrawHistory = () => { if (!historyApp?.rendered || historyTimer) return; historyTimer = setTimeout(() => { historyTimer = null; if (historyApp?.rendered) historyApp.render(); }, 250); };
const openHistory = () => { historyApp ??= new HistoryApp(); historyApp.render(true); };
/* The Monster Turns window shows the fight on the scene this browser is looking at, so it redraws when that scene, its fight or a ticked box changes. */
const redrawTurns = () => { if (turnsApp?.rendered) turnsApp.render(); redrawHistory(); redrawChip(); };
/* the player's reaction chip (0.27.0): drawn again whenever a fight, its creatures or its reaction boxes change; never on a GM's page */
const redrawChip = () => { try { drawChip(); } catch (e) { console.warn(`${ID} | chip`, e); } };
Hooks.once("init", () => {
  game.settings.register(ID, "partySize", { name: "Party size for balance", hint: "How many PCs threat is worked out for. The campaign's rules say how many; PF2e's Low budget differs from the published one away from 4.", scope: "world", config: true, type: Number, default: 4 });
  game.settings.register(ID, "applyMonsterDamage", { name: "Apply monster damage automatically", hint: "A monster's hit changes HP at once, with PF2e's undo card. Off: damage is rolled and you apply it from the card.", scope: "world", config: true, type: Boolean, default: true });
  game.settings.register(ID, "autoPause", { name: "Pause between a monster's actions (seconds)", hint: "With a monster's Auto ticked, how long to wait after each action before the next, so each roll can be followed. Without Auto, Do it does one action and then shows Next step.", scope: "world", config: true, type: Number, range: { min: 0, max: 15, step: 0.5 }, default: 3 });
  game.settings.register(ID, "reactionTimer", { name: "Time to answer a reaction (seconds)", hint: "When a monster's action lets a player react (Reactive Strike and the like), how long their React / Pass window waits before the reaction passes. 0: no countdown; the turn waits for them or your Continue. Reactions you answer on your own card have no countdown.", scope: "world", config: true, type: Number, range: { min: 0, max: 60, step: 5 }, default: 20 });
  game.settings.register(ID, "runner", { name: "Account that runs monster turns", hint: "The GM account whose page carries out monster turns: its name, exactly. It targets for real on its own account, so yours are never touched. If it's offline, turns wait and the card says so.", scope: "world", config: true, type: String, default: "Claude Bridge" });
  /* who is thinking for the monsters: the chat's generation and when it last asked for an event. A newer chat retires an older one. */
  game.settings.register(ID, "brain", { scope: "world", config: false, type: Object, default: { generation: 0, at: 0 }, onChange: () => { redrawTurns(); } });
  /* when the thinker last asked, on the server clock: its own setting, so a wait renewing it never writes the generation back (a page's copy of
     "brain" can be a moment old, and an old chat renewing it just after a new chat's hello would undo the takeover) */
  game.settings.register(ID, "brainAt", { scope: "world", config: false, type: Number, default: 0, onChange: () => { redrawTurns(); } });
  /* the world launch that time was written in: the server clock restarts at every launch, so a time from another launch never counts (0.23.0) */
  game.settings.register(ID, "brainLaunch", { scope: "world", config: false, type: String, default: "", onChange: () => { redrawTurns(); } });
  /* the API route (0.31.0): the route a new fight starts on (each fight's own is on its Combat flag, her "Thinks by" list); the API thinker's own
     generation, listening time and launch, apart from the chat's so neither retires the other; the bridge worker's note (why it stopped, or no key);
     and Wake Angel's latest press, which the worker looks for every few seconds */
  game.settings.register(ID, "defaultRoute", { name: "Angel thinks by (new fights)", hint: "Who thinks for the monsters Angel runs when a fight starts: the Claude API through the bridge (Sonnet, Opus for band leaders and spellcasters two or more levels above the party), a chat through the bridge, or nobody. Each fight can be switched on Monster Turns. If the API can't plan a turn it goes to a listening chat, then to you.", scope: "world", config: true, type: String, choices: { api: "The API (through the bridge)", chat: "A chat", off: "Off: I play them" }, default: "api", onChange: () => { redrawTurns(); } });
  game.settings.register(ID, "apiBrain", { scope: "world", config: false, type: Object, default: { generation: 0, at: 0 }, onChange: () => { redrawTurns(); } });
  game.settings.register(ID, "apiBrainAt", { scope: "world", config: false, type: Number, default: 0, onChange: () => { redrawTurns(); } });
  game.settings.register(ID, "apiBrainLaunch", { scope: "world", config: false, type: String, default: "", onChange: () => { redrawTurns(); } });
  game.settings.register(ID, "apiNote", { scope: "world", config: false, type: Object, default: {}, onChange: () => { redrawTurns(); } });
  game.settings.register(ID, "apiWake", { scope: "world", config: false, type: Object, default: {}, onChange: () => { redrawTurns(); } });
  registerChip();   /* where each player put their reaction chip, per browser (0.27.0) */
  game.settings.register(ID, "treasure", { scope: "world", config: false, type: Object, default: { manual: {}, builds: {} } });
});
/* Monster Minds (0.24.0): one window per scene; it redraws when the scene's brief or a token's own profile changes, unless she is in the middle of an edit */
function openMinds(scene = canvas.scene) { if (!scene || !game.user.isGM) return null; let app = mindsApps.get(scene.id); if (!app) { app = new MindsApp(scene); mindsApps.set(scene.id, app); } app.render(true); return app; }
const redrawMinds = scene => { const app = scene && mindsApps.get(scene.id); if (app?.rendered && !app.dirty) app.render(); };
const onLibraryPage = page => { if (!page?.parent?.getFlag?.(ID, "mindsLibrary")) return; dropLibraryCache(); redrawLibrary(); for (const app of mindsApps.values()) if (app.rendered && !app.dirty) app.render(); };
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
      minds: { name: "minds", title: "Monster Minds", icon: "fa-solid fa-brain", button: true, order: 3.7, onChange: () => { openMinds(); } },
      library: { name: "library", title: "Minds Library", icon: "fa-solid fa-book", button: true, order: 3.8, onChange: () => { openLibrary(); } },
      journal: { name: "journal", title: "Open this build's journal", icon: "fa-solid fa-book-open", button: true, order: 4, onChange: () => { const id = canvas.scene?.getFlag(ID, "build")?.entry; const e = id && game.journal.get(id); if (e) e.sheet.render(true); else ui.notifications.info("This map has no build."); } },
      clear: { name: "clear", title: "Clear this build", icon: "fa-solid fa-trash", button: true, order: 5, onChange: guard(askClear) }
    } };
});
/* a redraw makes any earlier read stale */
/* canvasReady goes through Hooks.call, so a handler returning false stops every later module's handler. No handler here returns anything. */
Hooks.on("lythara-survey-sheet.encounterDrawn", scene => { markDrawn(scene); });
Hooks.on("canvasReady", c => { markReady(c.scene?.id); redrawTurns(); });
/* a party member's ticks last one fight (0.18.0): the runner clears them when the fight is deleted */
Hooks.on("deleteCombat", combat => { onCombatGone(combat); untickParty(combat).catch(e => console.warn(`${ID} | untick`, e)); });
for (const h of ["createCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant", "deleteToken"]) Hooks.on(h, () => { redrawTurns(); });
Hooks.on("updateCombat", () => { redrawChip(); });
/* a brief sent from a chat shows up in an open window */
Hooks.on("updateScene", (scene, change) => { if (!foundry.utils.hasProperty(change, `flags.${ID}`)) return; redrawMinds(scene);
  /* an open Build window holds its own copy of the brief: minds saved meanwhile go into it, or its next Build would write the old ones back (0.24.0 review 4) */
  const app = apps.get(scene.id); if (app?.rendered && scene.getFlag(ID, "build")) { app.takeMinds(scene.getFlag(ID, "brief")); app.render(); } });
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
Hooks.on("preCreateChatMessage", message => { onPreCreateMessage(message);
  /* a net (0.30.1): a pronoun marker nothing turned reads as "it" in chat, never as a brace */
  try { const fix = {}; for (const k of ["content", "flavor"]) if (hasMarker(message[k])) fix[k] = pro(message[k]); if (Object.keys(fix).length) message.updateSource(fix); } catch (e) { console.warn(`${ID} | pronoun`, e); } });
Hooks.on("createChatMessage", message => { onCreateMessage(message); noteReactionRoll(message); onActionCard(message).catch(e => console.warn(`${ID} | reactions`, e)); try { onReactionCard(message); } catch (e) { console.warn(`${ID} | reaction box`, e); } try { onMemoryCard(message); } catch (e) { console.warn(`${ID} | notebook`, e); } });
/* monsters reacting on players' turns (0.21.0): the runner watches moves, cards, items changing hands and Prone coming off. Block bodies: no handler returns anything. */
Hooks.on("moveToken", (doc, movement) => { onTokenMoved(doc, movement); try { dropBeliefs(doc); } catch (e) { console.warn(`${ID} | point out`, e); } });
Hooks.on("updateItem", (item, change) => { onItemHands(item, change); noteChange(item); });
Hooks.on("deleteItem", item => { onConditionGone(item); noteChange(item); });
/* the start of a turn settles (0.23.0): the runner notes every change to a creature in a fight, and reads a monster only once they have stopped */
Hooks.on("createItem", item => { noteChange(item); });
Hooks.on("updateActor", (actor, change, options) => { noteChange(actor); try { onSideChange(actor, change); if ("ownership" in change || "==ownership" in change) redrawTurns(); } catch (e) { console.warn(`${ID} | sides`, e); } try { onMemoryHp(actor, change, options); } catch (e) { console.warn(`${ID} | notebook`, e); } });
Hooks.on("updateChatMessage", (message, change) => { onMessageUpdate(message, change); try { onMemoryUpdate(message, change); } catch (e) { console.warn(`${ID} | notebook`, e); } });
Hooks.on("preUpdateCombatant", (combatant, change, options) => { keepTurn(combatant, change, options); });
Hooks.on("updateCombatant", (combatant, change, options, userId) => { saveTurn(combatant, options, userId); noteChange(combatant); });
Hooks.on("renderChatMessageHTML", (message, html) => { onRenderMessage(message, html); try { onRenderOrder(message, html); onRenderSay(message, html); } catch (e) { console.warn(`${ID} | order line`, e); } });
Hooks.on("pauseGame", () => { redrawTurns(); });   /* the card says when Auto is waiting on the pause */
Hooks.on("updateCombat", (combat, change) => { if (foundry.utils.hasProperty(change, `flags.${ID}`) || "turn" in change || "round" in change) redrawHistory(); if (turnsApp?.rendered && (foundry.utils.hasProperty(change, `flags.${ID}`) || "turn" in change || "round" in change)) turnsApp.render(); onCombatUpdate(combat, change); });
/* a turn handed on with no `updateCombat` (the current combatant deleted, 0.24.0): `combatTurnChange` on the pages core tells, `deleteCombatant` on every page */
Hooks.on("combatTurnChange", combat => { onTurnHandedOn(combat); });
Hooks.on("deleteCombatant", combatant => { onTurnHandedOn(combatant.parent); });
/* B-6 (0.31.0): a creature that joins a fight already begun gets its side books at once (the runner's `checkSides`), so a first change of side
   is kept as a change and not as the side it started on */
Hooks.on("createCombatant", combatant => { if (combatant.parent?.started) checkSides(combatant.parent); });
/* the API route (0.31.0 review 10): a fight that starts takes the route the setting names now, so changing the setting later leaves it be */
Hooks.on("combatStart", combat => { fixRoute(combat).catch(e => console.warn(`${ID} | route`, e)); });
Hooks.on("updateToken", (tok, change) => { if (foundry.utils.hasProperty(change, `flags.${ID}`)) { redrawTurns(); redrawMinds(tok.parent); } onTokenFlag(tok, change); try { onSideChange(tok, change); } catch (e) { console.warn(`${ID} | sides`, e); } });
/* monster minds (0.24.0): the library is pages of one GM-only journal, read from a cache; the windows follow the scene's brief and tokens */
for (const h of ["createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage"]) Hooks.on(h, page => { onLibraryPage(page); });
Hooks.on("deleteJournalEntry", entry => { if (entry.getFlag(ID, "mindsLibrary")) { dropLibraryCache(); redrawLibrary(); } });
for (const h of ["createToken", "deleteToken"]) Hooks.on(h, tok => { redrawMinds(tok.parent); });
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
  redrawChip();
  game.modules.get(ID).api = { readMap, summary, findCreatures, submitBrief, prepare, place, build, clear, nextToParty, fight: { current: currentRequest, busy, reactions: openReactions, doReaction, skipReaction, partyReactions: { list: partyReactors, set: setReactionUsed }, choose: chooseFor, perceived, submitPlan, doIt, hold, playMyself, askAngel, changePlan, rollFor, waitForEvent, checkPlan: checkOnly, reportFailure, state: fightState, saveHistory, openHistory, memory: { of: notebookOf, preview: previewRemember, add: rememberAdd, cross: rememberCross },
      /* the leader's orders (0.28.0): `orders.preview(combat, tokenId)` says whether that creature may give one now and who would hear it;
         `orders.give(combat, tokenId, order)` is the GM's Give orders box (never Angel's door: Angel's leader orders from its plan, with an "order"
         step); `orders.hear` is her call on one member for this round; `orders.log` and `orders.words` read the band log */
      orders: { preview: orderPreview, give: giveOrder, hear: setHearCall, card: orderCard, log: bandLog, words: bandLogWords },
      /* speech and yielding (0.29.0): who stands down and this fight's prisoners; `accept`, `fightOn` (`{ own: true }` is Play it myself) and
         `back` are the GM's buttons on Monster Turns: never Angel's door (a monster yields from its plan, with a "say" step) */
      speech: { yielded: yieldedList, prisoners: prisonerList, accept: acceptYield, fightOn: refuseYield, back: backInFight, box: speakPreview, say: gmSpeak },
      /* tier 3d (0.30.0): `commands.list` the commands in force (an animal's row and card) and `commands.answer(combat, tokenId, "own" | "angel")`,
         the GM's buttons after a failed command (never Angel's door: a handler commands from its plan, with a "command-animal" step);
         `pointOut.card` the GM's box under a Point Out step; `sides.list` who changed sides or became a player's, and `sides.check(combat)`,
         the runner's look at every monster's side (it runs by itself at each turn change and when an actor's side or owners change) */
      commands: { list: commandList, answer: answerCommand }, pointOut: { card: pointCard }, sides: { list: sideList, check: checkSides },
      /* the API route (0.31.0): `route.of(combat)` / `route.set(combat, "api" | "chat" | "off")` her "Thinks by" list; `route.model(token)` which
         model thinks for it and why; `route.pick(scene, tokenIds, "opus" | "sonnet" | null)` her Model tick (null: the rule again). The rest is the
         bridge worker's door: `route.wanted()` (a read: is a fight on the API route, Wake Angel's latest press), `route.note(note)`, and
         `handOff(combat, requestId, reason, meta)` when the API can't plan a turn (it falls back to a chat, then the GM), `route.alive(generation)`
         while an answer takes long, `route.spend(combat, use)` for every answer the API gave. `route.wake(combat?, requestId?)` is the card's Wake
         Angel. The worker waits with `waitForEvent(cursor, s, { generation, route: "api" })` and hands in with `by: "api"`. */
      route: { of: fightRoute, set: setRoute, model: modelOf, pick: setModelPick, wanted: apiWanted, note: setApiNote, wake: wakeAngel, alive: apiAlive, spend: apiSpend }, handOff,
      /* the fight-start look (0.33.0): `look.now(combat)` the look as it stands; `look.answer(combat, i | "all", "accept" | "keep")` and
         `look.dismiss(combat)` are the GM's buttons on its card (never Angel's door: Angel answers the "look" event through submitPlan with
         requestId "look"); `look.escapes(combat)` what the monsters that got away offer at End Encounter, `look.acceptEscapes(combat, { tokenId:
         [lines] })` her Accepts there */
      look: { now: lookNow, answer: answerLook, dismiss: dismissLook, escapes: escapeOffers, acceptEscapes: acceptEscapeLines } },
    /* monster minds (0.24.0), `api.minds`: how a chat reads and writes profiles (api.minds.set, api.minds.open, api.minds.library.put and the rest). `by: "angel"` never replaces a line whose words are the GM's unless `force`.
       This is the chat's door, so a write with no `by` is Angel's (the windows say "gm" themselves): only `by: "gm"` for words she dictated, and
       `giveOwn`, `dropOwn`, `library.remove` and `library.import` only when she asked for them. */
    minds: { schema: MIND_SCHEMA, lines: LINES, rows: mindRows, profile: rowProfile, layers: mindLayers, of: mindOf, pronounOf, kindOf: kindFacts, giveOwn, dropOwn, open: openMinds, openLibrary,
      set: (scene, ref, lines, { by = "angel", force = false } = {}) => setLines(scene, ref, lines, { by, force }),
      /* bands (0.26.0): `bands.list(scene)` reads every band with its members, leader, nature and plan; `bands.set(scene, key, change)` changes or
         makes one (as Angel unless `by: "gm"`; never over her words or choices without `force`); `bands.join(scene, ref, key)` puts a row, a kind or
         a token into a band; `bands.remove` only when she asked. */
      bands: { list: bandViews, of: bandOf, join: joinBand, remove: removeBand, set: (scene, key, change, { by = "angel", force = false } = {}) => setBand(scene, key, change, { by, force }) },
      library: { list: libraryEntries, get: libraryGet, remove: libraryRemove, export: libraryExport, import: libraryImport, put: (entry, { by = "angel", force = false } = {}) => libraryPut(entry, { by, force }) } } };
});
