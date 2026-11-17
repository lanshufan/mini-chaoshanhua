const { lookup, suggest } = require('../../data/dictionary');
Page({
  openFeedback() { wx.navigateTo({url:'/pages/feedback/feedback'}); },
  data:{ suggestion:'',input:'',count:0,result:null,active:null,selected:-1,playing:'',audioStatus:'',audioLoading:false,loading:false,error:'',history:[],suggestions:['你好','食','茶','谢谢','新年快乐'] },
  onLoad() {
    try { const history=wx.getStorageSync('teochew-history'); if(Array.isArray(history)) this.setData({history:history.filter(x=>typeof x==='string').slice(0,8)}); } catch (_) {}
  },
  audioFailure(stage,error,source) {
    this.stopAudio();
    const code=error.errCode == null ? '未知' : error.errCode;
    const details='阶段：'+stage+'\n错误码：'+code+'\n'+(error.errMsg || error.message || '未提供详细信息')+'\n音频地址：'+source;
    console.error('[audio]',details);
    wx.showToast({title:'播放失败',icon:'none'});
  },
  startAudio(source,id) {
    const version=this.audioVersion=(this.audioVersion || 0)+1;
    const current=()=>this.audioVersion===version;
    const fail=(stage,error)=>{if(current()) this.audioFailure(stage,error,source);};
    this.setData({playing:id,audioStatus:'正在加载…',audioLoading:true});
    this.audioTimer=setTimeout(()=>fail('启动播放超时',{errMsg:'30秒内播放器没有开始播放，请复制详情协助排查。'}),30000);
    let started=false;
    const begin=()=>{
      if(!current() || started) return;
      started=true;
      try {
        const audio=wx.createInnerAudioContext();this.audio=audio;
        audio.onPlay(()=>{
          if(!current()) return;
          clearTimeout(this.audioTimer);this.audioTimer=null;
          this.setData({audioStatus:'正在播放',audioLoading:false});
        });
        audio.onEnded(()=>{if(current()) this.stopAudio();});
        audio.onError(error=>fail('在线播放',error));
        audio.volume=1;
        audio.src=source;
        audio.play();
      } catch(error) {fail('创建播放器',error);}
    };
    try {
      // Best-effort iPhone mute-switch setting. Unsupported runtimes must still play.
      if(wx.setInnerAudioOption) wx.setInnerAudioOption({obeyMuteSwitch:false,speakerOn:true,success:begin,fail:begin});
      else begin();
    } catch(error) {begin();}
  },
  onInput(e) { this.requestVersion=(this.requestVersion || 0)+1;this.setData({suggestion:'',loading:false}); const input=Array.from(e.detail.value).slice(0,10).join(''); this.setData({input,count:Array.from(input).length}); },
  clear() { this.requestVersion=(this.requestVersion || 0)+1; this.setData({loading:false,error:'',suggestion:''}); this.stopAudio(); this.setData({input:'',count:0,result:null,active:null,selected:-1}); },
  async search(options) {
    const version=this.requestVersion=(this.requestVersion || 0)+1;
    this.stopAudio(); this.setData({loading:true,error:'',suggestion:''});
    try {
      const result=await lookup(this.data.input);
      if(version!==this.requestVersion) return;
      this.stopAudio();
      const history=[result.query,...this.data.history.filter(x=>x!==result.query)].slice(0,8);
      this.setData({input:result.query,count:result.chars.length,result,active:result.entry,selected:-1,history});
      try { wx.setStorageSync('teochew-history',history); } catch (_) {}
      if(!(options && options.skipSuggestion===true) && Array.from(result.query).length>3) {
        Promise.resolve().then(()=>suggest(result.query)).then(suggestion=>{
          if(version===this.requestVersion && this.data.input===result.query && suggestion && suggestion!==result.query) this.setData({suggestion});
        }).catch(()=>{});
      }
    } catch(error) { if(version===this.requestVersion) this.setData({error:error.message}); } finally { if(version===this.requestVersion) this.setData({loading:false}); }
  },
  useSuggestion() {
    const input=this.data.suggestion;
    if(!input) return;
    this.setData({input,count:Array.from(input).length,suggestion:''});
    return this.search({skipSuggestion:true});
  },
  useWord(e) { const input=e.currentTarget.dataset.word; this.setData({input,count:Array.from(input).length}); this.search(); },
  selectChar(e) { const selected=Number(e.currentTarget.dataset.index); this.stopAudio(); this.setData({selected,active:this.data.result.chars[selected].entry}); },
  selectAll() { this.stopAudio(); this.setData({selected:-1,active:this.data.result.entry}); },
  releaseAudio() {
    // Invalidate pending setup and native callbacks before destroying the player.
    this.audioVersion=(this.audioVersion || 0)+1;
    if(this.audioTimer) clearTimeout(this.audioTimer);this.audioTimer=null;
    const audio=this.audio;this.audio=null;
    if(audio) audio.destroy();
  },
  stopAudio() { this.releaseAudio();this.setData({playing:'',audioStatus:'',audioLoading:false}); },
  play(e) {
    const reading=this.data.active && this.data.active.readings.find(item=>item.id===e.currentTarget.dataset.id);
    if(!reading || !reading.audio) return;
    if(this.data.playing===reading.id) { if(!this.data.audioLoading) this.stopAudio(); return; }
    this.stopAudio(); this.startAudio(reading.audio,reading.id);
  },
  onShareAppMessage() {
    return {title:'潮汕话词典，查字听乡音',path:'/pages/dictionary/dictionary'};
  },
  showAbout() {
    const sources=[
      '字音资料：PUJDICT 项目贡献者 / pujbase。已转换五地读音并整理简繁字及词条索引。',
      '原始资料：https://github.com/pujdict/pujbase',
      '数据许可：CC BY-SA 4.0\nhttps://creativecommons.org/licenses/by-sa/4.0/',
      '在线参考发音：https://chaofayin.com/',
      '澄海试用参考音频：潮州音字典（www.czyzd.com），仅限后端已核实样例。',
      '本项目源码（AGPL-3.0-or-later）：\nhttps://github.com/lanshufan/mini-chaoshanhua'
    ].join('\n\n');
    wx.showModal({title:'关于与资料来源',content:sources,confirmText:'复制来源',cancelText:'关闭',success(result) {
      if(result.confirm) wx.setClipboardData({data:sources});
    }});
  },
  clearHistory() { this.setData({history:[]}); try { wx.removeStorageSync('teochew-history'); } catch (_) {} },
  onHide() { this.stopAudio(); },
  onUnload() { this.requestVersion=(this.requestVersion || 0)+1; this.releaseAudio(); }
});
