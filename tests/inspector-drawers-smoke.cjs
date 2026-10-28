const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const { build } = require('esbuild');
const fs = require('node:fs/promises'), path = require('node:path');
app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([{scheme:'assetflow-canvas',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
app.setPath('userData',path.resolve(`.cache/node-draw-profile-${process.pid}`));
const timer=setTimeout(()=>{console.error('Node draw smoke timed out');app.exit(1)},40000);
app.whenReady().then(async()=>{
  const root=path.resolve(`.cache/node-draw-${process.pid}`),directory=path.join(root,'probe');
  await fs.mkdir(directory,{recursive:true});
  const value={id:'probe.value',name:'Value',type:'number',default:10,min:0,max:100};
  const names=['good','bad','tree','slow'];
  await fs.writeFile(path.join(directory,'config.json'),JSON.stringify({
    schemaVersion:1,sdkVersion:1,id:'probe',name:'Node Draw',version:'1',entry:'./index.js',
    bindings:{canvas:'Canvas',nodes:Object.fromEntries(names.map(name=>['probe.'+name,name]))},
    tools:names.map(name=>({id:'probe.'+name,command:'probe.'+name,name,kind:'tool',fields:[{...value,id:'probe.'+name+'.value'}]})),
    inspector:{canvas:[value]},
  }));
  await fs.writeFile(path.join(directory,'index.js'),`
    const {CanvasBase,ToolNode}=assetFlowCanvasSDK;
    class Canvas extends CanvasBase {
      draw(){this.context.root.textContent='probe active';this.disposed=0}
      drawProperties(ctx){return ctx.ui.column([ctx.fields([${JSON.stringify(value)}]),ctx.ui.button({label:'Reset',onClick:()=>ctx.setValue(JSON.stringify({'probe.value':10}))})])}
      properties(values){this.context.root.dataset.value=String(values['probe.value'])}
      input(){} target(){} open(){} capture(){return null} restore(){} clear(){} save(){throw Error('Read only')} dispose(){}
    }
    const classes={Canvas};
    for(const name of ${JSON.stringify(names)}) classes[name]=class extends ToolNode {
      name=name;
      async draw(ctx){
        ctx.onDispose(()=>{this.context.root.dataset.disposed=String(++this.canvas.disposed);if(name==='slow')this.context.root.dataset.slowDisposed='yes'});
        if(name==='bad')throw Error('EXPECTED_NODE_ERROR');
        if(name==='tree')return {kind:'row',children:'invalid'};
        if(name==='slow')await new Promise(()=>{});
        return ctx.fields([{...${JSON.stringify(value)},id:'probe.'+name+'.value'}]);
      }
    };
    export default {contractVersion:3,classes};
  `);
  await build({entryPoints:{host:'scripts/src/extensions/canvas/host.ts',manager:'scripts/src/extensions/canvas/manager.ts'},outdir:path.join(root,'compiled'),bundle:true,packages:'external',platform:'node',format:'cjs',outExtension:{'.js':'.cjs'}});
  const {CanvasModuleManager}=require(path.join(root,'compiled/manager.cjs'));
  const manager=new CanvasModuleManager(path.join(root,'installed.json'));
  await manager.install(path.join(directory,'config.json'));
  require(path.join(root,'compiled/host.cjs')).registerCanvasDocuments(manager);
  ipcMain.handle('systemExtensions.snapshot',()=>[]);ipcMain.handle('canvasModules.list',()=>manager.list());
  ipcMain.handle('canvasModules.payload',(_,id)=>manager.payload(id));ipcMain.handle('definitions',()=>[]);
  const win=new BrowserWindow({show:false,width:1500,height:940,webPreferences:{preload:path.resolve('dist/node/preload/index.js'),sandbox:true,contextIsolation:true,backgroundThrottling:false}});
  await win.loadFile(path.resolve('dist/ui/index.html'));
  await win.webContents.executeJavaScript(`(async()=>{
    const pause=(ms=220)=>new Promise(r=>setTimeout(r,ms));
    const check=(c,m)=>{if(!c)throw Error(m)};
    const click=(text,root=document)=>{const b=[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===text||b.getAttribute('aria-label')===text);check(b,'Missing '+text);b.click()};
    const input=(el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}))};
    await pause();const panel=document.querySelector('.generic-panel');click('编辑',panel);click('类型',panel);click('Node Draw',panel);await pause(700);
    input(document.querySelector('.inspector-upper [aria-label=Value]'),'25');await pause();
    check(document.querySelector('.inspector-upper [aria-label=Value]').value==='25','Canvas draw binding failed');
    click('good',panel.querySelector('.canvas-toolbox'));await pause();input(document.querySelector('.inspector-lower [aria-label=Value]'),'40');await pause();
    check(document.querySelector('.inspector-upper [aria-label=Value]').value==='25','Tool contaminated canvas properties');click('取消',document.querySelector('.inspector-lower'));await pause();
    click('bad',panel.querySelector('.canvas-toolbox'));await pause();check(document.querySelector('.inspector-lower').textContent.includes('EXPECTED_NODE_ERROR'),'Node error missing');check(document.querySelector('.inspector-upper input'),'Tool failure broke upper Inspector');click('取消',document.querySelector('.inspector-lower'));await pause();
    click('tree',panel.querySelector('.canvas-toolbox'));await pause();check(document.querySelector('.inspector-lower [role=alert]'),'Invalid UI tree accepted');click('取消',document.querySelector('.inspector-lower'));await pause();
    click('slow',panel.querySelector('.canvas-toolbox'));await pause(11000);check(document.querySelector('.inspector-lower').textContent.includes('字段绘制超时'),'Draw timeout missing');
  })()`);
  const frame=win.webContents.mainFrame.frames[0];
  const state=await frame.executeJavaScript("({...document.getElementById('root').dataset})");
  if(state.value!=='25'||Number(state.disposed)<3||state.slowDisposed!=='yes')throw Error('Draw callback cleanup failed '+JSON.stringify(state));
  clearTimeout(timer);console.log('Node Inspector smoke passed: Canvas/Tool draw, isolated values, invalid trees, failures and timeout cleanup.');app.exit(0);
}).catch(error=>{console.error(error);app.exit(1)});
