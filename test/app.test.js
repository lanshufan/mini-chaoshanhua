import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {lookup,database,loadAudio} from '../server/dictionary.js';
import {createApp} from '../server/app.js';
test('five real accents and regional distinctions',()=>{
 const result=lookup('你'); assert.equal(result.entry.readings.length,5);
 assert.ok(result.entry.readings.find(x=>x.id==='shantou').phonetic.includes('le2'));
 assert.ok(result.entry.readings.find(x=>x.id==='chaoyang').phonetic.includes('lu2'));
 assert.equal(result.entry.readings.filter(x=>x.audio).length,0);
 assert.ok(Object.keys(database.characters).length>9000);
});
test('multi-character, duplicate, phrase and unknown reference',()=>{
 for(const q of ['你好','谢谢','新年快乐','一二三四五六七八九十']) assert.equal(lookup(q).chars.map(x=>x.char).join(''),q);
 assert.equal(lookup('犀牛').entry.kind,'phrase');
 assert.ok(lookup('犀牛').entry.readings.every(x=>typeof x.phonetic==='string'&&!x.phonetic.includes('[object')));
 assert.equal(lookup('一二三四五六七八九十').entry.kind,'reference');
 assert.equal(lookup('𰻞').entry.kind,'missing');
 for(const q of ['',' ','hello','你好！','一二三四五六七八九十一','你 好']) assert.throws(()=>lookup(q));
});
test('all generated readings are nonempty strings',()=>{
 for(const entry of Object.values(database.characters)) for(const options of Object.values(entry.readings)) for(const option of options) assert.equal(typeof option.phonetic,'string');
 for(const entries of Object.values(database.phrases)) for(const entry of entries) for(const options of Object.values(entry.readings)) for(const phonetic of options) {assert.equal(typeof phonetic,'string');assert.ok(phonetic);}
});
async function withServer(options,fn){const server=createApp(options);server.listen(0,'127.0.0.1');await once(server,'listening');try{await fn('http://127.0.0.1:'+server.address().port);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}}
test('HTTP lookup, health, invalid inputs and methods',async()=>{
 await withServer({},async base=>{
  assert.equal((await (await fetch(base+'/health/ready')).json()).ok,true);
  assert.equal((await (await fetch(base+'/api/lookup?q='+encodeURIComponent('你好'))).json()).chars.length,2);
  assert.equal((await fetch(base+'/api/lookup?q=abc')).status,400);
  assert.equal((await fetch(base+'/api/lookup',{method:'POST'})).status,405);
  assert.equal((await fetch(base+'/missing')).status,404);
 });
});
test('audio manifest, range playback and blocked unknown paths',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'chaoshan-test-'));
 try{
  writeFileSync(join(dir,'test.mp3'),Buffer.alloc(100,1));
  writeFileSync(join(dir,'manifest.json'),JSON.stringify({'shantou:你':{file:'test.mp3',source:'test fixture',license:'test only',speakerRegion:'test'}}));
  const manifest=loadAudio(dir);assert.equal(lookup('你',manifest).entry.readings[0].audio,'/audio/test.mp3');
  await withServer({directory:dir,manifest},async base=>{
   const response=await fetch(base+'/audio/test.mp3',{headers:{Range:'bytes=10-19'}});assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,10);
   assert.equal((await fetch(base+'/audio/test.mp3',{headers:{Range:'bytes=300-400'}})).status,416);
   assert.equal((await fetch(base+'/audio/other.mp3')).status,404);
  });
  writeFileSync(join(dir,'manifest.json'),JSON.stringify({'shantou:你':{file:'../secret.mp3'}}));assert.throws(()=>loadAudio(dir));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('mini-program integrates with live HTTP and switches the second character',async()=>{
 await withServer({},async base=>{
  const wx={request(opts){fetch(opts.url).then(async r=>opts.success({statusCode:r.status,data:await r.json()})).catch(opts.fail);},getStorageSync(){return[];},setStorageSync(){},createInnerAudioContext(){return{stop(){},onEnded(){},onError(){},destroy(){}};}};
  const context={module:{exports:{}},require:()=>({apiBaseUrl:base}),wx};
  vm.runInNewContext(readFileSync(new URL('../miniprogram/data/dictionary.js',import.meta.url),'utf8'),context);
  let page;vm.runInNewContext(readFileSync(new URL('../miniprogram/pages/dictionary/dictionary.js',import.meta.url),'utf8'),{Page:p=>page=p,require:()=>context.module.exports,wx});
  page.setData=x=>Object.assign(page.data,x);page.onLoad();page.onInput({detail:{value:'你好'}});await page.search();
  assert.equal(page.data.error,'');assert.equal(page.data.result.chars.length,2);
  page.selectChar({currentTarget:{dataset:{index:1}}});assert.equal(page.data.active.text,'好');
  page.selectAll();assert.equal(page.data.active.text,'你好');page.onUnload();
 });
});
test('clearing while query is in flight does not resurrect results',async()=>{
 let finish,page;const wx={};vm.runInNewContext(readFileSync(new URL('../miniprogram/pages/dictionary/dictionary.js',import.meta.url),'utf8'),{Page:p=>page=p,require:()=>({lookup:()=>new Promise(r=>finish=r)}),wx});
 page.setData=x=>Object.assign(page.data,x);page.data.input='你好';const task=page.search();page.clear();finish(lookup('你好'));await task;assert.equal(page.data.result,null);assert.equal(page.data.loading,false);
});
