/**
 * FIL-A — implémentation RÉELLE du fil des échanges d'un permis (IMPUR : base, LECTURE SEULE). Fusionne QUATRE sources dispersées :
 * messages reçus (`demande_reponse`, avec corps), envois initiaux + relances (`demande_acheminement` ⋈ `demande`/`demande_relance`),
 * compléments de pièces et déclarations (`demande_journal`, FILTRÉS aux seuls préfixes de messages — jamais les événements de cycle de
 * vie). `le` est normalisé en ISO UTC pour un tri fiable. Résilient si la colonne `details` (migration 175) est absente.
 */
import { query } from '../db/client';
import { lireFil, type DepsFil, type FilEntree, type ResultatFil } from './filPermis';
import { MOTIF_COMPLEMENT_PREFIXE, MOTIF_DECLARATION_PREFIXE, MOTIF_REPONSE_LIBRE_PREFIXE } from './demanderPiecesRepo';
import { estNoReply } from './complementPieces';

const ISO_UTC = `'YYYY-MM-DD"T"HH24:MI:SS"Z"'`; // format to_char → ISO UTC comparable lexicographiquement

export function depsReellesFil(): DepsFil {
  return {
    demandesDuDossier: async (dossierId) => {
      const { rows } = await query<{ demande_id: number; nb: number }>(
        `SELECT dd.demande_id, (SELECT count(*) FROM demande_dossier x WHERE x.demande_id = dd.demande_id AND x.actif)::int AS nb
           FROM demande_dossier dd WHERE dd.dossier_id = $1 AND dd.actif`, [dossierId]);
      return rows.map((r) => ({ demandeId: r.demande_id, nbDossiers: r.nb }));
    },
    entreesDesDemandes: async (demandeIds) => {
      if (demandeIds.length === 0) return [];
      const entrees: FilEntree[] = [];

      // 1) REÇUS (hors rebond) — avec leur corps + de quoi Y RÉPONDRE (FIL-B) : id du message + répondabilité (expéditeur non no-reply).
      const { rows: recus } = await query<{ id: number; le: string; interlocuteur: string | null; de_adresse: string; objet: string | null; corps: string | null }>(
        `SELECT id, to_char(recu_le AT TIME ZONE 'UTC', ${ISO_UTC}) AS le, coalesce(nullif(de_nom, ''), de_adresse) AS interlocuteur, de_adresse, objet, corps_texte AS corps
           FROM demande_reponse WHERE demande_id = ANY($1) AND nature <> 'rebond'`, [demandeIds]);
      for (const r of recus) entrees.push({ le: r.le, sens: 'recu', interlocuteur: r.interlocuteur, objet: r.objet, corps: r.corps, corpsConnu: true, reponseId: r.id, repliable: !estNoReply(r.de_adresse) });

      // 2) ENVOIS (demande initiale + relances) — corps depuis demande/demande_relance.
      const { rows: envois } = await query<{ le: string; interlocuteur: string | null; objet: string | null; corps: string | null }>(
        `SELECT to_char(a.envoye_le AT TIME ZONE 'UTC', ${ISO_UTC}) AS le, coalesce(nullif(d.dest_nom, ''), d.dest_email) AS interlocuteur,
                coalesce(dr.objet, d.objet) AS objet, coalesce(dr.corps, d.corps) AS corps
           FROM demande_acheminement a JOIN demande d ON d.id = a.demande_id
           LEFT JOIN demande_relance dr ON dr.id = a.relance_id
          WHERE a.demande_id = ANY($1) AND a.statut = 'envoye'`, [demandeIds]);
      for (const r of envois) entrees.push({ le: r.le, sens: 'envoye', interlocuteur: r.interlocuteur, objet: r.objet, corps: r.corps, corpsConnu: true });

      // 3) COMPLÉMENTS envoyés + 4) DÉCLARATIONS — depuis demande_journal, FILTRÉS aux préfixes (jamais les événements de cycle de vie).
      //    Résilient : colonne `details` absente (175 non appliquée) → on saute ces entrées (le fil garde reçus + envois).
      try {
        const { rows: compl } = await query<{ le: string; interlocuteur: string | null; objet: string | null; corps: string | null }>(
          `SELECT to_char(horodatage AT TIME ZONE 'UTC', ${ISO_UTC}) AS le, details->>'destinataire' AS interlocuteur, details->>'objet' AS objet, details->>'corps' AS corps
             FROM demande_journal WHERE demande_id = ANY($1) AND motif LIKE $2 || '%'`, [demandeIds, MOTIF_COMPLEMENT_PREFIXE]);
        for (const r of compl) entrees.push({ le: r.le, sens: 'envoye', interlocuteur: r.interlocuteur, objet: r.objet, corps: r.corps, corpsConnu: true });

        const { rows: decl } = await query<{ le: string; interlocuteur: string | null }>(
          `SELECT coalesce(details->>'dateRelance', to_char(horodatage AT TIME ZONE 'UTC', 'YYYY-MM-DD')) AS le, details->>'destinataire' AS interlocuteur
             FROM demande_journal WHERE demande_id = ANY($1) AND motif LIKE $2 || '%'`, [demandeIds, MOTIF_DECLARATION_PREFIXE]);
        for (const r of decl) entrees.push({ le: r.le, sens: 'declare', interlocuteur: r.interlocuteur, objet: null, corps: null, corpsConnu: false });

        // RÉPONSES LIBRES (FIL-B) — envois à un message choisi : entrées 'envoye' avec objet + corps conservés.
        const { rows: rep } = await query<{ le: string; interlocuteur: string | null; objet: string | null; corps: string | null }>(
          `SELECT to_char(horodatage AT TIME ZONE 'UTC', ${ISO_UTC}) AS le, details->>'destinataire' AS interlocuteur, details->>'objet' AS objet, details->>'corps' AS corps
             FROM demande_journal WHERE demande_id = ANY($1) AND motif LIKE $2 || '%'`, [demandeIds, MOTIF_REPONSE_LIBRE_PREFIXE]);
        for (const r of rep) entrees.push({ le: r.le, sens: 'envoye', interlocuteur: r.interlocuteur, objet: r.objet, corps: r.corps, corpsConnu: true });
      } catch (e) {
        if (!(typeof e === 'object' && e !== null && (e as { code?: string }).code === '42703')) throw e; // autre erreur → propage ; 42703 (details absente) → toléré
      }

      return entrees;
    },
  };
}

/** Fil des échanges d'un permis (lecture seule). Voir la garde multi-dossiers dans `lireFil`. */
export function lireFilPermis(dossierId: number): Promise<ResultatFil> {
  return lireFil(depsReellesFil(), dossierId);
}
