# sociedadeMecanicaGenerator

The avatar generator of [sociedade mecânica de futebol](https://a-s-k.studio/apex-solar-kiss/sociedade) (2022): the [HashLips Art Engine](https://github.com/HashLips/hashlips_art_engine), configured by ASK to assemble the project's robot avatars from its commissioned component library. Recovered into this fork in 2026 as historical source.

**Historical outputs >>** see the sociedade mecânica de futebol project presentation on A-S-K.studio.

> **Historical source, not a working demo.** The component-art layers are not included. The recovered configuration also expects five layer families that are not in the working copy this recovery used, so this edition cannot reproduce the original run. The avatar collection never launched.

## What is here

Branch `sociedade-mecanica` is the HashLips Art Engine at tag [`v1.1.2_patch_v1`](https://github.com/HashLips/hashlips_art_engine/tree/v1.1.2_patch_v1), plus ASK's commits:

1. **The 2022 changes**, imported from the studio's working copy, which had no Git history:
   - `src/config.js` holds the layer grammar described below.
   - `src/main.js` writes `copyright: "bunda labs"` into generated metadata where HashLips writes `compiler: "HashLips Art Engine"`. This is the 2022 setting, kept as found. It does not license the generated art or establish who owns it now.
   - `package.json` adds `yarn`. The two lockfiles are from the same working copy.
   - `smf/nomes.js` is a 2022 helper that renamed numbered name-tag images to Swedish given names. It renames files in a `nomes` folder beside the script, which here means `smf/nomes/`, not `layers/nomes/`. It is kept for reading and was not tested.
2. **This README.**

One value changed on import: `baseUri` is set back to the upstream placeholder, `ipfs://NewUriToReplace`.

`layers/`, `logo.png` and `banner.png` are HashLips' own demo files from upstream. The SMF configuration does not use them. Branch `main` is HashLips' upstream branch, as forked.

## How the configuration worked

The engine knows nothing about robots. `src/config.js` tells it what to draw.

- **Layers.** Each avatar stacks one image per layer entry, bottom first:
  - `nomes` (name tags) and `fundo` (background);
  - `chassi` (chassis);
  - `pichações` (graffiti), drawn eight times;
  - `danos` (damage);
  - `antena` (antenna), `camisa` (shirt), `boca` (mouth) and `olhos` (eyes);
  - `chápeu` (hat) and `joias` (jewelry).

  Each entry draws from a folder in `layers/`. The engine picks one image per entry, weighted by the number after `#` in its file name (`element#weight.png`), or 1 when the file name carries no numeric weight.
- **Four configurations.** The 400 avatars, at 2160 × 2160, split across four layer configurations:

| Configuration | Avatars | Folders that change |
|---|---|---|
| small hats | 285 | `antena A`, `boca A`, `chápeu A` |
| big hats | 95 | `antena B`, `boca B`, `chápeu B` |
| fire + small hats | 15 | the A folders; `camisa` is dropped and `camisa queimando` (burning shirt) is drawn on top |
| fire + big hats | 5 | the B folders; `camisa` is dropped and `superaquecimento` (overheating) is drawn on top |

  The hat families are weighted 3:1, and the fire configurations get 5% of the collection. The four groups are shuffled together in the final numbering.
- **Uniqueness.** `nomes` and `fundo` are left out of the DNA the engine uses to keep avatars unique. So two avatars that differ only in name tag or background count as duplicates.

Swapping the images inside the folders changes what the generator makes. Changing which folders exist, their order or the configuration split means editing `src/config.js`.

## Before running anything

- Output goes to `build/` at the root of the clone. Git ignores `build/`, and `buildSetup()` deletes it recursively at the start of every run, so copy a finished run to a folder outside the repository before running again.
- Generation uses unseeded randomness and timestamps, so a run cannot be reproduced.
- Dependencies are the 2022 versions. They have not been updated or audited.

## Upstream documentation

This repository is a fork of the [HashLips Art Engine](https://github.com/HashLips/hashlips_art_engine). Branch `sociedade-mecanica` is based on its tag [`v1.1.2_patch_v1`](https://github.com/HashLips/hashlips_art_engine/tree/v1.1.2_patch_v1). For the engine's installation, options and utilities, see the [upstream README at that tag](https://github.com/HashLips/hashlips_art_engine/blob/v1.1.2_patch_v1/README.md). This README documents only the SMF recovery.

## Credits

- engine >> [HashLips Art Engine](https://github.com/HashLips/hashlips_art_engine)
- avatar creative direction >> Alex Limpo de Abreu
- CTO + generative avatar system development >> ASK
- avatar illustration >> P R Soliver
- avatar styling >> Antônio Frajado

## License

MIT, as in [`LICENSE`](LICENSE) (Copyright (c) 2021 HashLips). ASK's code and documentation changes on this branch are offered under the same license.

No SMF production layers or other SMF artwork are included or licensed.
