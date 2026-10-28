import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WorkspaceAssetStore } from "../scripts/src/main/workspaceAssets";
import { createAssetImporter } from "../scripts/src/main/assetImport";
import type { Asset } from "../scripts/src/shared";
import sharp from "sharp";
import { processImage } from "../scripts/extensions/canvas_modules/image/modules/processing/process";
import { exportResources } from "../scripts/src/main/resourceExport";
import { zipDirectory } from "../scripts/src/services/output";
import { definitions } from "../scripts/src/core/registry";
import { createImageExportTransform } from "../scripts/src/extensions/adapters/imageExport";

test("recursive import excludes meta by default and applies blacklist before whitelist", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "assetflow-filter-"));
  try {
    await fs.mkdir(path.join(root, "nested"));
    for (const name of ["nested/keep.custom", "nested/drop.META", "nested/skip.txt"])
      await fs.writeFile(path.join(root, name), "data");
    const importer = createAssetImporter(new Map());
    const defaults = await importer([root], true);
    assert.deepEqual(defaults.filter(a => a.format !== "directory").map(a => a.name).sort(), ["keep.custom", "skip.txt"]);
    const restricted = await importer([root], true, { whitelist: ["*.custom", "*.meta"], blacklist: ["*.meta"] });
    assert.deepEqual(restricted.filter((a: Asset) => a.format !== "directory").map((a: Asset) => a.name), ["keep.custom"]);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("saving an image recipe twice uses its immutable copy and exports the latest saved bytes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "assetflow-image-save-"));
  try {
    const origin = path.join(root,"input.png");
    await sharp({create:{width:12,height:10,channels:4,background:"#ff0000"}}).png().toFile(origin);
    const source = await fs.readFile(origin);
    const assets = new Map<string,Asset>(), store = new WorkspaceAssetStore(path.join(root,"internal"),assets);
    const asset = (await createAssetImporter(assets, item => store.importAsset(item))([origin],false))[0];
    const crop = { id:"crop",processor:"crop",enabled:true,params:Object.fromEntries(definitions.find(d=>d.id==="crop")!.fields.map(f=>[f.key,f.default])) };
    Object.assign(crop.params,{left:2,top:1,width:8,height:7});
    const first = await processImage(asset.path,[crop]);
    await store.commit(asset.id,{data:first.buffer,steps:[crop],revision:0});
    const second = await processImage(asset.path,[crop]);
    assert.equal(second.width,8); assert.equal(second.height,7);
    const saved = await store.commit(asset.id,{data:second.buffer,steps:[crop],revision:1});
    const output = path.join(root,"export");
    await exportResources(output,[{id:asset.id,folder:"images"}],["empty"],assets);
    assert.deepEqual(await fs.readFile(path.join(output,"images","input.png")),await fs.readFile(saved.savedPath!));
    assert.deepEqual(await fs.readFile(origin),source);
    assert.deepEqual(await fs.readFile(asset.path),source);
    const zip = await zipDirectory(output,root,new AbortController().signal,"export");
    assert.equal(path.basename(zip),"export.zip");
    assert.deepEqual([...((await fs.readFile(zip)).subarray(0,2))],[80,75]);
    const restored = new Map<string,Asset>(); await new WorkspaceAssetStore(path.join(root,"internal"),restored).restore();
    assert.equal(restored.get(asset.id)?.revision,2);
    assert.deepEqual(restored.get(asset.id)?.savedSteps,[crop]);
    const options = { format:"webp", quality:85, template:"{name}_{width}_{height}", background:"#ffffff" };
    const transformed = path.join(root,"converted");
    await exportResources(transformed,[{id:asset.id,folder:""}],[],assets,createImageExportTransform(options,processImage));
    const webp = await sharp(await fs.readFile(path.join(transformed,"input_8_7.webp"))).metadata();
    assert.equal(webp.format,"webp"); assert.equal(webp.width,8); assert.equal(webp.height,7);
    const renamed = path.join(root,"renamed");
    await exportResources(renamed,[{id:asset.id,folder:""}],[],assets,createImageExportTransform({...options,format:"original",template:"copy_{name}"},processImage));
    assert.deepEqual(await fs.readFile(path.join(renamed,"copy_input.png")),await fs.readFile(saved.savedPath!));
    assert.deepEqual(await fs.readFile(origin),source);
    assert.equal(assets.get(asset.id)?.name,"input.png");
    assert.throws(()=>createImageExportTransform({...options,template:"../escape"},processImage));
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});

test("concurrent imports and commits retain every asset and latest revision after restoring", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),"assetflow-index-"));
  try {
    const assets = new Map<string,Asset>(), store = new WorkspaceAssetStore(path.join(root,"internal"),assets);
    const importPaths = createAssetImporter(assets,item=>store.importAsset(item));
    const files = await Promise.all(Array.from({length:8},async (_,i)=>{const file=path.join(root,`${i}.txt`);await fs.writeFile(file,`${i}`);return file;}));
    const imported = await Promise.all(files.map(file=>importPaths([file],false)));
    await Promise.all(imported.map(([asset])=>store.commit(asset.id,{data:Buffer.from("saved"),revision:0})));
    const restored = new Map<string,Asset>(); await new WorkspaceAssetStore(path.join(root,"internal"),restored).restore();
    assert.equal(restored.size,8);
    for (const asset of restored.values()) { assert.equal(asset.revision,1); assert.equal(await fs.readFile(asset.savedPath!,"utf8"),"saved"); }
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});

test("imported assets are independent copies and saved representations never overwrite their base or source", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "assetflow-working-"));
  try {
    const origin = path.join(root, "source.txt"); await fs.writeFile(origin, "original");
    const assets = new Map<string, Asset>(), store = new WorkspaceAssetStore(path.join(root, "workspace"), assets);
    const importer = createAssetImporter(assets, asset => store.importAsset(asset));
    const imported = (await importer([origin], false))[0];
    assert.notEqual(imported.path, origin);
    assert.equal(imported.sourcePath, origin);
    await fs.writeFile(origin, "outside changed");
    assert.equal(await fs.readFile(imported.path, "utf8"), "original");
    await assert.rejects(store.commit(imported.id, { data: Buffer.from("invalid"), name: "file:stream", revision: 0 }), /名称/);
    const saved = await store.commit(imported.id, { data: Buffer.from("edited"), name: "source.txt", revision: 0 });
    assert.equal(saved.id, imported.id);
    assert.equal(await fs.readFile(saved.savedPath!, "utf8"), "edited");
    assert.equal(await fs.readFile(saved.path, "utf8"), "original");
    assert.equal(await fs.readFile(origin, "utf8"), "outside changed");
    await assert.rejects(store.commit(imported.id, { data: Buffer.from("stale"), revision: 0 }), /另一个|版本/);
    const restored = new Map<string, Asset>();
    await new WorkspaceAssetStore(path.join(root, "workspace"), restored).restore();
    assert.equal(restored.get(saved.id)?.savedPath, saved.savedPath);
    assert.equal((await importer([origin], false))[0].id, imported.id);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
