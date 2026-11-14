"use strict";
// shapesASK color rules: CIEDE2000 distances and the eligible tokens for each slot.
// The rules themselves live in ../rules/palette.json.

const fs = require("fs");
const path = require("path");

const RULES_PATH = path.join(__dirname, "..", "rules", "palette.json");

function hexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function srgbToLab(hex) {
  const lin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = hexToRgb(hex).map(lin);
  const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f(x / 0.95047);
  const fy = f(y / 1.0);
  const fz = f(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

function deltaE2000(hex1, hex2) {
  const [L1, a1, b1] = srgbToLab(hex1);
  const [L2, a2, b2] = srgbToLab(hex2);
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const mod360 = (v) => ((v % 360) + 360) % 360;
  const h1p = mod360(deg(Math.atan2(b1, a1p)));
  const h2p = mod360(deg(Math.atan2(b2, a2p)));
  const dL = L2 - L1;
  const dC = C2p - C1p;
  let dh = 0;
  if (C1p * C2p !== 0) {
    dh = h2p - h1p;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dh / 2));
  const Lb = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hb;
  if (C1p * C2p === 0) hb = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hb = (h1p + h2p) / 2;
  else hb = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  const T =
    1 -
    0.17 * Math.cos(rad(hb - 30)) +
    0.24 * Math.cos(rad(2 * hb)) +
    0.32 * Math.cos(rad(3 * hb + 6)) -
    0.2 * Math.cos(rad(4 * hb - 63));
  const dth = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(rad(2 * dth)) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}

function loadPalette() {
  const rules = JSON.parse(fs.readFileSync(RULES_PATH, "utf8"));
  const tokens = rules.tokens;
  const de = (t1, t2) => deltaE2000(tokens[t1], tokens[t2]);
  const figMin = rules.figure.min_delta_e2000_vs_field;
  const coreMin = rules.core.min_delta_e2000_vs_field_and_figure;
  const families = rules.core.families;

  const eligibleFigures = (field) => rules.figure.pool.filter((t) => t !== field && de(t, field) >= figMin);
  const eligibleCores = (family, field, figure) =>
    families[family].pool.filter(
      (t) => t !== field && t !== figure && de(t, field) >= coreMin && de(t, figure) >= coreMin
    );

  // Fail closed if the rules file is inconsistent; nothing is relaxed to make it work.
  const problems = [];
  const all = [
    ...rules.field.pool,
    ...rules.figure.pool,
    ...families.ordinary.pool,
    ...families.bright.pool,
  ];
  for (const t of all) {
    if (!(t in tokens)) problems.push(`token ${t} has no color`);
  }
  const excluded = new Set(Object.values(rules.excluded_inks).map((h) => h.toUpperCase()));
  for (const t of all) {
    if (tokens[t] && excluded.has(tokens[t].toUpperCase())) problems.push(`token ${t} is an excluded ink`);
  }
  const p = families.ordinary.probability + families.bright.probability;
  if (Math.abs(p - 1) > 1e-12) problems.push(`core family probabilities sum to ${p}, not 1`);
  for (const field of rules.field.pool) {
    if (eligibleFigures(field).length === 0) problems.push(`field ${field} has no eligible figure`);
  }
  if (problems.length) {
    throw new Error(`rules/palette.json is not usable:\n  ${problems.join("\n  ")}`);
  }

  // Every (field, figure) pair the draw can produce, with its eligible cores per family.
  const pairs = [];
  for (const field of rules.field.pool) {
    for (const figure of eligibleFigures(field)) {
      pairs.push({
        field,
        figure,
        ordinary: eligibleCores("ordinary", field, figure),
        bright: eligibleCores("bright", field, figure),
      });
    }
  }
  // Colorings available to one structure in each core family (the duplicate-free capacity).
  const capacity = {
    ordinary: pairs.reduce((n, q) => n + q.ordinary.length, 0),
    bright: pairs.reduce((n, q) => n + q.bright.length, 0),
  };

  return { rules, tokens, de, eligibleFigures, eligibleCores, pairs, capacity, rulesPath: RULES_PATH };
}

module.exports = { deltaE2000, loadPalette };
