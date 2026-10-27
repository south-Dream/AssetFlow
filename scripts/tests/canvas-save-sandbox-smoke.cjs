const { app, BrowserWindow } = require('electron');
const { buildSync } = require('esbuild');
const vm = require('node:vm');
app.disableHardwareAcceleration();
const compiled = buildSync({ entryPoints: ['scripts/src/renderer/workspace/moduleSandbox.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
const context = { module: { exports: {} }, exports: {} }; context.exports = context.module.exports;
vm.runInNewContext(compiled.outputFiles[0].text, context);
const sandboxDocument = context.module.exports.sandboxDocument;
const timer = setTimeout(() => { console.error('Canvas save sandbox timed out'); app.exit(1); }, 20000);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
  await win.loadURL('data:text/html,<html><body></body></html>');
  const run = async (source, expected) => {
    const html = sandboxDocument(source, { windowId: 'save-test', settings: {}, drawers: [], commands: [], resources: [] });
    const value = await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
      const frame=document.createElement('iframe');frame.sandbox='allow-scripts';
      const timer=setTimeout(()=>reject(Error('Save response timed out')),4000);
      const listener=event=>{
        if(event.source!==frame.contentWindow||event.data?.channel!=='assetflow.canvas.v1')return;
        if(event.data.type==='ready')frame.contentWindow.postMessage({channel:'assetflow.canvas.v1',type:'save',value:{requestId:'save-1'}},'*');
        if(event.data.type==='save-result'){
          clearTimeout(timer);window.removeEventListener('message',listener);
          const value=event.data.value;resolve({requestId:value.requestId,error:value.error,text:value.data instanceof ArrayBuffer?new TextDecoder().decode(value.data):null,name:value.name});frame.remove();
        }
      };window.addEventListener('message',listener);frame.srcdoc=${JSON.stringify(html)};document.body.append(frame);
    })`);
    require('node:assert/strict').equal(value.requestId, 'save-1');
    expected(value);
  };
  const assert = require('node:assert/strict');
  await run(`export default {activate(context){context.onSave(async()=>({data:new TextEncoder().encode('hello').buffer,name:'hello.txt'}))}}`, result => { assert.equal(result.text,'hello');assert.equal(result.name,'hello.txt');assert.equal(result.error,undefined); });
  await run(`export default {activate(context){let calls=0;context.onSave(()=>({data:new TextEncoder().encode(String(++calls)).buffer}));dispatchEvent(new MessageEvent('message',{data:{channel:'assetflow.canvas.v1',type:'save',value:{requestId:'forged'}}}))}}`, result => assert.equal(result.text,'1'));
  await run(`export default {activate(){}}`, result => assert.match(result.error, /未注册 onSave/));
  await run(`export default {activate(context){context.onSave(()=>({data:'bad'}))}}`, result => assert.match(result.error, /ArrayBuffer/));
  await run(`export default {activate(context){context.onSave(()=>({data:new ArrayBuffer(128*1024*1024+1)}))}}`, result => assert.match(result.error, /128 MB/));
  await run(`export default {activate(context){context.onSave(()=>{throw Error('serialize failed')})}}`, result => assert.match(result.error, /serialize failed/));
  clearTimeout(timer);console.log('Canvas save sandbox smoke passed: async bytes/name, missing callback, invalid payload, 128 MB limit, serialization error, foreign-source rejection.');app.exit(0);
}).catch(error=>{console.error(error);app.exit(1)});
