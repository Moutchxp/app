/**
 * FIL-C — ORCHESTRATION de la CAPTURE des réponses envoyées HORS OUTIL (depuis la boîte d'Arno). Passe ISOLÉE, sœur de T7-C
 * (`preCochageReponduAuto.ts`) : branchée dans le CORPS d'executerVeille, sous le MÊME verrou, APRÈS le pré-cochage. Elle NE REMPLACE
 * PAS T7-C et NE MODIFIE PAS son comportement — c'est une seconde passe indépendante. Testable PAR INJECTION (aucun IMAP, aucune base).
 *
 * INVARIANTS DURS :
 *  - Portée ÉLARGIE (≠ T7-C) : TOUS les fils de demandes envoyées, toutes natures — pas seulement `autre` ;
 *  - DÉROGATION ASSUMÉE à « en-têtes seuls » : on télécharge le CORPS des sortants APPARIÉS (voir `imap.lireSortantsComplets`) ;
 *  - EN CAS DE DOUTE ON NE CAPTURE PAS : appariement strict (fil ET destinataire mairie), sinon on ignore (`apparierSortant`) ;
 *  - DÉDUP par Message-ID : un même sortant n'est jamais stocké deux fois (clé UNIQUE + ON CONFLICT DO NOTHING) ;
 *  - repli SÛR : migration 176 absente OU aucun fil → AUCUNE connexion IMAP ; aucun dossier \Sent → aucun effet (jamais de scan aveugle) ;
 *  - LECTURE STRICTE (EXAMINE) : aucun flag, rien déplacé/supprimé.
 * ISOLATION : un échec (IMAP, DB) n'interrompt ni la capture des autres ni la veille (compté, on continue).
 */
import { query } from '../db/client';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { apparierSortant, type FilCible, type SortantComplet } from './captureSortants';
import type { ProfilBoite } from './demandeReponseRepo';

/** I/O de la capture, injectables pour les tests. */
export interface DepsCaptureSortants {
  lireConfig(): Promise<{ active: boolean; profil: ProfilBoite }>;
  tableDisponible(): Promise<boolean>;                                                        // migration 176 appliquée ? sinon repli propre
  chargerFils(profil: ProfilBoite): Promise<{ fils: FilCible[]; messageIds: string[]; depuis: Date }>; // fils suivis + union des Message-ID + borne basse
  lireSortantsComplets(profil: ProfilBoite, messageIds: string[], depuis: Date): Promise<SortantComplet[]>; // \Sent, CORPS ; [] si compte/\Sent absent
  stocker(demandeId: number, destinataire: string, sortant: SortantComplet): Promise<boolean>; // true = inséré ; false = doublon (dédup)
}

export interface BilanCapture { examines: number; captures: number; erreurs: number }

/**
 * Une passe de capture. Ne connecte l'IMAP QUE s'il y a des fils à suivre ET si la table existe (repli sûr). Pour chaque sortant du
 * dossier envoyés apparié à un fil ET adressé à la mairie, capture (dédup par Message-ID). Un échec est isolé.
 */
export async function executerCaptureSortantsAuto(deps: DepsCaptureSortants): Promise<BilanCapture> {
  const config = await deps.lireConfig();
  if (!config.active) return { examines: 0, captures: 0, erreurs: 0 };
  if (!(await deps.tableDisponible())) return { examines: 0, captures: 0, erreurs: 0 }; // migration 176 absente → aucune capture, aucune connexion IMAP

  const { fils, messageIds, depuis } = await deps.chargerFils(config.profil);
  if (fils.length === 0 || messageIds.length === 0) return { examines: 0, captures: 0, erreurs: 0 }; // aucun fil → AUCUNE connexion IMAP

  const sortants = await deps.lireSortantsComplets(config.profil, messageIds, depuis); // [] si compte absent OU pas de dossier \Sent

  let captures = 0, erreurs = 0;
  for (const s of sortants) {
    if (s.messageId.trim() === '') continue;         // pas de Message-ID → pas de clé de dédup → on ignore
    const cible = apparierSortant(s, fils);
    if (cible === null) continue;                     // pas apparié (fil ET mairie) → on ne capture pas
    try {
      if (await deps.stocker(cible.demandeId, cible.destinataire, s)) captures += 1; // false = doublon (déjà capturé)
    } catch {
      erreurs += 1; // ISOLATION : un échec de stockage n'interrompt ni les autres ni la veille (retenté la passe suivante).
    }
  }
  return { examines: sortants.length, captures, erreurs };
}

// ── Implémentation RÉELLE (production) ────────────────────────────────────────
/** Infixe des variables d'environnement par profil (même convention que la relève R7 / T7-C). */
const INFIXE: Record<ProfilBoite, string> = { entreprise: '', personne: 'PERSONNE_' };

const REPLI_FENETRE_MS = 366 * 24 * 3600 * 1000; // ~1 an : borne basse si aucune date d'envoi connue (fenêtre SINCE de repli)

