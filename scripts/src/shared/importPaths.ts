export function validateImportPaths(
  input: unknown,
  platform = "win32",
): asserts input is string[] {
  if (
    !Array.isArray(input) ||
    input.length > 10000 ||
    input.some(
      (value) =>
        typeof value !== "string" ||
        !value.trim() ||
        value.includes("\0") ||
        !(platform === "win32"
          ? /^[a-z]:[\\/]/i.test(value) ||
            /^\\\\[^\\/]+[\\/][^\\/]+/.test(value)
          : value.startsWith("/")),
    )
  ) {
    throw new Error(
      "无法获取有效的绝对文件路径，请从文件管理器拖入文件或使用文件菜单导入",
    );
  }
}

export function droppedFilePaths(
  files: File[],
  getPath: (file: File) => string,
): string[] {
  const paths = files.map((file) => getPath(file));
  validateImportPaths(
    paths,
    navigator.platform.toLowerCase().includes("win") ? "win32" : "posix",
  );
  return paths;
}
