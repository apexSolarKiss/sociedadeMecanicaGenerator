# shapesASK

shapesASK composes four shape instances on a flat field: an outer form, an aperture cut into it, a middle form and a visible core. The shapes are a circle, a pointy-top hexagon and a point-down triangle, all centered on one registration point. The outer form is a circle or a hexagon, never a triangle.

This example builds them with the repository's HashLips Art Engine, which composites one PNG layer per shape. HashLips picks each layer independently, but shapesASK's colors depend on each other: the aperture shows the field color, and the core has to stand apart from both field and figure. So a planner decides every output first, and the engine then composites exactly the layers it was given.

```text
recipe planner >> layer preparation >> HashLips Art Engine >> validation >> export
```

## Run

```bash
npm ci
npm run generate -- --count 32 --output /path/to/new-run-folder
```

`npm run generate:export` is the same command.

- `--count N` sets the number of outputs.
- `--output` names a folder that does not exist yet. It must be outside the repository and outside any other checkout of it. Its parent folder must exist. An existing destination is refused.
- `--seed TEXT` is optional. The same seed and count give the same recipes and the same images. Without it, a random seed is chosen and recorded in `run.json`.
- `--references`, used instead of `--count`, makes the four reference compositions: one per structure, in the colors of the accepted studies.

If planning, the engine or validation fails, the command exits with a nonzero status and exports nothing.

## The four structures

| Structure | Nesting, outermost first |
|---|---|
| `s04` | circle > [hexagon] > triangle > (hexagon) |
| `s02` | circle > [triangle] > hexagon > (triangle) |
| `s08` | hexagon > [circle] > triangle > (clipped circle) |
| `s06` | hexagon > [triangle] > circle > (triangle) |

`[ ]` is the aperture, painted with the field color; `( )` is the visible core.

Each structure has an editable master in `source/masters/`, with one SVG group per layer. `source/families.json` records each shape's size and the pair rule that sets it, plus the probe points that validation checks.

- **Editing a master:** keep each group on one line, in the form the masters already use, with exactly one fill color. The layer preparer refuses anything else.
- **Moving a shape:** the probe points in `families.json` must follow it, or validation fails.

Each group's `data-role` decides which color fills it:

| HashLips layer | Master group | Color |
|---|---|---|
| `field` | `field` | field |
| `outer` | `outer` | figure |
| `aperture` | `aperture` | field |
| `middle` | `middle` | figure |
| `core` | `core` | core |

## Colors

The rules are in `rules/palette.json`. Distances are CIEDE2000.

- **Field:** one of five light tokens, chosen uniformly.
- **Figure:** one of the seven ordinary tokens at least 17 from the field, chosen uniformly.
- **Core:** first the family, then the token.
  - The family is ordinary at 85% and bright (magenta, violet, cyan) at 15%. The odds do not depend on how many tokens are eligible.
  - The token is chosen uniformly among that family's tokens at least 15 from both the field and the figure.
- The three dark inks never appear.

Every field and figure pair the rules allow keeps at least one ordinary core and all three bright cores, so both families are always available.

The 15% is a probability for each output, not a quota. A batch of 32 has 4.8 bright cores on average, and some batches have none or many more.

## Capacity and duplicates

For one structure, the rules allow 14 field and figure pairs and 65 distinct colorings: 23 with an ordinary core and 42 with a bright core. The four structures allow 260 distinct outputs.

- The count is split evenly across the four structures, then shuffled into edition order. When the count is not a multiple of four, the seed picks which structures get one extra.
- Every output's core family is drawn before any color, and is never redrawn.
- A coloring that repeats an earlier output of the same run is redrawn within the same structure and core family. Each recipe records how many draws it took.
- If a run would need more distinct colorings of one structure and family than exist, the command refuses. It does not relax a rule or switch family.
  - Ordinary colorings run out first. Up to a count of 92 (23 per structure), no seed is refused.
  - Above 92, refusal depends on the seed's core-family draws. From the binomial odds, the share of seeds refused is 2% at 93, 8% at 96, 32% at 100, 88% at 108 and 99.95% at 120.
  - Near that limit, the seeds that do pass are the ones that drew more bright cores.
- Repeats across separate runs are not prevented.

## What a run writes

**Work area.** Generation happens in `build/shapesASK/`, which Git ignores and every run recreates. HashLips reads `src/config.js`, `layers/` and `node_modules/` from its working directory and deletes `build/` there when it starts. So the example gives it its own engine directory inside `build/shapesASK/`, containing:

