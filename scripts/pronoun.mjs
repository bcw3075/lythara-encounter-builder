/* Lythara Encounter Builder: each creature's own pronoun (0.30.1, R-2). Rhea, 2026-11-12: creatures are written about with their own pronoun, not
   "it": a character by its sheet's gender, a monster by the Pronoun line of its mind profile, animals and mindless creatures "it" until she says
   otherwise. Pure: no Foundry globals, so the unit tests run it in Node. docs/features/pronouns.md.

   How text is written: the module's sentences about a creature carry markers in the "they" form, and `pro` turns them into that creature's words:
     pro("{They} {has|have} left: {they} {keeps|keep} {their} notebook.", forms)   ->   "She has left: she keeps her notebook."
   Pronoun markers: {they} {them} {their} {theirs} {themself}, a capital for the start of a sentence. A verb that must agree gives both forms,
   {is|are}, {keeps|keep}: the first for he, she and it, the second for they. A marker marked 2 ({they2}, {is|are|2}) is about a second
   creature. Text with no forms given reads as "it", as before 0.30.1. */

/** The picks of the Pronoun line. `other` takes her own words in the line's text: "xe / xem / xyr" (then, if wanted, "xyrs / xemself"). */
export const PRONOUNS = {
  he: { label: "he", words: "he, him, his" },
  she: { label: "she", words: "she, her, her" },
  they: { label: "they", words: "they, them, their" },
  it: { label: "it", words: "it, it, its" },
  other: { label: "other…", words: "your own: write them as “xe / xem / xyr”" }
};
const FORMS = {
  he: { they: "he", them: "him", their: "his", theirs: "his", themself: "himself", plural: false },
  she: { they: "she", them: "her", their: "her", theirs: "hers", themself: "herself", plural: false },
  they: { they: "they", them: "them", their: "their", theirs: "theirs", themself: "themself", plural: true },
  it: { they: "it", them: "it", their: "its", theirs: "its", themself: "itself", plural: false }
};
export const IT = FORMS.it, THEY = FORMS.they;
/** Her own pronoun from the line's text: two to five words split by "/" or ",": subject, object, possessive, then "theirs" and "themself" forms
    when given. Fewer than two words is no pronoun (null). */
export function otherForms(text) {
  const w = String(text ?? "").split(/[\/,]+/).map(s => s.trim().toLowerCase()).filter(s => /^[\p{L}'’-]{1,20}$/u.test(s)).slice(0, 5);
  if (w.length < 2) return null;
  const [they, them, their = `${w[1]}s`] = w;
  return { they, them, their, theirs: w[3] ?? (/s$/.test(their) ? their : `${their}s`), themself: w[4] ?? `${them}self`, plural: false };
}
/** A Pronoun line ({ pick, text }, or a pick's id) as the words to write with. Nothing usable reads as "they". */
export function formsOf(line) {
  const pick = typeof line === "string" ? line : line?.pick;
  if (pick === "other") return otherForms(line?.text) ?? THEY;
  return FORMS[pick] ?? THEY;
}
/** The packet's three words ("she/her/her", minds.mjs `forPacket`) back as forms, for text written to the thinker. Nothing given is "it". */
export function formsFromWords(words) {
  if (typeof words !== "string" || !words.trim()) return IT;
  const subject = words.split("/")[0].trim().toLowerCase();
  return FORMS[subject] ?? otherForms(words) ?? IT;
}
/** One word for a pick, for the windows and the packet: "she", or her own subject word. */
export const pronounWord = line => formsOf(line).they;
/** A character sheet's Gender box as a pick: the first word that says one ("she/they" is she). An empty or unreadable box is "they". */
export function fromGender(text) {
  for (const w of String(text ?? "").toLowerCase().split(/[^\p{L}-]+/u)) {
    if (/^(she|her|hers|female|woman|girl|lady|f|fem|feminine)$/.test(w)) return "she";
    if (/^(he|him|his|male|man|boy|m|masc|masculine)$/.test(w)) return "he";
    if (/^(they|them|their|non-?binary|nb|enby|agender|genderfluid|genderqueer|neutral|none)$/.test(w)) return "they";
    if (w === "it" || w === "its") return "it";
  }
  return "they";
}
/** The pronoun a stat block alone suggests (Rhea, 2026-11-13): "it" for an animal or a mindless creature, "they" for anything that thinks.
    facts: { traits, mind } (mind: the Mind the stat block suggests). */
export const guessPronoun = ({ traits = [], mind = null } = {}) => {
  const t = (traits ?? []).map(x => String(x).toLowerCase());
  return t.includes("animal") || t.includes("mindless") || mind === "animal" || mind === "mindless" ? "it" : "they";
};

const WORDS = ["they", "them", "their", "theirs", "themself"];
const cap = (s, like) => like[0] !== like[0].toLowerCase() ? s[0].toUpperCase() + s.slice(1) : s;
const MARK = /\{(?:(they|them|their|theirs|themself)(2)?|([A-Za-z][A-Za-z']*)\|([A-Za-z][A-Za-z']*)(\|2)?)\}/gi;
/** Text with its markers turned into a creature's own words. forms: the creature the sentence is about (`formsOf`); forms2: a second creature, for
    markers marked 2. With no forms it reads as "it"; with forms null the first creature's markers are left for a later pass. Anything else
    in braces is left alone. */
export function pro(text, forms = IT, forms2 = IT) {
  if (typeof text !== "string" || !text.includes("{")) return text;
  return text.replace(MARK, (all, word, second, one, many, second2) => {
    const f = second || second2 ? forms2 ?? IT : forms; if (!f) return all;   /* forms null: only the second creature's markers are turned */
    if (word) return WORDS.includes(word.toLowerCase()) ? cap(f[word.toLowerCase()], word) : all;
    return f.plural ? many : one;
  });
}
/** Does this text still carry a marker? (For the tests: nothing shown or sent may.) */
export const hasMarker = text => new RegExp(MARK.source, "i").test(String(text ?? ""));
