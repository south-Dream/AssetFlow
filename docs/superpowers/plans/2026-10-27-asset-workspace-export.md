# Non-destructive resource workspace and selective package export

**Goal:** Import physical working copies; save the selected Canvas back to its linked workspace asset; export checked resources with a save-before-export gate; simplify navigation.

**Architecture:** Each asset owns an immutable imported base and optional materialized saved result + saved recipe. Saving updates its canonical workspace representation and metadata, never the source file, while Canvas previews keep their operation chains against the base to avoid duplicate processing. Generic modules serialize through an optional onSave callback. Resource/package exports read canonical saved representations. Workspace metadata persists independently of export.

- [ ] Tests for copy isolation, save recipe/result persistence, package selection and save gate.
- [ ] Managed asset store, import hydration, safe save API, serializer bridge and persistence.
- [ ] File menu Save / Import / Export, import chooser, export resource tree and unsaved confirmation.
- [ ] Hierarchy filters/empty state and navigation overlay (delegated independent scopes).
- [ ] Remove redundant window/preview commands and keep Canvas links.
- [ ] Unit/UI/real EXE verification, docs, clean release package.

Clarified by user: one internal asset is shared by its linked canvases; Save commits current selected Canvas operations to that asset. Original imported locations remain untouched. Export supports ZIP and directory, default ZIP pending format preference.

## Implemented behavior

- Physical immutable working copies and canonical saved result per asset; image steps persisted separately from rendered bytes.
- Current Canvas save submits valid current draft. Generic Canvas serialization uses onSave, source files untouched.
- File menu contains Save/Import/Export; obsolete auxiliary windows removed from navigation.
- Recursive export checklist; ZIP default or fresh directory; unsaved selected assets prompt before save/export. Multiple Canvas versions use an explicit per-asset choice.
- Import/commit persistence serialized; stale concurrent writes rejected; asynchronous save completion checks binding epoch.
- Resource search and format filters are per hierarchy; navigation overlap verified with renderer hit testing.

## Validation

80 unit tests passing. Electron smoke suite and native packaged EXE save/source-integrity checks are required before delivery.
