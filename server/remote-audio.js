import {validate} from './dictionary.js';

const QUERY_URL = 'https://v.laojuhui.com/FD/Chaofanyi.ashx';
const PLAY_URL = 'https://v.laojuhui.com/FD/PlayChaoYinVoice.ashx';
const REGIONS = {chaozhou:{field:'FaYinVoice1',code:'C'},shantou:{field:'FaYinVoice2',code:'D'},jieyang:{field:'FaYinVoice3',code:'E'}};
const HEADERS = {Origin:'https://chaofayin.com',Referer:'https://chaofayin.com/'};
const failure = (status,message) => Object.assign(new Error(message),{status});

async function readLimited(response,limit) {
  if(Number(response.headers.get('content-length'))>limit) {await response.body?.cancel();throw failure(502,'发音服务返回内容异常');}
  if(!response.body) throw failure(502,'发音服务未返回内容');
  const reader=response.body.getReader(),chunks=[];
  let size=0;
  try {
    for(;;) {
      const {done,value}=await reader.read();if(done) break;
      size+=value.byteLength;
      if(size>limit) {await reader.cancel();throw failure(502,'发音服务返回内容过大');}
      chunks.push(Buffer.from(value));
    }
  } finally {reader.releaseLock();}
  return Buffer.concat(chunks,size);
}

export function createRemoteAudio({provider=process.env.AUDIO_PROVIDER || 'chaofayin',fetchImpl=globalThis.fetch,timeoutMs=7000,cooldownMs=10000,now=Date.now}={}) {
  if(!['none','chaofayin'].includes(provider)) throw new Error('AUDIO_PROVIDER must be chaofayin or none');
  const enabled=provider==='chaofayin',cache=new Map();
  let activeQueries=0,activeAudio=0,nextQueryAt=0;
  const info={provider,enabled,regions:enabled?Object.keys(REGIONS):[],source:enabled?'https://chaofayin.com/':'',cooldownSeconds:cooldownMs/1000};

  async function queryIds(query) {
    const cached=cache.get(query);
    if(cached && cached.expires>now()) return cached.promise;
    cache.delete(query);
    if(activeQueries>=4) throw failure(503,'在线发音繁忙，请稍后重试');
    if(now()<nextQueryAt) throw Object.assign(failure(429,'在线音源请求间隔为10秒，请稍后重试'),{retryAfter:Math.ceil((nextQueryAt-now())/1000)});
    nextQueryAt=now()+cooldownMs;
    activeQueries++;
    const promise=(async()=>{
      const response=await fetchImpl(QUERY_URL,{method:'POST',headers:{...HEADERS,'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8'},body:new URLSearchParams({txt:query,type:''}).toString(),signal:AbortSignal.timeout(timeoutMs),redirect:'error'});
      if(!response.ok) throw failure(502,'在线发音服务暂时不可用');
      let data;
      try {data=JSON.parse((await readLimited(response,128*1024)).toString('utf8').replace(/^\uFEFF/,''));}
      catch(error) {if(error.status) throw error;throw failure(502,'发音服务返回内容异常');}
      if(!data.result || !data.item || data.item.FromWords!==query) throw failure(404,'该文字暂未找到在线发音');
      const ids={};
      for(const [region,{field}] of Object.entries(REGIONS)) {
        const value=data.item[field];
        if(typeof value!=='string' || !value || value.length>2048) continue;
        try {const id=decodeURIComponent(value);if(/^[A-Za-z0-9+/=]+$/.test(id)) ids[region]=id;} catch {}
      }
      return ids;
    })();
    if(cache.size>=100) cache.delete(cache.keys().next().value);
    const record={promise,expires:now()+10*60*1000};cache.set(query,record);
    try {return await promise;} catch(error) {if(cache.get(query)===record) cache.delete(query);throw error;}
    finally {activeQueries--;}
  }

  function decorate(result) {
    if(!enabled) return result;
    for(const entry of [result.entry,...result.chars.map(item=>item.entry)]) {
      let online=false;
      for(const reading of entry.readings) {
        if(reading.audio || !REGIONS[reading.id] || !reading.phonetic) continue;
        reading.audio='/api/audio?region='+reading.id+'&q='+encodeURIComponent(entry.text);
        reading.audioMode='online';reading.audioSource=info.source;reading.audioLicense='';online=true;
      }
      if(online) {entry.note+=' 在线发音采用服务默认读法，需结合词义核对文白读。';entry.onlineAudioNotice='在线音源的地区标签尚未逐条核实，部分地区可能返回同一音频。不同文字的发音请求请间隔10秒。';}
    }
    return result;
  }

  async function get(value,region) {
    const query=validate(value);
    if(!enabled || !REGIONS[region]) throw failure(404,'该地区暂无在线音源');
    if(activeAudio>=4) throw failure(503,'在线发音繁忙，请稍后重试');
    activeAudio++;
    try {
      const ids=await queryIds(query),id=ids[region];
      if(!id) throw failure(404,'该地区暂未找到这段发音');
      const url=new URL(PLAY_URL);url.searchParams.set('five',REGIONS[region].code);url.searchParams.set('ids',id);
      const response=await fetchImpl(url,{headers:HEADERS,signal:AbortSignal.timeout(timeoutMs),redirect:'error'});
      if(!response.ok) throw failure(502,'在线发音服务暂时不可用');
      const type=response.headers.get('content-type') || '';
      if(!/^audio\/(mpeg|mp3)(?:;|$)/i.test(type)) {await response.body?.cancel();throw failure(502,'发音服务未返回有效音频');}
      const bytes=await readLimited(response,4*1024*1024);
      if(bytes.length<4 || !(bytes.subarray(0,3).toString()==='ID3' || (bytes[0]===0xff && (bytes[1]&0xe0)===0xe0))) throw failure(502,'发音服务返回的音频无效');
      return bytes;
    } catch(error) {
      if(error.status) throw error;
      throw failure(error.name==='TimeoutError'||error.name==='AbortError'?504:502,'在线发音连接失败，请稍后重试');
    } finally {activeAudio--;}
  }
  return {info,decorate,get};
}

export function sendOnlineAudio(req,res,bytes) {
  const size=bytes.length;
  let start=0,end=size-1,status=200;
  if(req.headers.range) {
    const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if(match && (match[1] || match[2])) {
      if(!match[1]) start=Math.max(0,size-Number(match[2]));
      else {start=Number(match[1]);if(match[2]) end=Math.min(end,Number(match[2]));}
    }
    if(!match || (!match[1]&&!match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start>end || start>=size) {
      res.writeHead(416,{'Content-Range':`bytes */${size}`,'Cache-Control':'no-store'});return res.end();
    }
    status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);
  }
  res.writeHead(status,{'Content-Type':'audio/mpeg','Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(req.method==='HEAD'?undefined:bytes.subarray(start,end+1));
}
