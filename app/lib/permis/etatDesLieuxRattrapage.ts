/**
 * LOT 104 — RATTRAPAGE de l'ÉTAT DES LIEUX DATÉ (référence de comparaison / état d'origine) sur les dossiers Sitadel qui n'en ont
 * AUCUN. Cœur PUR-injectable (testable sans base) : sélection GUARDÉE + traitement par lots + reprise idempotente. Ne fait QUE poser la
 * photo (empreinte des parcelles d'origine + bâti présent) — SANS vision, SANS GED, SANS ré-écriture des parcelles.
 *
 * 🔴 GARDE ANTI-ÉCRASEMENT (non négociable) : on ne traite QUE les dossiers SANS état des lieux. `figerEmpreinte` ÉCRASE (snapshot
 * inconditionnel + empreinte ON CONFLICT DO UPDATE) → réécrire une photo existante DÉTRUIRAIT le point de comparaison. La sélection
 * exclut tout dossier ayant déjà une empreinte OU une parcelle snapshotée OU corrigée à la main (LOT 101) ; un DOUBLE contrôle
 * `aEtatDesLieux` juste avant le traitement redouble la sécurité. REPRISE : chaque dossier traité reçoit une empreinte → il sort de la
 * sélection au lot suivant (idempotent par exclusion) ; un dossier vu deux fois OU en erreur est sauté (jamais de boucle).
 */
export interface DepsRattrapage {
  selectionner(depts: string[] | null, limite: number): Promise<number[]>;               // dossiers ÉLIGIBLES (garde appliquée en SQL)
  aEtatDesLieux(dossierId: number): Promise<boolean>;                                     // double-contrôle : empreinte/snapshot/correction déjà là ?
  figer(dossierId: number, majPar: string): Promise<{ complete: boolean; nbBatiments: number | null }>; // figerEmpreinte + figerBatiSnapshot
}

export interface ResumeRattrapage {
  candidats: number;                 // dossiers éligibles VUS
  traites: number;                   // état des lieux COMPLET posé (dont terrain nu)
  terrainNu: number;                 // traités avec 0 bâtiment (VALABLE — pas un écart : couverture bâti confirmée au LOT 103)
  ecartes: Record<string, number>;   // motif → nb (deja_pourvu, empreinte_incomplete)
  erreurs: number;
}

const MAX_LOTS = 1_000_000; // garde-fou anti-boucle infinie (jamais atteint en pratique)

/** Traite les dossiers éligibles par lots. `dryRun` ne fige rien (compte seulement le 1er lot d'éligibles). PUR (deps injectées). */
export async function rattraperEtatDesLieux(
  deps: DepsRattrapage,
  opts: { depts: string[] | null; lot: number; majPar: string; dryRun?: boolean; log?: (s: string) => void },
): Promise<ResumeRattrapage> {
  const r: ResumeRattrapage = { candidats: 0, traites: 0, terrainNu: 0, ecartes: {}, erreurs: 0 };
  const ecart = (m: string) => { r.ecartes[m] = (r.ecartes[m] ?? 0) + 1; };
  const vus = new Set<number>(); // évite de re-traiter un id vu (reprise / dossier en erreur qui ne sort pas de la sélection)

  for (let boucle = 0; boucle < MAX_LOTS; boucle++) {
    const ids = (await deps.selectionner(opts.depts, opts.lot)).filter((id) => !vus.has(id));
    if (ids.length === 0) break;
    for (const id of ids) {
      vus.add(id); r.candidats++;
      if (await deps.aEtatDesLieux(id)) { ecart('deja_pourvu'); continue; } // 🔴 jamais réécrire une photo existante
      if (opts.dryRun) { r.traites++; continue; }
      try {
        const f = await deps.figer(id, opts.majPar);
        if (!f.complete) { ecart('empreinte_incomplete'); continue; } // ≥1 parcelle non résolue → pas d'état des lieux complet
        r.traites++;
        if ((f.nbBatiments ?? 0) === 0) r.terrainNu++;
      } catch { r.erreurs++; }
    }
    if (opts.dryRun) break; // rien n'avance en dry-run → un seul lot
    opts.log?.(`… ${r.traites} traité(s) · ${Object.values(r.ecartes).reduce((a, b) => a + b, 0)} écarté(s) · ${r.erreurs} erreur(s)`);
  }
  return r;
}
