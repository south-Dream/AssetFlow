import test from "node:test";
import assert from "node:assert/strict";
import { CanvasBase, NavNode, ToolNode, defineCanvasModule, createCanvasSession } from "../scripts/extensions/canvas_modules/sdk/module";
import type { CanvasScriptContext, CanvasValues, InspectorDrawContext } from "../scripts/extensions/canvas_modules/sdk/index";
import { createResourceAPI } from "../scripts/src/extensions/canvas/resources";
import { validateCanvasConfig } from "../scripts/src/extensions/canvas/config";
function fixture() {
  const events: string[] = [], selections: any[] = [], commands = new Map<string, any>(), drawers = new Map<string, any>();
  let tools: any, save: any, instance: any;
  const config = validateCanvasConfig({schemaVersion:1,sdkVersion:1,id:"test",name:"Test",version:"1",entry:"./index.js",
    tools:[{id:"test.resize",name:"Resize",command:"test.resize",kind:"tool",fields:[{id:"test.width",name:"Width",type:"number",default:10,min:1,max:100}]},
      {id:"test.background",name:"Background",command:"test.background",kind:"tool",fields:[]},
      {id:"test.action",name:"Action",command:"test.action",kind:"command"}],
    menus:[{id:"test.tools",name:"Tools",children:[{id:"test.menu",name:"Resize",command:"test.resize"}]}],
    resources:[{handler:"test.open",extensions:["txt"],mode:"replace"}],
    bindings:{canvas:"Canvas",nodes:{"test.resize":"Resize","test.background":"Background","test.action":"Action"}}});
  class Canvas extends CanvasBase {
    value=1;
    constructor(context:any){super(context);instance=this;}
    draw(){events.push("draw");}
    drawProperties(ctx:any){return ctx.ui.text(String(this.value));}
    input(){} properties(){} target(){}
    open(){this.value=1;events.push("open");}
    capture(){return this.value;}
    restore(value:unknown){this.value=value as number;events.push("restore");}
    clear(){this.value=0;}
    edit(tool:string,phase:string,values:CanvasValues){if(phase!=="cancel")this.value=tool==="test.resize"?Number(values["test.width"]):99;}
    save(){return {data:new Uint8Array([this.value]).buffer};}
    dispose(){events.push("dispose");}
  }
  class Resize extends ToolNode { readonly name="Resize"; draw(ctx:any){events.push("tool.draw");return ctx.fields(config.tools[0].fields!);} }
  class Background extends ToolNode { readonly name="Background"; draw(ctx:any){return ctx.ui.text("Background");} }
  class Action extends NavNode {readonly name="Action";constructor(private canvas:Canvas){super();}trigger(){this.canvas.value=50;}}
  const host:any={root:{},windowId:"one",settings:{},state:null,capabilities:{},previewTarget:"self",canvasProperties:{},
    resources:createResourceAPI(config.resources!,async()=>new ArrayBuffer(1)),
    registerCommand:(id:string,fn:any)=>commands.set(id,fn),registerDrawer:(id:string,drawer:any)=>drawers.set(id,drawer),
    onToolEvent:(fn:any)=>{tools=fn;},onCanvasProperties:()=>{},onInput:()=>{},onPreviewTarget:()=>{},onSave:(fn:any)=>{save=fn;},
    publishOutput:()=>{},saveState:()=>{},notify:()=>{},markToolDirty:()=>{},selectTool:(tool:any,params:any)=>selections.push({tool,params})};
  return {config,host:host as CanvasScriptContext,events,selections,commands,drawers,classes:{Canvas,Resize,Background,Action},get canvas(){return instance;},
    tool:(tool:string,phase:string,params={})=>tools({tool,phase,params}),save:()=>save()};
}
test("two-node contract binds trigger, controlled draw, resource and save",async()=>{
 const f=fixture(),session=await createCanvasSession(defineCanvasModule(f.classes),f.config,f.host);
 await f.commands.get("test.resize")({});assert.equal(f.selections.at(-1).tool,"test.resize");
 const ctx:any={values:{"test.width":10},fields:()=>{},ui:{fields:()=>({kind:"text",text:"fields"})}};
 assert.equal((await f.drawers.get("test.resize.__tool").draw(ctx)).text,"fields");
 await f.tool("test.resize","preview",{"test.width":20});await f.tool("test.resize","apply",{"test.width":20});
 assert.equal(new Uint8Array((await f.save()).data)[0],20);
 assert.equal(f.canvas.context?.registerCommand,undefined);
 await session.dispose();await session.dispose();assert.equal(f.events.filter(e=>e==="dispose").length,1);
 await assert.rejects(f.commands.get("test.resize")({}),/disposed/);
});
test("undo restores content and previous selected tool with original parameters",async()=>{
 const f=fixture(),session=await createCanvasSession(defineCanvasModule(f.classes),f.config,f.host);
 await f.tool("test.resize","apply",{"test.width":20});await f.tool("test.background","apply");
 assert.equal(f.canvas.value,99);await session.undo();assert.equal(f.canvas.value,20);
 assert.deepEqual(f.selections.at(-1),{tool:"test.resize",params:{"test.width":20}});
 await session.undo();assert.equal(f.canvas.value,1);assert.equal(f.selections.at(-1).tool,undefined);
 await session.dispose();
});
test("undo preview, clear and command snapshots use the same history",async()=>{
 const f=fixture(),session=await createCanvasSession(defineCanvasModule(f.classes),f.config,f.host);
 await f.tool("test.resize","apply",{"test.width":20});await f.tool("test.background","preview");await session.undo();assert.equal(f.canvas.value,20);
 await session.clear();assert.equal(f.canvas.value,0);await session.undo();assert.equal(f.canvas.value,20);
 await f.commands.get("test.action")({});assert.equal(f.canvas.value,50);await session.undo();assert.equal(f.canvas.value,20);await session.dispose();
});

