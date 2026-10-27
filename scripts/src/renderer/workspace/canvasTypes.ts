import type { Asset } from "../../shared";
import type { CanvasType } from "./model";

export const canvasTypes: Record<CanvasType, { label: string; accepts: string[]; available: boolean }> = {
  image: { label: "图片", accepts: ["png", "jpeg", "jpg", "webp"], available: true },
  atlas: { label: "图集", accepts: ["png", "jpeg", "jpg", "webp"], available: false },
  audio: { label: "音频", accepts: ["wav", "mp3", "ogg", "flac"], available: false },
  video: { label: "视频", accepts: ["mp4", "mov", "webm"], available: false },
  animation: { label: "动画", accepts: ["png", "webp"], available: false },
  data: { label: "数据", accepts: ["json", "csv", "xlsx"], available: false },
  blueprint: { label: "蓝图", accepts: [], available: false },
};

export function acceptsAsset(type: CanvasType, asset: Asset): boolean {
  return canvasTypes[type].accepts.includes(asset.format.toLowerCase());
}
