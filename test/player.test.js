import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('device playback never operates an empty player and ignores released callbacks',async()=>{
  let page;const players=[],modals=[],timers=new Map();let timerId=0;
  const result={query:'你好',chars:[],entry:{readings:[{id:'shantou',audio:'https://example.com/first.mp3'},{id:'chaozhou',audio:'https://example.com/second.mp3'}]}};
  const wx={getStorageSync:()=>[],setStorageSync(){},showModal:x=>modals.push(x),setInnerAudioOption(options){assert.equal(options.obeyMuteSwitch,false);assert.equal(options.speakerOn,true);options.success();},createInnerAudioContext(){
    const audio={src:'',destroyed:false,onPlay(fn){this.startedCallback=fn;},onEnded(fn){this.ended=fn;},onError(fn){this.error=fn;},
      stop(){assert.fail('must not stop an uninitialized native player');},
      play(){assert.ok(this.src);assert.equal(this.destroyed,false);this.started=true;},
      destroy(){this.destroyed=true;this.error({errCode:-1,errMsg:'late native error'});}};
    players.push(audio);return audio;
  }};
  vm.runInNewContext(readFileSync(new URL('../miniprogram/pages/dictionary/dictionary.js',import.meta.url),'utf8'),{Page:p=>page=p,require:()=>({lookup:async()=>result}),wx,console:{error(){}},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)});
  page.setData=x=>Object.assign(page.data,x);page.onLoad();page.data.input='你好';await page.search();page.onHide();
  assert.equal(players.length,0);assert.equal(modals.length,0);
  const tap=id=>page.play({currentTarget:{dataset:{id}}});
  tap('shantou');assert.equal(players[0].started,true);assert.equal(page.data.playing,'shantou');assert.equal(page.data.audioStatus,'正在加载…');players[0].startedCallback();assert.equal(page.data.audioStatus,'正在播放');assert.equal(timers.size,0);
  tap('chaozhou');assert.equal(players[0].destroyed,true);players[0].ended();
  assert.equal(page.data.playing,'chaozhou');assert.equal(modals.length,0);
  players[1].error({errCode:10002,errMsg:'network failed'});
  assert.equal(modals.length,1);assert.ok(modals[0].content.includes('https://example.com/second.mp3'));assert.equal(page.data.playing,'');
  tap('shantou');tap('shantou');assert.equal(players[2].destroyed,false);assert.equal(players.length,3);assert.equal(page.data.audioLoading,true);players[2].startedCallback();tap('shantou');assert.equal(players[2].destroyed,true);assert.equal(page.data.playing,'');
  tap('shantou');page.onHide();assert.equal(players[3].destroyed,true);
  tap('shantou');page.onUnload();players[4].error({errCode:-1});assert.equal(modals.length,1);assert.equal(timers.size,0);
  page.clear();page.data.active=result.entry;tap('shantou');const timeout=[...timers.values()][0];timeout();
  assert.equal(modals.length,2);assert.ok(modals[1].content.includes('启动播放超时'));assert.equal(players[5].destroyed,true);assert.equal(timers.size,0);
  players[5].startedCallback();assert.equal(page.data.audioStatus,'');
  wx.setInnerAudioOption=options=>options.fail({errMsg:'audio option failed'});
  tap('shantou');assert.equal(modals.length,3);assert.ok(modals[2].content.includes('设置播放选项'));assert.equal(timers.size,0);
});
