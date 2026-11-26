import { query } from '../db/client';
import { journalCoproprieteDisponible } from './journalSyndicCopro';
import { adresseBanParId, rapprocherAdresse } from '../adresse/banRepo';
import { libelleOfficiel } from '../adresse/rapprochementBan';
import { communeAffichee, voieAffichee } from '../adresse/libelleAffiche';
import { adresseImmeuble } from './syndics';
import type { ExamenAdresse } from './adresseCoproExamenModele';
export { lienCarte, type ExamenAdresse } from './adresseCoproExamenModele';

/**
 * ══ 🔴🔴 « À VÉRIFIER » SUR UNE ADRESSE DE LA COPROPRIÉTÉ — L'EXAMEN ET LA CONFIRMATION (Arno, 26/11/2026, 11h58, point 1). ════════════════════════
 *
 * « Il y a écrit à vérifier, mais je ne peux rien vérifier (lien mort). » « À vérifier », sur une adresse rattachée, veut dire : cette adresse n'est pas
 * (encore) reconnue AVEC CERTITUDE comme une adresse de la Base Adresse Nationale — elle vient d'être rattachée (le rapprochement ne se calcule qu'à
 * l'ouverture de la fiche, sur les adresses enregistrées), ou le rapprochement automatique hésite. C'est un AFFICHAGE : rien n'est bloqué.
 *
 * L'EXAMEN (lecture seule) : l'adresse telle qu'écrite, l'adresse officielle retrouvée (ou la meilleure proposition) et le motif, la parcelle cadastrale
 * du point de l'adresse, sa position (latitude, longitude) pour la voir sur une carte. LA CONFIRMATION est un geste humain : elle part avec « Valider »
 * (comme le « × ») et se JOURNALISE dans l'historique de la copropriété (« adresse_confirmee ») ; une adresse confirmée ne porte plus la mention tant
 * qu'elle reste rattachée (un retrait puis un nouveau rattachement redemandent la confirmation).
 */

/** L'EXAMEN d'une adresse (lecture seule). `banId` : l'identifiant officiel déjà connu (choix dans la liste), sinon le rapprochement. */
export async function examinerAdresseCopro(a: { libelle: string; codePostal: string | null; commune: string | null; banId?: string | null }): Promise<ExamenAdresse> {
  const ecrite = adresseImmeuble(a.libelle, a.codePostal, a.commune);
  const r = await rapprocherAdresse({ texte: a.libelle, codePostal: a.codePostal, commune: a.commune });
  const choisie = a.banId ? await adresseBanParId(a.banId) : null;
  const ban = choisie ?? r.ban;
  const officielle = ban === null ? null : adresseImmeuble(voieAffichee(libelleOfficiel(ban)), r.codePostal ?? a.codePostal, communeAffichee(ban.commune));
  let position: ExamenAdresse['position'] = null;
  let parcelle = r.parcelle;
  if (ban !== null && ban.x !== null && ban.y !== null) {
    const { rows } = await query<{ lat: number; lon: number; parcelle: string | null }>(
      `SELECT ST_Y(p) AS lat, ST_X(p) AS lon,
              (SELECT id FROM parcelle WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint($1, $2), 2154), 3) ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 2154) LIMIT 1) AS parcelle
         FROM (SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 2154), 4326) AS p) x`, [ban.x, ban.y]);
    if (rows[0] !== undefined) { position = { lat: Number(rows[0].lat), lon: Number(rows[0].lon) }; parcelle = rows[0].parcelle ?? parcelle; }
  }
  const statut = choisie !== null ? 'certain' : r.statut;
  const motif = choisie !== null ? 'Adresse choisie dans la liste de la Base Adresse Nationale.' : r.motif;
  return { ecrite, statut, motif, officielle, banId: ban?.id ?? null, parcelle, position };
}

/** Les clés des adresses CONFIRMÉES (journal « adresse_confirmee ») encore rattachées depuis leur confirmation. LECTURE SEULE. */
export async function adressesConfirmees(coproId: number): Promise<string[]> {
  if (!(await journalCoproprieteDisponible())) return [];
  const { rows } = await query<{ cle: string }>(
    `SELECT DISTINCT j.valeur_apres AS cle FROM gestion_journal j
      WHERE j.entite = 'copropriete' AND j.entite_id = $1 AND j.action = 'adresse_confirmee' AND j.valeur_apres IS NOT NULL
        AND EXISTS (SELECT 1 FROM gestion_copropriete_adresse a WHERE a.copropriete_id = $1 AND a.cle_immeuble = j.valeur_apres AND a.retire_le IS NULL AND a.cree_le <= j.survenu_le)`,
    [coproId]);
  return rows.map((r) => r.cle);
}

/** Les actions sur les adresses de la copropriété, montrées dans « Historique des adresses ». */
export const ACTIONS_ADRESSES = ['adresse_ajoutee', 'adresse_confirmee', 'adresse_retiree', 'adresse_verifiee', 'adresse_principale_changee', 'adresse_cedee', 'adresse_reprise'] as const;

/** L'historique des adresses de la copropriété (journal, du plus récent au plus ancien). LECTURE SEULE. */
export async function historiqueAdresses(coproId: number): Promise<{ le: string; texte: string; par: string }[]> {
  if (!(await journalCoproprieteDisponible())) return [];
  const { rows } = await query<{ le: string; texte: string; par: string }>(
    `SELECT to_char(j.survenu_le AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY "à" HH24"h"MI') AS le, j.commentaire AS texte,
            coalesce(nullif(btrim(concat_ws(' ', u.prenom, u.nom)), ''), j.auteur_libelle) AS par
       FROM gestion_journal j LEFT JOIN admin_utilisateur u ON u.id = j.auteur_id
      WHERE j.entite = 'copropriete' AND j.entite_id = $1 AND j.action = ANY($2::text[]) AND j.commentaire IS NOT NULL
      ORDER BY j.survenu_le DESC, j.id DESC LIMIT 200`, [coproId, [...ACTIONS_ADRESSES]]);
  return rows;
}