test("cancelling an Inspector selection restored by undo never activates default parameters", async () => {
 const f=fixture(),session=await createCanvasSession(defineCanvasModule(f.classes),f.config,f.host);
 await f.tool("test.resize","apply",{"test.width":20});await f.tool("test.background","apply");
 await session.undo();const count=f.selections.length;
 await f.tool("test.resize","cancel");assert.equal(f.canvas.value,20);assert.equal(f.selections.length,count);
 await session.undo();assert.equal(f.canvas.value,1);await session.dispose();
});
test("ToolNode trigger cannot be overridden to bypass Inspector selection",async()=>{
 const f=fixture();class Override extends f.classes.Resize { trigger(){throw Error("bypass");} }
 const session=await createCanvasSession(defineCanvasModule({...f.classes,Resize:Override}),f.config,f.host);
 await f.commands.get("test.resize")({});assert.equal(f.selections.at(-1).tool,"test.resize");await session.dispose();
});
test("unknown, missing and old bindings are rejected before draw",async()=>{
 const f=fixture();for(const change of [(c:any)=>delete c.bindings.nodes["test.resize"],(c:any)=>c.bindings.nodes.extra="Resize",(c:any)=>c.bindings.canvas="../Canvas",(c:any)=>c.bindings.functions={}]){
 const c=structuredClone(f.config);change(c);assert.throws(()=>validateCanvasConfig(c));}
 await assert.rejects(createCanvasSession({contractVersion:2} as any,f.config,f.host),/contractVersion 3/);
 await assert.rejects(createCanvasSession(defineCanvasModule({...f.classes,Canvas:class{dispose(){}}}),f.config,f.host),/implement draw/);
 assert.deepEqual(f.events,[]);
});
test("invalid tool parameters and undeclared tools never mutate the canvas",async()=>{
 const f=fixture(),session=await createCanvasSession(defineCanvasModule(f.classes),f.config,f.host);
 await assert.rejects(f.tool("test.resize","preview",{"test.width":-1}),/parameter/);await assert.rejects(f.tool("test.unknown","preview"),/Invalid tool/);assert.equal(f.canvas.value,1);await session.dispose();
});
test("per-window state and abort cleanup are isolated",async()=>{
 const f=fixture(),g=fixture();const a=await createCanvasSession(defineCanvasModule(f.classes),f.config,f.host),b=await createCanvasSession(defineCanvasModule(g.classes),g.config,g.host);
 await f.commands.get("test.action")({});assert.equal(g.canvas.value,1);await a.dispose();await b.dispose();
 const h=fixture(),controller=new AbortController();let started!:()=>void;const drawing=new Promise<void>(r=>{started=r;});
 class Waiting extends h.classes.Canvas {async draw(){started();await new Promise<void>(()=>{});}}
 const mounting=createCanvasSession(defineCanvasModule({...h.classes,Canvas:Waiting}),h.config,h.host,controller.signal);await drawing;controller.abort();await assert.rejects(mounting,/aborted/);assert.equal(h.events.filter(e=>e==="dispose").length,1);
});
