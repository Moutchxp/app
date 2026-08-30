/**
 * FIL-A — HISTORIQUE des échanges e-mail d'un permis, en LECTURE SEULE. Module PUR (fusion + tri + garde multi-dossiers). Aucune I/O.
 *
 * 🔒 RÈGLE ABSOLUE (Arno) — PAS DE FIL DOUTEUX : un message est rattaché à une DEMANDE, jamais à un permis. Si une demande couvrant
 * ce permis porte PLUS D'UN dossier, ses messages ne sont PAS attribuables à CE permis → on n'affiche AUCUN fil (mieux vaut rien
 * qu'un fil possiblement faux). Le fil n'est montré que si TOUTES les demandes du dossier sont mono-dossier.
 */

/** Une entrée du fil, du plus récent au plus ancien. `le` = ISO comparable (UTC pour les timestamps ; date seule pour une déclaration). */
export interface FilEntree {
  le: string;
  sens: 'recu' | 'envoye' | 'declare';
  interlocuteur: string | null; // expéditeur (reçu) ou destinataire (envoyé / déclaré)
  objet: string | null;
  corps: string | null;
  corpsConnu: boolean;          // false pour une déclaration : contenu NON connu du système (jamais un corps fabriqué)
  reponseId?: number | null;    // FIL-B — id du message REÇU (pour y répondre) ; absent/null pour un envoi ou une déclaration
  repliable?: boolean;          // FIL-B — le message reçu est-il répondable (expéditeur non no-reply) ? faux hors « recu »
}

export type ResultatFil =
  | { statut: 'multi' }              // demande multi-dossiers → pas de fil (message honnête à l'écran)
  | { statut: 'vide' }              // aucune demande / aucun échange
  | { statut: 'ok'; entrees: FilEntree[] };

export interface DepsFil {
  /** Les demandes ACTIVES du dossier, chacune avec son nombre de dossiers actifs (pour la garde multi). */
  demandesDuDossier(dossierId: number): Promise<{ demandeId: number; nbDossiers: number }[]>;
  /** Toutes les entrées (reçus + envois + compléments + déclarations) des demandes données, dans un ordre quelconque. */
  entreesDesDemandes(demandeIds: number[]): Promise<FilEntree[]>;
}

/** Tri du fil : plus récent d'abord (comparaison lexicographique d'ISO UTC), stable. PURE. Ne mute pas l'entrée. */
export function fusionnerFil(entrees: readonly FilEntree[]): FilEntree[] {
  return [...entrees].sort((a, b) => (a.le < b.le ? 1 : a.le > b.le ? -1 : 0));
}

/**
 * Construit le fil d'un permis. `multi` si une demande du dossier couvre plusieurs dossiers (garde stricte) ; `vide` si aucune
 * demande ou aucun échange ; sinon `ok` avec les entrées triées. PUR par injection.
 */
export async function lireFil(deps: DepsFil, dossierId: number): Promise<ResultatFil> {
  const demandes = await deps.demandesDuDossier(dossierId);
  if (demandes.length === 0) return { statut: 'vide' };
  if (demandes.some((d) => d.nbDossiers > 1)) return { statut: 'multi' }; // au moins une demande non attribuable à ce seul permis
  const entrees = fusionnerFil(await deps.entreesDesDemandes(demandes.map((d) => d.demandeId)));
  return entrees.length === 0 ? { statut: 'vide' } : { statut: 'ok', entrees };
}
