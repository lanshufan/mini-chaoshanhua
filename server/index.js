import {createApp} from './app.js';
const server=createApp();
const port=Number(process.env.PORT || 6917);
server.listen(port,process.env.HOST || '127.0.0.1',()=>console.log(`潮音字典后端已启动，端口 ${port}`));
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>process.exit(0)));
