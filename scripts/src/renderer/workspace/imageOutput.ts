import type { Step } from "../../shared";
export type ImageOutputOptions = {
  format: string;
  quality: number;
  template: string;
  background: string;
};
export function imageOutputSteps(
  steps: readonly Step[],
  options: ImageOutputOptions
): Step[] {
  return [
    ...steps.filter((step) => !["convert", "rename"].includes(step.processor)),
    {
      id: "output-format",
      processor: "convert",
      enabled: true,
      params: {
        format: options.format,
        quality: options.quality,
        background: options.background,
      },
    },
    {
      id: "output-name",
      processor: "rename",
      enabled: true,
      params: {
        prefix: "",
        suffix: "",
        find: "",
        replace: "",
        template: options.template,
        numbered: false,
        start: 1,
        digits: 3,
      },
    },
  ];
}
