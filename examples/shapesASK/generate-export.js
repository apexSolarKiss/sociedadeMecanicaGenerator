#!/usr/bin/env node
"use strict";
// shapesASK: plan >> prepare layers >> HashLips >> validate >> export.
//
//   npm run generate:export -- --count 32 --output /path/to/new-run-folder [--seed TEXT]
//   npm run generate:export -- --references --output /path/to/new-run-folder
//
// Generation happens only inside the Git-ignored build/shapesASK/ workspace.
// The export goes to a new folder outside every checkout of this repository;
// an existing destination is refused. Apart from its own lock file and its
// EXPORT-INCOMPLETE marker, the command deletes nothing outside the workspace.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const { loadPalette } = require("./lib/palette");
const { PlanError, loadFamilies, planBatch, planReferences, describe, FAMILIES_PATH } = require("./lib/plan");
const { prepareLayers } = require("./lib/layers");
const engine = require("./lib/engine");
const { validateRun, expectedDna, checkImageReferences } = require("./lib/validate");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const MAX_SEED_LENGTH = 200;

class UsageError extends Error {}
class RefusedError extends Error {}

function parseArgs(argv) {
  const out = { count: null, output: null, seed: null, references: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new UsageError(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--count") out.count = value();
    else if (a === "--output") out.output = value();
    else if (a === "--seed") out.seed = value();
    else if (a === "--references") out.references = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new UsageError(`unknown argument ${a}`);
  }
  if (out.help) return out;
  if (!out.output) throw new UsageError("--output <new folder> is required");
  if (out.references) {
    if (out.count !== null && out.count !== "4") throw new UsageError("--references always makes the 4 reference compositions");
    if (out.seed !== null) throw new UsageError("--references draws nothing, so it takes no --seed");
    out.count = 4;
  } else {
    if (out.count === null) throw new UsageError("--count N is required");
    if (!/^[1-9][0-9]*$/.test(out.count)) throw new UsageError(`--count must be a positive whole number, not ${out.count}`);
    out.count = Number(out.count);
    if (out.seed !== null && (out.seed.length === 0 || out.seed.length > MAX_SEED_LENGTH)) {
      throw new UsageError(`--seed must be 1 to ${MAX_SEED_LENGTH} characters`);
    }
  }
  return out;
}

const identity = (p) => {
  const st = fs.statSync(p);
  return `${st.dev}:${st.ino}`;
};

// Every checkout of this repository and its Git directory: this working tree,
// the shared Git directory, the main working tree and any linked worktrees.
function repositoryRoots() {
  const roots = [REPO_ROOT];
  const dotGit = path.join(REPO_ROOT, ".git");
  const st = engine.lstatOrNull(dotGit);
  let common = null;
  if (st && st.isDirectory()) common = dotGit;
  else if (st && st.isFile()) {
    const m = /^gitdir:\s*(.+?)\s*$/m.exec(fs.readFileSync(dotGit, "utf8"));
    if (m) {
      const gitDir = path.resolve(REPO_ROOT, m[1]);
      roots.push(gitDir);
      const cd = path.join(gitDir, "commondir");
      common = fs.existsSync(cd) ? path.resolve(gitDir, fs.readFileSync(cd, "utf8").trim()) : gitDir;
    }
  }
  if (common) {
    roots.push(common);
    if (path.basename(common) === ".git") roots.push(path.dirname(common));
    const wt = path.join(common, "worktrees");
    for (const name of fs.existsSync(wt) ? fs.readdirSync(wt) : []) {
      const gd = path.join(wt, name, "gitdir");
      if (fs.existsSync(gd)) roots.push(path.dirname(path.resolve(wt, name, fs.readFileSync(gd, "utf8").trim())));
    }
  }
  return new Set(roots.filter((p) => fs.existsSync(p)).map(identity));
}

// The destination must be new, and its parent must exist outside every checkout
// of this repository. Folders are compared by filesystem identity, so another
// spelling of the same path (letter case, a firmlink, a symbolic link) is caught.
function checkDestination(output) {
  // npm runs scripts from the package root; INIT_CWD is where npm was started.
  const npmStarted = process.env.npm_lifecycle_event === "generate:export" && process.env.INIT_CWD;
  const dest = path.resolve(npmStarted ? process.env.INIT_CWD : process.cwd(), output);
  if (engine.lstatOrNull(dest)) throw new RefusedError(`destination already exists, refusing to write: ${dest}`);
  const parent = path.dirname(dest);
  if (!engine.lstatOrNull(parent)) throw new RefusedError(`the destination's parent folder does not exist: ${parent}`);
  const realParent = fs.realpathSync(parent);
  if (!fs.statSync(realParent).isDirectory()) throw new RefusedError(`the destination's parent is not a folder: ${parent}`);
  const repo = repositoryRoots();
  for (let p = realParent; ; p = path.dirname(p)) {
    if (repo.has(identity(p))) {
      throw new RefusedError(`destination is inside a checkout of this repository or its Git directory, refusing: ${dest}`);
    }
    if (path.dirname(p) === p) break;
  }
  return { dest: path.join(realParent, path.basename(dest)), shown: dest };
}

function listFiles(dir, rel = "") {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(dir, r));
    else if (e.isFile()) out.push(r);
  }
  return out.sort();
}

