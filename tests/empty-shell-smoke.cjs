const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
app.disableHardwareAcceleration();
app.setPath("userData", path.resolve(`.cache/empty-shell-${process.pid}`));
const timer = setTimeout(() => { console.error("Empty shell timed out"); app.exit(1); }, 25000);
app.whenReady().then(async () => {
  let records = [require("./shipped-records.cjs").imageRecord];
  ipcMain.handle("canvasModules.list", () => records);
  ipcMain.handle("canvasModules.change", (_, action, id) => {
    if (action === "uninstall") records = records.filter(record => record.config.id !== id);
    return records;
  });
  ipcMain.handle("systemExtensions.snapshot", () => []);
  ipcMain.handle("definitions", () => []);
  const win = new BrowserWindow({ show: false, width: 1400, height: 850, webPreferences: { preload: path.resolve("dist/node/preload/index.js"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  await win.loadFile(path.resolve("dist/ui/index.html"));
  await win.webContents.executeJavaScript(`(async()=>{
    const pause=()=>new Promise(r=>setTimeout(r,180));await pause();
    for (let attempt=0;attempt<4;attempt++) { const button=document.querySelector('[aria-label="移除画布"]');if(!button)break;button.click();await pause(); }
    if(document.querySelector('.generic-panel'))throw Error('Last editor cannot be closed, preventing final package removal');
    document.querySelector('[data-nav-id="system.modules"]').click();await pause();
    const row=document.querySelector('[data-module-id="image"]');row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:300,clientY:250}));await pause();
    const remove=[...document.querySelectorAll('.module-context-menu button')].find(button=>button.textContent==='移除关联');
    if(!remove||remove.disabled)throw Error('Default image package remains protected');remove.click();await pause();
    if(document.querySelector('[data-module-id="image"]'))throw Error('Image package remains installed');document.querySelector('[aria-label="关闭包管理器"]').click();
  })()`);
  const verify = `(async()=>{
    const pause=()=>new Promise(r=>setTimeout(r,180));const check=(value,message)=>{if(!value)throw Error(message)};
    const click=text=>{const button=[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===text);check(button,'Missing '+text);button.click()};
    await pause();
    check(!document.querySelector('.canvas-empty,.image-workspace,.atlas-viewport'),'Uninstalled editor mounted');
    check(document.querySelector('.hierarchy-tree'),'Resource hierarchy missing in empty shell');
    click('包管理器');await pause();const manager=document.querySelector('.module-manager');check(manager&&!manager.querySelector('[data-module-id]'),'Image is still forced into package manager');check(manager.textContent.includes('暂无画布模块'),'Empty package guidance missing');click('×');
    click('编辑');click('设置…');await pause();const nav=document.querySelector('.unified-settings nav');check(![...nav.querySelectorAll('button')].some(button=>['img','图集','图片'].includes(button.textContent)),'Uninstalled package settings remain');click('×');
  })()`;
  await win.webContents.executeJavaScript(verify);
  await win.reload();
  await new Promise(resolve => win.webContents.once("did-finish-load", resolve));
  await win.webContents.executeJavaScript(verify);
  clearTimeout(timer); console.log("Empty shell smoke passed: no forced image/atlas, hierarchy and package management remain available after reload."); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
