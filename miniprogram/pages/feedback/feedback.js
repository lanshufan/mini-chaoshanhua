const service=require('../../utils/feedback');
const states={pending:'待处理',processing:'处理中',resolved:'已解决',closed:'已关闭'};
const date=v=>v?String(v).replace('T',' ').slice(0,16)+' UTC':'';
const uuid=()=> 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const n=Math.floor(Math.random()*16);return(c==='x'?n:(n&3|8)).toString(16);});
Page({
  data:{mode:'list',items:[],loading:false,error:'',more:false,content:'',count:0,categoryIndex:3,categories:['读音问题','释义问题','补充词条','其他建议'],detail:null,sending:false},
  onLoad(){this.load();},
  async load(append=false){this.setData({loading:true,error:''});try{const items=this.data.items,before=append&&items.length?'?before='+items[items.length-1].id:'';const r=await service.api('/api/feedback'+before);const rows=r.items.map(x=>({...x,statusText:states[x.status],time:date(x.created_at),unread:!!x.last_public_reply_at&&(!x.user_read_at||x.last_public_reply_at>x.user_read_at)}));this.setData({items:append?items.concat(rows):rows,more:rows.length===30});}catch(e){this.setData({error:e.message});}finally{this.setData({loading:false});}},
  onPullDownRefresh(){const action=this.load();Promise.resolve(action).finally(()=>wx.stopPullDownRefresh());},
  retry(){this.load();},
  more(){if(!this.data.loading)this.load(true);},
  add(){this.requestId=uuid();this.setData({mode:'new',content:'',count:0,error:''});},
  input(e){const content=Array.from(e.detail.value).slice(0,500).join('');this.setData({content,count:Array.from(content).length});},
  category(e){this.setData({categoryIndex:Number(e.detail.value)});},
  async submit(){if(this.data.sending||!this.data.content.trim())return;this.setData({sending:true,error:''});try{await service.api('/api/feedback','POST',{requestId:this.requestId,content:this.data.content,category:['pronunciation','meaning','new_word','other'][this.data.categoryIndex]});this.setData({mode:'list',content:'',count:0});wx.showToast({title:'反馈已提交'});await this.load();}catch(e){this.setData({error:e.message});}finally{this.setData({sending:false});}},
  async open(e){this.setData({loading:true,error:''});try{const item=await service.api('/api/feedback/'+e.currentTarget.dataset.id);this.setData({mode:'detail',detail:{...item,statusText:states[item.status],time:date(item.created_at),replies:item.replies.map(r=>({...r,time:date(r.created_at)})),history:item.history.map(h=>({...h,text:states[h.from_status]+' → '+states[h.to_status],time:date(h.created_at)}))}});}catch(e){this.setData({error:e.message});}finally{this.setData({loading:false});}},
  back(){if(this.data.sending)return;this.setData({mode:'list',error:''});this.load();},
  remove(){const id=this.data.detail.id;wx.showModal({title:'删除这条反馈？',content:'反馈内容和关联回复将一并删除，无法恢复。',success:async r=>{if(!r.confirm)return;try{await service.api('/api/feedback/'+id,'DELETE');this.back();}catch(e){this.setData({error:e.message});}}});}
});
