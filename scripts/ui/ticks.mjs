/* Lythara Encounter Builder: the Monster Turns window's group ticks. Pure: no Foundry globals, so the unit tests run it in Node. */
/** The group ticks on the Monster Turns window (0.22.0; Rhea, 2026-11-09: "All, plus one per kind"). rows: what the window lists, in its order,
    { id, name, kind, party, run, auto }. Out: a row for every monster when there are two or more, then a row per kind with two or more of it (none when
    every monster is the same kind, which the first row already is). A party member the GM plays is in no group: its ticks stay hers alone (0.18.0).
    run and auto say how many of the group are ticked: "all", "some" or "none". */
export function tickGroups(rows) {
  const mons = (rows ?? []).filter(r => r && !r.party), state = (list, k) => { const n = list.filter(r => r[k]).length; return !n ? "none" : n === list.length ? "all" : "some"; };
  const row = (key, label, list) => ({ key, label, ids: list.map(r => r.id), run: state(list, "run"), auto: state(list, "auto") });
  const kinds = new Map(); for (const r of mons) { const k = String(r.kind ?? r.name ?? ""); if (!kinds.has(k)) kinds.set(k, []); kinds.get(k).push(r); }
  return [...(mons.length > 1 ? [row("all", "All monsters", mons)] : []), ...(kinds.size > 1 ? [...kinds].filter(([, l]) => l.length > 1).map(([k, l]) => row(`kind:${k}`, k, l)) : [])];
}
/** Which of a group's tokens a tick changes: only those whose own tick differs, so nothing is written for the rest. */
export const groupChanges = (ids, rows, flag, on) => (ids ?? []).filter(id => { const r = (rows ?? []).find(x => x.id === id); return !!r && !r.party && !!r[flag] !== !!on; });
