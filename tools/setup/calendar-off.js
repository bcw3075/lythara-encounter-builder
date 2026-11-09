// Page check "calendar-off" (.modtools.json pageChecks). Run with the bridge's run_script on every
// page the chat uses: target "bridge", each started session ("gm", "player"), and the browser pane's console.
// Simple Calendar Reborn's client setting `open-on-load` comes back on (per browser, and on every fresh
// hidden session), and its window then covers the canvas. Seen in 0.13.0 and 0.14.0's chats.
const id = "foundryvtt-simple-calendar-reborn";
if (!game.modules.get(id)?.active) return `${game.user.name}: calendar module off, nothing to do`;
const was = game.settings.get(id, "open-on-load");
if (was !== false) await game.settings.set(id, "open-on-load", false);
const apps = [...Object.values(ui.windows), ...foundry.applications.instances.values()];
let closed = 0;
for (const app of new Set(apps)) {
  const names = `${app.id ?? ""} ${(app.options?.classes ?? []).join(" ")}`;
  if (/\bsimple-calendar\b|^fsc-/.test(names) && app.rendered) {
    try { await app.close(); closed++; } catch (e) { /* already closing */ }
  }
}
const now = game.settings.get(id, "open-on-load");
const left = document.querySelectorAll(".window-app.simple-calendar").length;
return `${game.user.name}: open-on-load ${was} -> ${now}; closed ${closed} calendar window(s); ${left} left open`;
