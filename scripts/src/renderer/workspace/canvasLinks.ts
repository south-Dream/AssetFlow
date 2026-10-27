import type { Step } from "../../shared";

export function canLinkCanvas(
  links: Record<string, string>,
  source: string,
  target: string
): boolean {
  const visited = new Set([target]);
  for (let id: string | undefined = source; id; id = links[id]) {
    if (visited.has(id)) return false;
    visited.add(id);
  }
  return true;
}

export function resolveCanvas(
  id: string,
  links: Record<string, string>,
  assets: Record<string, string>,
  documents: Record<string, { steps: Step[] }>
): { assetId: string; steps: Step[] } {
  const chain: string[] = [];
  const visited = new Set<string>();
  let current: string | undefined = id;
  while (current) {
    if (visited.has(current)) return { assetId: "", steps: [] };
    visited.add(current);
    chain.unshift(current);
    current = links[current];
  }
  return {
    assetId: assets[chain[0]] ?? "",
    steps: chain.flatMap((key) => documents[key]?.steps ?? []),
  };
}

/** Drafts participate only in live preview; saved pipelines remain unchanged. */
export function resolvePreviewCanvas(
  id: string,
  links: Record<string, string>,
  assets: Record<string, string>,
  documents: Record<
    string,
    { steps: Step[]; editing?: { draft: Step; fresh: boolean } | null }
  >
) {
  return resolveCanvas(
    id,
    links,
    assets,
    Object.fromEntries(
      Object.entries(documents).map(([key, document]) => {
        const edit = document.editing;
        return [
          key,
          {
            steps: !edit
              ? document.steps
              : edit.fresh
              ? [...document.steps, edit.draft]
              : document.steps.map((step) =>
                  step.id === edit.draft.id ? edit.draft : step
                ),
          },
        ];
      })
    )
  );
}
