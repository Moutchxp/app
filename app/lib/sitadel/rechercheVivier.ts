/**
 * D3 — RECHERCHE PURE dans le VIVIER (permis encore demandables), scopée par process. Aucune I/O. Le vivier lui-même (liste des
 * permis éligibles) est construit côté repo (`chargerVivier`) à partir de la MÊME définition d'éligibilité que le stock et la
 * proposition (`estCandidatEligible`) — jamais redéfinie ici. Ce module ne fait que FILTRER + SCOPER + compter l'autre process.
 *
 * 🔑 SCOPING NON SILENCIEUX : une correspondance dans l'AUTRE vivier n'est jamais « aucun résultat » — elle est comptée et
 * annoncée (« N résultat(s) dans le process X — basculer »), même principe que la mention hors-process de D2.
 */
import { processDeCanal, type Process } from './process';
import type { CleCategorie } from './priorite';

export interface PermisVivier {
  dossierId: number;
  numDau: string;
  type: 'PC' | 'PD' | null;
  codeInsee: string;
  communeNom: string | null;
  canal: string | null;
  categorie: CleCategorie;
  dateAutorisation: string | null;
}

export interface ResultatRechercheVivier {
  resultats: PermisVivier[]; // du process actif, capés à `cap`
  total: number;             // nombre TOTAL de correspondances du process actif (avant cap) — pour signaler une troncature
  autreProcess: number;      // nombre de correspondances dans l'AUTRE process (mention non silencieuse)
}

/** Normalise pour la comparaison (majuscule, sans espaces ni tirets) — même esprit que `normaliserReference`. */
function norm(s: string): string {
  return s.toUpperCase().replace(/[\s-]/g, '');
}

/** Un permis du vivier correspond-il à la requête ? Par n° de permis (num_dau) OU par ville (nom / code INSEE). PURE. */
export function correspondVivier(p: { numDau: string; communeNom: string | null; codeInsee: string }, q: string): boolean {
  const qn = norm(q);
  if (qn === '') return false; // requête vide → AUCUN résultat (jamais « tout le vivier »)
  return norm(p.numDau).includes(qn) || norm(p.communeNom ?? '').includes(qn) || p.codeInsee.includes(qn);
}

/**
 * Recherche dans le vivier, scopée au `process` actif. `cap` borne les résultats renvoyés (le total réel est renvoyé à part
 * pour signaler une troncature). Requête vide → aucun résultat. PURE.
 */
export function rechercherDansVivier(vivier: readonly PermisVivier[], q: string, process: Process, cap: number): ResultatRechercheVivier {
  if (norm(q) === '') return { resultats: [], total: 0, autreProcess: 0 };
  const matches = vivier.filter((p) => correspondVivier(p, q));
  const actif = matches.filter((p) => processDeCanal(p.canal) === process);
  const autre = matches.filter((p) => {
    const pr = processDeCanal(p.canal);
    return pr !== null && pr !== process;
  }).length;
  return { resultats: actif.slice(0, cap), total: actif.length, autreProcess: autre };
}
