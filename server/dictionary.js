import { readFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
export const database = JSON.parse(readFileSync(new URL('./data/dictionary.json', import.meta.url),'utf8'));
export const audioDirectory = resolve(process.env.AUDIO_DIR || fileURLToPath(new URL('../audio/',import.meta.url)));
export function loadAudio(directory=audioDirectory) {
  const file=resolve(directory,'manifest.json');
  if (!existsSync(file)) return {};
  const manifest=JSON.parse(readFileSync(file,'utf8'));
  for(const [key,value] of Object.entries(manifest)) {
    if(!value || typeof value.file!=='string' || basename(value.file)!==value.file || !/^[a-zA-Z0-9_-]+\.(mp3|wav|m4a)$/.test(value.file) || !value.source || !value.license || !value.speakerRegion || !existsSync(resolve(directory,value.file))) throw new Error(`Invalid audio manifest entry: ${key}`);
  }
  return manifest;
}
export function validate(value) {
  const query=String(value || '').trim();
  if(!query || Array.from(query).length>10 || !/^[\p{Script=Han}]+$/u.test(query)) { const error=new Error('请输入 1–10 个汉字，不含空格、数字或标点'); error.status=400; throw error; }
  return query;
}
export function lookup(value, audio={}) {
  const query=validate(String(value || '').normalize('NFKC').replace(/[\p{P}\s]/gu,''));
  function detail(text) {
    const single=Array.from(text).length===1;
    const character=database.characters[text];
    const phrases=single ? null : database.phrases[text];
    const readings=database.regions.map(region=>{
      const options=single ? (character?.readings[region.id] || []) : (phrases || []).flatMap(p=>p.readings[region.id].map(phonetic=>({phonetic,category:'词条读音',meaning:p.meaning})));
      const reference=Array.from(text).map(char=>database.characters[char]?.readings[region.id]?.[0]?.phonetic || '□').join(' · ');
      const recording=audio[`${region.id}:${text}`];
      return {...region,options,phonetic:options.length ? [...new Set(options.map(x=>x.phonetic))].join(' / ') : (single ? '' : reference),audio:recording ? `/audio/${recording.file}` : '',audioSource:recording?.source || '',audioLicense:recording?.license || ''};
    });
    return {text,pinyin:'',kind:single ? (character?'character':'missing') : (phrases?'phrase':'reference'),note:single?'数字表示调类；文读、白读需按词义选择。':(phrases?'已收录词条；拼音保留词库的连读分组标记。':'未收录完整词条，以下是逐字首选读音参考，不代表实际连读。'),meaning:(single?character?.meanings:phrases?.map(p=>p.meaning).filter(Boolean))?.join('；') || '暂无释义，可查看单字读音。',readings};
  }
  const chars=Array.from(query).map((char,index)=>({char,index,entry:detail(char)}));
  return {query,chars,entry:detail(query),source:database.source};
}
