const { lookup } = require('../../data/dictionary');
Page({
  data:{ input:'',count:0,result:null,active:null,selected:-1,playing:'',loading:false,error:'',history:[],suggestions:['你好','食','茶','谢谢','新年快乐'] },
  onLoad() {
    try { const history=wx.getStorageSync('teochew-history'); if(Array.isArray(history)) this.setData({history:history.filter(x=>typeof x==='string').slice(0,8)}); } catch (_) {}
  },
  startAudio(source,id) {
    const audio=wx.createInnerAudioContext();
    this.audio=audio;
    audio.onEnded(()=>{ if(this.audio===audio) this.stopAudio(); });
    audio.onError(error=>{
      if(this.audio!==audio) return;
      this.stopAudio();
      this.setData({playing:''});
      const code=error.errCode == null ? '未知' : error.errCode;
      const hints={10001:'播放器系统错误，请退出小程序后重试。',10002:'音频网络请求失败，请检查音频域名配置、网络及服务器响应。',10003:'音频文件无法读取，请检查服务器返回内容。',10004:'音频格式不受支持，请确认后端已更新。'};
      const details='错误码：'+code+'\n'+(error.errMsg || '未提供详细信息')+'\n音频地址：'+source;
      wx.showModal({title:'语音播放失败',content:(hints[code] || '播放失败，请复制详情协助排查。')+'\n\n'+details,confirmText:'复制详情',cancelText:'关闭',success(result) {
        if(result.confirm) wx.setClipboardData({data:details});
      }});
    });
    audio.src=source;
    this.setData({playing:id});
    audio.play();
  },
  onInput(e) { const input=Array.from(e.detail.value).slice(0,10).join(''); this.setData({input,count:Array.from(input).length}); },
  clear() { this.requestVersion=(this.requestVersion || 0)+1; this.setData({loading:false,error:''}); this.stopAudio(); this.setData({input:'',count:0,result:null,active:null,selected:-1}); },
  async search() {
    const version=this.requestVersion=(this.requestVersion || 0)+1;
    this.stopAudio(); this.setData({loading:true,error:''});
    try {
      const result=await lookup(this.data.input);
      if(version!==this.requestVersion) return;
      this.stopAudio();
      const history=[result.query,...this.data.history.filter(x=>x!==result.query)].slice(0,8);
      this.setData({input:result.query,count:result.chars.length,result,active:result.entry,selected:-1,history});
      try { wx.setStorageSync('teochew-history',history); } catch (_) {}
    } catch(error) { if(version===this.requestVersion) this.setData({error:error.message}); } finally { if(version===this.requestVersion) this.setData({loading:false}); }
  },
  useWord(e) { const input=e.currentTarget.dataset.word; this.setData({input,count:Array.from(input).length}); this.search(); },
  selectChar(e) { const selected=Number(e.currentTarget.dataset.index); this.stopAudio(); this.setData({selected,active:this.data.result.chars[selected].entry}); },
  selectAll() { this.stopAudio(); this.setData({selected:-1,active:this.data.result.entry}); },
  stopAudio() {
    // Invalidate callbacks before releasing the old native player. Never stop an unset source.
    const audio=this.audio;this.audio=null;
    if(audio) audio.destroy();
    this.setData({playing:''});
  },
  play(e) {
    const reading=this.data.active && this.data.active.readings.find(item=>item.id===e.currentTarget.dataset.id);
    if(!reading || !reading.audio) return;
    if(this.data.playing===reading.id) { this.stopAudio(); return; }
    this.stopAudio(); this.startAudio(reading.audio,reading.id);
  },
  showAbout() {
    const sources=[
      '字音资料：PUJDICT 项目贡献者 / pujbase。已转换五地读音并整理简繁字及词条索引。',
      '原始资料：https://github.com/pujdict/pujbase',
      '数据许可：CC BY-SA 4.0\nhttps://creativecommons.org/licenses/by-sa/4.0/',
      '在线参考发音：https://chaofayin.com/',
      '本项目源码（AGPL-3.0-or-later）：\nhttps://github.com/lanshufan/mini-chaoshanhua'
    ].join('\n\n');
    wx.showModal({title:'关于与资料来源',content:sources,confirmText:'复制来源',cancelText:'关闭',success(result) {
      if(result.confirm) wx.setClipboardData({data:sources});
    }});
  },
  clearHistory() { this.setData({history:[]}); try { wx.removeStorageSync('teochew-history'); } catch (_) {} },
  onHide() { this.stopAudio(); },
  onUnload() { this.requestVersion=(this.requestVersion || 0)+1; const audio=this.audio;this.audio=null;if(audio) audio.destroy(); }
});
