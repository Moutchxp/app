/**
 * T7-C — ORCHESTRATION du pré-cochage automatique de « répondu ». Branchée dans le CORPS d'executerVeille (aucun nouveau job,
 * aucune nouvelle clé), sous le MÊME verrou, APRÈS l'alerte action (cas ③). Testable PAR INJECTION (aucun IMAP, aucune base).
 *
 * INVARIANTS DURS :
 *  - LECTURE STRICTE du dossier envoyés (EXAMINE), EN-TÊTES SEULS — jamais le corps ni les pièces (`telechargerMessage` jamais appelé) ;
 *  - ANCRE anti-résurrection : candidats exigent repondu_auto_le IS NULL → auto-cochage AU PLUS UNE FOIS par message ; une
 *    annulation humaine (repondu_le → NULL) n'est JAMAIS re-cochée (repondu_auto_le survit) ;
 *  - EN CAS DE DOUTE ON NE MARQUE PAS : match strict (fil ET destinataire mairie), sinon la ligne reste bleue ;
 *  - ne remplace jamais le bouton manuel ; aucune alerte, aucune bascule Archives, aucune écriture demande.statut ;
 *  - repli SÛR : aucun candidat → aucune connexion IMAP ; aucun dossier \Sent → aucun effet (jamais de scan à l'aveugle).
 * ISOLATION : un échec (IMAP, DB) n'interrompt ni le pré-cochage des autres ni la veille (compté, on continue).
 */
import { query } from '../db/client';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { marquerReponduAuto } from './demandeReponseRepo';
import { estReponse, type CandidatRepondu, type SortantEntete } from './preCochageRepondu';
import type { ProfilBoite } from './demandeReponseRepo';

/** I/O du pré-cochage, injectables pour les tests. */
export interface DepsPreCochage {
  lireConfig(): Promise<{ active: boolean; profil: ProfilBoite }>;
  lireCandidats(profil: ProfilBoite): Promise<CandidatRepondu[]>;              // `autre` ancrés, repondu_le NULL ∧ repondu_auto_le NULL, rattachés
  lireSortants(profil: ProfilBoite, messageIds: string[], depuis: Date): Promise<SortantEntete[]>; // dossier envoyés, EN-TÊTES seuls ; [] si compte absent / pas de \Sent
  marquerReponduAuto(reponseId: number): Promise<void>;                        // pose repondu_le=now() + repondu_auto_le=now() (repondu_par reste NULL)
}

export interface BilanPreCochage { examines: number; precoches: number; erreurs: number }

/**
 * Une passe de pré-cochage. Ne connecte l'IMAP QUE s'il y a des candidats (repli sûr). Pour chaque candidat, cherche dans le
 * dossier envoyés une réponse au fil ADRESSÉE À la mairie ; si trouvée, pré-coche (une fois, ancre posée). Un échec est isolé.
 */
export async function executerPreCochageAuto(deps: DepsPreCochage): Promise<BilanPreCochage> {
  const config = await deps.lireConfig();
  if (!config.active) return { examines: 0, precoches: 0, erreurs: 0 };

  const candidats = await deps.lireCandidats(config.profil);
  if (candidats.length === 0) return { examines: 0, precoches: 0, erreurs: 0 }; // aucun candidat → AUCUNE connexion IMAP

  const depuis = new Date(Math.min(...candidats.map((c) => c.recuLe.getTime()))); // une réponse ne précède jamais le mail de mairie
  const messageIds = candidats.map((c) => c.messageId).filter((m) => m.trim() !== '');
  const sortants = await deps.lireSortants(config.profil, messageIds, depuis);    // [] si compte absent OU pas de dossier \Sent

  let precoches = 0, erreurs = 0;
  for (const c of candidats) {
    if (!sortants.some((s) => estReponse(c, s))) continue; // pas de réponse au fil ET adressée à la mairie → on ne coche pas
    try {
      await deps.marquerReponduAuto(c.reponseId);
      precoches += 1;
    } catch {
      erreurs += 1; // ISOLATION : un échec de marquage n'interrompt ni les autres ni la veille (retenté la passe suivante).
    }
  }
  return { examines: candidats.length, precoches, erreurs };
}

// ── Implémentation RÉELLE (production) ────────────────────────────────────────
/** Infixe des variables d'environnement par profil (même convention que la relève R7). */
const INFIXE: Record<ProfilBoite, string> = { entreprise: '', personne: 'PERSONNE_' };

export function depsReellesPreCochage(): DepsPreCochage {
  return {
    lireConfig: async () => {
      const c = await chargerConfigVeille();
      const profil: ProfilBoite = c.releveProfil === 'personne' ? 'personne' : 'entreprise'; // même compte que la relève
      return { active: c.releveActive, profil };
    },
    lireCandidats: async (profil) => {
      // `autre` ANCRÉS (nature_classee_le), rattachés, PAS encore répondus ET jamais auto-cochés (anti-résurrection).
      const { rows } = await query<{ reponse_id: number; message_id: string; de_adresse: string; recu_le: string }>(
        `SELECT r.id::int AS reponse_id, r.message_id, r.de_adresse, r.recu_le::text AS recu_le
           FROM demande_reponse r
          WHERE r.nature = 'autre' AND r.nature_classee_le IS NOT NULL
            AND r.demande_id IS NOT NULL
            AND r.repondu_le IS NULL AND r.repondu_auto_le IS NULL
            AND r.profil_boite = $1 AND r.message_id <> ''`,
        [profil],
      );
      return rows.map((r) => ({ reponseId: r.reponse_id, messageId: r.message_id, mairieAdresse: r.de_adresse, recuLe: new Date(r.recu_le) }));
    },
    lireSortants: async (profil, messageIds, depuis) => {
      // Import DYNAMIQUE d'imap.ts (imapflow) : garde la dépendance lourde HORS du graphe statique. Compte absent → [].
      const { lireCompteImap } = await import('../email');
      const compte = lireCompteImap(INFIXE[profil]);
      if (compte === null) return [];
      const { creerClientEnvoyes } = await import('../email/imap');
      const client = creerClientEnvoyes(compte);
      try {
        await client.ouvrir();                          // connecte + repère & ouvre \Sent (readOnly) ; pas de \Sent → aBoiteEnvoyes() faux
        if (!client.aBoiteEnvoyes()) return [];         // repli sûr : jamais de scan à l'aveugle
        return await client.lireEntetesReponses(messageIds, depuis); // SEARCH par en-tête + fetch EN-TÊTES seuls (jamais la source)
      } finally {
        await client.fermer();
      }
    },
    marquerReponduAuto: async (reponseId) => { await marquerReponduAuto(reponseId); },
  };
}
