import { randomUUID } from 'node:crypto';
import { query } from '../db/client';
import { domaineDe, fabriquerMessageId } from './envoiGmail';
import { chargerConfigGestion } from './config';
import { avecVerrouTest, transportParDefaut, type TransportDemande } from './envoiDemandeTache';
import { lireReglageTaches } from './acceptationRepo';
import type { Auteur } from './gestes';
import { collaborateursAPrevenir, mailModificationRdv, type CollaborateurRdv, type EtatRdv } from './modificationRdv';

/**
 * 🔴🔴 Arno (19/11/2026) — règle D (et H) : l'état d'un rendez-vous AVANT un geste, puis, après, le mail au collaborateur initial qui n'est plus en
 * charge (quand quelqu'un d'autre a fait la modification). Pré-visite, état des lieux, tâches : la même fonction. Ne lève jamais : un échec
 * n'annule pas le geste (il est dit au journal du serveur). Le mail part par le canal des tâches (gestion@, mode RECETTE et préavis de test
 * respectés), seulement si l'envoi des demandes par mail est allumé.
 */

/** L'état du rendez-vous (créneau, collaborateurs en charge et leur agenda), ou `null` (tâche inconnue). LECTURE. */
export async function etatDuRdv(tacheId: number): Promise<(EtatRdv & { objet: string; adresse: string | null; etat: string }) | null> {
  try {
    const { rows } = await query<{ jour: string; heure: string | null; duree: number | null; objet: string; etat: string; confiee_a: string | null; libelle: string;
      email: string | null; agenda: boolean; adresse: string | null }>(
      `SELECT to_char(t.jour, 'YYYY-MM-DD') AS jour, to_char(t.heure, 'HH24:MI') AS heure, t.duree_minutes AS duree, t.objet, t.etat, t.confiee_a::text,
              t.confiee_a_libelle AS libelle, u.identifiant AS email, (t.google_evenement_id IS NOT NULL) AS agenda,
              nullif(concat_ws(', ', l.adresse, l.commune), '') AS adresse
         FROM gestion_tache t LEFT JOIN admin_utilisateur u ON u.id = t.confiee_a LEFT JOIN gestion_annuaire_lot l ON l.id = t.lot_id
        WHERE t.id = $1`, [tacheId]);
    const t = rows[0];
    if (t === undefined) return null;
    const collaborateurs: CollaborateurRdv[] = [];
    const inv = await query<{ id: string | null; libelle: string; email: string | null; agenda: boolean }>(
      `SELECT i.collaborateur_id::text AS id, i.libelle, coalesce(i.email, u.identifiant) AS email, (i.google_evenement_id IS NOT NULL) AS agenda
         FROM gestion_tache_invite i LEFT JOIN admin_utilisateur u ON u.id = i.collaborateur_id
        WHERE i.tache_id = $1 AND i.retire_le IS NULL ORDER BY i.rang, i.id`, [tacheId]).catch(() => ({ rows: [] as never[] }));
    for (const i of inv.rows) collaborateurs.push({ id: i.id === null ? null : Number(i.id), libelle: i.libelle, email: i.email, agenda: i.agenda === true });
    if (t.confiee_a !== null && !collaborateurs.some((c) => c.id === Number(t.confiee_a))) {
      collaborateurs.unshift({ id: Number(t.confiee_a), libelle: t.libelle, email: t.email, agenda: t.agenda === true });
    }
    return { jour: t.jour, heure: t.heure, dureeMinutes: t.duree === null ? null : Number(t.duree), collaborateurs, objet: t.objet, adresse: t.adresse, etat: t.etat };
  } catch (e) {
    console.error('[rdv] état avant modification', (e as Error)?.message);
    return null;
  }
}

/** Après le geste : le mail au(x) collaborateur(s) initial(aux) retiré(s) du rendez-vous par quelqu'un d'autre. Rend les adresses prévenues. */
export async function prevenirCollaborateurInitial(tacheId: number, avant: (EtatRdv & { objet: string; adresse: string | null }) | null, auteur: Auteur,
  transport: TransportDemande | null = null): Promise<string[]> {
  try {
    if (avant === null) return [];
    const apres = await etatDuRdv(tacheId);
    if (apres === null) return [];
    const cibles = collaborateursAPrevenir(avant, apres, auteur.id);
    if (cibles.length === 0) return [];
    if (!(await lireReglageTaches()).envoiMail) return [];
    const config = await chargerConfigGestion();
    const t = transport ?? transportParDefaut();
    const faits: string[] = [];
    for (const c of cibles) {
      const m = mailModificationRdv({ pour: c, objetRdv: avant.objet, adresse: avant.adresse, avant, apres, auteur: auteur.libelle });
      const r = await avecVerrouTest(t).envoyer({ de: config.adresseGestion, deNom: 'Sans Vis-à-Vis', a: [c.email as string], cc: [], cci: [], objet: m.objet, corps: m.corps,
        messageId: fabriquerMessageId(domaineDe(config.adresseGestion), randomUUID().replace(/-/g, ''), new Date()) });
      if (r.ok) faits.push(c.email as string);
      await query(
        `INSERT INTO gestion_tache_action (tache_id, action, avant, apres, auteur_id, auteur_libelle) VALUES ($1, 'modification', $2::jsonb, $3::jsonb, $4, $5)`,
        [tacheId, JSON.stringify({ collaborateurPrevenu: c.libelle }), JSON.stringify({ mailModification: r.ok ? 'envoye' : 'echec', a: c.email }), auteur.id, auteur.libelle],
      ).catch(() => undefined);
    }
    return faits;
  } catch (e) {
    console.error('[rdv] prévenir le collaborateur initial', (e as Error)?.message);
    return [];
  }
}

/** La tâche « à faire » du rendez-vous de préavis de ces occupations (pré-visite ou état des lieux), ou `null`. LECTURE. */
export async function tacheDuRdvPreavis(sorte: 'previsite' | 'edl', occupationIds: readonly number[]): Promise<number | null> {
  try {
    const table = sorte === 'previsite' ? 'gestion_location_previsite' : 'gestion_location_edls';
    const { rows } = await query<{ id: string }>(
      `SELECT x.tache_id::text AS id FROM ${table} x JOIN gestion_tache t ON t.id = x.tache_id
        WHERE x.clos_le IS NULL AND t.etat = 'a_faire' AND x.occupation_ids && $1::bigint[] ORDER BY x.id DESC LIMIT 1`, [[...occupationIds]]);
    return rows[0] ? Number(rows[0].id) : null;
  } catch { return null; }
}
