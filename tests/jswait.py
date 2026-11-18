"""Attente d'une condition JavaScript, compatible avec la CSP de la page.

page.wait_for_function() évalue sa condition avec eval() dans la page : la politique de sécurité
du contenu (script-src sans 'unsafe-eval') le refuse. page.evaluate(), lui, passe par le protocole
DevTools et n'est pas concerné : on interroge donc la condition à intervalle régulier.
"""
import asyncio, time


async def wait_js(page, expr, timeout=30000, interval=100):
    """Attend que l'expression JavaScript `expr` soit vraie (une exception compte comme fausse)."""
    probe = f"(()=>{{ try {{ return !!({expr}); }} catch (e) {{ return false; }} }})()"
    end = time.monotonic() + timeout / 1000
    while True:
        if await page.evaluate(probe): return
        if time.monotonic() > end: raise TimeoutError(f'condition non remplie en {timeout} ms : {expr}')
        await asyncio.sleep(interval / 1000)
