import type { LigneSource } from './sourcesFraicheur';
import type { AffichageProtocoles } from './protocolesReingestion';

/**
 * FRAÎCHEUR / F7 — logique PURE de la pastille « mises à jour disponibles » et du regroupement « périmées sans procédure ».
 * Aucune I/O. Partagée par la route (compte) et le module de Rendu (regroupement d'écran) — une seule vérité, deux usages.
 *
 * ⚠️ SOURCE DE VÉRITÉ (a)/(b)/(c) = le PARSEUR DE PROTOCOLES F5, jamais une liste en dur. Dérivation ADOPTÉE et VOULUE :
 *   « une section de protocole possède ≥ 1 bloc de commande  ⟺  la source a une procédure réelle (cas a ou b) ;
 *     zéro bloc de commande  ⟺  cas (c), aucun geste documenté. »
 * Conséquence : le jour où un protocole aujourd'hui absent (cas c) reçoit un vrai bloc de commande dans
 * docs/PROTOCOLES_REINGESTION.md, la source rentre AUTOMATIQUEMENT dans le compte, SANS toucher à ce code.
 * NE PAS remplacer cette dérivation par une liste de clés codée en dur : ce serait une seconde vérité à maintenir.
 */

/** Ensemble des clés de sources dont le protocole documente une PROCÉDURE réelle (≥ 1 bloc de commande = cas a/b). */
export function sourcesAvecProcedure(protocoles: AffichageProtocoles): Set<string> {
  const avec = new Set<string>();
  for (const s of protocoles.sections) {
    if (s.present && s.elements.some((e) => e.type === 'commande')) avec.add(s.cle);
  }
  return avec;
}

/**
 * Compte les sources ACTIONNABLES : une publication plus récente est détectée (detection = mise_a_jour) ET une procédure
 * réelle existe (cas a/b). Une source périmée mais sans procédure (cas c) est EXCLUE — l'y compter enverrait vers un
 * cul-de-sac. `null` si le compte ne peut pas être établi (protocoles illisibles) → l'appelant n'affiche AUCUNE pastille
 * (jamais « 0 » : absence de mesure ≠ absence de mise à jour).
 */
export function compterMisesAJourActionnables(lignes: LigneSource[], protocoles: AffichageProtocoles): number | null {
  if (protocoles.fichierAbsent) return null; // impossible de classer (a)/(b)/(c) → compte indéterminé, surtout pas 0
  const avecProcedure = sourcesAvecProcedure(protocoles);
  return lignes.filter((l) => l.detection?.statut === 'mise_a_jour' && avecProcedure.has(l.cle)).length;
}

/**
 * Les sources PÉRIMÉES SANS PROCÉDURE : une mise à jour est détectée, mais aucun geste n'est documenté pour la recharger
 * (cas c). Elles ne disparaissent pas de l'écran — elles changent de statut. Sert au regroupement dédié de l'écran Sources.
 */
export function misesAJourSansProcedure(lignes: LigneSource[], protocoles: AffichageProtocoles): LigneSource[] {
  const avecProcedure = sourcesAvecProcedure(protocoles);
  return lignes.filter((l) => l.detection?.statut === 'mise_a_jour' && !avecProcedure.has(l.cle));
}

/** Les sources ACTIONNABLES : mise à jour détectée ET procédure réelle (le pendant « objet » de compterMisesAJourActionnables). */
export function misesAJourActionnables(lignes: LigneSource[], protocoles: AffichageProtocoles): LigneSource[] {
  const avecProcedure = sourcesAvecProcedure(protocoles);
  return lignes.filter((l) => l.detection?.statut === 'mise_a_jour' && avecProcedure.has(l.cle));
}
