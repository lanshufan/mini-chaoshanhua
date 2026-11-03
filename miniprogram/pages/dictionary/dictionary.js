const { lookup } = require('../../data/dictionary');
Page({
  data:{ input:'',count:0,result:null,active:null,selected:-1,playing:'',loading:false,error:'',history:[],suggestions:['你好','食','茶','谢谢','新年快乐'] },
  onLoad() {
    try { const history=wx.getStorageSync('teochew-history'); if(Array.isArray(history)) this.setData({history:history.filter(x=>typeof x==='string').slice(0,8)}); } catch (_) {}
    this.audio=wx.createInnerAudioContext();
    this.audio.onEnded(()=>this.setData({playing:''}));
    this.audio.onError(()=>{ this.setData({playing:''}); wx.showToast({title:'音频暂时无法播放',icon:'none'}); });
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
  stopAudio() { if(this.audio) this.audio.stop(); this.setData({playing:''}); },
  play(e) {
    const reading=this.data.active.readings.find(item=>item.id===e.currentTarget.dataset.id);
    if(!reading || !reading.audio) return;
    if(this.data.playing===reading.id) { this.stopAudio(); return; }
    this.stopAudio(); this.audio.src=reading.audio; this.setData({playing:reading.id}); this.audio.play();
  },
  clearHistory() { this.setData({history:[]}); try { wx.removeStorageSync('teochew-history'); } catch (_) {} },
  onHide() { this.stopAudio(); },
  onUnload() { this.requestVersion=(this.requestVersion || 0)+1; if(this.audio) this.audio.destroy(); }
});
