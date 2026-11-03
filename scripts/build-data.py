import sys,json,pathlib,re,os
root=pathlib.Path(__file__).resolve().parents[1]
vendor=root/'vendor/pujbase'
sys.path[:0]=[str(vendor),str(vendor/'libpuj')]
import yaml
from libpuj.pujcommon import Pronunciation
from libpuj.convert import load_accents,convert
from libpuj import pujpb as pb
from libpuj import generate_entries_db
os.chdir(vendor/'libpuj')
generate_entries_db.main()
accents=load_accents(vendor/'dist/accents.pb')
source=pb.Entries(); source.ParseFromString((vendor/'dist/entries.pb').read_bytes())
regions=[('shantou','汕头','ShanTou_ShiQu'),('chenghai','汕头澄海','ChengHai_ChengCheng'),('chaoyang','汕头潮阳','ChaoYang_MianCheng'),('chaozhou','潮州','ChaoZhou_FuCheng'),('jieyang','揭阳','JieYang_RongCheng')]
chars={}
for e in source.entries:
 for char in set([e.char,e.char_sim]):
  if not char: continue
  entry=chars.setdefault(char,{'readings':{r[0]:[] for r in regions},'meanings':[]})
  meanings=[d.meaning for d in e.details if d.meaning]
  entry['meanings']=list(dict.fromkeys(entry['meanings']+meanings))
  for rid,name,aid in regions:
   pron=Pronunciation.from_pb(e.pron)
   if e.sp_nasal==2 or (e.sp_nasal==1 and aid in e.accents_nasalized):
    if 'nn' not in pron.final: pron.final += 'nn'
   variants=[accents[aid].fuzzy_result(pron)]
   for aka in e.pron_aka:
    if aka.accent_id==aid:
     extras=[Pronunciation.from_pb(p) for p in aka.prons]
     variants=extras if aka.replace else variants+extras
   for p in variants:
    entry['readings'][rid].append({'phonetic':str(p.to_dp()),'category':['常用音','白读','文读','俗读'][e.cat],'frequency':e.freq,'meaning':'；'.join(meanings)})
for entry in chars.values():
 for rid in entry['readings']:
  values=sorted(entry['readings'][rid],key=lambda p:(p['frequency'] if p['frequency']>=0 else 1,p['category']=='文读'))
  unique=[]
  for v in values:
   if v not in unique: unique.append(v)
  entry['readings'][rid]=unique
phrases={}
for row in yaml.safe_load((vendor/'data/phrases.yml').read_text(encoding='utf-8')):
 for key,details in row.items():
  words,prons,mandarin,*_=key.split('|')
  details=details or {}
  readings={}
  for rid,name,aid in regions:
   readings[rid]=[]
   for pron in prons.split('/'):
    converted, errors=convert(pron,source='apuj',target='dp',fuzzy_rule=accents[aid])
    if errors: raise ValueError((key, errors))
    readings[rid].append(converted)
  for word in words.split('/'):
   if not re.fullmatch(r'[\u3400-\u9fff\uf900-\ufaff\U00020000-\U000323af]{1,10}',word): continue
   phrases.setdefault(word,[]).append({'readings':readings,'meaning':details.get('desc') or mandarin or '', 'word':word})
data={'source':{'name':'PUJDICT / pujbase','url':'https://github.com/pujdict/pujbase','revision':'fe84c5fc82436bf27dafb9b8b987628b53deed14','license':'CC-BY-SA-4.0','notation':'潮州话拼音（数字为调类，非实际调值）'},'regions':[{'id':rid,'name':name,'point':accents[aid].area+accents[aid].subarea} for rid,name,aid in regions],'characters':chars,'phrases':phrases}
(root/'server/data/dictionary.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(json.dumps({'characters':len(chars),'phrases':len(phrases)},ensure_ascii=False))
