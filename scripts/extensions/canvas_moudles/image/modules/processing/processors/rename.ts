import type { Processor } from "./types";
export const rename: Processor = (c, p) => {
  if (p.find) c.name = c.name.split(p.find).join(p.replace);
  c.name = p.template
    .replaceAll("{name}", c.name)
    .replaceAll("{index}", String(c.index + p.start).padStart(p.digits, "0"))
    .replaceAll("{width}", String(c.width))
    .replaceAll("{height}", String(c.height));
  c.name =
    p.prefix +
    c.name +
    p.suffix +
    (p.numbered ? "_" + String(c.index + p.start).padStart(p.digits, "0") : "");
};
