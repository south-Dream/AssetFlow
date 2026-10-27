export default {
  activate(context) {
    let player;
    let decoded;
    const empty = () => {
      context.root.replaceChildren();
      const p = document.createElement("p");
      p.textContent = "拖入 MP3 / WAV 等音频，或使用文件菜单打开资源。";
      context.root.append(p);
    };
    const dispose = () => {
      if (player) {
        player.pause();
        player.removeAttribute("scripts/src");
        player.load();
        player = null;
      }
      empty();
    };
    context.resources.registerHandler("audio-player.open", {
      async canAccept(refs) {
        if (refs.length !== 1 || refs[0].size > 128 * 1024 * 1024)
          return {
            accepted: false,
            reason: "仅接收单个、不超过 128 MB 的音频",
          };
        const audio = new AudioContext();
        try {
          decoded = await audio.decodeAudioData(
            await context.resources.read(refs[0].id)
          );
          return true;
        } catch {
          return {
            accepted: false,
            reason: "音频解码失败：文件损坏或当前运行时不支持此编码",
          };
        } finally {
          await audio.close();
        }
      },
      async open(refs) {
        const url = await context.resources.url(refs[0].id);
        context.root.replaceChildren();
        const name = document.createElement("h3");
        name.textContent = refs[0].name;
        player = document.createElement("audio");
        player.controls = true;
        player.src = url;
        player.style.width = "100%";
        const track = document.createElement("section");
        track.style.cssText =
          "margin:18px 8px;padding:12px;border:1px solid #394859;border-radius:6px;background:#203940";
        const label = document.createElement("p");
        label.textContent = `音频轨 · ${decoded.duration.toFixed(2)} 秒 · ${
          decoded.numberOfChannels
        } 声道`;
        const wave = document.createElement("canvas");
        wave.width = 800;
        wave.height = 120;
        wave.style.width = "100%";
        const samples = decoded.getChannelData(0),
          painter = wave.getContext("2d");
        painter.strokeStyle = "#7bd3b2";
        painter.beginPath();
        for (let x = 0; x < 800; x++) {
          const start = Math.floor((x * samples.length) / 800),
            end = Math.max(
              start + 1,
              Math.floor(((x + 1) * samples.length) / 800)
            );
          let peak = 0;
          for (let i = start; i < end && i < samples.length; i++)
            peak = Math.max(peak, Math.abs(samples[i]));
          painter.moveTo(x, 60 - peak * 55);
          painter.lineTo(x, 60 + peak * 55);
        }
        painter.stroke();
        track.append(label, wave);
        context.root.append(name, player, track);
      },
      dispose,
    });
    empty();
  },
};
