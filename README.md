# sociedadeMecanicaGenerator // shapesASK example

This branch runs the [HashLips Art Engine](https://github.com/HashLips/hashlips_art_engine) on **shapesASK**, ASK's compositions of circles, hexagons and triangles. It shows the recovered engine assembling an independent layer set. The historical sociedade mecânica de futebol recovery is branch [`sociedade-mecanica`](https://github.com/apexSolarKiss/sociedadeMecanicaGenerator/tree/sociedade-mecanica), whose README documents the 2022 configuration.

## Run the example

```bash
npm ci
npm run generate:export -- --count 32 --output /path/to/new-run-folder
```

`.nvmrc` names the tested Node version. [`examples/shapesASK/README.md`](examples/shapesASK/README.md) covers the options, the color rules and what a run writes.

## What this branch changes

It starts from `sociedade-mecanica` before that branch's avatar banner, and adds:

- **`examples/shapesASK/`:** the example. That covers the editable masters and color rules, the recipe planner, layer preparation, validation and export.
- **`src/main.js`:** generated metadata carries HashLips' upstream `compiler: "HashLips Art Engine"` field again, in place of the 2022 `copyright: "bunda labs"` line. The file is now identical to HashLips' tag `v1.1.2_patch_v1`.
- **Dependencies:**
  - `canvas` is pinned at 3.2.3, replacing `^2.8.0`, which publishes no prebuilt binary for current Node on Apple silicon;
  - `.nvmrc` is `v22.12.0`;
  - the `yarn` dependency and `yarn.lock` are removed, so npm alone installs;
  - `package-lock.json` is regenerated.
- **`package.json`:** adds the `generate:export` script.
- **`NOTICE`:** states which files the MIT License covers and excludes the shapesASK artwork from it.

**Unchanged:**

- `src/config.js` still holds the 2022 configuration. The example does not use it, and `npm run generate` still expects the original layers, which are not included.
- `smf/`, HashLips' demo `layers/`, `utils/` and `LICENSE`.

## Credits

- engine >> [HashLips Art Engine](https://github.com/HashLips/hashlips_art_engine)
- shapesASK >> ASK

## License

MIT, as in [`LICENSE`](LICENSE) (Copyright (c) 2021 HashLips), for the HashLips Art Engine. ASK's shapesASK code, rules and configuration, and documentation are under the same MIT terms. The shapesASK artwork is excluded from the MIT License, and no license to it is granted. [`NOTICE`](NOTICE) sets out the scope.
