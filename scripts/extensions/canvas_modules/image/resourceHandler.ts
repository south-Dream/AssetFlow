import { createResourceAPI, type CanvasResourceRef } from "../../sdk/canvas";
import config from "./config.json";
/** Image-specific resource behavior; the generic shell never decodes images. */
export function createImageResourceAPI(
  open: (resource: CanvasResourceRef) => void
) {
  const resources = createResourceAPI(config.resources as any, async () => {
    throw Error("内置图片资源通过可信预览服务读取");
  });
  resources.registerHandler("image.open", {
    canAccept: (refs) =>
      refs.length === 1 && refs[0].width > 0 && refs[0].height > 0,
    open: async (refs) => open(refs[0]),
    dispose() {},
  });
  return resources;
}
