/** Acknowledged commands; managers wait for restore/clear instead of racing the next action. */
export function requestCanvasOperation(windowId: string, operation: "undo" | "clear"): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(Error("Canvas operation timed out")), 30000);
    window.dispatchEvent(new CustomEvent(`assetflow:canvas-${operation}`, { detail: {
      windowId, resolve: () => { clearTimeout(timer); resolve(); },
      reject: (error: unknown) => { clearTimeout(timer); reject(error); },
    } }));
  });
}
