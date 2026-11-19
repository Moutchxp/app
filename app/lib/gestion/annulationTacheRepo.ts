import { randomUUID } from 'node:crypto';
import { query } from '../db/client';
import { domaineDe, fabriquerMessageId } from './envoiGmail';
import { chargerConfigGestion } from './config';
import { avecVerrouTest, transportParDefaut, type TransportDemande } from './envoiDemandeTache';
import { lireReglageTaches } from './acceptationRepo';
import { invitesTacheDisponible } from './schema';
import type { Auteur } from './gestes';
import { collaborateursAPrevenirAnnulation, mailAnnulationTache, type ReponseCollaborateur } from './annulationTache';

/**
 * 🔴🔴 Arno (19/11/2026, choix A) — l'annulation d'une tâche : ce qu'elle était AVANT (titre, créneau, adresse, réponses des collaborateurs), puis,
 * après, le mail d'annulation aux seuls collaborateurs qui l'avaient ACCEPTÉE (sauf la personne qui annule). Le canal des tâches (gestion@, mode
 * RECETTE et préavis de test respectés), seulement si l'envoi des demandes par mail est allumé. Chaque mail est tracé au journal interne de la
 * tâche (`gestion_tache_action`). Ne lève jamais : un échec n'annule pas l'annulation.
 */

export interface AvantAnnulation { titre: string; rdv: boolean; adresse: string | null; jour: string; heure: string | null; dureeMinutes: number | null;
  reponses: ReponseCollaborateur[] }

/** La tâche telle qu'elle est AVANT l'annulation, ou `null`. LECTURE. */
export async function lireAvantAnnulation(tacheId: number): Promise<AvantAnnulation | null> {
  try {
    const { rows } = await query<{ objet: string; sorte: string | null; jour: string; heure: string | null; duree: number | null; adresse: string | null }>(
      `SELECT t.objet, to_jsonb(t) ->> 'sorte' AS sorte, to_char(t.jour, 'YYYY-MM-DD') AS jour, to_char(t.heure, 'HH24:MI') AS heure,
              (to_jsonb(t) ->> 'duree_minutes')::int AS duree, nullif(concat_ws(', ', l.adresse, l.commune), '') AS adresse
         FROM gestion_tache t LEFT JOIN gestion_annuaire_lot l ON l.id = t.lot_id WHERE t.id = $1`, [tacheId]);
    const t = rows[0];
    if (t === undefined) return null;
    const parInvite = await invitesTacheDisponible().catch(() => false);
    const r = await query<{ id: string | null; libelle: string; email: string | null; statut: string }>(
      `SELECT d.destinataire_id::text AS id, d.destinataire_libelle AS libelle, coalesce(nullif(d.destinataire_email, ''), u.identifiant) AS email, d.statut
         FROM gestion_tache_demande d LEFT JOIN admin_utilisateur u ON u.id = d.destinataire_id
        WHERE d.tache_id = $1 AND d.statut <> 'remplacee'
          ${parInvite ? 'AND (d.invite_id IS NULL OR EXISTS (SELECT 1 FROM gestion_tache_invite i WHERE i.id = d.invite_id AND i.retire_le IS NULL))' : ''}
        ORDER BY d.id`, [tacheId]).catch(() => ({ rows: [] as never[] }));
    return { titre: t.objet, rdv: t.sorte === 'rdv' || t.heure !== null, adresse: t.adresse, jour: t.jour, heure: t.heure,
      dureeMinutes: t.duree === null ? null : Number(t.duree),
      reponses: r.rows.map((x) => ({ id: x.id === null ? null : Number(x.id), libelle: x.libelle, email: x.email, statut: x.statut })) };
  } catch (e) {
    console.error('[tâches] état avant annulation', (e as Error)?.message);
    return null;
  }
}

/** Après l'annulation : le mail à chaque collaborateur qui avait accepté. Rend, pour la fenêtre, chaque envoi tenté. */
export async function prevenirAnnulation(tacheId: number, avant: AvantAnnulation | null, auteur: Auteur, transport: TransportDemande | null = null):
  Promise<{ destinataire: string; etat: string; objet: string }[]> {
  try {
    if (avant === null) return [];
    const cibles = collaborateursAPrevenirAnnulation(avant.reponses, auteur.id);
    if (cibles.length === 0) return [];
    if (!(await lireReglageTaches()).envoiMail) {
      return cibles.map((c) => ({ destinataire: c.libelle, etat: 'desactive', objet: mailAnnulationTache({ pour: c, ...base(avant), auteur: auteur.libelle }).objet }));
    }
    const config = await chargerConfigGestion();
    const t = transport ?? transportParDefaut();
    const faits: { destinataire: string; etat: string; objet: string }[] = [];
    for (const c of cibles) {
      const m = mailAnnulationTache({ pour: c, ...base(avant), auteur: auteur.libelle });
      const r = await avecVerrouTest(t).envoyer({ de: config.adresseGestion, deNom: 'Sans Vis-à-Vis', a: [c.email as string], cc: [], cci: [], objet: m.objet, corps: m.corps,
        messageId: fabriquerMessageId(domaineDe(config.adresseGestion), randomUUID().replace(/-/g, ''), new Date()) });
      faits.push({ destinataire: c.libelle, etat: r.ok ? 'envoye' : 'echec', objet: m.objet });
      await query(
        `INSERT INTO gestion_tache_action (tache_id, action, avant, apres, auteur_id, auteur_libelle) VALUES ($1, 'annulation', $2::jsonb, $3::jsonb, $4, $5)`,
        [tacheId, JSON.stringify({ collaborateurPrevenu: c.libelle }), JSON.stringify({ mailAnnulation: r.ok ? 'envoye' : 'echec', a: c.email }), auteur.id, auteur.libelle],
      ).catch(() => undefined);
    }
    return faits;
  } catch (e) {
    console.error('[tâches] prévenir de l’annulation', (e as Error)?.message);
    return [];
  }
}

const base = (a: AvantAnnulation) => ({ rdv: a.rdv, titre: a.titre, adresse: a.adresse, quand: { jour: a.jour, heure: a.heure, dureeMinutes: a.dureeMinutes } });
