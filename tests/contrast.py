"""e2e : contrastes de l'interface (WCAG 2.2, critères 1.4.3 et 1.4.11).

Mesure, sur le rendu réel, le contraste de chaque texte visible de l'interface (chaque onglet, sections Avancé
dépliées, Mes affiches et résultat de l'export dans l'onglet Export), sur mobile et sur ordinateur, et à l'agrandissement A+ :
- texte courant : 4,5:1 au moins ; grand texte (24 px, ou 18,66 px en gras) : 3:1 ;
- texte d'un bouton inactif (disabled) : exempté par les WCAG, mais tenu ici à 3:1 pour rester lisible ;
- composants non textuels : pastilles d'état (prêt, chargement, attente, erreur), bordure des champs, icônes des boutons
  (actifs ou non) : 3:1.
États forcés : lignes masquées sur l'affiche, réduction signalée, boutons inactifs, diagnostic réseau en échec.
La couleur du texte tient compte de l'opacité de ses ancêtres ; le fond est celui du premier ancêtre opaque
(les textes posés sur l'aperçu de l'affiche, une image ou un dégradé sont ignorés : ils ne dépendent pas de l'interface).
"""
import pathlib, os, asyncio
from playwright.async_api import async_playwright
from seed import seed
T = pathlib.Path(__file__).resolve().parent
APP = (T.parent / 'index.html').as_uri() + '?test'
CHROME = os.environ.get('CHROME') or None
FIX = open(T / 'osm.json').read()

AUDIT = r"""(()=>{
  const parse=c=>{ const m=c.match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return [p[0],p[1],p[2],p.length>3?p[3]:1]; };
  const lin=v=>{ v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4); };
  const L=c=>0.2126*lin(c[0])+0.7152*lin(c[1])+0.0722*lin(c[2]);
  const ratio=(a,b)=>{ const x=L(a), y=L(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); };
  const mix=(f,b,a)=>[0,1,2].map(i=>f[i]*a+b[i]*(1-a));
  const opacity=el=>{ let o=1; for(let e=el;e;e=e.parentElement) o*=+getComputedStyle(e).opacity; return o; };
  const visible=el=>{ const r=el.getBoundingClientRect(); if(r.width<1||r.height<1) return false; const s=getComputedStyle(el); return s.visibility!=='hidden' && s.display!=='none' && opacity(el)>0.05; };
  /** Fond opaque derrière l'élément ; null s'il est sur une image, un canevas ou un dégradé */
  const bgOf=el=>{ let layers=[];
    for(let e=el;e;e=e.parentElement){ const s=getComputedStyle(e);
      if(s.backgroundImage!=='none' && !e.matches('input[type=range]')) return null;
      if(['CANVAS','IMG'].includes(e.tagName) || e.id==='poster' || e.id==='stage') return null;
      const c=parse(s.backgroundColor); if(c && c[3]>0){ layers.push(c); if(c[3]>=1) break; } }
    let base=[22,22,26]; for(const c of layers.reverse()) base=mix(c,base,c[3]); return base; };
  const out=[], seen=new Set();
  const label=el=>(el.id?'#'+el.id:el.tagName.toLowerCase()+(el.className&&typeof el.className==='string'?'.'+el.className.trim().split(/\s+/).join('.'):''))+' « '+(el.innerText||el.value||'').trim().slice(0,30)+' »';
  // Textes : tout élément visible qui porte un nœud texte non vide
  const all=[...document.querySelectorAll('body *')].filter(el=>!el.closest('dialog:not([open])') && !el.closest('[hidden]'));
  const inModal=document.querySelector('dialog[open]');
  for(const el of all){
    if(inModal && !el.closest('dialog[open]')) continue;   // fenêtre ouverte : l'arrière-plan est inerte
    const own=[...el.childNodes].some(n=>n.nodeType===3 && n.textContent.trim()) || (el.matches('input[type=text],input[type=number],input:not([type]),select,textarea') && (el.value||'').trim());
    if(!own || !visible(el) || seen.has(el)) continue; seen.add(el);
    const s=getComputedStyle(el), fg=parse(s.color), bg=bgOf(el); if(!fg || !bg) continue;
    const disabled=el.closest('[disabled]') || el.matches(':disabled');
    const off=el.closest('label.f.show:has(input:not(:checked))+input+.tsz, label.f.show:has(input:not(:checked))+.row+.tsz');   // taille d'une ligne masquée sur l'affiche
    const a=fg[3]*opacity(el), col=mix(fg,bg,a), r=ratio(col,bg);
    const px=parseFloat(s.fontSize), bold=+s.fontWeight>=700, large=px>=24 || (bold && px>=18.66);
    const need=disabled||off ? 3 : large ? 3 : 4.5;
    if(r<need-0.005) out.push({el:label(el), r:+r.toFixed(2), need, px});
  }
  // Composants non textuels
  const nt=(sel,need,fgProp='backgroundColor')=>document.querySelectorAll(sel).forEach(el=>{ if(!visible(el)) return;
    const fg=parse(getComputedStyle(el)[fgProp]), bg=bgOf(el.parentElement); if(!fg||!bg) return; const r=ratio(mix(fg,bg,fg[3]*opacity(el)),bg);
    if(r<need-0.005) out.push({el:label(el)+' (composant)', r:+r.toFixed(2), need}); });
  nt('#stDot',3); nt('input[type=text],input[type=search],input[type=number],select',3,'borderTopColor');
  // Icônes (SVG en currentColor) des boutons, actifs ou non : 3:1
  document.querySelectorAll('button:has(> svg), label.btn:has(> svg)').forEach(el=>{ if(!visible(el) || el.closest('[hidden]') || (inModal && !el.closest('dialog[open]'))) return;
    const fg=parse(getComputedStyle(el).color), bg=bgOf(el); if(!fg||!bg) return; const r=ratio(mix(fg,bg,fg[3]*opacity(el)),bg);
    if(r<3-0.005) out.push({el:label(el)+' (icône)', r:+r.toFixed(2), need:3}); });
  return out;
})()"""

