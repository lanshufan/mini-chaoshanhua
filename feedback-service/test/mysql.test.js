import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createStore} from '../store.js';
test('isolated MySQL integration: schema, injection, ownership, transaction, deletion', {skip:process.env.FEEDBACK_TEST_MYSQL!=='1'},async()=>{
 const {default:mysql}=await import('mysql2/promise');
 // Deliberately fixed to a disposable localhost instance, never production env vars.
 const pool=mysql.createPool({host:'127.0.0.1',port:23318,user:'root',password:'',connectionLimit:1,supportBigNumbers:true,bigNumberStrings:true,dateStrings:true});
 try{
 const sql=(await readFile(new URL('../schema.sql',import.meta.url),'utf8')).replace(/^--.*$/gm,'');for(const statement of sql.split(';').map(x=>x.trim()).filter(Boolean))await pool.query(statement);
 const store=createStore(pool);await store.ready();
 const user=await store.user('integration-test',Buffer.alloc(32,1)),other=await store.user('integration-test',Buffer.alloc(32,2));
 const [result]=await pool.execute('INSERT INTO feedback_admins (username,password_hash,display_name) VALUES (?,?,?)',['integration-'+Date.now(),'unused-test-hash','test']);
 const data={requestId:'aaaaaaaa-aaaa-4aaa-aaaa-'+Date.now().toString().padStart(12,'0').slice(-12),category:'other',content:"'); DROP TABLE feedback_items; -- <script>alert(1)</script>",relatedWord:null};
 const key=await store.create(user,data,'v1');assert.equal(await store.create(user,data,'v1'),key);await assert.rejects(store.create(user,{...data,content:'changed'},'v1'),e=>e.status===409);
 assert.equal((await store.detail(key,user)).content,data.content);await assert.rejects(store.detail(key,other),e=>e.status===404);await assert.rejects(store.remove(key,other),e=>e.status===404);
 await store.change(key,String(result.insertId),{version:0,status:'processing',content:'internal secret',visibility:'internal'});assert.equal((await store.detail(key,user)).replies.length,0);
 await store.change(key,String(result.insertId),{version:1,status:'resolved',content:'已修复',visibility:'public'});const item=await store.detail(key,user);assert.equal(item.status,'resolved');assert.equal(item.replies.length,1);assert.equal(item.history.length,2);
 await assert.rejects(store.change(key,String(result.insertId),{version:1,status:'closed'}),e=>e.status===409);assert.equal((await store.detail(key,user)).status,'resolved');
 await store.remove(key,user);for(const table of ['feedback_replies','feedback_status_history']){const [rows]=await pool.execute(`SELECT COUNT(*) AS n FROM ${table} WHERE feedback_id=?`,[key]);assert.equal(String(rows[0].n),'0');}
 await pool.execute('DELETE FROM feedback_admins WHERE id=?',[result.insertId]);await pool.execute('DELETE FROM feedback_users WHERE app_id=?',['integration-test']);
 }finally{await pool.end();}
});
