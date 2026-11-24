"""Dérive de tests/osm.json les autres formats d'import du moteur Fichier, et la page de test de l'aperçu intégré.

tests/data.osm (XML OSM : nœuds, chemins à références, relations multipolygones), tests/data.geojson
(FeatureCollection) et tests/frame.html (l'application dans une iframe, pour tests/offline.py). Lancé par
tests/run_all.py après tests/fixture.py.
"""
import json, pathlib
T=pathlib.Path(__file__).resolve().parent
d=json.load(open(T/'osm.json'))
nodes={}; xml=['<?xml version="1.0"?><osm version="0.6">']; ways=[]; rels=[]
nid=[100000]; wid=[500000]
def node(g):
    k=(g['lat'],g['lon'])
    if k not in nodes: nid[0]+=1; nodes[k]=nid[0]
    return nodes[k]
def tagx(t): return ''.join(f'<tag k="{k}" v="{v}"/>' for k,v in t.items())
for e in d['elements']:
    if e['type']=='way':
        refs=[node(g) for g in e['geometry']]
        ways.append(f'<way id="{e["id"]}">'+''.join(f'<nd ref="{r}"/>' for r in refs)+tagx(e['tags'])+'</way>')
    else:
        mem=[]
        for m in e['members']:
            wid[0]+=1; refs=[node(g) for g in m['geometry']]
            ways.append(f'<way id="{wid[0]}">'+''.join(f'<nd ref="{r}"/>' for r in refs)+'</way>')
            mem.append(f'<member type="way" ref="{wid[0]}" role="{m["role"]}"/>')
        rels.append(f'<relation id="{e["id"]}">'+''.join(mem)+tagx(e['tags'])+'</relation>')
xml+= [f'<node id="{i}" lat="{a}" lon="{b}"/>' for (a,b),i in nodes.items()]+ways+rels+['</osm>']
open(T/'data.osm','w').write(''.join(xml))
feats=[]
for e in d['elements']:
    if e['type']=='way':
        c=[[g['lon'],g['lat']] for g in e['geometry']]
        closed=c[0]==c[-1] and len(c)>3
        feats.append({"type":"Feature","properties":e['tags'],"geometry":{"type":"Polygon","coordinates":[c]} if closed else {"type":"LineString","coordinates":c}})
    else:
        polys=[[[ [g['lon'],g['lat']] for g in m['geometry']] for m in e['members']]]
        feats.append({"type":"Feature","properties":e['tags'],"geometry":{"type":"MultiLineString","coordinates":polys[0]}})
json.dump({"type":"FeatureCollection","features":feats},open(T/'data.geojson','w'))
(T/'frame.html').write_text('<iframe src="'+(T.parent/'index.html').as_uri()+'?test'+'" style="width:420px;height:900px"></iframe>')
print('ok')
