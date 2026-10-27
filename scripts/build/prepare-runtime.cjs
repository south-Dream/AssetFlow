// Reuse the installed Electron runtime so packaging needs no second download.
const fs = require('node:fs');
const path = require('node:path');
const archiver = require('archiver');
async function main() {
  await require('./prepare-extension-resources.cjs').prepareExtensionResources();
  const runtime = path.join(path.dirname(require.resolve('electron/package.json')), 'dist');
  const version = require('electron/package.json').version;
  if (!fs.existsSync(path.join(runtime, 'electron.exe'))) throw Error('Electron runtime is missing. Run npm install first.');
  const directory = path.resolve('.cache/electron');
  fs.mkdirSync(directory, {recursive:true});
  const target = path.join(directory, `electron-v${version}-win32-x64.zip`);
  if (fs.existsSync(target)) return;
  const temporary = target + '.partial';
  try {
    await new Promise((resolve,reject)=>{
      const output=fs.createWriteStream(temporary);
      const archive=archiver('zip',{store:true});
      output.once('close',resolve);output.once('error',reject);archive.once('error',reject);
      archive.pipe(output);archive.directory(runtime,false);void archive.finalize().catch(reject);
    });
    fs.renameSync(temporary,target);
    console.log('Prepared local Electron runtime for packaging.');
  } catch(error) {fs.rmSync(temporary,{force:true});throw error;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
