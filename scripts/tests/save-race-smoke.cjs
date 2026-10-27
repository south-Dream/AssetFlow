// Real renderer regressions for choosing one dirty canvas and rebinding during saves.
const { app, BrowserWindow, ipcMain } = require('electron');
const { build } = require('esbuild');
const path = require('node:path');
const assert = require('node:assert/strict');
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
app.setPath('userData', path.resolve(`.cache/save-race-${process.pid}`));
const timer = setTimeout(() => { console.error('Save race smoke timed out'); app.exit(1); }, 65000);
app.whenReady().then(async () => {
  await build({ entryPoints: ['scripts/src/core/registry.ts'], outfile: '.cache/save-race-definitions.cjs', bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
  const { definitions } = require(path.resolve('.cache/save-race-definitions.cjs'));
  const image = await require('sharp')({ create: { width: 256, height: 128, channels: 4, background: '#8cba90' } }).png().toBuffer();
  const base = { root: 'C:/fixtures', format: 'png', width: 256, height: 128, size: image.length, thumbnail: '', revision: 0 };
  let assets, saves, delayed, release, exports;
  const reset = () => { assets = [{ ...base, id: 'a', name: 'a.png', path: 'C:/fixtures/a.png' }, { ...base, id: 'b', name: 'b.png', path: 'C:/fixtures/b.png' }]; saves = []; delayed = false; release = undefined; exports = []; };
  reset();
  ipcMain.handle('systemExtensions.snapshot', () => []);
  ipcMain.handle('canvasModules.list', () => []);
  ipcMain.handle('definitions', () => definitions);
  ipcMain.handle('import', () => assets);
  ipcMain.handle('preview', (_, id) => ({ url: 'data:image/png;base64,' + image.toString('base64'), width: 256, height: 128, name: assets.find(asset => asset.id === id)?.name, format: 'png', warnings: [] }));
  ipcMain.handle('workspace.saveImage', async (_, id, steps, revision) => {
    saves.push({ id, steps: structuredClone(steps), revision });
    if (delayed) { delayed = false; await new Promise(resolve => { release = resolve; }); }
    const index = assets.findIndex(asset => asset.id === id);
    const updated = { ...assets[index], revision: assets[index].revision + 1, savedSteps: structuredClone(steps) };
    assets[index] = updated;
    return updated;
  });
  ipcMain.handle('exportHierarchy', (_, ...args) => { exports.push(args); return 'C:/exports/assets.zip'; });
  const prepare = async (scenario) => {
    reset();
    const win = new BrowserWindow({ show: false, width: 1500, height: 940, webPreferences: { partition: `save-race-${scenario}`, preload: path.resolve('dist/node/preload/index.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    console.log('Save race scenario:', scenario);
    await win.loadFile(path.resolve('dist/ui/index.html'));
    await win.webContents.executeJavaScript(`(async()=>{
      const pause=(ms=180)=>new Promise(resolve=>setTimeout(resolve,ms));
      const check=(value,message)=>{if(!value)throw Error(message)};
      const click=(text,root=document)=>{const element=[...root.querySelectorAll('button')].find(button=>button.textContent.trim()===text);check(element,'Missing button '+text);element.click()};
      const panel=index=>document.querySelectorAll('.generic-panel')[index];
      const activate=async index=>{const p=panel(index);check(p,'Missing canvas '+index);p.closest('.dock-group').querySelector('.dock-tab-strip button').click();await pause()};
      const drop=async(index,id)=>{const transfer=new DataTransfer();transfer.setData('application/assetflow-asset',id);panel(index).dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));await pause();const replace=document.querySelector('[aria-label="替换面板内容"]');if(replace){click('不保存替换',replace);await pause()}await pause(220)};
      const rotate=async(index,angle)=>{await activate(index);const tool=panel(index).querySelector('button[aria-label="旋转翻转"]');tool.click();await pause();const label=[...document.querySelectorAll('.inspector-lower label')].find(node=>node.querySelector('span')?.textContent==='角度');check(label,'Rotation angle field missing: canvas '+index+' angle '+angle+' inspector '+document.querySelector('.inspector-lower')?.textContent+' dialog '+document.querySelector('[role=dialog]')?.textContent);const input=label.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(angle));input.dispatchEvent(new Event('input',{bubbles:true}));await pause(220)};
      const apply=async()=>{click('应用',document.querySelector('.inspector-lower'));await pause(220)};
      const menu=async id=>{document.querySelector('[data-navigation-container="system.top"] [data-nav-id="system.file"]').click();await pause();document.querySelector('[data-navigation-container="system.top"] [data-nav-id="'+id+'"]').click();await pause()};
      const exportOpen=async()=>{await menu('system.file.export');click('导出',document.querySelector('[aria-label="导出资源"]'));await pause()};
      const angle=()=>[...document.querySelectorAll('.inspector-lower label')].find(node=>node.querySelector('span')?.textContent==='角度')?.querySelector('input')?.value;
      window.h={pause,check,click,panel,activate,drop,rotate,apply,menu,exportOpen,angle};
      await pause(250);await menu('system.file.import');click('选择文件…',document.querySelector('[aria-label="导入资源"]'));await pause(250);await drop(0,'a');await drop(1,'a');
    })()`);
    return win;
  };
  const evaluate = (win, source) => win.webContents.executeJavaScript(`(async()=>{const {pause,check,click,panel,activate,drop,rotate,apply,menu,exportOpen,angle}=window.h;${source}})()`);
  // Two canvases own different dirty edits of the same asset. Choose the first.
  let win = await prepare('choice');
  await evaluate(win, `await rotate(0,15);await apply();await rotate(1,35);await apply();await exportOpen();const approval=document.querySelector('[aria-label="保存后导出"]');check(approval,'Missing save approval');const select=approval.querySelector('select');check(select&&select.options.length===2,'Same-asset canvases must offer a save choice');const firstId=panel(0).querySelector('[data-navigation-container]').dataset.navigationContainer.slice('canvas.top.'.length);const activeId=panel(1).querySelector('[data-navigation-container]').dataset.navigationContainer.slice('canvas.top.'.length);check(select.value===activeId,'Save choice must default to the active canvas');select.value=firstId;select.dispatchEvent(new Event('change',{bubbles:true}));await pause();click('保存并导出',approval);await pause(400);check(!document.querySelector('[aria-label="导出资源"]'),'Export did not complete');`);
  assert.equal(saves.length, 1, 'Export silently saved multiple canvases');
  assert.equal(saves[0].id, 'a');
  assert.ok(saves[0].steps.some(step => step.processor === 'rotate' && step.params.angle === 15), 'Export saved wrong canvas');
  assert.equal(exports.length, 1);
  await evaluate(win, `await activate(1);await exportOpen();check(document.querySelector('[aria-label="保存后导出"]'),'Unchosen canvas lost its dirty changes');click('取消',document.querySelector('[aria-label="保存后导出"]'));await pause();click('取消',document.querySelector('[aria-label="导出资源"]'));`);
  assert.equal(saves.length, 1);
  win.destroy();
  // Completion of an A save must not clear new B edits after replacement.
  win = await prepare('direct');
  await evaluate(win, `await rotate(0,45);`);
  delayed = true;
  await evaluate(win, `await menu('system.file.savePanel');`);
  assert.ok(release, 'Save A did not reach the delayed IPC boundary');
  await evaluate(win, `await drop(0,'b');await rotate(0,13);`);
  release(); release = undefined;
  await evaluate(win, `await pause(350);check(angle()==='13','Old save completion changed new B draft');check(panel(0).querySelector('button[aria-label="旋转翻转"]').getAttribute('aria-pressed')==='true','Old save completion cleared new B editing state');await menu('system.file.savePanel');await pause(250);`);
  assert.equal(saves.length, 2);
  assert.equal(saves[1].id, 'b', 'New canvas source was changed back to A');
  assert.ok(saves[1].steps.some(step => step.processor === 'rotate' && step.params.angle === 13), 'New B draft was lost');
  win.destroy();
  // Repeat through a source -> downstream link to exercise epoch propagation.
  win = await prepare('linked');
  await evaluate(win, `await activate(1);const input=document.querySelector('[aria-label="输入源"]');const sourceId=panel(0).querySelector('[data-navigation-container]').dataset.navigationContainer.slice('canvas.top.'.length);input.value='canvas:'+sourceId;input.dispatchEvent(new Event('change',{bubbles:true}));await pause();check(input.value==='canvas:'+sourceId,'Downstream input did not link');await rotate(1,45);`);
  delayed = true;
  await evaluate(win, `await menu('system.file.savePanel');`);
  assert.ok(release, 'Downstream A save did not reach delayed IPC');
  await evaluate(win, `await drop(0,'b');await rotate(1,23);`);
  release(); release = undefined;
  await evaluate(win, `await pause(350);check(angle()==='23','Upstream replacement allowed stale completion to clear downstream draft');check(panel(1).querySelector('button[aria-label="旋转翻转"]').getAttribute('aria-pressed')==='true','Downstream editing state was cleared');await menu('system.file.savePanel');await pause(250);`);
  assert.equal(saves.length, 2);
  assert.equal(saves[1].id, 'b', 'Downstream lost new upstream source');
  assert.ok(saves[1].steps.some(step => step.processor === 'rotate' && step.params.angle === 23), 'Downstream B draft was lost');
  win.destroy();
  clearTimeout(timer);
  console.log('Save race smoke passed: choose one same-asset canvas, preserve other dirty canvas, delayed direct and linked source replacements preserve new drafts.');
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