export function depsReellesCaptureSortants(): DepsCaptureSortants {
  return {
    lireConfig: async () => {
      const c = await chargerConfigVeille();
      const profil: ProfilBoite = c.releveProfil === 'personne' ? 'personne' : 'entreprise'; // même compte que la relève
      return { active: c.releveActive, profil };
    },
    tableDisponible: async () => {
      const { rows } = await query<{ ok: boolean }>(`SELECT to_regclass('public.demande_sortant_hors_outil') IS NOT NULL AS ok`);
      return rows[0]?.ok === true;
    },
    chargerFils: async () => {
      // Fils suivis = demandes ENVOYÉES par e-mail avec un destinataire. Message-ID du fil = envoi initial + relances (demande_acheminement)
      //   ∪ reçus (demande_reponse, hors rebond). Adresses mairie = dest_email ∪ expéditeurs des reçus. La portée profil est implicite :
      //   les sortants proviennent du \Sent du compte relevé (config.profil) ; l'appariement strict (fil ET mairie) protège du reste.
      const { rows } = await query<{ demande_id: number; dest_email: string; ach_mids: string[]; rec_mids: string[]; rec_adr: string[]; envoye_min: string | null }>(
        `SELECT d.id AS demande_id, d.dest_email,
                coalesce((SELECT array_agg(a.message_id) FROM demande_acheminement a WHERE a.demande_id = d.id AND a.statut = 'envoye' AND coalesce(a.message_id,'') <> ''), '{}') AS ach_mids,
                coalesce((SELECT array_agg(r.message_id) FROM demande_reponse r WHERE r.demande_id = d.id AND r.nature <> 'rebond' AND coalesce(r.message_id,'') <> ''), '{}') AS rec_mids,
                coalesce((SELECT array_agg(DISTINCT r.de_adresse) FROM demande_reponse r WHERE r.demande_id = d.id AND r.nature <> 'rebond' AND coalesce(r.de_adresse,'') <> ''), '{}') AS rec_adr,
                (SELECT min(a.envoye_le) FROM demande_acheminement a WHERE a.demande_id = d.id AND a.statut = 'envoye')::text AS envoye_min
           FROM demande d
          WHERE d.statut IN ('envoyee','close') AND d.dest_canal = 'email' AND coalesce(d.dest_email,'') <> ''`,
      );
      const fils: FilCible[] = [];
      const tousMids = new Set<string>();
      let minMs: number | null = null;
      for (const row of rows) {
        const messageIds = [...new Set([...row.ach_mids, ...row.rec_mids])];
        if (messageIds.length === 0) continue; // pas de Message-ID → rien à chercher pour ce fil
        const mairieAdresses = [...new Set([row.dest_email, ...row.rec_adr].filter((a) => a && a.trim() !== ''))];
        fils.push({ demandeId: row.demande_id, messageIds, mairieAdresses });
        for (const m of messageIds) tousMids.add(m);
        if (row.envoye_min) { const t = new Date(row.envoye_min).getTime(); if (minMs === null || t < minMs) minMs = t; }
      }
      const depuis = minMs !== null ? new Date(minMs) : new Date(Date.now() - REPLI_FENETRE_MS);
      return { fils, messageIds: [...tousMids], depuis };
    },
    lireSortantsComplets: async (profil, messageIds, depuis) => {
      // Import DYNAMIQUE d'imap.ts (imapflow) : garde la dépendance lourde HORS du graphe statique. Compte absent → [].
      const { lireCompteImap } = await import('../email');
      const compte = lireCompteImap(INFIXE[profil]);
      if (compte === null) return [];
      const { creerClientEnvoyes } = await import('../email/imap');
      const client = creerClientEnvoyes(compte);
      try {
        await client.ouvrir();                                 // connecte + repère & ouvre \Sent (readOnly) ; pas de \Sent → aBoiteEnvoyes() faux
        if (!client.aBoiteEnvoyes()) return [];                // repli sûr : jamais de scan à l'aveugle
        return await client.lireSortantsComplets(messageIds, depuis); // SEARCH par en-tête + fetch CORPS (dérogation FIL-C)
      } finally {
        await client.fermer();
      }
    },
    stocker: async (demandeId, destinataire, s) => {
      try {
        const res = await query(
          `INSERT INTO demande_sortant_hors_outil (demande_id, message_id, in_reply_to, references_brut, destinataire, objet, corps_texte, envoye_le, capture_par)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (message_id) DO NOTHING
             RETURNING id`,
          [demandeId, s.messageId, s.inReplyTo, s.references.length ? s.references.join(' ') : null, destinataire, s.objet, s.corpsTexte, s.envoyeLe, 'veille:auto'],
        );
        return (res.rowCount ?? 0) > 0; // false = doublon (ON CONFLICT) → dédup
      } catch (e) {
        if (typeof e === 'object' && e !== null && (e as { code?: string }).code === '42P01') return false; // table absente (176 non appliquée) → repli propre
        throw e;
      }
    },
  };
}