- copies of `index.js`, `src/main.js`, `constants/` and `modules/`;
- a generated `src/config.js`;
- the prepared layers;
- a link to `node_modules/`.

The repository's tracked `src/config.js` is neither read nor changed.

**Export folder:**

- `images/` holds HashLips' composites, 2160 × 2160.
- `json/` holds HashLips' metadata, one record per image plus `_metadata.json`. Each record names its image by the relative path `../images/<N>.png`, which leads from `json/` to that image in the sibling `images/` folder of the same export folder. Nothing is uploaded or minted.
- `recipes/` holds the planner's record for each image: structure, colors, eligible tokens and distances, number of draws, layer files and expected DNA hash. Metadata attributes name each layer's shape and color but not the structure, which is recorded here.
- `contact-sheet.png`.
- `hashlips.log`.
- `run.json` records the seed, the counts, the hashes of the rules, masters and engine files, the runtime versions and the validation summary.
- `LICENSE` and `NOTICE`: the Apache License, Version 2.0, and the shapesASK notice, which cover the run.
- `SHA256SUMS`.

**Validation, before anything is exported:**

- exactly N images, N metadata records and `_metadata.json`;
- for each image:
  - name, description, `compiler` field, attributes and DNA hash as planned;
  - the `image` path is exactly `../images/<N>.png` in the record and in `_metadata.json`, and it resolves, through no symbolic link, to that image's file with the validated hash;
  - 2160 × 2160 and fully opaque;
  - the planned color at a probe point inside every element;
  - under 1% of pixels outside the image's three colors, which are the anti-aliased edges;
  - no excluded ink.

The engine's exit status is not trusted on its own: HashLips exits normally even when it stops on duplicate DNA.

**One run at a time.** A run holds `build/shapesASK.lock` while it works. If a run is interrupted, the lock stays behind. Delete it once no run is active; the command's message says so.

**Export.**

1. The command creates the new folder and writes an `EXPORT-INCOMPLETE` marker into it.
2. It copies the files.
3. It checks every copy against the hash of the staged file. Each staged image and metadata file was itself checked against the hash of the bytes validation read.
4. It checks every metadata record's `image` path again inside the new folder: it must resolve to that image, with the validated hash.
5. It removes the marker only when every copy matches and every path resolves.

If an export fails partway, the folder is left as it is, with the marker. Apart from its own lock file and marker, the command deletes nothing outside `build/shapesASK/`.

## Reproducibility

The same seed, count, rules, masters and renderer give the same recipes and byte-identical images. The contact sheet is byte-identical only in the same tested environment, including the same system fonts, because its labels use the system's sans-serif font. Metadata records include HashLips' timestamp, so their bytes differ between runs, as do `run.json` and `SHA256SUMS`.

## s08's clipped core

s08's core is a circle clipped by the middle triangle. Drawn in the obvious way, the triangle's own anti-aliased edge lies under the core's clipped edges, and the figure color shows through as a faint line along them.

The s08 master draws the triangle with a hole instead:

- The hole's straight edges are the core's clipped edges in full.
- Its arcs run 1.5 px inside the core's arcs.

The hole lies under the opaque core, so the visible geometry is unchanged. Along the clipped edges, the core now meets the aperture with no triangle edge beneath it. Along the arcs, the triangle stays beneath the core's edge, which is correct there because the triangle is the visible neighbor. A few pixels remain at the six corners where a clipped edge turns into an arc.

## Layer file names

HashLips splits its DNA string on `-`, reads an element id before `:` and a weight after `#`. Layer file names therefore avoid all three, for example `hexagon (ask white).png`. Metadata attributes use the same names.

## Tested environment

Node 22.12.0 on macOS 26.6 (arm64), with `canvas` 3.2.3, cairo 1.18.4 and librsvg 2.62.1, and the system's own fonts for the contact sheet's labels. HashLips' own scripts in `utils/` were not tested with `canvas` 3.

## License

shapesASK is open source under the Apache License, Version 2.0, in [`LICENSE`](LICENSE). That covers the code, `rules/palette.json`, `source/families.json`, the masters in `source/masters/`, this documentation, and the images, metadata, recipes, contact sheets and other files the example generates. [`NOTICE`](NOTICE) is its notice. Every export made from this revision on carries both files; earlier exports, including run 01, are covered without carrying them. The HashLips Art Engine, which composites the images, stays under the repository's MIT License. The repository's [`NOTICE`](../../NOTICE) maps each file to its license.
