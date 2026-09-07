/**
 * MAP à CONCURRENCE BORNÉE, préservant l'ORDRE. Exécute `fn` sur chaque élément avec AU PLUS `limite` opérations SIMULTANÉES (pool de
 * workers qui tirent l'indice suivant). Le tableau renvoyé est dans l'ORDRE DES ENTRÉES — JAMAIS l'ordre d'arrivée → résultat déterministe.
 * Utilité (P2, perfo) : chevaucher des I/O (téléchargements S3/MinIO) sans lancer N requêtes simultanées. Une exception de `fn` REJETTE la
 * promesse globale (sémantique Promise.all) : pour « continuer malgré un échec par élément », gérer l'erreur DANS `fn` (try/catch). PUR.
 */
export async function mapConcurrenceBornee<T, R>(items: readonly T[], limite: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const n = items.length;
  const resultats = new Array<R>(n);
  if (n === 0) return resultats;
  const lim = Math.max(1, Math.min(Math.trunc(limite) || 1, n)); // au moins 1, au plus n (jamais plus de workers que d'éléments)
  let prochain = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = prochain;
      prochain += 1;
      if (i >= n) return;
      resultats[i] = await fn(items[i], i); // résultat rangé À SA POSITION → ordre d'entrée préservé
    }
  };
  await Promise.all(Array.from({ length: lim }, () => worker()));
  return resultats;
}
