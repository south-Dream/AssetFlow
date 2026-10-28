// Deterministic preinstalled-image fixture for renderer tests that mock the host.
const fs = require("node:fs");
const path = require("node:path");
const configPath = path.resolve("scripts/extensions/canvas_modules/image/config.json");
const config = require(configPath);
const iconData = Object.fromEntries(config.tools.filter(tool => tool.icon).map(tool => [tool.icon, "data:image/svg+xml;base64," + fs.readFileSync(path.resolve(path.dirname(configPath), tool.icon)).toString("base64")]));
module.exports = { imageRecord: { config, configPath, enabled: true, revision: 1, iconData }, defaults: [configPath] };
