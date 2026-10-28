param([string]$Executable = (Join-Path $PSScriptRoot '../release/AssetFlow.exe'))
$ErrorActionPreference = 'Stop'
$expectExamples = $env:ASSETFLOW_TEST_EXTERNAL -eq '1'
$application = (Resolve-Path -LiteralPath $Executable).Path
$moduleDirectory = Join-Path (Split-Path -Parent $application) 'scripts/extensions/canvas_modules/image/modules/background-removal/rembg'
foreach ($moduleFile in @('runner.py', 'config.json', 'requirements.txt')) {
  if (-not (Test-Path -LiteralPath (Join-Path $moduleDirectory $moduleFile))) { throw "Missing module-owned release asset: $moduleFile" }
}
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$debugPort = $listener.LocalEndpoint.Port
$listener.Stop()
$profile = Join-Path $workspace ('.cache/packaged-profile-' + [guid]::NewGuid().ToString('N'))
$env:ELECTRON_RUN_AS_NODE = $null
$arguments = @("--remote-debugging-port=$debugPort", '--assetflow-smoke', "--user-data-dir=`"$profile`"")
$applicationProcess = Start-Process -FilePath $application -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $workspace '.cache/packaged-smoke.stdout.log') -RedirectStandardError (Join-Path $workspace '.cache/packaged-smoke.stderr.log')
$socket = [System.Net.WebSockets.ClientWebSocket]::new()
$script:sequence = 0
function Invoke-Cdp([string]$Method, [hashtable]$Parameters = @{}) {
  Write-Host "CDP $Method"
  $script:sequence++
  $messageId = $script:sequence
  $json = @{ id = $messageId; method = $Method; params = $Parameters } | ConvertTo-Json -Depth 30 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $socket.SendAsync([ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
  $deadline = [Threading.CancellationTokenSource]::new(20000)
  try {
    while ($true) {
      $stream = [IO.MemoryStream]::new()
      do {
        $buffer = [byte[]]::new(65536)
        $received = $socket.ReceiveAsync([ArraySegment[byte]]::new($buffer), $deadline.Token).GetAwaiter().GetResult()
        if ($received.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { throw 'CDP connection closed' }
        $stream.Write($buffer, 0, $received.Count)
      } while (-not $received.EndOfMessage)
      $response = [Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
      if ($response.id) { Write-Host "CDP response $($response.id)" }
      $stream.Dispose()
      if ($response.id -eq $messageId) {
        if ($response.error) { throw ($response.error | ConvertTo-Json -Compress) }
        return $response.result
      }
    }
  } finally { $deadline.Dispose() }
}
function Invoke-Page([string]$Expression) {
  $result = Invoke-Cdp 'Runtime.evaluate' @{ expression = $Expression; awaitPromise = $true; returnByValue = $true }
  if ($result.exceptionDetails) { throw ($result.exceptionDetails | ConvertTo-Json -Depth 10 -Compress) }
  return $result.result.value
}
try {
  $target = $null
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try { $target = @(Invoke-RestMethod "http://127.0.0.1:$debugPort/json/list") | Where-Object { $_.type -eq 'page' -and $_.url -like '*dist/ui/index.html' } | Select-Object -First 1 } catch {}
    if ($target) { break }
    if ($applicationProcess.HasExited) { throw "EXE exited: $($applicationProcess.ExitCode)" }
    Start-Sleep -Milliseconds 200
  }
  if (-not $target) { throw 'Packaged EXE did not expose its application page' }
  $target = @($target) | Where-Object { $_.type -eq 'page' -and $_.url -like '*dist/ui/index.html*' } | Select-Object -First 1
  if (-not $target) { throw 'Packaged application page not found' }
  $socket.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
  $state = Invoke-Page @'
(async()=>{await new Promise(r=>setTimeout(r,350));const menu=document.querySelector('.dock-app > .main-menu');if(!menu)throw Error('Missing workspace');const click=(text,root=document)=>{const el=[...root.querySelectorAll('button,summary')].find(e=>e.textContent.trim()===text);if(!el)throw Error('Missing '+text);el.click()};click('包管理器',menu);await new Promise(r=>setTimeout(r,150));if(!document.querySelector('.module-manager .module-list')||!document.querySelector('.module-manager-footer [aria-label="添加模块配置"]'))throw Error('Packaged package list/add control missing');click('×',document.querySelector('.module-manager'));const panel=document.querySelector('.generic-panel');click('编辑',panel);click('设置…',panel);await new Promise(r=>setTimeout(r,150));if(!document.querySelector('.unified-settings')||document.querySelectorAll('.unified-settings .settings-section').length!==3||document.querySelector('.unified-settings nav nav'))throw Error('Packaged flat settings missing');click('×',document.querySelector('.unified-settings'));return {url:location.href,menus:menu.textContent,panels:document.querySelectorAll('.generic-panel').length,packageList:true,flatSettings:true}})()
'@
  $fixture = Join-Path $workspace '.cache/packaged-input.png'
  $imageBytes = [Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
  [IO.File]::WriteAllBytes($fixture, $imageBytes)
  $point = Invoke-Page '(()=>{const r=document.querySelector(".generic-panel").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()'
  $drag = @{ items = @(); files = @($fixture); dragOperationsMask = 1 }
  Invoke-Cdp 'Input.dispatchDragEvent' @{ type = 'dragEnter'; x = $point.x; y = $point.y; data = $drag } | Out-Null
  Invoke-Cdp 'Input.dispatchDragEvent' @{ type = 'dragOver'; x = $point.x; y = $point.y; data = $drag } | Out-Null
  Invoke-Cdp 'Input.dispatchDragEvent' @{ type = 'drop'; x = $point.x; y = $point.y; data = $drag } | Out-Null
  $preview = Invoke-Page '(async()=>{for(let i=0;i<50;i++){const img=document.querySelector(".preview-image");if(img?.complete&&img.naturalWidth>0)return {width:img.naturalWidth,height:img.naturalHeight,assets:document.querySelectorAll(".asset").length};await new Promise(r=>setTimeout(r,150))}throw Error("Packaged image resource preview failed: "+document.body.innerText)})()'
  $layout = Invoke-Page @'
(async()=>{const pause=()=>new Promise(r=>setTimeout(r,120));const check=(c,m)=>{if(!c)throw Error(m)};const top=document.querySelector('.dock-app > .main-menu');const summary=name=>[...top.querySelectorAll(':scope > .navigation-node > button[aria-haspopup="menu"]')].find(e=>e.textContent.trim()===name);summary('编辑').click();summary('文件').click();await pause();check(top.querySelectorAll(':scope > .navigation-node[data-menu-open="true"]').length===1,'Menus are not exclusive');summary('文件').click();const panel=document.querySelector('.generic-panel');const rail=panel.querySelector('.canvas-toolbox');check(rail&&rail.getBoundingClientRect().width<60,'Missing left icon rail');const icons=[...rail.querySelectorAll('img')];check(icons.length===6&&icons.every(img=>img.complete&&img.naturalWidth>0),'Packaged module icons failed');check(!document.querySelector('.add-processor'),'Legacy Add Module still visible');check(!panel.querySelector('.panel-type-trigger'),'Separate Type control still exists');const edit=panel.querySelector('.main-menu > .navigation-node > button[aria-haspopup="menu"]');edit.click();const type=[...panel.querySelectorAll('.main-menu button[aria-haspopup]')].find(e=>e.textContent==='类型');check(type,'Missing unified type menu');type.click();check(panel.querySelector('button[aria-checked=true]'),'Missing current type selection');[...panel.querySelectorAll('button')].find(e=>e.textContent==='img').click();const row=document.querySelector('.canvas-connections .field'),label=row.querySelector('span').getBoundingClientRect(),select=row.querySelector('select').getBoundingClientRect();check(label.right<select.left&&Math.abs(label.top-select.top)<12,'Connections are not horizontal');rail.querySelector('button[aria-label="旋转翻转"]').click();await pause();check(document.querySelector('.parameters').textContent.includes('旋转'),'Image tool no longer opens Inspector');return {tools:icons.length,railWidth:rail.getBoundingClientRect().width,menuExclusive:true,horizontalConnections:true,operationTool:true}})()
'@
  $systemExtensions = if ($expectExamples) { Invoke-Page @'
(async()=>{const pause=(ms=250)=>new Promise(r=>setTimeout(r,ms));const check=(c,m)=>{if(!c)throw Error(m)};const top=document.querySelector('.dock-app > .main-menu');const click=(text,root=top)=>{const el=[...root.querySelectorAll('button,summary')].find(e=>e.textContent.trim()===text);check(el,'Missing '+text);el.click()};await pause(500);const button=[...top.querySelectorAll(':scope > .navigation-node > .navigation-trigger')].find(e=>e.tagName==='BUTTON'&&e.textContent==='偏好');check(button,'Manually merged package was not discovered');const a=getComputedStyle(button),b=getComputedStyle(top.querySelector(':scope > .navigation-node > button[aria-haspopup="menu"]'));check(['height','padding','borderWidth','borderRadius','fontSize'].every(key=>a[key]===b[key]),'Extension navigation has inconsistent styling');click('偏好');await pause();check(document.querySelector('[aria-label="扩展面板"] input[aria-label="示例作者"]'),'Merged form panel missing');document.querySelector('[aria-label="关闭扩展面板"]').click();click('扩展示例');click('执行示例操作');await pause();check(document.body.textContent.includes('系统扩展命令已执行'),'Merged script command failed');return {manualMerge:true,uniformTrigger:true,formPanel:true,command:true}})()
'@
  } else { Invoke-Page @'
(async()=>{const check=(c,m)=>{if(!c)throw Error(m)};const top=document.querySelector('.dock-app > .main-menu');const labels=[...top.querySelectorAll(':scope > .navigation-node > .navigation-trigger')].map(e=>e.tagName==='DETAILS'?e.querySelector('summary').textContent.trim():e.textContent.trim());check(JSON.stringify(labels)===JSON.stringify(['包管理器','文件','编辑']),'Distribution contains example navigation: '+labels.join(','));check(!document.querySelector('[aria-label="扩展面板"]'),'Example panel opened automatically');return {noExamples:true,builtinMenus:labels}})()
'@
  }
  $buttonGeometry = Invoke-Page @'
(()=>{const top=document.querySelector('[data-navigation-container="system.top"]');const buttons=[...top.querySelectorAll(':scope > .navigation-node > .navigation-trigger')];if(top.querySelector('summary,details')||buttons.some(button=>button.tagName!=='BUTTON'))throw Error('Mixed navigation primitives');const boxes=buttons.map(button=>button.getBoundingClientRect()),labels=buttons.map(button=>button.querySelector('.navigation-label').getBoundingClientRect());if(boxes.some(box=>box.width!==88||box.height!==28||box.top!==boxes[0].top)||labels.some(box=>box.top!==labels[0].top||box.height!==labels[0].height))throw Error('Navigation rectangles/text lines differ');return {allButtons:true,width:88,height:28,textHeight:labels[0].height,count:buttons.length}})()
'@
  $assetSave = Invoke-Page @'
(async()=>{const pause=ms=>new Promise(r=>setTimeout(r,ms));const button=[...document.querySelector('.inspector-lower').querySelectorAll('button')].find(e=>e.textContent==='取消');if(button)button.click();await pause(200);const top=document.querySelector('[data-navigation-container="system.top"]');[...top.querySelectorAll(':scope > .navigation-node > button')].find(e=>e.textContent.trim()==='文件').click();await pause(100);const fileItems=[...(top.querySelector('[role="menu"]')?.querySelectorAll('button')??[])];if(fileItems.length!==3)throw Error('File menu must contain exactly Save/Import/Export');const save=fileItems.find(e=>e.textContent.trim().startsWith('全部保存'));if(!save)throw Error('Save entry missing');save.click();for(let i=0;i<60;i++){if(document.querySelector('.workspace-notice')?.textContent.includes('已保存到内部资产'))return {saved:true,notice:document.querySelector('.workspace-notice').textContent};await pause(100)}throw Error('Native asset save failed: '+document.body.innerText)})()
'@
  $sourceJson = $fixture | ConvertTo-Json -Compress
  $savedAsset = Invoke-Page "(async()=>{const assets=await window.assetFlow.drop([$sourceJson],false);const a=assets.find(a=>a.format!=='directory');if(!a||a.path===a.sourcePath||!a.savedPath||a.revision!==1)throw Error('Native working copy/save metadata invalid: '+JSON.stringify(a));return {path:a.path,sourcePath:a.sourcePath,savedPath:a.savedPath,revision:a.revision}})()"
  if (-not (Test-Path -LiteralPath $savedAsset.savedPath)) { throw 'Native save did not materialize output' }
  if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($fixture)) -ne [Convert]::ToBase64String($imageBytes)) { throw 'Native save modified the original source' }
  if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($savedAsset.path)) -ne [Convert]::ToBase64String($imageBytes)) { throw 'Native save modified immutable base' }
  Invoke-Page @'
(async()=>{const pause=()=>new Promise(r=>setTimeout(r,150));const top=document.querySelector('[data-navigation-container="system.top"]');[...top.querySelectorAll(':scope > .navigation-node > button')].find(e=>e.textContent.trim()==='文件').click();await pause();[...top.querySelectorAll('button')].find(e=>e.textContent==='导出…').click();await pause();const dialog=document.querySelector('[aria-label="导出资源"]');if(!dialog?.querySelector('.export-selection-tree input:checked'))throw Error('Packaged export checklist failed');dialog.querySelector('.export-image-settings').open=true;await pause();const row=dialog.querySelector(".export-selection-row"),box=row.querySelector("input").getBoundingClientRect(),text=row.querySelector("span").getBoundingClientRect();if(text.left-box.right>18||dialog.querySelector("[aria-label=文件命名模板]").getBoundingClientRect().width<150)throw Error("Export row/grid spacing inconsistent");const r=dialog.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight||!dialog.querySelector('[aria-label="输出格式"]')||!dialog.querySelector('[aria-label="文件命名模板"]'))throw Error('Packaged export layout/options failed');return true})()
'@ | Out-Null
  $exportScreenshot = Invoke-Cdp 'Page.captureScreenshot' @{ format = 'png' }
  [IO.File]::WriteAllBytes((Join-Path $workspace '.cache/packaged-export.png'), [Convert]::FromBase64String($exportScreenshot.data))
  $report = @{ executable = $application; application = $state; imagePreview = $preview; layout = $layout; systemExtensions = $systemExtensions; navigationButtons = $buttonGeometry; assetSave = $assetSave; savedAsset = $savedAsset; passed = $true }
  $report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $workspace '.cache/packaged-smoke-result.json') -Encoding utf8
  Write-Output ('Packaged EXE smoke passed: ' + ($report | ConvertTo-Json -Depth 10 -Compress))
  Invoke-Cdp 'Runtime.evaluate' @{ expression = 'setTimeout(()=>window.close(),100);true' } | Out-Null
} finally {
  $socket.Dispose()
  if (-not $applicationProcess.HasExited) { if (-not $applicationProcess.WaitForExit(5000)) { Stop-Process -Id $applicationProcess.Id } }
}