DOTS = r"""(()=>{ const d=document.getElementById('stDot'), cls=['','busy','wait','err'], res={};
  const prev=d.className; for(const c of cls){ d.className='dot '+c; res[c||'ok']=getComputedStyle(d).backgroundColor; } d.className=prev; return res; })()"""


async def main():
    fails = []
    def check(cond, msg):
        print('✓' if cond else '✗', msg)
        if not cond: fails.append(msg)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        async def route(r):
            if r.request.url.startswith('file:'): await r.continue_()
            else: await r.abort()
        for name, vp, mobile in [('mobile', {'width': 390, 'height': 844}, True), ('ordinateur', {'width': 1400, 'height': 900}, False)]:
            ctx = await b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1, accept_downloads=True)
            page = await ctx.new_page(); errs = []
            page.on('pageerror', lambda e: errs.append(str(e)))
            await page.route('**/*', route)
            await seed(page, APP)
            await page.evaluate("f=>{__cms.setEngine('file'); __cms.importText(f,'osm.json')}", FIX); await page.wait_for_timeout(500)
            if mobile: await page.evaluate("__cms.setSheet('full')"); await page.wait_for_timeout(300)
            # États atténués ou en couleur : lignes masquées (cases décochées), réduction signalée, boutons inactifs
            # (Annuler, Rétablir, A−, un bouton .btn), diagnostic réseau en échec (texte d'erreur)
            await page.evaluate("""(()=>{ for(const k of ['show.date','show.names']){ const c=document.querySelector(`[data-k="${k}"]`); c.checked=false; c.dispatchEvent(new Event('input')); }
                const d=document.querySelector('[data-k="texts.dedication"]'); d.value='Là où tout a commencé, un soir de juillet sur les quais de la Loire, au coucher du soleil, main dans la main'; d.dispatchEvent(new Event('input')); })()""")
            await page.evaluate("__cms.showTab('lieu')"); await page.evaluate("__cms.runDiagnostics()"); await page.wait_for_timeout(1500)
            DIS = "['bUndo','bRedo','bUiSmaller','bDiag'].forEach(id=>document.getElementById(id).disabled=true); document.getElementById('toast').classList.remove('show')"
            bad = {}
            for tab in ['lieu', 'textes', 'style', 'repere', 'export']:
                await page.evaluate(f"__cms.showTab('{tab}')")
                await page.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)"); await page.evaluate(DIS); await page.wait_for_timeout(400)
                for f in await page.evaluate(AUDIT): bad.setdefault(f['el'], f)
            # Onglet Export après un export : encart du résultat (aperçu, informations, téléchargement)
            async with page.expect_download(timeout=120000) as dl: await page.evaluate("__cms.showTab('export')"); await page.click('#bExport')
            await dl.value; await page.wait_for_timeout(300)
            for f in await page.evaluate(AUDIT): bad.setdefault(f['el'], f)
            # Agrandissement de l'interface (A+)
            await page.evaluate("__cms.showTab('textes')")
            for _ in range(2): await page.click('#bUiLarger')
            await page.evaluate(DIS); await page.wait_for_timeout(400)
            for f in await page.evaluate(AUDIT): bad.setdefault(f['el'], f)
            for f in bad.values(): print(f"    {f['el']} : {f['r']}:1 (attendu {f['need']}:1)")
            check(not bad, f'{name} : contrastes des textes et des composants ({len(bad)} écart(s))')
            # Pastilles d'état : chaque couleur contre le fond du panneau
            dots = await page.evaluate(DOTS)
            res = await page.evaluate("""d=>{ const p=c=>c.match(/\\d+(\\.\\d+)?/g).map(Number), lin=v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4}, L=c=>0.2126*lin(c[0])+0.7152*lin(c[1])+0.0722*lin(c[2]);
                const bg=p(getComputedStyle(document.querySelector('.foot')).backgroundColor==='rgba(0, 0, 0, 0)'?getComputedStyle(document.getElementById('panel')).backgroundColor:getComputedStyle(document.querySelector('.foot')).backgroundColor);
                return Object.fromEntries(Object.entries(d).map(([k,c])=>{ const a=L(p(c)), b=L(bg); return [k,+((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)).toFixed(2)]; })); }""", dots)
            check(all(v >= 3 for v in res.values()), f'{name} : pastilles d\'état à 3:1 au moins {res}')
            check(not errs, f'{name} : aucune erreur de page {errs[:2]}')
            await ctx.close()
        await b.close()
    print('✗ échecs : ' + ', '.join(fails) if fails else 'OK')
    return 1 if fails else 0

raise SystemExit(asyncio.run(main()))
