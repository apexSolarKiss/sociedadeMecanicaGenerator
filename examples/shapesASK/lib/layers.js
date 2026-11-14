"use strict";
// shapesASK layer preparation: turns each structure's editable master SVG into
// the component layers HashLips composites. One layer per master group; the
// group's data-role decides which recipe color fills it.

const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const SOURCE_DIR = path.join(__dirname, "..", "source");
const GROUP_RE = /^  <g id="([a-z]+)" data-role="([a-z]+)" data-shape="([a-z ]+)">(.*)<\/g>$/;
const FILL_RE = /fill="#[0-9A-Fa-f]{6}"/g;

function loadMaster(family, layerOrder) {
  const file = path.join(SOURCE_DIR, family.master);
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");
  const first = lines.findIndex((l) => l.startsWith("  <g "));
  const head = lines.slice(0, first).join("\n") + "\n";
  if (first < 0) throw new Error(`${family.master}: no layer groups`);
  const groups = [];
  const rest = lines.slice(first);
  while (rest.length && rest[rest.length - 1] === "") rest.pop();
  if (rest.pop() !== "</svg>") throw new Error(`${family.master}: must end with </svg> after the last group`);
  for (const line of rest) {
    // one group per line, nothing else between them
    const m = GROUP_RE.exec(line);
    if (!m) throw new Error(`${family.master}: unreadable layer group: ${line.slice(0, 80)}`);
    const [, element, role, shape, inner] = m;
    if ((inner.match(FILL_RE) || []).length !== 1) {
      throw new Error(`${family.master}: group ${element} must carry exactly one fill color`);
    }
    groups.push({ element, role, shape, inner });
  }
  const order = groups.map((g) => g.element).join(",");
  if (order !== layerOrder.join(",")) {
    throw new Error(`${family.master}: groups are ${order}; expected ${layerOrder.join(",")}`);
  }
  return { file, text, head, groups };
}

// Layer file name = the HashLips trait value. HashLips splits its DNA string on
// "-", reads weights after "#" and ids before ":", so none of those may appear.
function layerValue(group, token) {
  const color = token.replace(/-/g, " ");
  return group.shape === "field" ? color : `${group.shape} (${color})`;
}

function layerSpec(family, group, recipe) {
  const token = recipe[group.role];
  const folder = `${family.id}_${group.element}_${token}`;
  const value = layerValue(group, token);
  if (/[-#:/]/.test(value)) throw new Error(`layer name ${value} contains a character HashLips reserves`);
  return { element: group.element, role: group.role, token, folder, file: `${value}.png`, value };
}

function layerSvg(master, group, hex) {
  const inner = group.inner.replace(FILL_RE, `fill="${hex}"`);
  return `${master.head}  <g id="${group.element}">${inner}</g>\n</svg>\n`;
}

async function renderLayer(master, group, hex, width, height) {
  const img = await loadImage(Buffer.from(layerSvg(master, group, hex), "utf8"));
  const canvas = createCanvas(width, height);
  canvas.getContext("2d").drawImage(img, 0, 0, width, height);
  return canvas.toBuffer("image/png");
}

// Writes every layer the plan needs into layersDir/<folder>/<file>, one file per
// folder, and returns the per-recipe layer lists in drawing order.
async function prepareLayers(plan, families, palette, layersDir) {
  const { width, height } = families.canvas;
  const byId = Object.fromEntries(families.families.map((f) => [f.id, f]));
  const masters = {};
  const written = new Map();
  const perRecipe = [];
  for (const r of plan.recipes) {
    const family = byId[r.family];
    masters[r.family] = masters[r.family] || loadMaster(family, families.layer_order);
    const master = masters[r.family];
    const layers = [];
    for (const group of master.groups) {
      const spec = layerSpec(family, group, r);
      if (!written.has(spec.folder)) {
        const dir = path.join(layersDir, spec.folder);
        fs.mkdirSync(dir, { recursive: false });
        const png = await renderLayer(master, group, palette.tokens[spec.token], width, height);
        fs.writeFileSync(path.join(dir, spec.file), png);
        written.set(spec.folder, spec.file);
      }
      layers.push(spec);
    }
    perRecipe.push(layers);
  }
  return { perRecipe, layerCount: written.size, masters };
}

module.exports = { loadMaster, prepareLayers, layerSvg, SOURCE_DIR };
