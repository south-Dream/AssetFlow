import fs from "node:fs/promises";
import path from "node:path";

/** Exclusive creation protects both existing exports and source files. */
export async function writeUnique(
  directory: string,
  name: string,
  buffer: Buffer,
  protectedPaths: Set<string>,
  reserved: Set<string>,
  signal: AbortSignal
) {
  if (path.basename(name) !== name) throw Error("不合法的输出文件名");
  await fs.mkdir(directory, { recursive: true });
  const parsed = path.parse(name);
  for (let suffix = 0; ; suffix++) {
    signal.throwIfAborted();
    const target = path.join(
      directory,
      parsed.name + (suffix ? "_" + suffix : "") + parsed.ext
    );
    const key = target.toLowerCase();
    if (protectedPaths.has(key) || reserved.has(key)) continue;
    reserved.add(key);
    let handle;
    try {
      handle = await fs.open(target, "wx");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw e;
    }
    try {
      await handle.writeFile(Uint8Array.from(buffer));
      signal.throwIfAborted();
      await handle.close();
      return target;
    } catch (e) {
      await handle.close().catch(() => {});
      await fs.rm(target, { force: true }).catch(() => {});
      throw e;
    }
  }
}

export async function zipDirectory(
  source: string,
  directory: string,
  signal: AbortSignal,
  name = "AssetFlow"
) {
  if (!name || /[\\/:*?"<>|]/.test(name) || name === "." || name === "..") throw Error("导出名称无效");
  const { default: archiver } = await import("archiver");
  let handle;
  let target = "";
  for (let suffix = 0; ; suffix++) {
    signal.throwIfAborted();
    target = path.join(directory, `${name}${suffix ? "_" + suffix : ""}.zip`);
    try {
      handle = await fs.open(target, "wx");
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const stream = handle!.createWriteStream();
      const archive = archiver("zip", { zlib: { level: 6 } });
      const abort = () => {
        archive.abort();
        stream.destroy(Error("任务已取消"));
      };
      signal.addEventListener("abort", abort, { once: true });
      stream.once("close", () => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) reject(Error("任务已取消"));
        else resolve();
      });
      stream.once("error", reject);
      archive.once("error", (e) => {
        stream.destroy(e);
        reject(e);
      });
      archive.pipe(stream);
      archive.directory(source, false);
      void archive.finalize().catch(reject);
      if (signal.aborted) abort();
    });
    return target;
  } catch (e) {
    await handle.close().catch(() => {});
    await fs.rm(target, { force: true }).catch(() => {});
    throw e;
  }
}
