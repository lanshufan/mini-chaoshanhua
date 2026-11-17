// All untrusted values use execute() placeholders; SQL identifiers are fixed.
import {fail} from './security.js';
export function createStore(pool){
  const query=async(sql,args=[])=>{const [rows]=await pool.execute(sql,args);return rows;};
  return {
    ready:()=>query('SELECT 1 FROM feedback_items LIMIT 1'),
    admin:async name=>(await query('SELECT id, username, display_name, password_hash FROM feedback_admins WHERE username=? AND enabled=1',[name]))[0],
    activeAdmin:async key=>(await query('SELECT id FROM feedback_admins WHERE id=? AND enabled=1',[key]))[0],
    user:async(app,hash)=>{await query('INSERT INTO feedback_users (app_id,identity_hash) VALUES (?,?) ON DUPLICATE KEY UPDATE id=id',[app,hash]);return (await query('SELECT id FROM feedback_users WHERE app_id=? AND identity_hash=?',[app,hash]))[0].id;},
    list:async(user,status,before)=>{
      const conditions=['id < ?'],args=[before];
      if(user){conditions.push('user_id=?');args.push(user);}
      if(status){conditions.push('status=?');args.push(status);}
      return query(`SELECT id, content, category, related_word, status, created_at, updated_at, last_public_reply_at, user_read_at, version FROM feedback_items WHERE ${conditions.join(' AND ')} ORDER BY id DESC LIMIT 30`,args);
    },
    create:async(user,data,privacy)=>{
      try {const result=await query('INSERT INTO feedback_items (user_id,request_id,category,content,related_word,privacy_version,consented_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(3))',[user,data.requestId,data.category,data.content,data.relatedWord,privacy]);return String(result.insertId);}
      catch(error){if(error.code!=='ER_DUP_ENTRY')throw error;const [existing]=await query('SELECT id,content,category,related_word FROM feedback_items WHERE user_id=? AND request_id=?',[user,data.requestId]);if(!existing||existing.content!==data.content||existing.category!==data.category||existing.related_word!==data.relatedWord)fail(409,'重复提交编号与内容不一致');return String(existing.id);}
    },
    detail:async(key,user)=>{
      const rows=await query('SELECT id,content,category,related_word,status,created_at,updated_at,version FROM feedback_items WHERE id=?'+(user?' AND user_id=?':''),user?[key,user]:[key]);
      if(!rows.length)fail(404,'反馈不存在');
      // Mark read before selecting replies; a concurrent later reply remains unread.
      if(user)await query('UPDATE feedback_items SET user_read_at=UTC_TIMESTAMP(3), updated_at=updated_at WHERE id=? AND user_id=?',[key,user]);
      const replies=await query('SELECT id,visibility,content,created_at FROM feedback_replies WHERE feedback_id=?'+(user?" AND visibility='public'":'')+' ORDER BY id ASC LIMIT 300',[key]);
      const history=await query('SELECT from_status,to_status,created_at FROM feedback_status_history WHERE feedback_id=? ORDER BY id ASC LIMIT 300',[key]);
      return {...rows[0],replies,history};
    },
    change:async(key,admin,data)=>{
      const conn=await pool.getConnection();
      try {await conn.beginTransaction();const [rows]=await conn.execute('SELECT status,version FROM feedback_items WHERE id=? FOR UPDATE',[key]);if(!rows.length)fail(404,'反馈不存在');const row=rows[0];if(row.version!==data.version)fail(409,'反馈已被修改，请刷新后重试');
        if(data.content){await conn.execute('INSERT INTO feedback_replies (feedback_id,admin_id,visibility,content) VALUES (?,?,?,?)',[key,admin,data.visibility,data.content]);if(data.visibility==='public')await conn.execute('UPDATE feedback_items SET last_public_reply_at=UTC_TIMESTAMP(3) WHERE id=?',[key]);}
        if(data.status&&data.status!==row.status){await conn.execute('INSERT INTO feedback_status_history (feedback_id,admin_id,from_status,to_status) VALUES (?,?,?,?)',[key,admin,row.status,data.status]);await conn.execute("UPDATE feedback_items SET status=?, resolved_at=IF(? IN ('resolved','closed'),UTC_TIMESTAMP(3),NULL), purge_after=NULL WHERE id=?",[data.status,data.status,key]);}
        await conn.execute('UPDATE feedback_items SET version=version+1,updated_at=UTC_TIMESTAMP(3) WHERE id=?',[key]);await conn.commit();
      }catch(error){await conn.rollback();throw error;}finally{conn.release();}
    },
    remove:async(key,user)=>{const result=await query('DELETE FROM feedback_items WHERE id=? AND user_id=?',[key,user]);if(!result.affectedRows)fail(404,'反馈不存在');}
  };
}
