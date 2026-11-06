/* The journal a build files, as plain page data. Pure: no Foundry globals. Brief text is escaped; @Check links still work because
   they use no markup. GM truth goes in a secret section. Only what the brief says is written: no story is made up. */
export const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const paras = s => esc(s).split(/\n{2,}|\r?\n/).filter(Boolean).map(p => `<p>${p}</p>`).join("");
const block = (head, s) => s ? `<h3>${esc(head)}</h3>${paras(s)}` : "";

export function journalPages(brief, { threat, setup = [], treasure = [], treasureNote = "" } = {}) {
  const t = threat ?? {}, story = [block("Why here", brief.why), block("What they want", brief.want), block("What they were doing", brief.doing), block("How they retreat", brief.retreat)].join("");
  const overview = `${brief.beat ? `<p><em>${esc(brief.beat)}</em></p>` : ""}<h3>Threat</h3><p>${esc(t.rating ?? "unknown")}: ${esc(t.xp ?? "?")} XP for ${esc(t.size ?? "?")} PCs of level ${esc(t.level ?? "?")}.</p>${t.claimNote ? `<p><strong>${esc(t.claimNote)}</strong></p>` : ""}<h3>On the map</h3><ul>${setup.map(s => `<li>${esc(s)}</li>`).join("")}</ul>${story}`;
  const tactics = brief.creatures.map((c, g) => `<h3 data-group="${g}">${esc(c.name || "Creature")} (${esc(c.role)})</h3>${c.tactics ? paras(c.tactics) : "<p>No tactics written.</p>"}`).join("");
  const j = brief.journal, learn = [j.truth ? `<section class="secret"><h3>GM truth</h3>${paras(j.truth)}</section>` : "", block("What locals believe", j.locals), block("What the party can learn", j.learn)].join("");
  const loot = `${treasure.length ? `<ul>${treasure.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : "<p>None placed.</p>"}${treasureNote ? `<p>${esc(treasureNote)}</p>` : ""}`;
  return [
    { name: "Overview", content: overview },
    { name: "Tactics", content: tactics || "<p>No creatures.</p>" },
    ...(learn ? [{ name: "What can be learned", content: learn }] : []),
    { name: "Treasure", content: loot }
  ];
}
