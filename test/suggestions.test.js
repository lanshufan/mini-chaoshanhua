import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createSuggestions} from '../server/suggestions.js';

function setup(answer={suggestion:'食未',confident:true}) {
  const cache=new Map();let calls=0;
  const redis={get:async key=>cache.get(key)??null,set:async(key,value)=>{cache.set(key,value);return 'OK';},eval:async(script,{keys})=>{if(script.includes('DEL')) cache.delete(keys[0]);return 1;}};
  const suggest=createSuggestions({redis,env:{LLM_API_KEY:'test'},fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(answer)}}]})};}});
  return {suggest,cache,get calls(){return calls;}};
}
test('threshold, normalized cache and simultaneous calls',async()=>{
  const s=setup();assert.equal(await s.suggest('吃了吗？'),null);assert.equal(s.calls,0);
  assert.deepEqual(await Promise.all([s.suggest('你吃了吗？'),s.suggest('你 吃了吗')]),['食未','食未']);
  assert.equal(await s.suggest('你吃了吗'), '食未');assert.equal(s.calls,1);
});
test('uncertain, identical and invalid suggestions are cached as no suggestion',async()=>{
  for(const answer of [{suggestion:'食未'}, {suggestion:'你吃了吗',confident:true}, {suggestion:'abc',confident:true},{suggestion:null}]) {
    const s=setup(answer);assert.equal(await s.suggest('你吃了吗'),null);assert.equal(await s.suggest('你吃了吗'),null);assert.equal(s.calls,1);
  }
});
test('disabled or unavailable cache never calls model',async()=>{
  const fetchImpl=()=>assert.fail('must not call model');
  assert.equal(await createSuggestions({env:{},fetchImpl})('你吃了吗'),null);
  assert.equal(await createSuggestions({env:{LLM_API_KEY:'test'},redis:{get:async()=>{throw Error();}},fetchImpl})('你吃了吗'),null);
});
test('late suggestions are discarded and suggestion click skips AI',async()=>{
  let page,resolveSuggestion,calls=0;
  vm.runInNewContext(readFileSync(new URL('../miniprogram/pages/dictionary/dictionary.js',import.meta.url),'utf8'),{
    Page:value=>page=value,require:()=>({lookup:async query=>({query,chars:[],entry:{}}),suggest:()=>{calls++;return new Promise(resolve=>resolveSuggestion=resolve);}}),
    wx:{setStorageSync(){}},clearTimeout(){},console
  });
  page.setData=value=>Object.assign(page.data,value);
  page.data.input='你吃了吗';await page.search();await Promise.resolve();
  assert.equal(page.data.loading,false);assert.equal(page.data.result.query,'你吃了吗');
  page.onInput({detail:{value:'你去哪里'}});resolveSuggestion('食未');await Promise.resolve();await Promise.resolve();
  assert.equal(page.data.suggestion,'');
  page.data.suggestion='你食饱未';await page.useSuggestion();
  assert.equal(page.data.result.query,'你食饱未');assert.equal(calls,1);
});
