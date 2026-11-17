const config=require('../config');
const base=config.feedbackBaseUrl||(config.apiBaseUrl.replace(/\/$/,'')+'/feedback');
let token='',loginPromise=null;
function request(path,method='GET',data){return new Promise((resolve,reject)=>wx.request({url:base+path,method,data,timeout:12000,header:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},success:r=>r.statusCode>=200&&r.statusCode<300?resolve(r.data):reject(Object.assign(new Error(r.data.error||'服务暂时不可用'),{status:r.statusCode})),fail:()=>reject(new Error('网络连接失败，请稍后重试'))}));}
function login(){if(!loginPromise)loginPromise=new Promise((resolve,reject)=>wx.login({success:r=>r.code?resolve(r.code):reject(new Error('微信登录失败')),fail:()=>reject(new Error('微信登录失败'))})).then(code=>request('/api/session','POST',{code})).then(r=>{token=r.token;}).finally(()=>{loginPromise=null;});return loginPromise;}
async function api(path,method='GET',data){if(!token)await login();try{return await request(path,method,data);}catch(e){if(e.status!==401)throw e;token='';await login();return request(path,method,data);}}
module.exports={api};
