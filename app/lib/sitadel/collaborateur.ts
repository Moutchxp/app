/**
 * Tourniquet d'attribution des demandes aux collaborateurs (chantier S8a) — module PUR, aucun accès base, entièrement
 * testable. ⚠️ INVARIANT : AUCUN ALÉATOIRE nulle part. Le tirage au sort a été EXPLICITEMENT écarté ; le choix est une
 * fonction TOTALE et DÉTERMINISTE de l'état (deux exécutions sur les mêmes entrées donnent le même résultat), pour que
 * la répartition soit auditable et rejouable.
 */
import { problemeChamp, problemeChampFacultatif, problemeEmail } from './demande';

export interface Collaborateur { id: number; nom: string; prenom: string; fonction: string; email: string; actif: boolean }

/**
 * Problèmes de plausibilité d'un collaborateur (réutilise les contrôles de `problemesIdentite` : longueurs crédibles,
 * refus du tout-majuscules, format e-mail). Vide = identité complète et crédible.
 */
export function problemesCollaborateur(c: { nom: string; prenom: string; fonction: string; email: string }): string[] {
  const p: string[] = [];
  for (const e of [
    problemeChamp(c.nom, 'nom', 2),
    problemeChamp(c.prenom, 'prénom', 2),
    problemeChampFacultatif(c.fonction, 'fonction', 2), // FACULTATIF (S8a) : vide accepté ; contrôlé seulement si renseigné
    problemeEmail(c.email, 'e-mail'),
  ]) if (e) p.push(e);
  return p;
}

/** Éligible au tourniquet : actif ET identité complète/crédible. */
export function collaborateurEligible(c: Collaborateur): boolean {
  return c.actif && problemesCollaborateur(c).length === 0;
}

/** Bilan d'éligibilité pour le bandeau : combien d'éligibles, et qui est inéligible et pourquoi. */
export function resumeEligibilite(collaborateurs: Collaborateur[]): {
  nbEligibles: number; nbTotal: number;
  inaptes: { id: number; nom: string; raisons: string[] }[];
} {
  const actifs = collaborateurs.filter((c) => c.actif);
  const inaptes = actifs
    .map((c) => ({ id: c.id, nom: `${c.prenom} ${c.nom}`.trim(), raisons: problemesCollaborateur(c) }))
    .filter((x) => x.raisons.length > 0);
  return { nbEligibles: actifs.length - inaptes.length, nbTotal: collaborateurs.length, inaptes };
}

/**
 * Choisit le collaborateur à qui attribuer une demande pour `codeInsee`. Départage à DEUX critères, dans cet ordre STRICT
 * (correctif S8b) :
 *   1. ANCIENNETÉ À CETTE COMMUNE (prioritaire) — `dernieres` = date ISO de la DERNIÈRE demande de chaque collaborateur À
 *      CETTE COMMUNE (null/absent = n'y a jamais écrit). Jamais écrit passe devant ; sinon la plus ANCIENNE d'abord. Cette
 *      contrainte (« ne pas revenir dans une mairie tant que les autres n'y sont pas passés ») n'est JAMAIS sacrifiée à
 *      l'équilibre global.
 *   2. À ÉGALITÉ sur le critère 1 (cas normal quand la commune est neuve pour tout le monde) — CHARGE GLOBALE : celui qui
 *      porte le MOINS de demandes au total, toutes communes confondues (`chargeGlobale` = nb total par collaborateur, mis à
 *      jour AU FIL DU LOT par l'appelant, comme `dernieres`).
 *   3. Toujours à égalité — id croissant.
 * STRICTEMENT déterministe, AUCUN aléatoire (le tri est total). `raison` chiffrée NOMMANT le critère qui a tranché. Aucun
 * éligible → { null, raison }, jamais d'exception.
 */
export function choisirCollaborateur(
  codeInsee: string,
  collaborateurs: Collaborateur[],
  dernieres: ReadonlyMap<number, string | null>,
  chargeGlobale: ReadonlyMap<number, number>,
  maintenant: Date,
): { collaborateurId: number | null; raison: string } {
  const eligibles = collaborateurs.filter(collaborateurEligible);
  if (eligibles.length === 0) {
    return { collaborateurId: null, raison: `aucun collaborateur éligible (0 sur ${collaborateurs.length})` };
  }
  const dateDe = (id: number) => dernieres.get(id) ?? null;
  const chargeDe = (id: number) => chargeGlobale.get(id) ?? 0;
  const trie = [...eligibles].sort((a, b) => {
    const da = dateDe(a.id), db = dateDe(b.id);
    // critère 1 — ancienneté à CETTE commune (jamais écrit prioritaire, sinon la plus ancienne)
    if (da === null && db !== null) return -1;
    if (da !== null && db === null) return 1;
    if (da !== null && db !== null && da !== db) return da < db ? -1 : 1;
    // critère 2 — charge globale (le moins chargé d'abord)
    const ca = chargeDe(a.id), cb = chargeDe(b.id);
    if (ca !== cb) return ca - cb;
    // critère 3 — id croissant (départage déterministe, aucun aléatoire)
    return a.id - b.id;
  });
  const g = trie[0];
  const suivant = trie[1] ?? null;
  const d = dateDe(g.id);
  const charge = chargeDe(g.id);
  if (d === null) {
    // g n'a jamais écrit à cette commune. Si le SUIVANT n'y a jamais écrit non plus, le critère 1 était à égalité et c'est
    // la charge globale qui a tranché ; sinon le critère 1 (ancienneté) a suffi.
    if (suivant !== null && dateDe(suivant.id) === null) {
      return { collaborateurId: g.id, raison: `n'a jamais écrit à la commune ${codeInsee} (comme les autres éligibles), et porte le moins de demandes au total : ${charge} contre ${chargeDe(suivant.id)} pour le suivant` };
    }
    return { collaborateurId: g.id, raison: `n'a jamais écrit à la commune ${codeInsee} (prioritaire parmi ${eligibles.length} éligible(s))` };
  }
  const jours = Math.max(0, Math.floor((maintenant.getTime() - Date.parse(d)) / 86_400_000));
  if (suivant !== null && dateDe(suivant.id) !== null && d === dateDe(suivant.id)) {
    // même dernière date que le suivant → critère 1 à égalité, la charge globale a tranché.
    return { collaborateurId: g.id, raison: `dernière demande à ${codeInsee} il y a ${jours} jour(s), à égalité d'ancienneté, et porte le moins de demandes au total : ${charge} contre ${chargeDe(suivant.id)} pour le suivant` };
  }
  return { collaborateurId: g.id, raison: `dernière demande à ${codeInsee} il y a ${jours} jour(s), la plus ancienne des ${eligibles.length} éligible(s)` };
}
