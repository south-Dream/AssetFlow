import { createResourceAPI, matchResourceRule } from "../../extensions/canvas/resources";
/** Opaque-origin iframe: resources are granted explicitly through the host SDK. */
export function sandboxDocument(source: string, boot: unknown): string {
  const data = JSON.stringify({ source, boot }).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; media-src blob:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"><style>html,body{margin:0;height:100%;background:#171c26;color:#d9e1ed;font:14px system-ui}#root{height:100%;overflow:auto}button,input{font:inherit}</style></head><body><div id="root"></div><script type="module">
const {source,boot}=${data};
const send=(type,value)=>parent.postMessage({channel:'assetflow.canvas.v1',type,value},'*');
const matchResourceRule=(${matchResourceRule.toString()});
const createResourceAPI=(${createResourceAPI.toString()});
const reads=new Map();let readSequence=0;
const resources=createResourceAPI(boot.resources||[],id=>new Promise((resolve,reject)=>{const requestId=++readSequence;const timer=setTimeout(()=>{reads.delete(requestId);reject(Error('资源读取超时'))},30000);reads.set(requestId,{resolve,reject,timer});send('resource-read',{id,requestId})}));
const commands=new Map(),drawers=new Map(),drawSessions=new Map();let toolHandler,inputHandler,targetHandler,propertiesHandler,saveHandler,module;
const drawUI=(requestId,field,values)=>{
 const callbacks=new Map();let sequence=0;const event=callback=>{const id=String(++sequence);callbacks.set(id,callback);return id};
 const cleanups=[],session={callbacks,cleanups,disposed:false};drawSessions.set(requestId,session);
 const ui={text:text=>({kind:'text',text:String(text)}),input:o=>({kind:'input',value:o.value,event:event(o.onChange)}),slider:o=>({kind:'slider',value:o.value,min:o.min,max:o.max,step:o.step||0.01,event:event(o.onChange)}),button:o=>({kind:'button',text:o.label,event:event(o.onClick)}),row:children=>({kind:'row',children}),column:children=>({kind:'column',children})};
 return {field,value:values[field.id]??field.default,values:Object.freeze(values),ui,onDispose:cleanup=>{if(session.disposed)cleanup();else cleanups.push(cleanup)},setValue:value=>{if(!session.disposed)send('drawer-value',{requestId,value})}};
};
const disposeDrawSession=id=>{const session=drawSessions.get(id);if(!session)return;session.disposed=true;drawSessions.delete(id);for(const cleanup of session.cleanups.splice(0).reverse())try{cleanup()}catch(error){safeError(error)}};
const safeError=e=>send('error',String(e?.message||e));
addEventListener('error',e=>safeError(e.error||e.message));addEventListener('unhandledrejection',e=>safeError(e.reason));
addEventListener('keydown',e=>{if(e.repeat||e.target?.closest?.('input,textarea,select,[contenteditable=true]'))return;send('key',{key:e.key,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey,shiftKey:e.shiftKey});if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s')e.preventDefault()});
const context=Object.freeze({root:document.getElementById('root'),windowId:boot.windowId,settings:Object.freeze(boot.settings),state:boot.state,capabilities:Object.freeze(boot.capabilities||{}),previewTarget:boot.previewTarget,resources,canvasProperties:Object.freeze(boot.canvasProperties||{}),
 onSave(handler){if(typeof handler!=='function')throw Error('保存回调必须是函数');saveHandler=handler},
 onCanvasProperties(handler){propertiesHandler=handler},
 registerDrawer(id,drawer){if(!boot.drawers.includes(id)||drawers.has(id)||typeof drawer?.draw!=='function')throw Error('未声明、重复或无效的Drawer: '+id);drawers.set(id,drawer)},
 registerCommand(id,handler){if(!boot.commands.includes(id)||typeof handler!=='function'||commands.has(id))throw Error('未声明或重复的命令: '+id);commands.set(id,handler)},
 onToolEvent(handler){toolHandler=handler},onInput(handler){inputHandler=handler},onPreviewTarget(handler){targetHandler=handler},
 publishOutput(value){send('output',value)},saveState(value){send('state',value)},notify(message){send('notice',String(message).slice(0,2000))},markToolDirty(dirty=true){send('tool-dirty',!!dirty)}});
// Tool-local drawing changes may exist without a parameter edit.
addEventListener('message',async e=>{if(e.source!==parent||e.data?.channel!=='assetflow.canvas.v1')return;const {type,value}=e.data;try{
 if(type==='command'){const handler=commands.get(value.command);if(!handler)throw Error('命令未注册: '+value.command);await handler(value.params||{})}
 if(type==='tool'){try{await toolHandler?.(value);if(value.requestId)send('tool-result',{requestId:value.requestId})}catch(error){if(value.requestId)send('tool-result',{requestId:value.requestId,error:String(error.message||error)});else throw error}}
 if(type==='save'){try{if(!saveHandler)throw Error('此画布未注册 onSave 保存回调');const result=await saveHandler();if(!result||!(result.data instanceof ArrayBuffer))throw Error('画布保存必须返回 ArrayBuffer 数据');if(result.data.byteLength>128*1024*1024)throw Error('画布保存数据超过 128 MB');if(result.name!==undefined&&(typeof result.name!=='string'||!result.name.trim()||result.name.length>255))throw Error('画布保存名称无效');send('save-result',{requestId:value.requestId,data:result.data,name:result.name})}catch(error){send('save-result',{requestId:value.requestId,error:String(error.message||error)})}}
 if(type==='input')await inputHandler?.(value);
 if(type==='target')await targetHandler?.(value);
 if(type==='canvas-properties')await propertiesHandler?.(Object.freeze(value));
 if(type==='drawer-draw'){try{const drawer=drawers.get(value.field.renderer);if(!drawer)throw Error('绘制器未注册: '+value.field.renderer);const tree=await drawer.draw(drawUI(value.requestId,value.field,value.values));if(!drawSessions.has(value.requestId))throw Error('绘制会话已取消');if(JSON.stringify(tree).length>100000)throw Error('绘制描述超过限制');send('drawer-tree',{requestId:value.requestId,tree})}catch(error){disposeDrawSession(value.requestId);send('drawer-tree',{requestId:value.requestId,error:String(error.message||error)})}}
 if(type==='drawer-event'){const callback=drawSessions.get(value.requestId)?.callbacks.get(value.event);if(callback)await callback(value.value)}
 if(type==='drawer-dispose')disposeDrawSession(value.requestId);
 if(type==='resource-read-result'){const entry=reads.get(value.requestId);if(entry){reads.delete(value.requestId);clearTimeout(entry.timer);value.error?entry.reject(Error(value.error)):entry.resolve(value.data)}}
 if(type==='resource-open'){try{await resources.open(value.resources);send('resource-result',{requestId:value.requestId})}catch(error){send('resource-result',{requestId:value.requestId,error:String(error.message||error)})}}
 if(type==='dispose'){saveHandler=undefined;await resources.dispose();for(const id of [...drawSessions.keys()])disposeDrawSession(id);for(const drawer of drawers.values())await drawer.dispose?.();drawers.clear();await module?.deactivate?.();commands.clear();for(const entry of reads.values()){clearTimeout(entry.timer);entry.reject(Error('画布已关闭'))}reads.clear();send('disposed',null)}
 }catch(error){safeError(error)}});
try{const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));try{module=(await import(url)).default}finally{URL.revokeObjectURL(url)}
if(typeof module?.activate!=='function')throw Error('模块必须默认导出 activate(context)');await module.activate(context);for(const id of boot.commands)if(!commands.has(id))throw Error('配置声明的命令未注册: '+id);for(const rule of boot.resources||[])if(!resources.hasHandler(rule.handler))throw Error('配置声明的资源入口未注册: '+rule.handler);send('ready',[...commands.keys()]);}catch(error){safeError(error)}
</script></body></html>`;
}
