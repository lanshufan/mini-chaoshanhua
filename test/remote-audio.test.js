import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRemoteAudio} from '../server/remote-audio.js';
import {createApp} from '../server/app.js';
import {lookup} from '../server/dictionary.js';

const mp3=Buffer.concat([Buffer.from([0xff,0xfb,0x50,0xc4]),Buffer.alloc(296,1)]);
const item={FromWords:'你好',FaYinVoice1:'ab%2Bc%2F%3D%3D',FaYinVoice2:'ST%2B%2F%3D',FaYinVoice3:'JY%3D%3D'};
function fixture(options={}) {
  const calls=[];
  const service=createRemoteAudio({cooldownMs:0,normalizeAudio:async bytes=>bytes,fetchImpl:async(url,init)=>{
    calls.push({url:String(url),init});
    return String(url).includes('Chaofanyi.ashx')?new Response(JSON.stringify({result:true,item})):new Response(mp3,{headers:{'Content-Type':'audio/mpeg'}});
  },...options});
  return {service,calls};
}
async function withServer(service,fn,manifest={}) {
  const server=createApp({remoteAudio:service,manifest});server.listen(0,'127.0.0.1');await once(server,'listening');
  try {await fn('http://127.0.0.1:'+server.address().port);} finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}

test('online capability is limited to three labelled regions; local recording wins',()=>{
  const {service,calls}=fixture();
  const result=service.decorate(lookup('你好',{'shantou:你好':{file:'local.mp3',source:'owner',license:'permission'}}));
  assert.equal(result.entry.readings.find(r=>r.id==='shantou').audio,'/audio/local.mp3');
  assert.equal(result.entry.readings.find(r=>r.id==='chaozhou').audioMode,'online');
  assert.equal(result.entry.readings.find(r=>r.id==='chenghai').audio,'');
  assert.equal(result.entry.readings.find(r=>r.id==='chaoyang').audio,'');
  assert.equal(calls.length,0); // Searches do not consume upstream queries.
  assert.ok(result.chars.every(c=>c.entry.readings.find(r=>r.id==='shantou').audio.includes(encodeURIComponent(c.char))));
  assert.equal(fixture({provider:'none'}).service.decorate(lookup('你')).entry.readings.filter(r=>r.audio).length,0);
});

test('uses exact regional fields and encodes upstream IDs once; metadata reused across accents',async()=>{
  const {service,calls}=fixture();
  for(const region of ['chaozhou','shantou','jieyang']) assert.deepEqual(await service.get('你好',region),mp3);
  assert.equal(calls.length,4);
  assert.equal(new URLSearchParams(calls[0].init.body).get('txt'),'你好');
  assert.equal(new URLSearchParams(calls[0].init.body).get('type'),'');
  for(const [index,code,id] of [[1,'C','ab+c/=='],[2,'D','ST+/='],[3,'E','JY==']]) {
    const url=new URL(calls[index].url);assert.equal(url.searchParams.get('five'),code);assert.equal(url.searchParams.get('ids'),id);
    assert.equal(url.hostname,'v.laojuhui.com');
  }
});

test('rejects unsupported regions and invalid text without any upstream request',async()=>{
  const {service,calls}=fixture();
  for(const region of ['chenghai','chaoyang','https://example.com']) await assert.rejects(service.get('你好',region),{status:404});
  await assert.rejects(service.get('你好！','shantou'),{status:400});assert.equal(calls.length,0);
});

test('concurrent playback shares one metadata request; new text observes global cooldown',async()=>{
  let clock=10000;const {service,calls}=fixture({cooldownMs:10000,now:()=>clock});
  await Promise.all([service.get('你好','shantou'),service.get('你好','chaozhou')]);
  assert.equal(calls.filter(c=>c.url.includes('Chaofanyi.ashx')).length,1);
  await assert.rejects(service.get('你','shantou'),{status:429,retryAfter:10});
  clock+=10000;
  // The fixture intentionally returns a mismatched query after the cooldown.
  await assert.rejects(service.get('你','shantou'),{status:404});
});

