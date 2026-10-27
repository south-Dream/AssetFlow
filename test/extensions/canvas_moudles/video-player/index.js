export default {
  activate(context) {
    let player;
    const empty = () => {
      context.root.replaceChildren();
      const p = document.createElement("p");
      p.textContent = "拖入 MP4 / WebM，预览区下方会显示视频与音频轨道。";
      context.root.append(p);
    };
    context.resources.registerHandler("video-player.open", {
      async canAccept(refs) {
        if (refs.length !== 1 || refs[0].size > 128 * 1024 * 1024)
          return {
            accepted: false,
            reason: "仅接收单个、不超过 128 MB 的视频",
          };
        const bytes = new Uint8Array(await context.resources.read(refs[0].id));
        const mp4 = String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
        const webm =
          bytes[0] === 0x1a &&
          bytes[1] === 0x45 &&
          bytes[2] === 0xdf &&
          bytes[3] === 0xa3;
        return {
          accepted: mp4 || webm,
          reason: "文件头不匹配 MP4 / MOV / WebM 容器",
        };
      },
      async open(refs) {
        const url = await context.resources.url(refs[0].id);
        context.root.replaceChildren();
        const heading = document.createElement("h3");
        heading.textContent = refs[0].name;
        player = document.createElement("video");
        player.controls = true;
        player.src = url;
        player.style.cssText = "width:100%;max-height:58vh;background:#000";
        const status = document.createElement("p");
        status.textContent = "正在读取视频…";
        const tracks = document.createElement("section");
        tracks.style.cssText =
          "margin:12px 8px;padding:10px;border:1px solid #394859";
        const video = document.createElement("div"),
          audio = document.createElement("div");
        video.textContent = "视频轨 · 预览";
        audio.textContent = "音频轨 · 容器音轨占位（尚未检测是否含音频）";
        video.style.cssText = "padding:16px;margin:6px;background:#30496a";
        audio.style.cssText = "padding:16px;margin:6px;background:#244f49";
        tracks.append(video, audio);
        player.addEventListener("loadedmetadata", () => {
          status.textContent = `${player.videoWidth} × ${
            player.videoHeight
          } · ${
            Number.isFinite(player.duration)
              ? player.duration.toFixed(2)
              : "未知"
          } 秒`;
        });
        player.addEventListener("error", () => {
          status.textContent =
            "无法播放：当前运行时不支持该视频编码，或文件损坏。";
        });
        context.root.append(heading, player, status, tracks);
      },
      dispose() {
        if (player) {
          player.pause();
          player.removeAttribute("scripts/src");
          player.load();
          player = null;
        }
        empty();
      },
    });
    empty();
  },
};
