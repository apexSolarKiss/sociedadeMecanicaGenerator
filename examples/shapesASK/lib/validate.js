"use strict";
// Validates a finished HashLips run against the plan. A zero exit status from
// the engine proves nothing on its own: HashLips exits normally even when it
// gives up on duplicate DNA. Every check below reads the files it wrote.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

// Share of pixels that may differ from the output's three colors: anti-aliased
// edges only. Measured runs sit near 0.3%; anything near this ceiling is wrong.
const MAX_EDGE_SHARE = 0.01;

const sha1 = (s) => crypto.createHash("sha1").update(s, "utf8").digest("hex");
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const toInt = (hex) => parseInt(hex.slice(1), 16);
const hexOf = (d, i) =>
  "#" + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, "0").toUpperCase()).join("");

function expectedDna(layers) {
  return layers.map((l) => `0:${l.file}`).join("-");
}

// Each metadata record names its image by a path relative to the record:
// json/<N>.json >> ../images/<N>.png, never a remote address.
const IMAGE_BASE = "../images";

// In json/<N>.json and in json/_metadata.json, the reference must be exactly
// ../images/<N>.png, resolve inside the run folder to images/<N>.png with no
// symbolic link on the way, and reach a regular file whose bytes have the
// validated hash. Used on the build output before export and again on the
// exported folder.
function checkImageReferences(root, n, imageHashes) {
  const failures = [];
  const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
  let all;
  try {
    all = read("json/_metadata.json");
  } catch (e) {
    return [`json/_metadata.json: ${e.message}`];
  }
  for (let ed = 1; ed <= n; ed++) {
    const planned = `${IMAGE_BASE}/${ed}.png`;
    const target = `images/${ed}.png`;
    let one;
    try {
      one = read(`json/${ed}.json`);
    } catch (e) {
      failures.push(`json/${ed}.json: ${e.message}`);
      continue;
    }
    const entry = Array.isArray(all) ? all.find((m) => m && m.edition === ed) : undefined;
    for (const [where, meta] of [[`json/${ed}.json`, one], [`json/_metadata.json, edition ${ed}`, entry]]) {
      const ref = meta && meta.image;
      if (ref !== planned) {
        failures.push(`${where}: image is ${JSON.stringify(ref)}, planned ${planned}`);
        continue;
      }
      const resolved = path.resolve(root, "json", ref);
      if (path.relative(root, resolved).split(path.sep).join("/") !== target) {
        failures.push(`${where}: ${ref} does not resolve to ${target}`);
        continue;
      }
      let st = null;
      try {
        st = fs.lstatSync(resolved);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      if (!st || !st.isFile()) {
        failures.push(`${where}: ${ref} does not reach a regular file`);
        continue;
      }
      if (fs.realpathSync(resolved) !== path.join(fs.realpathSync(root), "images", `${ed}.png`)) {
        failures.push(`${where}: ${ref} leads outside the run folder through a symbolic link`);
        continue;
      }
      if (sha256(fs.readFileSync(resolved)) !== imageHashes[ed]) {
        failures.push(`${where}: ${ref} reaches a file that is not the validated image`);
      }
    }
  }
  return failures;
}

async function validateRun({ buildDir, plan, layerLists, families, palette, config, engineStdout }) {
  const failures = [];
  const fail = (msg) => failures.push(msg);
  const n = plan.recipes.length;
  const { width, height } = families.canvas;
  const byId = Object.fromEntries(families.families.map((f) => [f.id, f]));
  const excluded = new Set(Object.values(palette.rules.excluded_inks).map(toInt));

  // 1. exactly the expected files
  const want = (k) => Array.from({ length: n }, (_, i) => `${i + 1}.${k}`);
  const listed = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : null); // hidden files count too
  const images = listed(path.join(buildDir, "images"));
  const jsons = listed(path.join(buildDir, "json"));
  const same = (a, b) => a && a.length === b.length && a.every((v, i) => v === b[i]);
  if (!same(images, want("png").sort())) fail(`images/ holds ${images ? images.length : "no"} files; expected ${n}`);
  if (!same(jsons, [...want("json"), "_metadata.json"].sort())) fail(`json/ does not hold exactly ${n} records + _metadata.json`);
  const created = (engineStdout.match(/^Created edition: \d+, with DNA: [0-9a-f]{40}$/gm) || []).length;
  if (created !== n) fail(`the engine reported ${created} created editions; expected ${n}`);
  if (/DNA exists!/.test(engineStdout)) fail("the engine reported duplicate DNA");
  if (failures.length) return { ok: false, failures, per_edition: [] };

  // 2. metadata against the plan. Steps 2 and 3 read each file once and record
  //    the hash of exactly those bytes; staging and export check against it.
  const validated = {};
  const readValidated = (rel) => {
    const bytes = fs.readFileSync(path.join(buildDir, rel));
    validated[rel] = sha256(bytes);
    return bytes;
  };
  const all = JSON.parse(readValidated("json/_metadata.json").toString("utf8"));
  if (!Array.isArray(all) || all.length !== n) fail(`_metadata.json holds ${Array.isArray(all) ? all.length : "no"} records`);
  const perEdition = [];
  for (let i = 0; i < n; i++) {
    const r = plan.recipes[i];
    const layers = layerLists[i];
    const ed = i + 1;
    const where = `edition ${ed}`;
    const meta = JSON.parse(readValidated(`json/${ed}.json`).toString("utf8"));
    const fromAll = (all || []).find((m) => m.edition === ed);
    if (JSON.stringify(meta) !== JSON.stringify(fromAll)) fail(`${where}: ${ed}.json differs from its _metadata.json entry`);
    if (meta.edition !== ed) fail(`${where}: metadata edition is ${meta.edition}`);
    if (meta.name !== `${config.namePrefix} #${ed}`) fail(`${where}: name is ${meta.name}`);
    if (meta.description !== config.description) fail(`${where}: description differs`);
    if (meta.image !== `${IMAGE_BASE}/${ed}.png`) fail(`${where}: image is ${meta.image}`);
    if (meta.compiler !== "HashLips Art Engine") fail(`${where}: compiler field is ${meta.compiler}`);
    if ("copyright" in meta) fail(`${where}: carries a copyright field`);
    for (const [k, v] of Object.entries(config.extraMetadata)) {
      if (meta[k] !== v) fail(`${where}: ${k} is ${meta[k]}`);
    }
    const wantAttrs = layers.map((l) => ({ trait_type: l.element, value: l.value }));
    if (JSON.stringify(meta.attributes) !== JSON.stringify(wantAttrs)) fail(`${where}: attributes differ from the plan`);
    if (meta.dna !== sha1(expectedDna(layers))) fail(`${where}: DNA does not match the planned layers`);

    // 3. pixels: size, colors at probe points, edge share, no excluded ink
    const img = await loadImage(readValidated(`images/${ed}.png`));
    if (img.width !== width || img.height !== height) {
      fail(`${where}: image is ${img.width} x ${img.height}`);
      continue;
    }
    const cv = createCanvas(width, height);
    const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, width, height).data;
    const hex = { field: palette.tokens[r.field], figure: palette.tokens[r.figure], core: palette.tokens[r.core] };
    const roleOf = Object.fromEntries(layers.map((l) => [l.element, l.role]));
    const probes = byId[r.family].probes.map((p) => {
      const got = hexOf(d, (p.y * width + p.x) * 4);
      const expect = hex[roleOf[p.element]];
      if (got !== expect.toUpperCase()) fail(`${where}: ${p.element} at (${p.x}, ${p.y}) is ${got}, expected ${expect}`);
      return { element: p.element, got };
    });
    const three = new Set(Object.values(hex).map(toInt));
    let edge = 0;
    let ink = 0;
    let opaque = true;
    for (let k = 0; k < d.length; k += 4) {
      if (d[k + 3] !== 255) opaque = false;
      const v = (d[k] << 16) | (d[k + 1] << 8) | d[k + 2];
      if (!three.has(v)) edge++;
      if (excluded.has(v)) ink++;
    }
    const share = edge / (width * height);
    if (!opaque) fail(`${where}: image is not fully opaque`);
    if (share > MAX_EDGE_SHARE) fail(`${where}: ${(share * 100).toFixed(3)}% of pixels are outside the three colors`);
    if (ink) fail(`${where}: ${ink} pixels are an excluded ink`);
    perEdition.push({ edition: ed, probes_ok: probes.length, edge_pixel_share: +share.toFixed(5) });
  }

  // 4. image references, against the hashes of the images validated above
  if (!failures.length) {
    const imageHashes = Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, validated[`images/${i + 1}.png`]]));
    failures.push(...checkImageReferences(buildDir, n, imageHashes));
  }
  return { ok: failures.length === 0, failures, per_edition: perEdition, max_edge_pixel_share: MAX_EDGE_SHARE, validated };
}

module.exports = { validateRun, expectedDna, checkImageReferences, IMAGE_BASE };
