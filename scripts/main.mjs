/* Hooks, settings, the left-bar group and the API. The work is in builder.mjs (Foundry) and the pure files. */
import { ID, build, clear, findCreatures, markDrawn, markReady, nextToParty, place, prepare, readMap, submitBrief, summary } from "./builder.mjs";
import { BuildApp, askClear, askReplace } from "./ui/build.mjs";

const CONTROL = "encounters", apps = new Map();
Hooks.once("init", () => {
  game.settings.register(ID, "partySize", { name: "Party size for balance", hint: "How many PCs threat is worked out for. The campaign's rules say how many; PF2e's Low budget differs from the published one away from 4.", scope: "world", config: true, type: Number, default: 4 });
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
      journal: { name: "journal", title: "Open this build's journal", icon: "fa-solid fa-book-open", button: true, order: 4, onChange: () => { const id = canvas.scene?.getFlag(ID, "build")?.entry; const e = id && game.journal.get(id); if (e) e.sheet.render(true); else ui.notifications.info("This map has no build."); } },
      clear: { name: "clear", title: "Clear this build", icon: "fa-solid fa-trash", button: true, order: 5, onChange: guard(askClear) }
    } };
});
/* a redraw makes any earlier read stale */
Hooks.on("lythara-survey-sheet.encounterDrawn", scene => markDrawn(scene));
Hooks.on("canvasReady", c => markReady(c.scene?.id));
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
Hooks.once("ready", () => {
  game.modules.get(ID).api = { readMap, summary, findCreatures, submitBrief, prepare, place, build, clear, nextToParty };
});
