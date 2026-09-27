import ckgql,json,urllib.request
T=lambda v:{'column':'type','relation':'equals','condition':v}
V=lambda v:{'column':'vendor','relation':'equals','condition':v}
TI=lambda v:{'column':'title','relation':'contains','condition':v}
CATS=[
 ('prams-and-strollers','Prams and strollers','Prams, strollers and stroller-trikes from UPPAbaby, smarTrike and more.',[T('Pram'),T('Stroller'),T('Rumbleseat'),T('Trike'),TI('Pram With'),TI('smarTrike Wonder')]),
 ('capsules-and-car-seats','Capsules and car seats','Infant capsules, bases and adapters.',[TI('Car Seat Capsule'),T('Car Seat Base'),T('Car Seat Adapter'),T('Car Seat Protector')]),
 ('stroller-wagons','Stroller wagons','WonderFold stroller wagons for two to six children, plus covers and add-ons.',[T('Stroller Wagon'),T('Wagon Accessories'),V('WonderFold')]),
 ('cots-and-nursery-furniture','Cots and nursery furniture','Cots, dressers, change stations, wardrobes and nursing chairs.',[T('Cot Bed'),T('Dresser'),T('Wardrobe'),T('Changing Station'),T('Rocking & Nursing Chair'),V('Gaia Baby')]),
 ('baby-monitors','Baby monitors','Nanit smart baby monitors, stands and breathing wear.',[V('Nanit')]),
 ('sleep','Sleep','Sleep trainer clocks, white noise, nightlights and projectors.',[V('ZAZU'),T('Sleep Pod'),T('Portable Blackout Curtain'),T('Portacot'),T('White Noise Machine')]),
 ('feeding-and-highchairs','Feeding and highchairs','Highchairs, snack trays and teethers.',[T('Highchair'),T('Snack Tray'),V('Hannie'),T('Teething Toy')]),
 ('travel','Travel','Family luggage, travel bags and cases.',[V('MiaMily'),T('Travel Bag'),T('Travel case'),T('Carry On Suitcase'),T('Check in suitcase')]),
 ('nappy-bins','Nappy bins','Magic nappy bins, lids and bags.',[V('Magic'),T('Nappy Bin')]),
 ('baby-and-mum-care','Baby and mum care','Baby care, postpartum recovery and skincare from Frida and Mamave.',[V('Frida'),V('Mamave')]),
 ('teethers-and-toys','Teethers and toys','Teethers, bath toys and soft toys.',[V('Matchstick Monkey'),T('Bath Toy'),T('Soft Toy'),T('Teething Toy')]),
]
def rest(method,path,body=None):
    r=urllib.request.Request(f"https://{ckgql.ck['domain']}/admin/api/2025-07/{path}",data=json.dumps(body).encode() if body else None,method=method,headers={'X-Shopify-Access-Token':ckgql.tok,'Content-Type':'application/json'})
    return json.load(urllib.request.urlopen(r))
for h,t,d,rules in CATS:
    ex=rest('GET',f'smart_collections.json?handle={h}')['smart_collections']
    body={'smart_collection':{'title':t,'handle':h,'body_html':f'<p>{d}</p>','rules':rules,'disjunctive':True,'published':True,'sort_order':'best-selling'}}
    if ex: body['smart_collection']['id']=ex[0]['id']; c=rest('PUT',f"smart_collections/{ex[0]['id']}.json",body)['smart_collection']
    else: c=rest('POST','smart_collections.json',body)['smart_collection']
    n=rest('GET',f"products/count.json?collection_id={c['id']}&published_status=published")['count']
    print(h,c['id'],n)