async function contactSheet(buildDir, plan, file) {
  const cols = Math.min(8, plan.recipes.length);
  const rows = Math.ceil(plan.recipes.length / cols);
  const tile = 300;
  const gap = 24;
  const margin = 40;
  const lh = 18;
  const labelH = 4 * lh + 8;
  const W = 2 * margin + cols * tile + (cols - 1) * gap;
  const H = 2 * margin + rows * (tile + labelH) + (rows - 1) * gap;
  const cv = createCanvas(W, H);
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, W, H);
  ctx.font = "14px sans-serif";
  ctx.textBaseline = "top";
  for (const [i, r] of plan.recipes.entries()) {
    const x = margin + (i % cols) * (tile + gap);
    const y = margin + Math.floor(i / cols) * (tile + labelH + gap);
    const img = await loadImage(path.join(buildDir, "images", `${r.edition}.png`));
    ctx.drawImage(img, x, y, tile, tile);
    ctx.fillStyle = "#0D0D0D";
    const lines = [
      `#${r.edition}  ${r.family}  ${r.core_family} core`,
      `field ${r.field}`,
      `figure ${r.figure}`,
      `core ${r.core}`,
    ];
    lines.forEach((t, k) => ctx.fillText(t, x, y + tile + 8 + k * lh, tile));
  }
  fs.writeFileSync(file, cv.toBuffer("image/png"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    const head = fs.readFileSync(__filename, "utf8").split("\n").slice(2);
    const end = head.findIndex((l) => !l.startsWith("//"));
    console.log(head.slice(0, end).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    return;
  }
  const { dest, shown } = checkDestination(args.output);

  // 1. plan
  const palette = loadPalette();
  const families = loadFamilies();
  const seed = args.references ? null : args.seed || crypto.randomBytes(8).toString("hex");
  const plan = args.references ? planReferences(palette, families) : planBatch(palette, families, args.count, seed);
  console.log(`shapesASK: planned ${plan.recipes.length} outputs (${plan.mode}${seed ? `, seed ${seed}` : ""})`);

  // 2. layers + engine workspace, one run at a time
  const release = engine.acquireLock(REPO_ROOT);
  try {
    await generateAndExport({ dest, shown, palette, families, plan });
  } finally {
    release();
  }
}

async function generateAndExport({ dest, shown, palette, families, plan }) {
  const ws = engine.freshWorkspace(REPO_ROOT);
  const engineDir = path.join(ws, "engine");
  fs.mkdirSync(engineDir);
  const engineFiles = engine.copyEngine(REPO_ROOT, engineDir);
  const layersDir = path.join(engineDir, "layers");
  fs.mkdirSync(layersDir);
  const { perRecipe, layerCount, masters } = await prepareLayers(plan, families, palette, layersDir);
  const dnas = new Set(perRecipe.map(expectedDna));
  if (dnas.size !== perRecipe.length) throw new PlanError("two planned outputs would share HashLips DNA");
  const config = engine.writeRuntimeConfig(engineDir, families, perRecipe);
  console.log(`shapesASK: prepared ${layerCount} layer files; running the HashLips Art Engine`);

  // 3. HashLips
  const run = engine.runEngine(engineDir);
  fs.writeFileSync(path.join(ws, "hashlips.log"), run.stdout + (run.stderr ? `\n[stderr]\n${run.stderr}` : ""));
  if (run.error || run.status !== 0) {
    throw new Error(`the engine failed (status ${run.status}, ${run.signal || run.error || "no signal"}); see build/shapesASK/hashlips.log`);
  }

  // 4. validate the files it wrote
  const buildDir = path.join(engineDir, "build");
  const result = await validateRun({ buildDir, plan, layerLists: perRecipe, families, palette, config, engineStdout: run.stdout });
  if (!result.ok) {
    throw new RefusedError(`validation failed; nothing was exported:\n  ${result.failures.join("\n  ")}`);
  }
  console.log(`shapesASK: validated ${plan.recipes.length} images and metadata records`);

  // 5. stage the export inside the workspace: exactly the validated files, each
  //    checked against the hash of the bytes validation read
  const hashFile = (p) => engine.sha256(fs.readFileSync(p));
  const validatedNames = [
    ...plan.recipes.map((r) => `images/${r.edition}.png`),
    ...plan.recipes.map((r) => `json/${r.edition}.json`),
    "json/_metadata.json",
  ];
  const validated = result.validated;
  for (const f of validatedNames) if (!validated[f]) throw new Error(`validation did not read ${f}`);
  const imageHashes = Object.fromEntries(plan.recipes.map((r) => [r.edition, validated[`images/${r.edition}.png`]]));
  const stage = path.join(ws, "export");
  for (const d of ["images", "json", "recipes"]) fs.mkdirSync(path.join(stage, d), { recursive: true });
  for (const f of validatedNames) {
    fs.copyFileSync(path.join(buildDir, f), path.join(stage, f), fs.constants.COPYFILE_EXCL);
    if (hashFile(path.join(stage, f)) !== validated[f]) throw new Error(`staged ${f} differs from the validated file`);
  }
  for (const [i, r] of plan.recipes.entries()) {
    const rec = {
      edition: r.edition,
      structure: r.family,
      nesting: families.families.find((f) => f.id === r.family).nesting,
      colors: { field: r.field, figure: r.figure, core: r.core },
      hex: { field: palette.tokens[r.field], figure: palette.tokens[r.figure], core: palette.tokens[r.core] },
      core_family: r.core_family,
      draws: r.draws,
      ...describe(palette, r),
      layers: perRecipe[i].map((l) => ({ element: l.element, role: l.role, token: l.token, file: `${l.folder}/${l.file}` })),
      hashlips_dna_sha1: crypto.createHash("sha1").update(expectedDna(perRecipe[i]), "utf8").digest("hex"),
    };
    fs.writeFileSync(path.join(stage, "recipes", `${r.edition}.json`), JSON.stringify(rec, null, 2) + "\n");
  }
  await contactSheet(buildDir, plan, path.join(stage, "contact-sheet.png"));
  fs.writeFileSync(path.join(stage, "hashlips.log"), run.stdout); // the engine's own report; stderr stays in the workspace
  const counts = { ordinary: 0, bright: 0 };
  for (const r of plan.recipes) counts[r.core_family]++;
  const canvasMod = require("canvas");
  const runRecord = {
    project: "shapesASK",
    mode: plan.mode,
    count: plan.recipes.length,
    seed: plan.seed,
    structures: plan.shares,
    core_families: counts,
    duplicate_redraws: plan.recipes.reduce((s, r) => s + Math.max(0, r.draws - 1), 0),
    rules: {
      "rules/palette.json": hashFile(palette.rulesPath),
      "source/families.json": hashFile(FAMILIES_PATH),
      ...Object.fromEntries(
        Object.values(masters).map((m) => [path.relative(path.join(__dirname), m.file).split(path.sep).join("/"), engine.sha256(m.text)])
      ),
    },
    engine_files_sha256: engineFiles,
    runtime: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      canvas: require("canvas/package.json").version,
      cairo: canvasMod.cairoVersion,
      librsvg: canvasMod.rsvgVersion,
    },
    validation: {
      checks: "files, metadata, image references, DNA, attributes, size, probe colors, edge share, excluded inks",
      per_edition: result.per_edition,
    },
    generated_at: new Date().toISOString(),
    note: "Images are fully determined by the recipes and the renderer. Metadata records carry the engine's timestamp, so their bytes differ between runs.",
  };
  fs.writeFileSync(path.join(stage, "run.json"), JSON.stringify(runRecord, null, 2) + "\n");
  const staged = listFiles(stage);
  const sums = staged.map((f) => `${hashFile(path.join(stage, f))}  ${f}`).join("\n") + "\n";
  fs.writeFileSync(path.join(stage, "SHA256SUMS"), sums);

  // 6. export: create the new folder (never overwrite), copy, verify every byte,
  //    then check that every metadata record's image reference resolves, inside
  //    the new folder, to its validated image. EXPORT-INCOMPLETE stays in the
  //    folder unless all of this passes.
  try {
    fs.mkdirSync(dest);
  } catch (e) {
    if (e.code === "EEXIST") throw new RefusedError(`destination appeared during the run, refusing to write: ${shown}`);
    throw e;
  }
  const marker = path.join(dest, "EXPORT-INCOMPLETE");
  fs.writeFileSync(marker, "This export did not finish verification. Do not use these files.\n", { flag: "wx" });
  const incomplete = (why) =>
    new RefusedError(`export to ${shown} is incomplete (${why}); the folder is left as is, marked EXPORT-INCOMPLETE`);
  try {
    for (const f of [...staged, "SHA256SUMS"]) {
      const to = path.join(dest, f);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(stage, f), to, fs.constants.COPYFILE_EXCL);
    }
  } catch (e) {
    throw incomplete(`copy failed: ${e.message}`);
  }
  const bad = [];
  for (const line of sums.trim().split("\n")) {
    const [h, f] = [line.slice(0, 64), line.slice(66)];
    if (hashFile(path.join(dest, f)) !== h) bad.push(f);
  }
  if (hashFile(path.join(dest, "SHA256SUMS")) !== engine.sha256(sums)) bad.push("SHA256SUMS");
  if (bad.length) throw incomplete(`verification failed for ${bad.join(", ")}`);
  const refFailures = checkImageReferences(dest, plan.recipes.length, imageHashes);
  if (refFailures.length) throw incomplete(`image references failed: ${refFailures.join("; ")}`);
  const present = listFiles(dest).filter((f) => f !== "EXPORT-INCOMPLETE");
  if (present.length !== staged.length + 1) throw incomplete("unexpected files in the folder");
  fs.unlinkSync(marker); // only now, with every file present and verified
  const delivered = listFiles(dest);
  console.log(
    `shapesASK: exported and verified ${delivered.length} files (${plan.recipes.length} images, ` +
      `${counts.bright} with a bright core) to ${shown}`
  );
}

main().catch((e) => {
  const usage = e instanceof UsageError;
  const known = usage || e instanceof RefusedError || e instanceof PlanError || e.refused === true;
  console.error(`shapesASK: ${known ? e.message : e.stack || e}`);
  if (usage) console.error("usage: npm run generate:export -- --count N --output <new folder> [--seed TEXT] | --references --output <new folder>");
  process.exit(usage ? 2 : 1);
});
