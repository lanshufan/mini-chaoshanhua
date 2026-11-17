import {randomBytes,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
export const token=()=>randomBytes(32).toString('hex');
export function fail(status,message){throw Object.assign(new Error(message),{status});}
export function string(value,min,max,label){if(typeof value!=='string') fail(400,`${label}格式不正确`);const clean=value.trim();if(Array.from(clean).length<min||Array.from(clean).length>max) fail(400,`${label}应为 ${min}–${max} 字`);return clean;}
export function id(value){if(!/^[1-9][0-9]{0,18}$/.test(String(value))) fail(400,'编号不正确');return String(value);}
export async function hashPassword(password){const salt=randomBytes(16).toString('hex');const hash=await scrypt(password,salt,64);return `scrypt$${salt}$${hash.toString('hex')}`;}
export async function verifyPassword(password,encoded){const parts=String(encoded).split('$');if(parts.length!==3||parts[0]!=='scrypt'||!/^[a-f0-9]{32}$/.test(parts[1])||!/^[a-f0-9]{128}$/.test(parts[2])) return false;const actual=await scrypt(password,parts[1],64);return timingSafeEqual(actual,Buffer.from(parts[2],'hex'));}
export class Sessions {
  constructor(){this.entries=new Map();}
  prune(){const now=Date.now();for(const [key,s] of this.entries) if(s.expires<=now) this.entries.delete(key);}
  create(data,ttl){this.prune();if(this.entries.size>=10000) fail(503,'服务繁忙，请稍后重试');const key=token();this.entries.set(key,{...data,expires:Date.now()+ttl});return key;}
  get(key,kind){const s=this.entries.get(key);if(!s||s.expires<=Date.now()||s.kind!==kind){if(s?.expires<=Date.now())this.entries.delete(key);fail(401,'登录已过期，请重新登录');}return s;}
}
export class Limiter {
  constructor(){this.entries=new Map();}
  take(key,limit,period){const now=Date.now();if(this.entries.size>10000){for(const [k,v] of this.entries)if(v.until<=now)this.entries.delete(k);if(this.entries.size>10000)fail(429,'请求过于频繁，请稍后重试');}let value=this.entries.get(key);if(!value||value.until<=now){value={count:0,until:now+period};this.entries.set(key,value);}if(++value.count>limit)fail(429,'请求过于频繁，请稍后重试');}
}
