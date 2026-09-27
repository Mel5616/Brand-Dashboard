import json,base64,os,re,sys,urllib.request,urllib.error
sys.path.insert(0,'.')
from brandq import *
D=os.path.dirname(os.path.abspath(__file__)); A='ck/ckfull/assets/'
BR={'Frida':(151722655837,'https://www.faire.com/brand/b_52hw6ftb47','ck-frida.jpg',['stockists']),
 'Matchstick Monkey':(142896791615,'https://www.faire.com/brand/b_b28byvvrcg','ck-mm-life.jpg',[]),
 'Mamave':(136647475407,'https://faire.com/direct/mamave','ck-mamave.jpg',['stockist']),
 'Hannie':(188567322878,'https://www.faire.com/brand/b_mxerpjq58h','ck-hannie.jpg',['stockist']),
 'ZAZU':(161228554470,'https://www.faire.com/brand/b_d2cwz2ac3a','ck-zazu.jpg',['stockists','become-a-stockist']),
 'Magic':(162573254880,'https://www.faire.com/brand/b_sac4k63prj','ck-magic-life.jpg',['stockists']),
 'MiaMily':(155009384622,'https://www.faire.com/brand/b_arjucws7rh','ck-m-travel.jpg',['authorised-stockist'])}
snip=open(D+'/faire-wholesale.liquid').read(); secsrc=open(D+'/faire-wholesale-section.liquid').read()
for b in cfg['brands']:
    if b['name'] not in BR: continue
    name=b['name']; tid,url,img,tpls=BR[name]; t=store_token(b)
    H={"X-Shopify-Access-Token":t,"Content-Type":"application/json"}
    U=f"https://{b['domain']}/admin/api/2025-07/themes/{tid}/assets.json"
    def put(asset):
        urllib.request.urlopen(urllib.request.Request(U,data=json.dumps({'asset':asset}).encode(),method='PUT',headers=H),timeout=90)
    def get(key):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(U+'?asset[key]='+key,headers=H),timeout=60))['asset']['value']
        except urllib.error.HTTPError: return None
    put({'key':'snippets/faire-wholesale.liquid','value':snip})
    put({'key':'sections/faire-wholesale.liquid','value':secsrc})
    put({'key':'assets/faire-wholesale.jpg','attachment':base64.b64encode(open(A+img,'rb').read()).decode()})
    call=f"{{% render 'faire-wholesale', brand: '{name}', url: '{url}' %}}"
    put({'key':'templates/page.wholesale.liquid','value':call+"\n{% if page.content != blank %}<div style=\"max-width:900px;margin:0 auto 56px;padding:0 20px\">{{ page.content }}</div>{% endif %}\n"})
    done=[]
    for w in tpls:
        for ext in ('json','liquid'):
            key=f'templates/page.{w}.{ext}'; v=get(key)
            if v is None: continue
            os.makedirs(f"{D}/backup/{name}",exist_ok=True); open(f"{D}/backup/{name}/page.{w}.{ext}",'w').write(v)
            if 'faire-wholesale' in v: done.append(key+' (already)'); break
            if ext=='json':
                j=json.loads(re.sub(r'^\s*/\*.*?\*/','',v,flags=re.S))
                j['sections']['faire_wholesale']={'type':'faire-wholesale','settings':{'brand':name,'url':url}}
                j['order'].append('faire_wholesale')
                put({'key':key,'value':json.dumps(j,indent=2)})
            else:
                put({'key':key,'value':v.rstrip()+"\n"+call+"\n"})
            done.append(key); break
    pg=gql(b,t,'{pages(first:1,query:"handle:wholesale"){nodes{id handle}}}')['data']['pages']['nodes']
    if not pg:
        r=gql(b,t,'mutation($p:PageCreateInput!){pageCreate(page:$p){page{handle} userErrors{message}}}',{'p':{'title':'Wholesale','handle':'wholesale','templateSuffix':'wholesale','isPublished':True,
            'body':f'<p>{name} is distributed in Australia by Coolkidz Australia. Retailers can order through Faire above, or <a href="https://coolkidz.com.au/pages/become-a-stockist">apply for a Coolkidz trade account</a> for larger orders.</p>'}})
        pg_res=r.get('data',{}).get('pageCreate') or r
    else: pg_res='exists'
    print(name,'| templates:',done,'| page:',pg_res)
