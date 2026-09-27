import sys,json,time
from brandq import *
from ckgql import gql as ckq
DRY='--go' not in sys.argv
mb=next(b for b in cfg['brands'] if b['name']=='Mamave'); mt=store_token(mb)
src={}
for p in gql(mb,mt,'{products(first:100,query:"status:active"){nodes{title handle media(first:20){nodes{... on MediaImage{alt image{url}}}} variants(first:20){nodes{sku}}}}}')['data']['products']['nodes']:
    for v in p['variants']['nodes']:
        if v['sku']: src[v['sku'].strip().lower()]=p
ck=ckq('{products(first:50,query:"vendor:Mamave"){nodes{id title status media(first:30){nodes{id}} source: metafield(namespace:"coolkidz",key:"source"){value} variants(first:20){nodes{sku}}}}}')['data']['products']['nodes']
for p in ck:
    m=next((src[v['sku'].strip().lower()] for v in p['variants']['nodes'] if v['sku'] and v['sku'].strip().lower() in src),None)
    if not m and p['source'] and p['source']['value'].startswith('Mamave:'):
        h=p['source']['value'].split(':',1)[1]; m=next((x for x in src.values() if x['handle']==h),None)
    imgs=[n for n in (m or {}).get('media',{}).get('nodes',[]) if n.get('image')]
    print(f"{p['title'][:40]:40} {p['status']:8} -> {(m or {}).get('title','NO MATCH')[:35]:35} {len(p['media']['nodes'])} -> {len(imgs)} images")
    if DRY or not imgs: continue
    old=[n['id'] for n in p['media']['nodes']]
    r=ckq('mutation($p:ID!,$m:[CreateMediaInput!]!){productCreateMedia(productId:$p,media:$m){media{id} mediaUserErrors{message}}}',
          {'p':p['id'],'m':[{'originalSource':n['image']['url'].split('?')[0],'mediaContentType':'IMAGE','alt':n.get('alt') or m['title']} for n in imgs]})['data']['productCreateMedia']
    if r['mediaUserErrors']: print('   !',r['mediaUserErrors']); continue
    if old:
        d=ckq('mutation($p:ID!,$ids:[ID!]!){productDeleteMedia(productId:$p,mediaIds:$ids){deletedMediaIds mediaUserErrors{message}}}',{'p':p['id'],'ids':old})['data']['productDeleteMedia']
        if d['mediaUserErrors']: print('   ! delete',d['mediaUserErrors'])
    time.sleep(0.5)
