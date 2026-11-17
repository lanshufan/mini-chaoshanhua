import {database} from './db.js';
import {privacyText} from './privacy.js';
import {createStore} from './store.js';
import {createApp} from './app.js';
for(const key of ['WX_APP_ID','WX_APP_SECRET','FEEDBACK_IDENTITY_KEY','FEEDBACK_PUBLIC_URL','FEEDBACK_PRIVACY_VERSION'])if(!process.env[key])throw new Error(`缺少配置 ${key}`);
if(process.env.FEEDBACK_IDENTITY_KEY.length<32)throw new Error('身份摘要密钥至少 32 字符');
if(process.env.FEEDBACK_PRIVACY_VERSION.length>32)throw new Error('隐私版本最多32字符');
const publicUrl=new URL(process.env.FEEDBACK_PUBLIC_URL);if(publicUrl.protocol!=='https:'||publicUrl.search||publicUrl.hash)throw new Error('后台地址必须为 HTTPS 且不含查询参数');
const config={appId:process.env.WX_APP_ID,identityKey:process.env.FEEDBACK_IDENTITY_KEY,origin:publicUrl.origin,basePath:publicUrl.pathname.replace(/\/$/,''),privacyText,privacyVersion:process.env.FEEDBACK_PRIVACY_VERSION,trustProxy:process.env.TRUST_PROXY==='true'};
const pool=database();
const exchange=async code=>{
  const url=new URL('https://api.weixin.qq.com/sns/jscode2session');url.search=new URLSearchParams({appid:config.appId,secret:process.env.WX_APP_SECRET,js_code:code,grant_type:'authorization_code'});
  const response=await fetch(url,{signal:AbortSignal.timeout(6000)});if(!response.ok)throw new Error('WeChat unavailable');const data=await response.json();if(typeof data.openid!=='string'||!data.openid||data.errcode)throw Object.assign(new Error('微信登录失败，请重试'),{status:401});return data.openid;
};
const store=createStore(pool);await store.ready();const app=await createApp({store,config,exchange});app.listen(Number(process.env.PORT||6918),'0.0.0.0',()=>console.log('反馈服务已启动'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>app.close(async()=>{await pool.end();process.exit(0);}));
