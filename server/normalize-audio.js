import {spawn} from 'node:child_process';

// Upstream sometimes concatenates MP3 streams with stale Info/Xing duration
// and changing channel layouts. Decode every frame and emit one uniform stream.
export function normalizeMp3(bytes,{executable=process.env.FFMPEG_PATH || 'ffmpeg',timeoutMs=10000,maxBytes=4*1024*1024}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,['-hide_banner','-loglevel','error','-nostdin','-f','mp3','-i','pipe:0','-map','0:a:0','-vn','-map_metadata','-1','-ac','1','-ar','44100','-c:a','libmp3lame','-b:a','64k','-threads','1','-write_xing','0','-id3v2_version','0','-f','mp3','pipe:1'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    const chunks=[];let size=0,settled=false;
    const fail=(status,message)=>{if(settled) return;settled=true;clearTimeout(timer);child.kill();reject(Object.assign(new Error(message),{status}));};
    const timer=setTimeout(()=>fail(504,'音频处理超时，请稍后重试'),timeoutMs);
    child.on('error',error=>fail(503,error.code==='ENOENT'?'服务端缺少音频处理组件，请更新后端镜像':'音频处理组件无法启动'));
    child.stderr.on('data',()=>{});
    child.stdin.on('error',error=>{if(error.code!=='EPIPE') fail(502,'音频处理失败');});
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>maxBytes) return fail(502,'处理后的音频过大');chunks.push(chunk);});
    child.on('close',code=>{
      if(settled) return;
      if(code!==0 || size<256) return fail(502,'音频格式无法处理，请稍后重试');
      settled=true;clearTimeout(timer);resolve(Buffer.concat(chunks,size));
    });
    child.stdin.end(bytes);
  });
}
