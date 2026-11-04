import http from 'node:http';
import {createRemoteAudio,sendOnlineAudio} from './remote-audio.js';
import {createReadStream,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {database,lookup,loadAudio,audioDirectory} from './dictionary.js';
export function createApp({directory=audioDirectory,manifest=loadAudio(directory),remoteAudio=createRemoteAudio()}={}) {
  const allowed=new Set(Object.values(manifest).map(x=>x.file));
  return http.createServer(async (req,res)=>{
    const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
    try {
      if(req.url.length>2048) return send(414,{error:'请求地址过长'});
      const url=new URL(req.url,'http://localhost');
      if(req.method!=='GET' && req.method!=='HEAD') {res.setHeader('Allow','GET, HEAD');return send(405,{error:'不支持此请求方式'});}
      if(url.pathname==='/health/ready') return send(200,{ok:true,characters:Object.keys(database.characters).length,phrases:Object.keys(database.phrases).length,audio:allowed.size,onlineAudio:remoteAudio.info});
      if(url.pathname==='/api/meta') return send(200,{regions:database.regions,source:database.source,characters:Object.keys(database.characters).length,phrases:Object.keys(database.phrases).length,audio:allowed.size,onlineAudio:remoteAudio.info,sourceCode:'https://github.com/lanshufan/mini-chaoshanhua'});
      if(url.pathname==='/api/lookup') return send(200,remoteAudio.decorate(lookup(url.searchParams.get('q'),manifest)));
      if(url.pathname==='/api/audio') {
        const bytes=await remoteAudio.get(url.searchParams.get('q'),url.searchParams.get('region'));
        return sendOnlineAudio(req,res,bytes);
      }
      if(url.pathname.startsWith('/audio/')) {
        const file=url.pathname.slice(7);
        if(!allowed.has(file)) return send(404,{error:'未找到录音'});
        const path=resolve(directory,file),size=statSync(path).size;
        let start=0,end=size-1,status=200;
        if(req.headers.range) {
          const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
          if(!match || (!match[1]&&!match[2])) {res.setHeader('Content-Range',`bytes */${size}`);return send(416,{error:'无效音频范围'});}
          if(!match[1]) start=Math.max(0,size-Number(match[2]));
          else {start=Number(match[1]);if(match[2]) end=Math.min(end,Number(match[2]));}
          if(start>end || start>=size) {res.setHeader('Content-Range',`bytes */${size}`);return send(416,{error:'无效音频范围'});}
          status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);
        }
        res.writeHead(status,{'Content-Type':file.endsWith('.wav')?'audio/wav':file.endsWith('.m4a')?'audio/mp4':'audio/mpeg','Content-Length':end-start+1,'Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'});
        if(req.method==='HEAD') return res.end();
        const stream=createReadStream(path,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
      }
      return send(404,{error:'接口不存在'});
    } catch(error) {if(error.retryAfter) res.setHeader('Retry-After',String(error.retryAfter));send(error.status || 500,{error:error.status?error.message:'服务暂时不可用'});}
  });
}
