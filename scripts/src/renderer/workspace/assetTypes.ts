import type { Asset } from "../../shared";
import { configFor } from "./moduleRegistry";
import { matchResourceRule, toResourceRef } from "../../extensions/canvas/resources";

export const assetTypes = [
  {
    id: "image",
    label: "图片",
    icon: "▧",
    formats: /^(png|jpe?g|webp|gif|bmp|svg|tiff?|avif)$/i,
  },
  {
    id: "audio",
    label: "音频",
    icon: "♪",
    formats: /^(mp3|wav|ogg|flac|aac|m4a)$/i,
  },
  {
    id: "video",
    label: "视频",
    icon: "▷",
    formats: /^(mp4|webm|mov|avi|mkv)$/i,
  },
  { id: "other", label: "其他", icon: "◇", formats: /.*/ },
] as const;
export type AssetIcons = Record<string, string>;
export function defaultAssetIcons(): AssetIcons {
  return Object.fromEntries(assetTypes.map((t) => [t.id, t.icon]));
}
export function assetType(asset: Asset): string {
  return assetTypes.find((t) => t.formats.test(asset.format))!.id;
}
export function acceptsAsset(mode: string, asset: Asset): boolean {
  return (
    !asset.error &&
    !!matchResourceRule(configFor(mode)?.resources ?? [], [
      toResourceRef(asset),
    ])
  );
}
