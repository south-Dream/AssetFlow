import type sharp from "sharp";
export type Context = {
  image: Buffer;
  width: number;
  height: number;
  format: string;
  quality: number;
  background: string;
  name: string;
  index: number;
  warnings: string[];
};
export type Processor = (
  context: Context,
  params: Record<string, any>
) => Promise<sharp.Sharp | void> | sharp.Sharp | void;
