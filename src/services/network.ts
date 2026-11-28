/* City Map Studio — Réseau (#118) : messages d'erreur réseau communs aux services (géocodeur, Wikipédia, carte). */
/** Message lisible pour une erreur de requête */
function netMsg(e: unknown){
  const m=((e as Error)?.message)||String(e);
  return /Failed to fetch|NetworkError|Load failed|blocked/i.test(m) ? 'accès réseau bloqué ou serveur injoignable' : m;
}

export {netMsg};
