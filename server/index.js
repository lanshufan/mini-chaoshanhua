import {createApp} from './app.js';
import {createSuggestions} from './suggestions.js';
let redis=null;
if(process.env.REDIS_URL && process.env.LLM_API_KEY) {
  const {createClient}=await import('redis');
  redis=createClient({url:process.env.REDIS_URL,disableOfflineQueue:true,socket:{connectTimeout:2000,reconnectStrategy:false}});
  redis.on('error',()=>console.warn('AI 建议缓存暂不可用'));
  try {await redis.connect();} catch {redis=null;}
}
const server=createApp({suggest:createSuggestions({redis})});
const port=Number(process.env.PORT || 6917);
server.listen(port,process.env.HOST || '127.0.0.1',()=>console.log(`潮音字典后端已启动，端口 ${port}`));
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(async()=>{if(redis?.isOpen) await redis.quit().catch(()=>{});process.exit(0);}));
