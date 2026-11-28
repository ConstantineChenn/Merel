const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, webkit, devices } = require('playwright');
const out = path.resolve(process.env.MEREL_TEST_OUTPUT || 'test-results/touch-navigation');
const base = process.argv[2] || 'http://127.0.0.1:8787';
fs.mkdirSync(out, { recursive: true });
const cases = [];
function test(id, group, title, steps, expected, run, smoke = false) { cases.push({ id, group, title, steps, expected, run, smoke }); }
const openMenu = async p => { await p.locator('#conversation-tools-button').tap(); await p.locator('#conversation-toolbar.is-open').waitFor(); };
const menuClosed = p => p.waitForFunction(() => document.querySelector('#conversation-tools-button')?.getAttribute('aria-expanded') === 'false', null, { timeout: 2200 });
const anim = p => p.evaluate(() => Promise.all(document.querySelector('#sidebar').getAnimations().map(a => a.finished)));
const drawerVisible = async p => {
  await p.locator('#sidebar.open').waitFor({ timeout: 7000 }); await anim(p);
  await p.waitForFunction(() => { const b = document.querySelector('#sidebar button').getBoundingClientRect(); return b.x >= 0 && b.y >= 0 && !!document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest('#sidebar'); }, null, { timeout: 2200 });
};
const option = (p, index) => p.locator('.conversation-actions button').nth(index);
const activate = async (p, index, keyboard = false) => { await openMenu(p); if (keyboard) await option(p, index).press('Enter'); else await option(p, index).tap(); };
const history = async p => { await activate(p, 0, true); await drawerVisible(p); };
const overview = async p => { await activate(p, 1, true); await p.locator('dialog[open]').waitFor(); };
const dialogClosed = p => p.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 2200 });
const closeHistory = p => p.getByRole('button', { name: '收起对话历史', exact: true }).tap();
async function navigate(p, key) {
  await p.locator('.character-hint').tap();
  await p.locator(`#character-nav button[data-page="${key}"]`).tap();
  const targets = { chat:'#message-input', state:'#duration-days', plans:'.plans-grid, .empty-panel, .filters', research:'.research-progress, .page-intro', settings:'#display-name' };
  await p.waitForFunction(key => document.querySelector(`#character-nav button[data-page="${key}"]`)?.getAttribute('aria-current') === 'page' && document.querySelector('#character-nav').hidden, key);
  if (key === 'chat' || key === 'state' || key === 'settings') await p.locator(targets[key]).waitFor();
  else await p.waitForFunction(() => !document.querySelector('.loading-inline'));
}
async function createViaMenu(p, keyboard, observations) {
  const before = await p.evaluate(() => localStorage.getItem('merel.conversation'));
  await openMenu(p);
  const requests=[];
  p.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/conversations'))requests.push(r.url());});
  const response = p.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/api/conversations'), { timeout: 12000 }).catch(() => null);
  if(keyboard)await option(p,2).press('Enter');else await option(p,2).tap();
  const r = await response; observations.postStatus = r?.status() ?? null;
  observations.postRequests=requests.length;
  assert(r,requests.length?'创建请求已发出但未在等待时间内收到响应':'未发出 POST /api/conversations'); assert.equal(r.status(), 201);
  await p.waitForFunction(old => localStorage.getItem('merel.conversation') !== old, before);
  await p.locator('#message-input').waitFor();
}
for (const [index, label] of ['对话历史', '状态概览', '新对话'].entries()) {
  test(`M0${index+1}`, '工具菜单', `触摸${label}`, `打开右上角菜单，触摸${label}。`, index === 0 ? '历史抽屉显示且可操作' : index === 1 ? '状态弹窗显示' : '创建接口返回 201 且当前会话 ID 更新', async (p,o) => {
    if (index === 2) return createViaMenu(p, false, o);
    await activate(p,index); if(index === 0) await drawerVisible(p); else await p.locator('dialog[open]').waitFor({timeout:2200});
  }, true);
  test(`K0${index+1}`, '键盘对照', `键盘激活${label}`, `打开菜单，在${label}按钮按 Enter。`, '执行对应操作，确认不是业务处理器整体失效', async (p,o) => {
    if(index===2) return createViaMenu(p,true,o);
    await activate(p,index,true); if(index===0) await drawerVisible(p); else await p.locator('dialog[open]').waitFor();
  });
}
test('M04','工具菜单','外部点击及草稿保留','输入草稿，打开菜单，点击输入框。','菜单关闭，草稿仍在，输入框可以继续输入',async p=>{await p.locator('#message-input').fill('draft audit');await openMenu(p);await p.locator('#message-input').tap();await menuClosed(p);assert.equal(await p.locator('#message-input').inputValue(),'draft audit');},true);
test('M05','工具菜单','Escape 关闭并恢复焦点','打开菜单后按 Escape。','菜单关闭，焦点回到触发按钮',async p=>{await openMenu(p);await p.keyboard.press('Escape');await menuClosed(p);assert.equal(await p.evaluate(()=>document.activeElement.id),'conversation-tools-button');});
test('M06','工具菜单','连续开关后操作','连续开关菜单六次，再触摸状态概览。','开关状态一致，状态弹窗可打开',async p=>{for(let i=0;i<6;i++)await p.locator('#conversation-tools-button').tap();await menuClosed(p);await activate(p,1);await p.locator('dialog[open]').waitFor({timeout:2200});});
test('M07','工具菜单','键盘与触摸混用','打开菜单，按 Tab 改变焦点，再触摸状态概览。','触摸操作仍执行',async p=>{await openMenu(p);await p.keyboard.press('Tab');await option(p,1).tap();await p.locator('dialog[open]').waitFor({timeout:2200});});
test('M08','工具菜单','打开菜单后旋转','竖屏打开菜单，切至 844×390，再触摸状态概览。','菜单项仍可见且点击后弹窗打开',async p=>{await openMenu(p);await p.setViewportSize({width:844,height:390});await option(p,1).tap();await p.locator('dialog[open]').waitFor({timeout:2200});});
test('M09','工具菜单','图片未下载时菜单交互','阻断高清 WebP 请求后加载页面，再触摸历史。','图片加载状态不阻止抽屉操作',async p=>{await activate(p,0);await drawerVisible(p);});
test('M10','工具菜单','菜单内部非按钮区域','打开菜单后触摸会话标题，再触摸状态概览。','触摸菜单内部不会被当成点击外部，随后操作成功',async p=>{await openMenu(p);await p.locator('.conversation-context .conversation-title').tap();assert.equal(await p.locator('#conversation-tools-button').getAttribute('aria-expanded'),'true','菜单内部点击错误地关闭菜单');await option(p,1).tap();await p.locator('dialog[open]').waitFor({timeout:2200});});
for(const [key,label] of [['chat','对话'],['state','状态记录'],['plans','小计划'],['research','研究回放'],['settings','设置']]) {
 test('C'+String(cases.filter(c=>c.group==='角色导航').length+1).padStart(2,'0'),'角色导航',`触摸导航${label}`,`点击展开空间，再点击${label}。`,'进入对应页面且导航收起',async p=>{await navigate(p,key);},true);
}
test('C06','角色导航','立绘触摸与表情切换','触摸立绘打开导航，再次触摸关闭。','导航正确开关，表情请求发生变化',async p=>{const first=await p.locator('.character-portrait').getAttribute('data-expression');await p.locator('.character-trigger').tap();assert.equal(await p.locator('#character-nav').evaluate(n=>n.hidden),false);assert.notEqual(await p.locator('.character-portrait').getAttribute('data-expression'),first);await p.locator('.character-trigger').tap();assert.equal(await p.locator('#character-nav').evaluate(n=>n.hidden),true);});
test('C07','菜单互斥','角色菜单切换工具菜单','先展开角色菜单，再点右上角。','角色菜单收起，工具菜单打开',async p=>{await p.locator('.character-hint').tap();await openMenu(p);assert.equal(await p.locator('#character-nav').evaluate(n=>n.hidden),true);});
test('C08','菜单互斥','工具菜单切换角色菜单','先打开工具菜单，再点展开空间。','工具菜单收起，角色菜单打开',async p=>{await openMenu(p);await p.locator('.character-hint').tap();await menuClosed(p);assert.equal(await p.locator('#character-nav').evaluate(n=>n.hidden),false);});
test('C09','角色导航','外部触摸收起角色菜单','展开角色导航后点击输入框。','导航收起且输入框可输入',async p=>{await p.locator('.character-hint').tap();await p.locator('#message-input').tap();assert.equal(await p.locator('#character-nav').evaluate(n=>n.hidden),true);await p.locator('#message-input').fill('character draft');});
test('C10','角色导航','方向键与 Enter 导航','用 Enter 展开空间，按 End，再按 Enter。','焦点到最后一项设置，并进入设置页',async p=>{await p.locator('.character-hint').press('Enter');await p.keyboard.press('End');assert.equal(await p.evaluate(()=>document.activeElement.dataset.page),'settings');await p.keyboard.press('Enter');await p.locator('#display-name').waitFor();});
test('D01','历史抽屉','关闭按钮触摸','用键盘打开历史，触摸关闭按钮。','抽屉关闭且 inert 恢复',async p=>{await history(p);await closeHistory(p);assert.equal(await p.locator('#sidebar').getAttribute('aria-hidden'),'true');assert.equal(await p.locator('#sidebar').evaluate(n=>n.inert),true);},true);
test('D02','历史抽屉','背景遮罩触摸','用键盘打开历史，点击抽屉右侧遮罩。','抽屉关闭',async p=>{await history(p);const v=p.viewportSize();await p.touchscreen.tap(v.width-2,v.height/2);assert.equal(await p.locator('#sidebar').getAttribute('aria-hidden'),'true');});
test('D03','历史抽屉','Escape 与焦点恢复','用键盘打开历史，再按 Escape。','抽屉关闭，焦点回到工具按钮',async p=>{await history(p);await p.keyboard.press('Escape');assert.equal(await p.locator('#sidebar').getAttribute('aria-hidden'),'true');assert.equal(await p.evaluate(()=>document.activeElement.id),'conversation-tools-button');});
test('D04','历史抽屉','Tab 焦点循环','打开历史，首个按钮按 Shift+Tab，再按 Tab。','焦点在抽屉最后和第一个可操作控件之间循环',async p=>{await history(p);const first=p.locator('#sidebar button').first();await first.focus();await p.keyboard.press('Shift+Tab');assert.equal(await p.evaluate(()=>document.activeElement.classList.contains('user-button')),true);await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.getAttribute('aria-label')),'收起对话历史');});
test('D05','历史抽屉','重命名取消','打开历史，点重命名，输入后取消。','弹窗关闭，原会话标题不变',async p=>{await history(p);const name=await p.locator('.recent-title').first().textContent();await p.getByRole('button',{name:'重命名对话',exact:true}).first().tap();await p.getByRole('textbox',{name:'对话名称',exact:true}).fill('cancelled audit');await p.getByRole('button',{name:'取消',exact:true}).tap();await dialogClosed(p);assert.equal(await p.locator('.recent-title').first().textContent(),name);});
test('D06','历史抽屉','重命名保存','打开历史并重命名测试会话，触摸保存。','PATCH 返回 200，抽屉标题更新',async (p,o)=>{await history(p);await p.getByRole('button',{name:'重命名对话',exact:true}).first().tap();await p.getByRole('textbox',{name:'对话名称',exact:true}).fill('audit saved');const pending=p.waitForResponse(r=>r.request().method()==='PATCH'&&/\/api\/conversations\/[^/]+$/.test(r.url()));await p.getByRole('button',{name:'保存',exact:true}).tap();o.patchStatus=(await pending).status();assert.equal(o.patchStatus,200);await dialogClosed(p);assert.equal(await p.locator('.recent-title').first().textContent(),'audit saved');});
test('D07','历史抽屉','删除确认取消','打开历史，点击删除图标，再点击保留。','弹窗关闭，测试会话数量不变，不发送 DELETE',async (p,o)=>{await history(p);const before=await p.locator('.recent-row').count();const deletes=[];p.on('request',r=>{if(r.method()==='DELETE')deletes.push(r.url());});await p.getByRole('button',{name:'删除对话',exact:true}).first().tap();await p.getByRole('button',{name:'保留',exact:true}).tap();await dialogClosed(p);assert.equal(await p.locator('.recent-row').count(),before);assert.equal(deletes.length,0);o.deleteRequests=deletes.length;});
test('P01','状态弹窗','关闭按钮触摸','用键盘打开状态概览，点击关闭。','弹窗关闭，输入框可再次输入',async p=>{await overview(p);await p.locator('dialog[open]').getByRole('button',{name:'关闭',exact:true}).tap();await dialogClosed(p);await p.locator('#message-input').fill('modal closed');},true);
test('P02','状态弹窗','点击遮罩关闭','用键盘打开状态概览，点击左上角遮罩。','弹窗关闭',async p=>{await overview(p);await p.touchscreen.tap(2,2);await dialogClosed(p);});
test('P03','状态弹窗','内部点击不关闭','打开状态概览，点击标题。','弹窗保持打开',async p=>{await overview(p);await p.locator('dialog[open] h2').first().tap();assert.equal(await p.locator('dialog[open]').count(),1);});
test('P04','状态弹窗','Escape 关闭','打开状态概览后按 Escape。','弹窗移除',async p=>{await overview(p);await p.keyboard.press('Escape');await dialogClosed(p);});
test('P05','状态弹窗','进入状态记录','打开状态概览，点击记录当前状态。','状态记录页面显示且弹窗关闭',async p=>{await overview(p);await p.locator('dialog[open]').getByRole('button',{name:'记下当前状态',exact:true}).tap();await p.locator('#duration-days').waitFor();await dialogClosed(p);await p.locator('#duration-days').fill('3');assert.equal(await p.locator('#duration-days').inputValue(),'3');});
test('N01','请求时序','慢请求下重复创建','将创建接口延迟 700ms，键盘连续激活新对话两次。','只发送一次创建请求，成功后更新会话',async (p,o)=>{let count=0;await p.route('**/api/conversations',async r=>{if(r.request().method()==='POST'){count++;await new Promise(resolve=>setTimeout(resolve,700));}await r.continue();});const before=await p.evaluate(()=>localStorage.getItem('merel.conversation'));await activate(p,2,true);await activate(p,2,true);await p.waitForFunction(old=>localStorage.getItem('merel.conversation')!==old,before);assert.equal(count,1);o.createRequests=count;});
test('N02','请求时序','创建失败后重试','输入草稿，创建接口先返回 503，再恢复接口后重试。','先显示错误并保留草稿，再重试成功',async(p,o)=>{await p.locator('#message-input').fill('preserved');const before=await p.evaluate(()=>localStorage.getItem('merel.conversation'));await p.route('**/api/conversations',r=>r.request().method()==='POST'?r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'专项测试故障注入'})}):r.continue());await activate(p,2,true);await p.waitForFunction(()=>document.querySelector('#toast')?.classList.contains('error'));assert.equal(await p.locator('#message-input').inputValue(),'preserved');assert.equal(await p.evaluate(()=>localStorage.getItem('merel.conversation')),before);await p.unroute('**/api/conversations');await createViaMenu(p,true,o);});
test('L01','适配布局','首页及菜单边界','检查页面横向溢出，输入框中心命中和菜单项范围。','无横向溢出；输入可触达；菜单三个按钮完整位于视口内',async(p,o)=>{
 o.layout=await p.evaluate(()=>{const n=document.querySelector('#message-input'),r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{width:innerWidth,scrollWidth:document.documentElement.scrollWidth,input:{x:r.x,y:r.y,width:r.width,height:r.height},inputHit:hit===n};});
 assert(o.layout.scrollWidth<=o.layout.width+1,'横向溢出');assert(o.layout.inputHit,'输入框中心被其他元素遮挡');await openMenu(p);
 o.buttons=await p.locator('.conversation-actions button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{text:n.textContent,x:r.x,y:r.y,width:r.width,height:r.height,inViewport:r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1};}));assert(o.buttons.every(b=>b.inViewport),'菜单按钮超出视口');
 const poem=p.locator('merel-poem');
 if(await poem.count())assert.equal(await poem.isVisible(),false,'诗句与展开的菜单文字叠加');
 await p.locator('#conversation-tools-button').tap();await menuClosed(p);
 if(await poem.count())assert.equal(await poem.isVisible(),true,'关闭菜单后诗句未恢复');
},true);
fs.writeFileSync(path.join(out,'test-plan.json'),JSON.stringify(cases.map(({run,...c})=>c),null,2));
const allResults=[];
const resultName=process.env.MEREL_RESULT_NAME||'expanded-results.json';
async function runConfiguration(browser, engine, configName, options, selected) {
 const context=await browser.newContext(options);
 for(const c of selected){
  const p=await context.newPage();p.setDefaultTimeout(12000);p.setDefaultNavigationTimeout(30000);
  const record={id:c.id,title:c.title,group:c.group,engine,configuration:configName,viewport:options.viewport,deviceScaleFactor:options.deviceScaleFactor,variant:'source',status:'PASS',observations:{},errors:[],durationMs:0};
  const start=Date.now();p.on('pageerror',e=>record.errors.push(e.message));
  try{
   if(c.id==='M09')await p.route('**/*.full.webp',r=>r.abort());
   await p.goto(base,{waitUntil:'domcontentloaded'});await p.locator('#message-input').waitFor({timeout:60000});await p.evaluate(()=>document.fonts.ready);
   await p.evaluate(()=>{window.auditEvents=[];for(const name of ['pointerdown','pointerup','click','focusin'])document.addEventListener(name,e=>{auditEvents.push({type:e.type,tag:e.target.tagName,id:e.target.id,class:e.target.getAttribute('class')});if(auditEvents.length>35)auditEvents.shift();},true);});
   await c.run(p,record.observations);assert.deepEqual(record.errors,[]);
  }catch(e){record.status='FAIL';record.failure=e.message;record.events=await p.evaluate(()=>window.auditEvents||[]).catch(()=>[]);}
  record.durationMs=Date.now()-start;
  if(record.status==='FAIL'||c.id==='L01'){
   const filename=`${configName}-${record.variant}-${c.id}.png`;record.screenshot=filename;
   await p.screenshot({path:path.join(out,filename)}).catch(e=>record.screenshotError=e.message);
  }
  await p.close();allResults.push(record);fs.writeFileSync(path.join(out,resultName),JSON.stringify(allResults,null,2));
  console.log(JSON.stringify({configuration:configName,variant:record.variant,id:c.id,status:record.status,failure:record.failure?.split('\n')[0]}));
 }
 await context.close();
}
(async()=>{
 const wk=await webkit.launch({headless:true}),cr=await chromium.launch({headless:true,executablePath:process.env.MEREL_CHROME || undefined});
 try{
  const baseline={viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true};
  const mode=process.argv[3]||'all';
  assert(['all','extended','devices','layout','release'].includes(mode),'Unknown test mode');
  const releaseIds=['M01','M02','M03','M10','C08','P05','C05','L01'];
  const extended=mode==='layout'?cases.filter(c=>c.id==='L01'):mode==='release'?cases.filter(c=>releaseIds.includes(c.id)):cases;
  if(mode==='release'){
   // Serialize cold starts on small-bandwidth demo hosts; keep interaction deadlines unchanged.
   await runConfiguration(wk,'webkit','expanded-webkit',baseline,extended);
   await runConfiguration(cr,'chromium','expanded-chromium',baseline,extended);
  }else if(['all','extended','layout'].includes(mode))await Promise.all([runConfiguration(wk,'webkit','expanded-webkit',baseline,extended),runConfiguration(cr,'chromium','expanded-chromium',baseline,extended)]);
  if(mode==='all'||mode==='devices'||mode==='layout'){
   const names=['iPhone SE','iPhone 13','iPhone 14 Pro Max','iPhone 13 landscape','iPad Mini','Pixel 5','Galaxy S9+','Galaxy Tab S4'];
   const configurations=names.map(name=>{const {defaultBrowserType,...opts}=devices[name];return{name,engine:defaultBrowserType,opts};});
   fs.writeFileSync(path.join(out,'device-configurations.json'),JSON.stringify(configurations,null,2));
   const jobs=[];
   for(const {name,engine,opts} of configurations){jobs.push(()=>runConfiguration(engine==='webkit'?wk:cr,engine,name.replaceAll(' ','-'),opts,cases.filter(c=>mode==='layout'?c.id==='L01':c.smoke || ['M10','C08','P05'].includes(c.id))));}
   for(const job of jobs)await job();
  }
 }finally{await wk.close();await cr.close();}
 const summary={caseDefinitions:cases.length,executions:allResults.length,passed:allResults.filter(r=>r.status==='PASS').length,failed:allResults.filter(r=>r.status==='FAIL').length};
 fs.writeFileSync(path.join(out,resultName.replace('.json','-summary.json')),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));if(summary.failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
