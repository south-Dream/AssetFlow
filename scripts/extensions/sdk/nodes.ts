/** Navigation is a tree of executable nodes; descriptors are only configuration. */
export abstract class NavNode {
  abstract readonly name: string;
  readonly children: readonly NavNode[] = [];
  abstract trigger(): void | Promise<void>;
}

/** Fixed selection template shared by native and script tools. */
export abstract class ToolNode<DrawContext, Output, Canvas = unknown, Context extends { selectTool(node: any): void | Promise<void> } = { selectTool(node: any): void | Promise<void> }> extends NavNode {
  readonly kind = "tool";
  constructor(protected readonly canvas: Canvas, protected readonly context: Context) {
    super();
    Object.defineProperty(this, "trigger", { value: async () => { await context.selectTool(this); await this.onTrigger(); }, writable: false, configurable: false });
  }
  trigger(): void | Promise<void> { throw Error("Tool trigger is installed by the base class"); }
  protected onTrigger(): void | Promise<void> {}
  abstract draw(context: DrawContext): Output | Promise<Output>;
}

/** Host adapter used by application and canvas menus alike. */
export class ActionNavNode extends NavNode {
  constructor(readonly name: string, private readonly action: () => void | Promise<void>,
    override readonly children: readonly NavNode[] = []) { super(); }
  trigger() { return this.action(); }
}
