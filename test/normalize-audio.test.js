import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {normalizeMp3} from '../server/normalize-audio.js';
import {createRemoteAudio} from '../server/remote-audio.js';
const ffmpeg=process.env.FFMPEG_PATH || 'ffmpeg';
function run(args,input) {
  const result=spawnSync(ffmpeg,['-hide_banner','-loglevel','error',...args],{input,windowsHide:true,maxBuffer:8*1024*1024,timeout:15000});
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr?.toString());return result.stdout;
}
function toneEnergy(pcm,seconds,frequency) {
  const start=Math.round(seconds*16000),count=1600;let re=0,im=0;
  for(let i=0;i<count;i++) {const x=pcm.readInt16LE((start+i)*2);re+=x*Math.cos(2*Math.PI*frequency*i/16000);im+=x*Math.sin(2*Math.PI*frequency*i/16000);}
  return re*re+im*im;
}

test('whole phrase preserves later audio across concatenated MP3 headers and stereo/mono change',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'chaoshan-mp3-regression-'));
  const first=join(dir,'first.mp3'),second=join(dir,'second.mp3');
  try {
    run(['-f','lavfi','-i','sine=frequency=440:duration=0.35:sample_rate=44100','-ac','2','-c:a','libmp3lame','-b:a','64k',first]);
    run(['-f','lavfi','-i','sine=frequency=880:duration=0.45:sample_rate=44100','-ac','1','-c:a','libmp3lame','-b:a','64k',second]);
    const original=Buffer.concat([readFileSync(first),readFileSync(second)]);
    assert.ok(original.indexOf('Info')>=0);
    const service=createRemoteAudio({cooldownMs:0,fetchImpl:async url=>String(url).includes('Chaofanyi.ashx')?new Response(JSON.stringify({result:true,item:{FromWords:'鞠躬尽瘁',FaYinVoice2:'YWJj'}})):new Response(original,{headers:{'Content-Type':'audio/mpeg'}})});
    const normalized=await service.get('鞠躬尽瘁','shantou');
    assert.equal(normalized.indexOf('Info'),-1);assert.equal(normalized.indexOf('Xing'),-1);
    const pcm=run(['-f','mp3','-i','pipe:0','-ac','1','-ar','16000','-f','s16le','pipe:1'],normalized);
    const duration=pcm.length/32000;
    assert.ok(duration>0.75 && duration<1.1,`expected both segments, got ${duration}s`);
    assert.ok(toneEnergy(pcm,0.12,440)>toneEnergy(pcm,0.12,880)*10,'first segment retained');
    assert.ok(toneEnergy(pcm,0.60,880)>toneEnergy(pcm,0.60,440)*10,'second segment retained');
  } finally {for(const file of [first,second]) {try{unlinkSync(file);}catch{}}rmdirSync(dir);}
});

test('missing processor, corrupt audio and output limit fail explicitly',async()=>{
  await assert.rejects(normalizeMp3(Buffer.from('bad'),{executable:join(tmpdir(),'nonexistent-chaoshan-ffmpeg')}),{status:503});
  await assert.rejects(normalizeMp3(Buffer.from('bad mp3')),{status:502});
  const audio=run(['-f','lavfi','-i','sine=frequency=440:duration=0.2','-f','mp3','pipe:1']);
  await assert.rejects(normalizeMp3(audio,{maxBytes:16}),{status:502});
});
