import {database} from './db.js';
import {hashPassword,string} from './security.js';
// Accept credentials via stdin JSON, not command-line arguments or checked-in files.
let raw='';for await(const chunk of process.stdin){raw+=chunk;if(raw.length>4096)throw new Error('输入过长');}
const data=JSON.parse(raw),username=string(data.username,1,64,'用户名'),password=string(data.password,16,256,'密码'),name=string(data.displayName||'管理员',1,64,'显示名称');
const pool=database();try{await pool.execute('INSERT INTO feedback_admins (username,password_hash,display_name) VALUES (?,?,?)',[username,await hashPassword(password),name]);console.log('管理员已创建');}catch(e){console.error(e.code==='ER_DUP_ENTRY'?'用户名已存在':'创建失败，请检查配置和输入');process.exitCode=1;}finally{await pool.end();}
