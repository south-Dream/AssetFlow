# Resource import and search

Approved design: accept files and recursive directories in the hierarchy, preserving folder structure. Import all file types unless excluded by configurable rules. Empty whitelist allows all; blacklist wins and defaults to `*.meta`. Existing assets remain unchanged. Replace the format menu with case-insensitive keyword and wildcard search.

Architecture: share a small wildcard matcher between hierarchy search and import rules. Store application import preferences in userData through validated IPC. Apply rules before copying or decoding files. Use importer return values directly when updating hierarchy.

- [x] Add failing wildcard and recursive import tests.
- [x] Implement shared matching and import preferences, wire main-process persistence and settings UI.
- [x] Remove format UI, extend search, and fix dropped result placement.
- [x] Run unit tests, build, and Electron smoke checks; review diff and update README.

Verification: `npm test`, `npm run build`, `npm run test:smoke`. Test uppercase suffixes, arbitrary file types, blacklist precedence, whitelist restrictions, nested folders and internal copies.