test('upstream failures, missing regional track and bad responses never fall back to another accent',async()=>{
  for(const response of [()=>new Response('broken'),()=>new Response('{}',{status:503}),()=>new Response(JSON.stringify({result:false})),()=>new Response(JSON.stringify({result:true,item:{...item,FaYinVoice2:''}}))]) {
    const service=createRemoteAudio({cooldownMs:0,fetchImpl:async()=>response()});
    await assert.rejects(service.get('你好','shantou'),error=>[404,502].includes(error.status));
  }
  const {service,calls}=fixture({fetchImpl:async()=>{throw new DOMException('timeout','TimeoutError');}});
  await assert.rejects(service.get('你好','shantou'),{status:504});
  assert.equal(calls.length,0);
});

test('rejects nonaudio, invalid MP3 and oversized responses; failed metadata can retry',async()=>{
  for(const audio of [()=>new Response('<html/>',{headers:{'Content-Type':'text/html'}}),()=>new Response('not mp3',{headers:{'Content-Type':'audio/mpeg'}}),()=>new Response(mp3,{headers:{'Content-Type':'audio/mpeg','Content-Length':String(5*1024*1024)}})]) {
    const {service}=fixture({fetchImpl:async url=>String(url).includes('Chaofanyi.ashx')?new Response(JSON.stringify({result:true,item})):audio()});
    await assert.rejects(service.get('你好','shantou'),{status:502});
  }
  let count=0;
  const {service}=fixture({fetchImpl:async url=>{if(String(url).includes('Chaofanyi.ashx')) {count++;return count===1?new Response('bad'):new Response(JSON.stringify({result:true,item}));}return new Response(mp3,{headers:{'Content-Type':'audio/mpeg'}});}});
  await assert.rejects(service.get('你好','shantou'),{status:502});
  assert.deepEqual(await service.get('你好','shantou'),mp3);assert.equal(count,2);
});

test('HTTP serves actual MP3 bytes, byte ranges and HEAD; errors remain JSON and query stays usable',async()=>{
  const {service}=fixture();
  await withServer(service,async base=>{
    const result=await(await fetch(base+'/api/lookup?q='+encodeURIComponent('你好'))).json();
    const url=base+result.entry.readings.find(r=>r.id==='shantou').audio;
    const response=await fetch(url);assert.equal(response.headers.get('content-type'),'audio/mpeg');assert.deepEqual(Buffer.from(await response.arrayBuffer()),mp3);
    const range=await fetch(url,{headers:{Range:'bytes=4-9'}});assert.equal(range.status,206);assert.equal(range.headers.get('content-range'),'bytes 4-9/300');assert.equal((await range.arrayBuffer()).byteLength,6);
    assert.equal((await fetch(url,{headers:{Range:'bytes=-0'}})).status,416);
    assert.equal((await fetch(url,{headers:{Range:'bytes=900-'}})).status,416);
    const head=await fetch(url,{method:'HEAD'});assert.equal(head.headers.get('content-length'),'300');assert.equal((await head.arrayBuffer()).byteLength,0);
    assert.equal((await fetch(base+'/api/audio?q='+encodeURIComponent('你好')+'&region=chaoyang')).status,404);
    assert.equal((await(await fetch(base+'/health/ready')).json()).onlineAudio.enabled,true);
  });
});

test('mini-program prefixes online audio with its deployed API base',async()=>{
  const {service}=fixture();
  const result=service.decorate(lookup('你好'));
  const context={module:{exports:{}},require:()=>({apiBaseUrl:'https://example.com/chaoshan'}),wx:{request(options){options.success({statusCode:200,data:result});}}};
  vm.runInNewContext(readFileSync(new URL('../miniprogram/data/dictionary.js',import.meta.url),'utf8'),context);
  const output=await context.module.exports.lookup('你好');
  const track=output.entry.readings.find(r=>r.id==='shantou');
  assert.equal(track.audio,'https://example.com/chaoshan/api/audio?region=shantou&q='+encodeURIComponent('你好')+'&v=2');
  assert.ok(output.entry.onlineAudioNotice.includes('同一音频'));
});

test('HTTP cooldown explains retry timing and does not block dictionary queries',async()=>{
  const {service}=fixture({cooldownMs:10000,now:()=>10000});
  await service.get('你好','shantou');
  await withServer(service,async base=>{
    const response=await fetch(base+'/api/audio?region=shantou&q='+encodeURIComponent('玩'));
    assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'10');
    assert.ok((await response.json()).error.includes('10秒'));
    assert.equal((await fetch(base+'/api/lookup?q='+encodeURIComponent('玩'))).status,200);
  });
});
