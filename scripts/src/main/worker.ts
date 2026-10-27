import { parentPort } from "node:worker_threads";
import { processImage } from "../extensions/adapters/imageBackend";
import sharp from "sharp";
sharp.concurrency(1);
sharp.cache({ memory: 16, files: 0, items: 20 });
parentPort!.on("message", async ({ file, steps, index }) => {
  try {
    const result = await processImage(file, steps, index);
    parentPort!.postMessage({ result });
  } catch (error) {
    parentPort!.postMessage({ error: (error as Error).message });
  }
});
