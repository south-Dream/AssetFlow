# Canvas shared structure repair

The atlas implementation bypassed the existing common Inspector properties and did not declare its operations in the shared left toolbox. This violates the established canvas contract and is a correction to the approved design.

Required boundary:

- CanvasFrame always owns the navigation, left CanvasToolbox and content surface. Types supply content only.
- CanvasInspector always owns InspectorLayout, common input/preview controls and CanvasBaseProperties. Configured type properties and optional native read-only extensions are appended after the common section.
- Image Inspector and ExtensionInspector provide operation bodies only, without another InspectorLayout or upper-area override.
- Atlas declares layout/export tools and one-shot commands in its config. Shared command dispatch, tool parameters, Apply/Cancel, shortcut settings and save preparation drive its implementation.
- Atlas viewport renders the image and direct image interaction only; no operation buttons or parameter form.

Verification covers image, atlas and a synthetic new type automatically receiving common structure, blank lower area before tool selection, left toolbar visibility/order/shortcuts, operation-specific lower contents, draft cancellation, applied persistence, export and Ctrl+S draft preparation, and same-type preview connections. Final delivery includes fresh build, regression suite and updated executable.
