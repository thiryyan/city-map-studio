"""Préparation du localStorage pour les tests qui rechargent la page.

Pourquoi ne pas utiliser page.add_init_script : un script injecté qui lit ou écrit
localStorage au démarrage de chaque document peut, au rechargement suivant, faire
perdre les écritures récentes de la page (vérifié sur une page minimale, sans
l'application : 0 perte sur 25 rechargements sans script injecté, 3 à 4 sur 25 avec).
Un utilisateur réel n'a pas de script injecté ; l'artefact est propre au banc de test.

seed() écrit donc les clés une seule fois, dans la page elle-même, puis recharge :
les chargements suivants se font sans aucun script injecté.
"""

DEFAULT = {'cityMapStudio.consent': '1', 'cityMapStudio.advOpen': '1', 'cityMapStudio.styleMoreOpen': '1', 'cityMapStudio.textMoreOpen': '1', 'cityMapStudio.welcomed': '1'}


async def seed(page, url, items=None, wait=1200):
    """Ouvre url, enregistre items dans localStorage, puis recharge la page."""
    await page.goto(url)
    await page.evaluate("items => { for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v); }", items or DEFAULT)
    await page.reload()
    await page.wait_for_timeout(wait)
