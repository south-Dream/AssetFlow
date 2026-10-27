export function checkDimensions(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1 ||
    width > 32768 ||
    height > 32768 ||
    width * height > 100_000_000
  )
    throw Error("目标尺寸超过限制：单边最多 32768，最多 1 亿像素");
}
