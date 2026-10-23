import { enMots, purgerCacheNext, SEUIL_CACHE_NEXT_OCTETS } from '../lib/ops/purgeCacheNext';

/**
 * Lancé tout seul AVANT `npm run dev` (`predev` de package.json) — Arno, 23/10/2026 : au-delà de 10 Go, `.next` voit ses SEULS
 * dossiers de cache vidés avant le démarrage, et c'est noté dans `.captures/surveiller-next/`. Jamais bloquant : quoi qu'il
 * arrive, le serveur démarre.
 */
try {
  const r = purgerCacheNext();
  if (r.geste === 'vide') console.log(`[cache .next] ${enMots(r.avant)} > ${enMots(SEUIL_CACHE_NEXT_OCTETS)} : cache vidé (${r.vides.join(', ')}), ${enMots(r.apres)} après. Note : ${r.rapport}`);
  else if (r.geste === 'differe') console.warn(`[cache .next] ${enMots(r.avant)} > ${enMots(SEUIL_CACHE_NEXT_OCTETS)}, mais un serveur next dev tourne déjà (pid ${r.serveur?.pid}) : rien n'est vidé. Note : ${r.rapport}`);
} catch (e) {
  console.warn(`[cache .next] mesure impossible (${e instanceof Error ? e.message : String(e)}) : le serveur démarre quand même.`);
}
