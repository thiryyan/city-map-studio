import pathlib
T=pathlib.Path(__file__).resolve().parent
ROOT=T.parent
APP_URL=(ROOT/'index.html').as_uri()
import os
CHROME=os.environ.get('CHROME') or None  # Chrome/Chromium ; vide = Chromium de Playwright
import json, math, random
random.seed(3)
lat0, lon0 = 47.5861, 1.3359
els=[]; nid=[1]
def W(tags, pts):
    nid[0]+=1; els.append({"type":"way","id":nid[0],"tags":tags,"geometry":[{"lat":a,"lon":b} for a,b in pts]})
# river: two banks as relation members (open chains) + island inner
north=[(lat0-0.004+0.0015*math.sin(i/6), lon0-0.03+i*0.002) for i in range(31)]
south=[(lat-0.0035, lon) for lat,lon in north]
seg1=north[:16]; seg2=north[15:]; seg3=list(reversed(south))
closeA=[south[-1], north[-1]]; closeB=[north[0], south[0]]
island=[(lat0-0.0055,lon0-0.004),(lat0-0.0050,lon0+0.002),(lat0-0.0060,lon0+0.004),(lat0-0.0066,lon0-0.002),(lat0-0.0055,lon0-0.004)]
mem=lambda pts,role:{"type":"way","ref":0,"role":role,"geometry":[{"lat":a,"lon":b} for a,b in pts]}
els.append({"type":"relation","id":9,"tags":{"natural":"water","type":"multipolygon"},"members":[mem(seg2,"outer"),mem(closeB,"outer"),mem(seg1,"outer"),mem(seg3,"outer"),mem(closeA,"outer"),mem(island,"inner")]})
W({"waterway":"river"}, [((a+b[0])/2, b[1]) for a,b in zip([p[0] for p in north],south)])
# grid streets
for i in range(-14,15):
    la=lat0+i*0.0012; cls="primary" if i%7==0 else ("tertiary" if i%3==0 else "residential")
    W({"highway":cls}, [(la+random.uniform(-.0002,.0002), lon0-0.03+j*0.006) for j in range(11)])
    lo=lon0+i*0.0018; cls="secondary" if i%5==0 else "residential"
    W({"highway":cls}, [(lat0-0.02+j*0.004, lo+random.uniform(-.0002,.0002)) for j in range(11)])
W({"highway":"motorway"},[(lat0+0.012-k*0.002,lon0-0.03+k*0.006) for k in range(11)])
W({"highway":"footway"},[(lat0+0.003,lon0-0.004),(lat0+0.006,lon0+0.002)])
W({"railway":"rail"},[(lat0+0.015,lon0-0.03),(lat0+0.005,lon0+0.03)])
for k in range(4):
    a,b=lat0+0.004+k*0.003,lon0-0.012+k*0.006
    W({"leisure":"park"},[(a,b),(a+0.0018,b),(a+0.0018,b+0.0025),(a,b+0.0025),(a,b)])
for k in range(300):
    a=lat0+random.uniform(-0.015,0.015); b=lon0+random.uniform(-0.02,0.02)
    if abs(a-(lat0-0.0058))<0.003: continue
    W({"building":"yes"},[(a,b),(a+0.0003,b),(a+0.0003,b+0.0004),(a,b+0.0004),(a,b)])
json.dump({"elements":els},open(str(T/'overpass.json'),"w"))
print(len(els))
