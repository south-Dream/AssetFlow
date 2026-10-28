import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { writeAtlasExport } from "../scripts/src/main/atlasFiles";

test("atlas export creates paired files without overwriting existing output", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-output-"));
  try {
    const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: "transparent" } }).png().toBuffer();
    const metadata = JSON.stringify({ frames: [], meta: { image: "sprites.png" } });
    const first = await writeAtlasExport(directory, png, metadata, "sprites");
    const second = await writeAtlasExport(directory, png, metadata, "sprites");
    assert.notEqual(first, second);
    assert.deepEqual(await fs.readFile(path.join(first, "sprites.png")), png);
    assert.equal(await fs.readFile(path.join(second, "sprites.json"), "utf8"), metadata);
    await assert.rejects(writeAtlasExport(directory, png, metadata, "../escape"), /名称/);
    await assert.rejects(writeAtlasExport(directory, Buffer.from("invalid"), metadata, "bad"), /PNG/);
    await assert.rejects(writeAtlasExport(directory, png, "[]", "bad"), /JSON/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
