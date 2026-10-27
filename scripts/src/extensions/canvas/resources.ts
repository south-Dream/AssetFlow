import type { Asset } from "../../shared";
import type {
  CanvasResourceRule,
  CanvasResourceRef,
  CanvasResourceAPI,
  CanvasResourceHandler,
} from "./contracts";

export function resourceMime(extension: string): string {
  return (
    (
      {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
        gif: "image/gif",
        svg: "image/svg+xml",
        mp3: "audio/mpeg",
        wav: "audio/wav",
        ogg: "audio/ogg",
        flac: "audio/flac",
        m4a: "audio/mp4",
        mp4: "video/mp4",
        webm: "video/webm",
        mov: "video/quicktime",
        json: "application/json",
        txt: "text/plain",
        csv: "text/csv",
      } as Record<string, string>
    )[extension.toLowerCase()] ?? "application/octet-stream"
  );
}
export function toResourceRef(asset: Asset): CanvasResourceRef {
  const extension = asset.format.toLowerCase();
  return {
    id: asset.id,
    name: asset.name,
    extension,
    mimeType: resourceMime(extension),
    size: asset.size,
    width: asset.width,
    height: asset.height,
  };
}
/** Self-contained: this exact function is also injected into isolated SDK documents. */
export function matchResourceRule(
  rules: readonly CanvasResourceRule[],
  refs: readonly CanvasResourceRef[]
): CanvasResourceRule | undefined {
  if (!Array.isArray(refs) || refs.length === 0) return;
  return rules.find(
    (rule) =>
      refs.length <= (rule.maxCount ?? 1) &&
      refs.every(
        (ref) =>
          ref &&
          typeof ref.id === "string" &&
          typeof ref.extension === "string" &&
          ref.extension !== "directory" &&
          ((rule.extensions ?? []).some(
            (ext) => ext.toLowerCase() === ref.extension.toLowerCase()
          ) ||
            (rule.mimeTypes ?? []).some((mime) =>
              mime.endsWith("/*")
                ? ref.mimeType?.startsWith(mime.slice(0, -1))
                : ref.mimeType === mime
            ))
      )
  );
}
/** No host dependencies; the same implementation runs in the sandbox and tests. */
export function createResourceAPI(
  rules: readonly CanvasResourceRule[],
  read: (id: string) => Promise<ArrayBuffer>
): CanvasResourceAPI {
  const handlers = new Map<string, CanvasResourceHandler>();
  let active: CanvasResourceHandler | undefined;
  let granted = new Map<string, CanvasResourceRef>();
  let pendingRefs = new Map<string, CanvasResourceRef>();
  const urls = new Map<string, string>();
  let pending = Promise.resolve();
  const queue = (action: () => Promise<void>) => {
    const result = pending.then(action);
    pending = result.catch(() => {});
    return result;
  };
  const revoke = () => {
    for (const url of urls.values()) URL.revokeObjectURL(url);
    urls.clear();
  };
  const api: CanvasResourceAPI = {
    registerHandler(id, handler) {
      if (
        !rules.some((rule) => rule.handler === id) ||
        handlers.has(id) ||
        typeof handler?.canAccept !== "function" ||
        typeof handler?.open !== "function"
      )
        throw Error(`未声明、重复或无效的资源入口：${id}`);
      handlers.set(id, handler);
    },
    hasHandler: (id) => handlers.has(id),
    async read(id) {
      if (!granted.has(id) && !pendingRefs.has(id))
        throw Error("资源未授权给当前画布");
      return read(id);
    },
    async url(id) {
      if (!granted.has(id) && !pendingRefs.has(id))
        throw Error("资源未授权给当前画布");
      if (!urls.has(id)) {
        const data = await api.read(id);
        const ref = granted.get(id) ?? pendingRefs.get(id)!;
        urls.set(
          id,
          URL.createObjectURL(new Blob([data], { type: ref.mimeType }))
        );
      }
      return urls.get(id)!;
    },
    open(refs) {
      return queue(async () => {
        const rule = matchResourceRule(rules, refs);
        if (!rule) throw Error("此画布未配置对应资源入口或资源数量不匹配");
        const handler = handlers.get(rule.handler);
        if (!handler) throw Error(`资源入口未注册：${rule.handler}`);
        pendingRefs = new Map(refs.map((ref) => [ref.id, ref]));
        try {
          const acceptance = await handler.canAccept(refs);
          if (
            !(typeof acceptance === "boolean"
              ? acceptance
              : acceptance?.accepted)
          )
            throw Error(
              typeof acceptance === "object"
                ? acceptance.reason || "模块拒绝该资源"
                : "模块拒绝该资源"
            );
          if (active && (rule.mode === "replace" || active !== handler)) {
            await active.dispose?.();
            revoke();
            granted.clear();
          }
          active = handler;
          for (const ref of refs) granted.set(ref.id, ref);
          await handler.open(refs, { mode: rule.mode });
        } finally {
          pendingRefs.clear();
        }
      });
    },
    dispose() {
      return queue(async () => {
        try {
          await active?.dispose?.();
        } finally {
          active = undefined;
          granted.clear();
          pendingRefs.clear();
          revoke();
        }
      });
    },
  };
  return api;
}
