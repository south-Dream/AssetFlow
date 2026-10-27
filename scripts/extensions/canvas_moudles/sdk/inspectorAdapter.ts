import type { InspectorAdapter, CanvasValues } from "./contracts";
/** Module-owned adaptation: only normalized fields and values cross the SDK. */
export function bindInspectorModel<Model>(
  model: Model,
  adapter: InspectorAdapter<Model>
) {
  const fields = adapter.describe(model);
  return {
    fields,
    read(): CanvasValues {
      return Object.fromEntries(
        fields.map((field) => [field.id, adapter.read(model, field.id)])
      );
    },
    write(values: CanvasValues) {
      for (const field of fields)
        if (Object.hasOwn(values, field.id))
          adapter.write(model, field.id, values[field.id]);
    },
  };
}
