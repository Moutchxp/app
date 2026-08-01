/**
 * Tourniquet d'attribution des demandes aux collaborateurs (chantier S8a) — module PUR, aucun accès base, entièrement
 * testable. ⚠️ INVARIANT : AUCUN ALÉATOIRE nulle part. Le tirage au sort a été EXPLICITEMENT écarté ; le choix est une
 * fonction TOTALE et DÉTERMINISTE de l'état (deux exécutions sur les mêmes entrées donnent le même résultat), pour que
 * la répartition soit auditable et rejouable.
 */
import { problemeChamp, problemeEmail } from './demande';

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
    problemeChamp(c.fonction, 'fonction', 2),
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
 * Choisit le collaborateur à qui attribuer une demande pour `codeInsee`. `dernieres` = pour chaque collaborateur, la date
 * ISO de sa DERNIÈRE demande À CETTE COMMUNE (null ou absent = n'y a jamais écrit). Règle : celui qui n'y a jamais écrit
 * passe devant tout le monde ; sinon celui dont la dernière demande y est la plus ANCIENNE ; départage par id croissant
 * (STRICTEMENT déterministe — aucun aléatoire). `raison` toujours chiffrée. Aucun éligible → { null, raison }, jamais
 * d'exception.
 */
export function choisirCollaborateur(
  codeInsee: string,
  collaborateurs: Collaborateur[],
  dernieres: ReadonlyMap<number, string | null>,
  maintenant: Date,
): { collaborateurId: number | null; raison: string } {
  const eligibles = collaborateurs.filter(collaborateurEligible);
  if (eligibles.length === 0) {
    return { collaborateurId: null, raison: `aucun collaborateur éligible (0 sur ${collaborateurs.length})` };
  }
  const trie = [...eligibles].sort((a, b) => {
    const da = dernieres.get(a.id) ?? null, db = dernieres.get(b.id) ?? null;
    if (da === null && db !== null) return -1;   // jamais écrit → prioritaire
    if (da !== null && db === null) return 1;
    if (da !== null && db !== null && da !== db) return da < db ? -1 : 1; // la plus ancienne d'abord
    return a.id - b.id;                            // départage déterministe (aucun aléatoire)
  });
  const g = trie[0];
  const d = dernieres.get(g.id) ?? null;
  if (d === null) {
    return { collaborateurId: g.id, raison: `n'a jamais écrit à la commune ${codeInsee} (prioritaire parmi ${eligibles.length} éligible(s))` };
  }
  const jours = Math.max(0, Math.floor((maintenant.getTime() - Date.parse(d)) / 86_400_000));
  return { collaborateurId: g.id, raison: `dernière demande à ${codeInsee} il y a ${jours} jour(s), la plus ancienne des ${eligibles.length} éligible(s)` };
}
