export type ImportRules = { whitelist: string[]; blacklist: string[] };
export const defaultImportRules: ImportRules = { whitelist: [], blacklist: ["*.meta"] };

export function matchesPattern(value: string, pattern: string): boolean {
  const source = [...pattern.replace(/\\/g, "/")].map(char =>
    char === "*" ? ".*" : char === "?" ? "." : char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  ).join("");
  return new RegExp(`^${source}$`, "i").test(value.replace(/\\/g, "/"));
}

export function validateImportRules(value: unknown): ImportRules {
  const rules = value as ImportRules;
  if (!rules || ![rules.whitelist, rules.blacklist].every(list => Array.isArray(list) && list.length <= 200 && list.every(item => typeof item === "string" && item.length <= 256 && !item.includes("\0"))))
    throw Error("导入规则无效：每个列表最多 200 条，每条最多 256 个字符");
  return { whitelist: rules.whitelist.map(s => s.trim()).filter(Boolean), blacklist: rules.blacklist.map(s => s.trim()).filter(Boolean) };
}

export function acceptsFile(name: string, relativePath: string, rules: ImportRules): boolean {
  const matches = (pattern: string) => matchesPattern(pattern.includes("/") || pattern.includes("\\") ? relativePath : name, pattern);
  return !rules.blacklist.some(matches) && (!rules.whitelist.length || rules.whitelist.some(matches));
}
