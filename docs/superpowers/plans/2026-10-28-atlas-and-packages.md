# Atlas canvas and package cleanup

Approved scope: compact and grid atlas layouts, multiple dropped images, deduplication, auto/fixed/POT dimensions, padding, trim offsets, extrusion, pan/zoom/fit, selection/removal, PNG + JSON export, retained editing state.

Additional requested changes: correct canvas_modules spelling throughout source/build/docs and migrate installed paths; make every shipped canvas package removable, preserving an empty application shell after restart; separate examples from automated tests and document each test group.

Architecture: atlas packing is a pure TypeScript module; native AtlasCanvas uses the existing resource opener and Inspector containers. Read assets by ID through a bounded IPC endpoint and export generated PNG + JSON into a user-selected directory. Never save atlas bytes over any input image. Shipped packages are seeded once and follow ordinary enable/remove/uninstall lifecycle.

- [x] Rename canvas_modules references and organize root examples/ and tests/.
- [x] Implement packing with failing-first tests for bounds, overlap, grid, fixed size, POT and invalid options.
- [x] Implement package persistence/removal tests, ordinary shipped registrations, and empty-shell behavior.
- [x] Implement AtlasCanvas, Inspector, resource decoding/trim/extrusion and export IPC.
- [x] Remove obsolete fallback checks superseded by current test/build commands; document examples and automated checks.
- [x] Run unit tests, build, full Electron smoke suite and new atlas/empty-shell coverage; inspect output and diff.
