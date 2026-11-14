"use strict";
// shapesASK recipe planner: decides every output's structure and colors before
// HashLips runs. HashLips picks each layer on its own, so the rules that tie
// layers together (aperture = field, core distinct from field and figure, the
// core-family odds) are applied here.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const FAMILIES_PATH = path.join(__dirname, "..", "source", "families.json");
const MAX_ATTEMPTS = 100000;

class PlanError extends Error {}

function loadFamilies() {
  return JSON.parse(fs.readFileSync(FAMILIES_PATH, "utf8"));
}

// Small seeded generator (sfc32), seeded from SHA-256 of the seed text.
function seededRandom(seedText) {
  const h = crypto.createHash("sha256").update(String(seedText), "utf8").digest();
  let a = h.readUInt32LE(0);
  let b = h.readUInt32LE(4);
  let c = h.readUInt32LE(8);
  let d = h.readUInt32LE(12);
  const next = () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  return next;
}

const pick = (rand, list) => list[Math.floor(rand() * list.length)];

function shuffle(rand, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function coreFamilyOf(palette, token) {
  const fams = palette.rules.core.families;
  return Object.keys(fams).find((f) => fams[f].pool.includes(token));
}

function describe(palette, recipe) {
  const { field, figure, core } = recipe;
  return {
    eligible_figures: palette.eligibleFigures(field),
    eligible_cores: {
      ordinary: palette.eligibleCores("ordinary", field, figure),
      bright: palette.eligibleCores("bright", field, figure),
    },
    delta_e2000: {
      field_figure: +palette.de(field, figure).toFixed(2),
      field_core: +palette.de(field, core).toFixed(2),
      figure_core: +palette.de(figure, core).toFixed(2),
    },
  };
}

// Throws if a recipe breaks a rule. Used for drawn and for fixed recipes alike.
function checkRecipe(palette, familyIds, r) {
  const rules = palette.rules;
  const errs = [];
  if (!familyIds.includes(r.family)) errs.push(`unknown structure ${r.family}`);
  if (!rules.field.pool.includes(r.field)) errs.push(`field ${r.field} is not in the field pool`);
  if (!palette.eligibleFigures(r.field).includes(r.figure)) errs.push(`figure ${r.figure} is not eligible on field ${r.field}`);
  const fam = coreFamilyOf(palette, r.core);
  if (!fam) errs.push(`core ${r.core} is in no core family`);
  else if (!palette.eligibleCores(fam, r.field, r.figure).includes(r.core))
    errs.push(`core ${r.core} is not eligible with field ${r.field} and figure ${r.figure}`);
  if (r.core_family && fam && r.core_family !== fam) errs.push(`core family ${r.core_family} does not match ${r.core}`);
  if (errs.length) throw new PlanError(`recipe ${r.edition} (${r.family}) breaks the rules: ${errs.join("; ")}`);
}

// Even split of `count` across the structures; when count is not a multiple of
// their number, the structures listed first in `ids` get one extra each.
function split(count, ids) {
  const base = Math.floor(count / ids.length);
  const extra = count % ids.length;
  return Object.fromEntries(ids.map((id, i) => [id, base + (i < extra ? 1 : 0)]));
}

function planBatch(palette, families, count, seed) {
  const ids = families.families.map((f) => f.id);
  const cap = palette.capacity;
  const maxCount = ids.length * (cap.ordinary + cap.bright);
  if (count > maxCount) {
    throw new PlanError(
      `--count ${count} exceeds the ${maxCount} distinct outputs the rules allow (${ids.length} structures, ` +
        `each with ${cap.ordinary} ordinary and ${cap.bright} bright colorings).`
    );
  }
  const rand = seededRandom(seed);
  const unordered = split(count, shuffle(rand, ids)); // the seed picks which structures take the remainder
  const shares = Object.fromEntries(ids.map((id) => [id, unordered[id]]));
  // 1. structures: an even split, shuffled into edition order.
  const slots = shuffle(rand, ids.flatMap((id) => Array(shares[id]).fill(id)));
  // 2. core family per output, drawn first and never redrawn.
  const probs = palette.rules.core.families;
  const coreFamilies = slots.map(() => (rand() < probs.bright.probability ? "bright" : "ordinary"));
  // 3. capacity check: refuse rather than relax a rule or switch families.
  for (const id of ids) {
    for (const fam of ["ordinary", "bright"]) {
      const need = slots.filter((s, i) => s === id && coreFamilies[i] === fam).length;
      if (need > cap[fam]) {
        throw new PlanError(
          `seed "${seed}" draws ${need} ${fam} cores for ${id}, but only ${cap[fam]} distinct ${fam} colorings ` +
            `exist for one structure. No rule was relaxed. Use a smaller --count or another --seed.`
        );
      }
    }
  }
  // 4. colors, redrawing within the same structure and core family on a duplicate.
  const used = new Set();
  const recipes = slots.map((family, i) => {
    const core_family = coreFamilies[i];
    for (let attempts = 1; attempts <= MAX_ATTEMPTS; attempts++) {
      const field = pick(rand, palette.rules.field.pool);
      const figure = pick(rand, palette.eligibleFigures(field));
      const cores = palette.eligibleCores(core_family, field, figure);
      if (cores.length === 0) {
        throw new PlanError(`no ${core_family} core is eligible for field ${field} and figure ${figure}`);
      }
      const core = pick(rand, cores);
      const key = [family, field, figure, core].join("|");
      if (used.has(key)) continue;
      used.add(key);
      return { edition: i + 1, family, core_family, field, figure, core, draws: attempts };
    }
    throw new PlanError(`edition ${i + 1}: no new ${core_family} coloring for ${family} after ${MAX_ATTEMPTS} draws`);
  });
  for (const r of recipes) checkRecipe(palette, ids, r);
  return { mode: "batch", seed, shares, recipes };
}

function planReferences(palette, families) {
  const ids = families.families.map((f) => f.id);
  const recipes = families.families.map((f, i) => {
    const r = { edition: i + 1, family: f.id, ...f.reference };
    r.core_family = coreFamilyOf(palette, r.core);
    r.draws = 0;
    return r;
  });
  for (const r of recipes) checkRecipe(palette, ids, r);
  return { mode: "references", seed: null, shares: Object.fromEntries(ids.map((id) => [id, 1])), recipes };
}

module.exports = { PlanError, loadFamilies, planBatch, planReferences, describe, seededRandom, FAMILIES_PATH };
