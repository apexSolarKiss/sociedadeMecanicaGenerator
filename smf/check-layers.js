#!/usr/bin/env node
"use strict";
// sociedade mecânica de futebol // layer preflight. Read-only: it changes no file
// and never runs the generator, whose startup deletes build/.
//
//   npm run check:layers
//   npm run check:layers -- --layers /path/to/a/restore-source/layers
//
// Structure: every family name in src/config.js is NFC and distinct; each
// resolves to exactly one folder in layers/, with no canonically equivalent
// duplicate; and, in a Git checkout, every tracked path under layers/ is NFC,
// with no canonically equivalent duplicate.
// Restore: each family's files are compared with the inventories in
// smf/inventory/ by name, weight and SHA-256. Only the working-copy inventory
// counts toward a complete restore. A match with a compile-ask supplement
// version is reported as that, since none of those versions is established as
// the one the final configuration used.
//
// Exit status: 0 every family is present and matches the working-copy
// inventory, which cannot happen today, because five families have no
// working-copy record; 1 the structure check failed, or the check could not
// run; 2 the structure is sound, but the restore is incomplete. A fresh clone
// exits 2: the production layers are not included.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const NFC = (s) => s.normalize("NFC");
const hidden = (item) => /(^|\/)\.[^\/\.]/g.test(item); // as src/main.js getElements skips files
const sha256 = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const statOrNull = (p) => {
  try {
    return fs.statSync(p);
  } catch {
    return null; // missing, or a link that leads nowhere
  }
};
const isDir = (p) => Boolean(statOrNull(p)?.isDirectory());
const isFile = (p) => Boolean(statOrNull(p)?.isFile());

function parseArgs(argv) {
  let layers = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--layers" && i + 1 < argv.length) layers = path.resolve(process.env.INIT_CWD || process.cwd(), argv[++i]);
    else {
      console.error("usage: npm run check:layers [-- --layers <layers folder>]");
      process.exit(1);
    }
  }
  return { layers };
}

// The family names, in order, and the weight delimiter, from the configuration
// itself. config.js reads its constants relative to the working directory, so
// it is loaded from the root.
function loadConfig() {
  process.chdir(ROOT);
  const { layerConfigurations, rarityDelimiter } = require(path.join(ROOT, "src", "config.js"));
  const names = [];
  for (const c of layerConfigurations) for (const l of c.layersOrder) if (!names.includes(l.name)) names.push(l.name);
  // as src/main.js getRarityWeight reads a weight
  const weightOf = (file) => {
    const n = Number(file.slice(0, -4).split(rarityDelimiter).pop());
    return isNaN(n) ? 1 : n;
  };
  return { names, weightOf };
}

function duplicates(names) {
  const by = new Map();
  for (const n of names) by.set(NFC(n), [...(by.get(NFC(n)) || []), n]);
  return [...by.values()].filter((v) => v.length > 1);
}

function trackedPaths() {
  const r = spawnSync("git", ["-C", ROOT, "ls-files", "-z", "--", "layers"], { encoding: "utf8" });
  if (r.error || r.status !== 0) return null;
  return r.stdout.split("\0").filter(Boolean);
}

