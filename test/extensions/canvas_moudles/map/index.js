// Native browser ES module. No Node/Electron/host DOM dependencies.
export default {
  activate(context) {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    canvas.style.cssText = "width:100%;max-width:640px;touch-action:none";
    const heading = document.createElement("p");
    heading.textContent =
      "选择“绘制地块”，在画布上点击；Inspector 中应用或取消。";
    context.root.append(heading, canvas);
    const ctx = canvas.getContext("2d");
    let committed = Array.isArray(context.state?.tiles)
      ? structuredClone(context.state.tiles)
      : [];
    let tiles = structuredClone(committed);
    let active = false;
    let linked = context.previewTarget === "linked";
    let params = { "map.paint.size": 32, "map.paint.color": "草地" };
    const colors = { 草地: "#5b9e62", 水面: "#497fae", 沙地: "#c5ad67" };
    let properties = context.canvasProperties;
    context.registerDrawer("map.sizeDrawer", {
      draw(ctx) {
        return ctx.ui.column([
          ctx.ui.slider({
            value: Number(ctx.value),
            min: Number(ctx.field.min),
            max: Number(ctx.field.max),
            step: 1,
            onChange: ctx.setValue,
          }),
          ctx.ui.row([
            ctx.ui.input({ value: Number(ctx.value), onChange: ctx.setValue }),
            ctx.ui.button({ label: "重置", onClick: () => ctx.setValue(32) }),
          ]),
        ]);
      },
    });
    context.onCanvasProperties((values) => {
      properties = values;
      draw();
    });
    const draw = () => {
      ctx.fillStyle =
        properties["map.background"] === "浅色" ? "#d7dce3" : "#202a35";
      ctx.fillRect(0, 0, 640, 480);
      for (const tile of linked ? committed : tiles) {
        ctx.fillStyle = colors[tile.color] || colors["草地"];
        ctx.fillRect(tile.x, tile.y, tile.size, tile.size);
      }
      if (context.settings["map.grid"] !== false) {
        ctx.strokeStyle = "#ffffff18";
        ctx.beginPath();
        for (
          let x = 0;
          x <= 640;
          x += Number(properties["map.gridSize"] ?? 32)
        ) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, 480);
        }
        for (
          let y = 0;
          y <= 480;
          y += Number(properties["map.gridSize"] ?? 32)
        ) {
          ctx.moveTo(0, y);
          ctx.lineTo(640, y);
        }
        ctx.stroke();
      }
    };
    const output = () =>
      context.publishOutput({ tiles: structuredClone(tiles) });
    context.registerCommand("map.paint", () => {
      active = true;
      tiles = structuredClone(committed);
      draw();
    });
    context.registerCommand("map.clear", () => {
      committed = [];
      tiles = [];
      context.saveState({ tiles: committed });
      draw();
      output();
    });
    context.onToolEvent((event) => {
      if (event.tool !== "map.paint") return;
      params = event.params;
      if (event.phase === "apply") {
        committed = structuredClone(tiles);
        context.saveState({ tiles: committed });
        active = false;
      }
      if (event.phase === "cancel") {
        tiles = structuredClone(committed);
        active = false;
      }
      draw();
      output();
    });
    context.onInput((value) => {
      if (!Array.isArray(value?.tiles)) return;
      committed = structuredClone(value.tiles);
      tiles = structuredClone(committed);
      draw();
      output();
    });
    context.onPreviewTarget((target) => {
      linked = target === "linked";
      draw();
    });
    canvas.addEventListener("pointerdown", (event) => {
      if (!active) return;
      const rect = canvas.getBoundingClientRect();
      const size = params["map.paint.size"];
      context.markToolDirty();
      tiles.push({
        x:
          Math.floor(((event.clientX - rect.left) * 640) / rect.width / size) *
          size,
        y:
          Math.floor(((event.clientY - rect.top) * 480) / rect.height / size) *
          size,
        size,
        color: params["map.paint.color"],
      });
      draw();
      output();
    });
    draw();
    output();
  },
};
