import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import {fail,string,id,token,hashPassword,verifyPassword,Sessions,Limiter} from './security.js';
const statuses=['pending','processing','resolved','closed'];
const categories=['pronunciation','meaning','new_word','other'];
async function json(req){if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))fail(415,'请使用 JSON 请求');let size=0,parts=[];for await(const chunk of req){size+=chunk.length;if(size>12000)fail(413,'提交内容过长');parts.push(chunk);}try{const value=JSON.parse(Buffer.concat(parts).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'请求格式错误');return value;}catch{fail(400,'请求格式错误');}}
export async function createApp({store,config,exchange}){
  const sessions=new Sessions(),limiter=new Limiter();
  const dummy=await hashPassword(token());
  const assets=new Map(await Promise.all([['/','index.html','text/html'],['/admin.js','admin.js','text/javascript'],['/style.css','style.css','text/css']].map(async([path,file,type])=>[path,{body:await readFile(new URL(`./public/${file}`,import.meta.url)),type}])));
  const cookieName='__Secure-feedback';
  const cookie=(value,age)=>`${cookieName}=${value}; Path=${config.basePath}/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
  const server=http.createServer(async(req,res)=>{
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try{
      if((req.url||'').length>2048)fail(414,'地址过长');const url=new URL(req.url,'http://localhost'),path=url.pathname;
      const ip=config.trustProxy?String(req.headers['x-real-ip']||req.socket.remoteAddress):req.socket.remoteAddress;
      limiter.take(`all:${ip}`,180,60000);
      if(req.method==='GET'&&assets.has(path)){const asset=assets.get(path);res.writeHead(200,{'Content-Type':asset.type+'; charset=utf-8'});return res.end(asset.body);}
      if(req.method==='GET'&&path==='/health/ready'){await store.ready();return send(200,{ok:true});}
      if(req.method==='POST'&&path==='/api/session'){
        limiter.take(`wx:${ip}`,15,60000);const body=await json(req);const code=string(body.code,1,256,'登录凭据');
        const openid=await exchange(code);const hash=createHmac('sha256',config.identityKey).update(config.appId+'\0'+openid).digest();
        const user=await store.user(config.appId,hash);return send(200,{token:sessions.create({kind:'user',id:String(user)},2*3600000)});
      }
      if(path.startsWith('/api/admin/')){
        if(req.method!=='GET'&&req.headers.origin!==config.origin)fail(403,'请求来源校验失败');
        if(path==='/api/admin/login'&&req.method==='POST'){
          limiter.take('admin:global',30,15*60000);limiter.take(`admin:${ip}`,5,15*60000);
          const body=await json(req),name=string(body.username,1,64,'用户名'),password=string(body.password,1,256,'密码');const admin=await store.admin(name);
          const valid=await verifyPassword(password,admin?.password_hash||dummy);if(!admin||!valid)fail(401,'用户名或密码错误');
          const csrf=token(),key=sessions.create({kind:'admin',id:String(admin.id),csrf},3600000);res.setHeader('Set-Cookie',cookie(key,3600));return send(200,{csrf});
        }
        const key=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
        const session=sessions.get(key,'admin');if(!await store.activeAdmin(session.id)){sessions.entries.delete(key);fail(401,'账号不可用');}
        if(req.method!=='GET'&&req.headers['x-csrf-token']!==session.csrf)fail(403,'请求校验失败，请刷新');
        if(path==='/api/admin/session'&&req.method==='GET')return send(200,{csrf:session.csrf});
        if(path==='/api/admin/logout'&&req.method==='POST'){sessions.entries.delete(key);res.setHeader('Set-Cookie',cookie('',0));return send(200,{ok:true});}
        if(path==='/api/admin/feedback'&&req.method==='GET'){
          const status=url.searchParams.get('status')||'';if(status&&!statuses.includes(status))fail(400,'状态不正确');return send(200,{items:await store.list(null,status,id(url.searchParams.get('before')||'9223372036854775807'))});
        }
        const match=/^\/api\/admin\/feedback\/([0-9]+)$/.exec(path);
        if(match){const key=id(match[1]);if(req.method==='GET')return send(200,await store.detail(key,null));
          if(req.method==='POST'){const body=await json(req);if(!Number.isInteger(body.version)||body.version<0)fail(400,'版本不正确');if(body.status&&!statuses.includes(body.status))fail(400,'状态不正确');const content=body.content?string(body.content,1,2000,'回复'):null;const visibility=body.visibility||'public';if(!['public','internal'].includes(visibility))fail(400,'回复类型不正确');if(!content&&!body.status)fail(400,'请填写回复或选择状态');await store.change(key,session.id,{version:body.version,status:body.status,content,visibility});return send(200,{ok:true});}
        }
        fail(404,'接口不存在');
      }
      if(path==='/api/feedback'||path.startsWith('/api/feedback/')){
        const auth=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization||'');const user=sessions.get(auth?.[1],'user');
        if(path==='/api/feedback'){
          if(req.method==='GET')return send(200,{items:await store.list(user.id,null,id(url.searchParams.get('before')||'9223372036854775807'))});
          if(req.method==='POST'){limiter.take(`submit:${user.id}`,5,3600000);const body=await json(req);if(!/^[a-f0-9-]{36}$/.test(body.requestId||''))fail(400,'提交编号不正确');if(!categories.includes(body.category))fail(400,'反馈类型不正确');const data={requestId:body.requestId,category:body.category,content:string(body.content,1,500,'反馈内容'),relatedWord:body.relatedWord?string(body.relatedWord,1,64,'词条'):null};return send(201,{id:await store.create(user.id,data)});}
        }
        const match=/^\/api\/feedback\/([0-9]+)$/.exec(path);if(match){const key=id(match[1]);if(req.method==='GET')return send(200,await store.detail(key,user.id));if(req.method==='DELETE'){await store.remove(key,user.id);return send(200,{ok:true});}}
      }
      fail(404,'接口不存在');
    }catch(error){if(error.status===429)res.setHeader('Retry-After','60');if(!error.status)console.error('feedback request failed');send(error.status||503,{error:error.status?error.message:'服务暂时不可用，请稍后重试'});}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.maxHeadersCount=40;return server;
}
