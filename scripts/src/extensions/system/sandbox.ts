import type { SystemExtensionConfig } from "../../../extensions/sdk/contracts";
export function systemSandboxDocument(config: SystemExtensionConfig, source: string): string {
  const data = JSON.stringify({ config, source }).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:;"><style>html,body{margin:0;height:100%;color:#e4e9f3;background:#1c212d;font:14px system-ui}#root{padding:18px;box-sizing:border-box}input,select,button{font:inherit;color:inherit;background:#252e40;border:1px solid #47516a;border-radius:5px;padding:7px}label{display:flex;align-items:center;gap:12px;margin:12px 0}button{cursor:pointer}</style></head><body><div id="root"></div><script type="module">
const {config,source}=${data};
const send=(type,value)=>parent.postMessage({assetflowSystem:true,type,value},'*');
const root=document.getElementById('root'),commands=new Map(),panels=new Map(),calls=new Map(),valueListeners=new Map();
const checkPanel=id=>{if(!config.panels.some(panel=>panel.id===id))throw Error('面板未声明: '+id)};
const declared=new Set();const walk=items=>items.forEach(i=>{if(i.command)declared.add(i.command);if(i.children)walk(i.children)});walk(config.menus);
let active,extensionModule,cleanups=[],sequence=0,queue=Promise.resolve();
const rpc=(type,value)=>new Promise((resolve,reject)=>{const id=String(++sequence),timer=setTimeout(()=>{calls.delete(id);reject(Error('配置写入超时'))},15000);calls.set(id,{resolve,reject,timer});send(type,{...value,id})});
const dispose=async()=>{const previous=active;active=undefined;for(const cleanup of cleanups.splice(0).reverse())try{cleanup()}catch{};try{await previous?.unmount?.()}finally{root.replaceChildren()}};
addEventListener('pagehide',()=>{void dispose();void extensionModule?.deactivate?.()});
addEventListener('message',event=>{if(event.source!==parent||!event.data?.assetflowSystemHost)return;const {type,value}=event.data;
if(type==='reply'){const call=calls.get(value.id);if(call){clearTimeout(call.timer);calls.delete(value.id);value.error?call.reject(Error(value.error)):call.resolve(value.values)}return}
if(type==='valuesChanged'){for(const handler of valueListeners.get(value.panel)||[])try{handler(Object.freeze(value.values))}catch(error){send('error',String(error))};return}
queue=queue.then(async()=>{
if(type==='command'){const handler=commands.get(value);if(!handler)throw Error('命令未注册: '+value);await handler()}
if(type==='hide')await dispose();
if(type==='show'){await dispose();const panel=panels.get(value.panel);if(!panel)throw Error('面板未注册: '+value.panel);active=panel;await panel.mount(Object.freeze({root,panelId:value.panel,host:value.host,values:Object.freeze(value.values),setValues:values=>rpc('saveValues',{panel:value.panel,values}),onDispose:cleanup=>cleanups.push(cleanup)}))}
}).catch(error=>{send('error',String(error));send('panelError',String(error))});});
try{
const module=source?await import(URL.createObjectURL(new Blob([source],{type:'text/javascript'}))):{};extensionModule=module.default||module;
const activate=module.activate||module.default?.activate;if(source&&typeof activate!=='function')throw Error('缺少 activate(context)');
await activate?.(Object.freeze({getValues(id){checkPanel(id);return rpc('getValues',{panel:id})},setValues(id,values){checkPanel(id);return rpc('saveValues',{panel:id,values})},onValues(id,handler){checkPanel(id);if(typeof handler!=='function')throw Error('配置回调无效');if(!valueListeners.has(id))valueListeners.set(id,new Set());valueListeners.get(id).add(handler);return ()=>valueListeners.get(id)?.delete(handler)},registerCommand(id,handler){if(!declared.has(id)||commands.has(id)||typeof handler!=='function')throw Error('命令未声明或重复');commands.set(id,handler)},registerPanel(id,panel){if(!config.panels.some(p=>p.id===id&&p.renderer==='custom')||panels.has(id)||typeof panel?.mount!=='function')throw Error('面板未声明或重复');panels.set(id,panel)},openPanel(id,host='dialog'){checkPanel(id);send('openPanel',{panel:id,host})},notify(message){send('notice',String(message).slice(0,2000))}}));send('ready',true);
}catch(error){send('error',String(error))}
addEventListener('unhandledrejection',event=>send('error',String(event.reason)));
</script></body></html>`;
}
