import type { Definition, Field } from "../../../../../sdk/processing";
const n = (key: string, label: string, value: number, min = 0): Field => ({
  key,
  label,
  type: "number",
  default: value,
  min,
  max: key === "digits" ? 12 : key === "start" ? 1_000_000 : 32768,
});
const s = (
  key: string,
  label: string,
  value: string,
  options: string[]
): Field => ({ key, label, type: "select", default: value, options });
const t = (key: string, label: string, value = ""): Field => ({
  key,
  label,
  type: "text",
  default: value,
});
const b = (key: string, label: string, value = false): Field => ({
  key,
  label,
  type: "boolean",
  default: value,
});
const color: Field = {
  key: "background",
  label: "背景颜色",
  type: "color",
  default: "#ffffff",
};
export const definitions: Definition[] = [
  {
    id: "remove-background",
    name: "移除背景",
    description: "本地 rembg 抠图，保留透明通道；需先安装 Python 依赖和模型。建议导出 PNG / WebP。",
    fields: [
      s("model", "模型", "rembg.u2netp", ["rembg.u2netp"]),
      b("postProcessMask", "平滑蒙版边缘", false),
    ],
  },
  {
    id: "resize",
    name: "缩放",
    description: "调整尺寸、比例或最大边长",
    fields: [
      s("mode", "模式", "fit", ["fit", "exact", "percent", "max"]),
      n("width", "宽度", 512, 1),
      n("height", "高度", 512, 1),
      n("percent", "缩放百分比", 100, 0.01),
      n("max", "最大边长", 1024, 1),
      b("enlarge", "允许放大", true),
      s("kernel", "插值", "lanczos3", [
        "nearest",
        "cubic",
        "mitchell",
        "lanczos3",
      ]),
    ],
  },
  {
    id: "crop",
    name: "裁剪",
    description: "坐标基于此步骤输入图像，可在预览中拖选",
    fields: [
      n("left", "左侧 X", 0),
      n("top", "顶部 Y", 0),
      n("width", "宽度", 128, 1),
      n("height", "高度", 128, 1),
    ],
  },
  {
    id: "canvas",
    name: "画布 / 补边",
    description: "画布不得小于图片；透明背景适用于 PNG / WebP",
    fields: [
      s("mode", "模式", "size", ["size", "padding"]),
      n("width", "画布宽度", 1024, 1),
      n("height", "画布高度", 1024, 1),
      n("padding", "四周边距", 16),
      s("position", "对齐", "centre", [
        "centre",
        "north",
        "south",
        "east",
        "west",
        "northeast",
        "northwest",
        "southeast",
        "southwest",
      ]),
      b("transparent", "透明背景", true),
      color,
    ],
  },
  {
    id: "rotate",
    name: "旋转 / 翻转",
    description: "正数为顺时针旋转",
    fields: [
      { ...n("angle", "角度", 90, -360), max: 360 },
      b("horizontal", "水平翻转"),
      b("vertical", "垂直翻转"),
      b("transparent", "透明背景", true),
      color,
    ],
  },
  {
    id: "trim",
    name: "透明裁剪",
    description: "无 Alpha 或完全透明图保持原样并提示",
    fields: [
      { ...n("threshold", "Alpha 阈值 (0–255)", 0), max: 255 },
      n("padding", "保留边距", 0),
    ],
  },
  {
    id: "convert",
    name: "格式转换",
    description: "格式在最终输出时编码；JPEG 将合成背景",
    fields: [
      s("format", "输出格式", "png", ["png", "jpeg", "webp"]),
      { ...n("quality", "质量", 90, 1), max: 100 },
      color,
    ],
  },
  {
    id: "rename",
    name: "重命名",
    description: "模板支持 {name}、{index}、{width}、{height}",
    fields: [
      t("prefix", "前缀"),
      t("suffix", "后缀"),
      t("find", "替换内容"),
      t("replace", "替换为"),
      t("template", "模板", "{name}"),
      b("numbered", "附加序号"),
      n("start", "起始序号", 1),
      n("digits", "序号位数", 3, 1),
    ],
  },
];
