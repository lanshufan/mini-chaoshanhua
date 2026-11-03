const {apiBaseUrl}=require('../config');
function validate(value) {
  const query=String(value || '').trim();
  if(!query || Array.from(query).length>10 || !/^[\u3400-\u9fff\uf900-\ufaff\u{20000}-\u{323af}]+$/u.test(query)) throw new Error('请输入 1–10 个汉字，不含空格、数字或标点');
  return query;
}
function lookup(value) {
  const query=validate(value);
  return new Promise((resolve,reject)=>{
    wx.request({url:apiBaseUrl.replace(/\/$/,'')+'/api/lookup?q='+encodeURIComponent(query),method:'GET',timeout:12000,
      success(response) {
        if(response.statusCode!==200 || !response.data || !Array.isArray(response.data.chars)) return reject(new Error(response.data?.error || '查询服务暂时不可用'));
        const result=response.data;
        for(const entry of [result.entry,...result.chars.map(x=>x.entry)]) for(const reading of entry.readings) {
          if(reading.audio) reading.audio=apiBaseUrl.replace(/\/$/,'')+reading.audio;
        }
        resolve(result);
      },fail(){reject(new Error('连接失败，请检查后端地址与网络后重试'));}
    });
  });
}
module.exports={lookup,validate};
