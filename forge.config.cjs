module.exports = {
  outDir: require('node:path').resolve('release/installers'),
  packagerConfig: {
    extraResource: [".cache/forge-resources/scripts"],
    asar: { unpack: "**/node_modules/@img/**/*" },
    executableName: "AssetFlow",
    electronZipDir: require('node:path').resolve('.cache/electron'),
    ignore: [
      /^\/src/,
      /^\/extensions/,
      /^\/tests/,
      /^\/test(?:\/|$)/,
      /^\/docs/,
      /^\/scripts/,
      /^\/out/,
      /^\/release/,
      /^\/\.tools/,
      /^\/\.cache/,
      /^\/\.test-build/,
    ],
  },
  makers: [
    { name: "@electron-forge/maker-squirrel", config: { name: "AssetFlow" } },
  ],
  plugins: [{ name: "@electron-forge/plugin-auto-unpack-natives", config: {} }],
};
