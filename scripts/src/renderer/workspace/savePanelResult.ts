import type { Bridge, Step } from "../../shared";

/** run starts a background task; only its terminal progress confirms a save. */
export async function savePanelResult(
  bridge: Bridge,
  id: string,
  steps: Step[],
): Promise<boolean> {
  const directory = await bridge.chooseOutput();
  if (!directory) return false;
  return new Promise((resolve, reject) => {
    const unsubscribe = bridge.onProgress((progress) => {
      if (!progress.finished) return;
      unsubscribe();
      if (
        progress.failed ||
        progress.cancelled ||
        progress.errors.length ||
        progress.success !== 1
      )
        reject(
          new Error(progress.errors.join("\n") || "保存未成功，保留当前面板"),
        );
      else resolve(true);
    });
    bridge
      .run([id], steps, { directory, preserve: false, zip: false })
      .catch((error) => {
        unsubscribe();
        reject(error);
      });
  });
}
