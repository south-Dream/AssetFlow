import test from "node:test";
import assert from "node:assert/strict";
import { CanvasMgr, InspectorMgr, CanvasHistory } from "../scripts/src/renderer/workspace/managers";
import { restoreImageInspector } from "../scripts/src/renderer/workspace/imageEditing";

test("CanvasMgr owns selection and saves every editable canvas despite one failure", async () => {
  const canvases = [{id:"a",title:"A"},{id:"b",title:"B"},{id:"preview",title:"Preview",readOnly:true}] as any;
  CanvasMgr.canvases.set(canvases);
  CanvasMgr.select("a"); assert.equal(InspectorMgr.selection.get(),"a");
  CanvasMgr.select("unknown"); assert.equal(CanvasMgr.selected.get(),"a");
  const calls:string[]=[];
  CanvasMgr.bind("a",{save:async()=>{calls.push("a");throw Error("failed")},undo(){calls.push("undo")},clear(){calls.push("clear")}});
  CanvasMgr.bind("b",{save:async()=>{calls.push("b");return true},undo(){},clear(){}});
  await assert.rejects(CanvasMgr.saveAll(),/A/); assert.deepEqual(calls,["a","b"]);
  await CanvasMgr.undo();await CanvasMgr.clear();assert.deepEqual(calls.slice(2),["undo","clear"]);
  CanvasMgr.canvases.set([]);CanvasMgr.reconcile();CanvasMgr.select("");
  assert.equal(await CanvasMgr.save("b"),false);
});

test("image history restores the previous operation and its Inspector parameters", () => {
  const resize={id:"resize-1",processor:"resize",enabled:true,params:{width:100,height:80}};
  const background={id:"background-1",processor:"remove-background",enabled:true,params:{}};
  const initial:any={steps:[],editing:null,activeStepId:""};
  const first:any={...initial,steps:[resize]}, second:any={...initial,steps:[resize,background]};
  const history=new CanvasHistory<any>();
  history.commit(restoreImageInspector(initial),first);
  history.commit(restoreImageInspector(first),second);
  const previous=history.undo();assert.deepEqual(previous.steps,[resize]);
  assert.equal(previous.editing.draft.processor,"resize");assert.equal(previous.editing.draft.params.width,100);
  previous.editing.draft.params.width=1;assert.equal(resize.params.width,100);
  assert.deepEqual(history.undo().steps,[]);assert.equal(history.undo(),undefined);
});
