"use strict";
// Runs the repository's HashLips Art Engine on prepared shapesASK layers.
//
// HashLips reads src/config.js, layers/ and node_modules/ relative to its working
// directory and deletes ./build at start. To leave the repository's tracked
// configuration untouched, each run gets its own engine
// directory inside the Git-ignored build/shapesASK/ workspace: copies of the
// engine files, a generated runtime config, the prepared layers, and a link to
// the repository's node_modules. Compositing is the engine's own src/main.js.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ENGINE_FILES = [
  "index.js",
  "src/main.js",
  "constants/network.js",
  "constants/blend_mode.js",
  "modules/HashlipsGiffer.js",
];

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

const METADATA = {
  namePrefix: "shapesASK",
  description:
    "shapesASK: a circle, hexagon and triangle composition assembled by the HashLips Art Engine from component layers. Generated example output.",
  // Each metadata record names its image by a path relative to the record:
  // json/<N>.json >> ../images/<N>.png. Nothing is uploaded or minted.
  // Validation requires exactly this value (IMAGE_BASE in validate.js).
  baseUri: "../images",
  extraMetadata: { project: "shapesASK", creator: "ASK" },
};

function lstatOrNull(p) {
  try {
    return fs.lstatSync(p);
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function checkPlainDir(repoRoot, p) {
  const st = lstatOrNull(p);
  if (st && (st.isSymbolicLink() || !st.isDirectory())) {
    throw new Error(`${path.relative(repoRoot, p)} is not a plain directory; refusing to use it as the build workspace`);
  }
}

// One run at a time: build/shapesASK.lock is created exclusively and removed when
// the run ends. A lock left by an interrupted run must be removed by hand.
function acquireLock(repoRoot) {
  const buildDir = path.join(repoRoot, "build");
  checkPlainDir(repoRoot, buildDir);
  fs.mkdirSync(buildDir, { recursive: true });
  const lock = path.join(buildDir, "shapesASK.lock");
  try {
    const fd = fs.openSync(lock, "wx");
    fs.writeSync(fd, `pid ${process.pid}\nstarted ${new Date().toISOString()}\n`);
    fs.closeSync(fd);
  } catch (e) {
    if (e.code === "EEXIST") {
      const err = new Error(
        "another shapesASK run holds build/shapesASK.lock. If no run is active, a previous run was interrupted: delete that file and run again."
      );
      err.refused = true;
      throw err;
    }
    throw e;
  }
  return () => fs.rmSync(lock, { force: true });
}

// Creates <repo>/build/shapesASK/ afresh. Refuses anything but a plain directory
// at that exact place, so a link can never redirect the deletion elsewhere.
function freshWorkspace(repoRoot) {
  const buildDir = path.join(repoRoot, "build");
  const ws = path.join(buildDir, "shapesASK");
  checkPlainDir(repoRoot, buildDir);
  checkPlainDir(repoRoot, ws);
  if (!isInside(ws, repoRoot) || path.basename(ws) !== "shapesASK" || path.basename(buildDir) !== "build") {
    throw new Error("unexpected build workspace location");
  }
  fs.rmSync(ws, { recursive: true, force: true });
  fs.mkdirSync(ws, { recursive: true });
  return ws;
}

function copyEngine(repoRoot, engineDir) {
  const files = {};
  for (const rel of ENGINE_FILES) {
    const src = fs.readFileSync(path.join(repoRoot, rel));
    const dst = path.join(engineDir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, src);
    const copied = fs.readFileSync(dst);
    if (sha256(copied) !== sha256(src)) throw new Error(`engine copy of ${rel} does not match`);
    files[rel] = sha256(src);
  }
  fs.symlinkSync(path.join(repoRoot, "node_modules"), path.join(engineDir, "node_modules"), "dir");
  return files;
}

function writeRuntimeConfig(engineDir, families, layerLists) {
  const layerConfigurations = layerLists.map((layers, i) => ({
    growEditionSizeTo: i + 1,
    layersOrder: layers.map((l) => ({ name: l.folder, options: { displayName: l.element } })),
  }));
  const { width, height } = families.canvas;
  const config = {
    format: { width, height, smoothing: false },
    baseUri: METADATA.baseUri,
    description: METADATA.description,
    background: { generate: false, brightness: "80%", static: false, default: "#000000" },
    uniqueDnaTorrance: 10,
    layerConfigurations,
    rarityDelimiter: "#",
    shuffleLayerConfigurations: false,
    debugLogs: false,
    extraMetadata: METADATA.extraMetadata,
    text: {
      only: false,
      color: "#ffffff",
      size: 20,
      xGap: 40,
      yGap: 40,
      align: "left",
      baseline: "top",
      weight: "regular",
      family: "Courier",
      spacer: " => ",
    },
    namePrefix: METADATA.namePrefix,
    gif: { export: false, repeat: 0, quality: 100, delay: 500 },
    pixelFormat: { ratio: 2 / 128 },
    preview: { thumbPerRow: 8, thumbWidth: 270, imageRatio: height / width, imageName: "preview.png" },
    preview_gif: { numberOfImages: 5, order: "ASC", repeat: 0, quality: 100, delay: 500, imageName: "preview.gif" },
  };
  const js =
    "// Generated by examples/shapesASK for a single run; rewritten every run, never tracked.\n" +
    "const basePath = process.cwd();\n" +
    "const { NETWORK } = require(`${basePath}/constants/network.js`);\n" +
    // NETWORK.eth selects HashLips' standard metadata layout.
    `module.exports = { ...${JSON.stringify(config, null, 2)}, network: NETWORK.eth };\n`;
  fs.mkdirSync(path.join(engineDir, "src"), { recursive: true });
  fs.writeFileSync(path.join(engineDir, "src", "config.js"), js);
  return config;
}

function runEngine(engineDir) {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const res = spawnSync(process.execPath, ["index.js"], {
    cwd: engineDir,
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 30 * 60 * 1000,
  });
  return { status: res.status, signal: res.signal, error: res.error, stdout: res.stdout || "", stderr: res.stderr || "" };
}

module.exports = {
  acquireLock,
  freshWorkspace,
  copyEngine,
  writeRuntimeConfig,
  runEngine,
  isInside,
  lstatOrNull,
  sha256,
  METADATA,
  ENGINE_FILES,
};