function loadInventories() {
  const dir = path.join(ROOT, "smf", "inventory");
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const sets = new Map(); // family -> [{ source, assets }]
  for (const f of read("working-copy.json").families) sets.set(f.family, [{ source: "working-copy", final: true, assets: f.assets }]);
  for (const f of read("compile-ask-supplement.json").families) {
    sets.set(f.family, f.variants.map((v) => ({ source: `compile-ask supplement version (${v.folders.join(", ")})`, final: false, assets: v.assets })));
  }
  return sets;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const layersDir = args.layers || path.join(ROOT, "layers");
  const errors = [];
  const { names, weightOf } = loadConfig();
  const resolved = new Map(); // family -> its folder, once it resolves exactly once

  // structure: the configuration
  for (const n of names) if (n !== NFC(n)) errors.push(`src/config.js family "${n}" is not NFC`);
  for (const d of duplicates(names)) errors.push(`src/config.js names one family in more than one form: ${d.map((n) => JSON.stringify(n)).join(", ")}`);

  // structure: the folders
  if (!isDir(layersDir)) {
    errors.push(`no layers folder at ${layersDir}`);
  } else {
    // This clone's own layers/ must match the configuration byte for byte. A
    // restore source checked with --layers keeps its own names, which may be
    // decomposed, so there a name only has to match after NFC normalization.
    const strict = !args.layers;
    const entries = fs.readdirSync(layersDir).filter((e) => !hidden(e));
    for (const e of entries) {
      if (e === NFC(e)) continue;
      if (strict) errors.push(`layers/${e} is not NFC`);
      else console.log(`note: ${e} is not NFC; copy its files into this clone's NFC folder of the same name`);
    }
    for (const d of duplicates(entries)) errors.push(`layers/ holds canonically equivalent names: ${d.map((n) => JSON.stringify(n)).join(", ")}`);
    for (const n of names) {
      const matches = entries.filter((e) => NFC(e) === NFC(n));
      const exact = matches.filter((e) => (strict ? e === n : true) && isDir(path.join(layersDir, e)));
      if (matches.length === 1 && exact.length === 1) resolved.set(n, path.join(layersDir, exact[0]));
      else if (!strict && matches.length === 0) continue; // absent from the source: reported below
      else {
        errors.push(`family "${n}" resolves to ${matches.length === 0 ? "no folder" : `${matches.length} entr${matches.length === 1 ? "y" : "ies"}, ${exact.length} of them ${strict ? "an exact" : "a"} folder`}`);
      }
    }
    for (const e of entries) if (!names.some((n) => NFC(n) === NFC(e))) console.log(`note: layers/${e} is not a family src/config.js names`);
    for (const n of names) {
      const dir = resolved.get(n);
      if (!dir) continue;
      for (const d of duplicates(fs.readdirSync(dir))) errors.push(`layers/${n}/ holds canonically equivalent names: ${d.map((x) => JSON.stringify(x)).join(", ")}`);
    }
  }

  // structure: the tracked paths
  if (!args.layers) {
    const tracked = trackedPaths();
    if (tracked === null) console.log("note: not a Git checkout, so the tracked-path checks were skipped");
    else {
      for (const t of tracked) if (t !== NFC(t)) errors.push(`tracked path ${JSON.stringify(t)} is not NFC`);
      for (const d of duplicates(tracked)) errors.push(`canonically equivalent tracked paths: ${d.map((t) => JSON.stringify(t)).join(", ")}`);
      for (const n of names) if (!tracked.includes(`layers/${n}/.gitkeep`)) errors.push(`layers/${n}/.gitkeep is not tracked under exactly that name`);
    }
  }

  if (errors.length) {
    console.log(`structure: FAILED\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  console.log(
    args.layers
      ? `structure: ok // ${resolved.size} of the ${names.length} families have a folder in this source, each resolving to exactly one`
      : `structure: ok // ${names.length} families, each NFC and resolving to exactly one folder`
  );

  // restore: compare each family's files with the inventories
  const inventories = loadInventories();
  let ready = true;
  for (const n of names) {
    const dir = resolved.get(n);
    if (!dir) {
      ready = false;
      console.log(`${n}: no folder in this source`);
      continue;
    }
    const entries = fs.readdirSync(dir).filter((e) => !hidden(e));
    const files = entries.filter((e) => isFile(path.join(dir, e)));
    const sets = inventories.get(n);
    if (files.length !== entries.length) {
      ready = false;
      console.log(`${n}: ${entries.length - files.length} entr${entries.length - files.length === 1 ? "y is" : "ies are"} not a file, which the generator would try to load as an image`);
    }
    if (files.length === 0) {
      ready = false;
      console.log(`${n}: empty${sets ? "" : " // no inventory: see smf/inventory/unresolved.json"}`);
      continue;
    }
    if (!sets) {
      ready = false;
      console.log(`${n}: ${files.length} file${files.length === 1 ? "" : "s"}, not checked: no inventory records this family (see smf/inventory/unresolved.json)`);
      continue;
    }
    const present = new Map(files.map((f) => [NFC(f), f]));
    const reports = sets.map((set) => {
      const missing = [], changed = [];
      for (const a of set.assets) {
        const f = present.get(a.file);
        if (!f) missing.push(a.file);
        else if (weightOf(f) !== a.weight || sha256(path.join(dir, f)) !== a.sha256) changed.push(a.file);
      }
      const listed = new Set(set.assets.map((a) => a.file));
      const extra = [...present.keys()].filter((f) => !listed.has(f));
      return { set, missing, changed, extra, ok: !missing.length && !changed.length && !extra.length };
    });
    const match = reports.find((r) => r.ok);
    if (match && match.set.final) {
      console.log(`${n}: ${files.length} file${files.length === 1 ? "" : "s"} match${files.length === 1 ? "es" : ""} the working-copy inventory`);
      continue;
    }
    ready = false;
    if (match) {
      console.log(`${n}: ${files.length} file${files.length === 1 ? "" : "s"} match${files.length === 1 ? "es" : ""} the ${match.set.source} // a different source set, not established as the final configuration`);
      continue;
    }
    for (const r of reports) {
      const parts = [];
      if (r.missing.length) parts.push(`${r.missing.length} missing`);
      if (r.changed.length) parts.push(`${r.changed.length} differ in weight or bytes`);
      if (r.extra.length) parts.push(`${r.extra.length} not listed`);
      console.log(`${n}: does not match the ${r.set.final ? "working-copy inventory" : r.set.source}: ${parts.join(", ")}`);
    }
  }
  console.log(ready ? "restore: complete // every family matches the working-copy inventory" : "restore: incomplete // not every family matches the working-copy inventory");
  process.exit(ready ? 0 : 2);
}

main();
