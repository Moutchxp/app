/**
 * ══ 🔴🔴 LOT NEW-EVENEMENT-PROPRE (Arno, 04/11/2026) — LE « NEW » D'UN ÉVÉNEMENT EST UN ÉTAT DE L'ÉVÉNEMENT ══════════
 *
 * LE SIGNALEMENT (production, la collègue d'Arno) : « les mails contenant un événement, lorsque tu les ouvres,
 * repassent automatiquement en non lu. C'est pour cela que la mention NEW apparaît à chaque fois. »
 *
 * CAUSE PROUVÉE (04/11/2026, vraie boîte, lecture seule) : le « New » se DÉDUISAIT du non-lu Gmail (lot
 * FILTRES-EVENEMENTS-NEW). Or NOTRE échange se forme par les en-têtes `References`, celui de Gmail aussi par
 * l'OBJET : un échange de chez nous peut couvrir plusieurs conversations Gmail (l'échange 5881, « DOSSIER GODEAU »,
 * en couvre trois). L'ouvrir ne marquait lue que la première conversation trouvée (`marquerFilGmail`) ; le mail
 * resté non lu dans une autre remettait l'échange en gras, et l'événement restait « New » quoi qu'on fasse.
 *
 * LA RÈGLE D'ARNO, TENUE ICI :
 *   1. le « New » s'allume quand un mail REÇU rattaché à l'événement arrive (nos envois n'allument rien) ;
 *   2. il s'éteint quand on DÉPLIE la carte (`vuParLaCarte`), ou quand on OUVRE le mail qui l'a allumé — dans
 *      l'application (`vuParLeMail`) ou dans Gmail (`constaterLecturesGmail`, à la lecture de l'écran) ;
 *   3. il ne revient qu'avec un NOUVEAU mail reçu — jamais parce qu'on a rouvert un mail, ni au passage d'une relève.
 *
 * 🔴 UN SEUIL, PAS UN DRAPEAU. `vu_jusqu_au` = l'identifiant du dernier mail reçu tenu pour vu ; un mail reçu
 * d'identifiant plus grand rallume le « New » de lui-même, sans qu'aucune relève n'écrive rien ici. L'identifiant
 * suit l'ordre d'ARRIVÉE chez nous : la date d'un expéditeur (horloge fausse, mail retardé) n'y entre pas.
 *
 * 🔴 LE SEUIL NE RECULE JAMAIS (`GREATEST`) : rouvrir, marquer non lu, relire n'allument rien.
 *
 * ⚠️ AUCUNE ÉCRITURE DANS GMAIL ICI. Le lu / non lu reste UN état, celui de Gmail (décision du 25/09/2026) ; ce
 * fichier ne fait que LIRE la liste des non-lus que l'écran a déjà demandée.
 *
 * ⚠️ SANS LA MIGRATION 456, RIEN N'EST ÉCRIT et aucune requête ne nomme la table : le « New » est celui d'avant.
 * Ce fichier touche `pg` : jamais importé d'un composant `'use client'` (garde `clientBoundary.guard.test.ts`).
 */
import { query } from '../db/client';
import { deplacementsDeMailsDisponibles, evenementNouveauteDisponible } from './schema';

export type MotifNouveauteVue = 'carte' | 'mail' | 'gmail';

/**
 * LES MAILS REÇUS RATTACHÉS AUX ÉVÉNEMENTS, en relation `(evenement_id, id, fil_id)`.
 *
 * 🔴 LES MÊMES MAILS QUE LE « NEW » D'AVANT ET QUE LA CARTE (`sqlNouveauteDeLEvenement` de `fileRepo`) : ceux que
 * l'affectation active rattache à l'événement, par leur ÉCHANGE ou un par un ; un mail déplacé seul vers un autre
 * événement quitte celui de son échange. `sens = 'recu'` : nos envois n'allument rien ; `exclu_le IS NULL` : un
 * mail tenu hors de la file n'existe pas pour l'écran.
 *
 * ⚠️ DEUX BRANCHES `UNION ALL` plutôt qu'un `OR` dans la jointure : sur toute la table, un `OR` interdirait au
 * planificateur les deux index (identifiant et échange) qu'il prend branche par branche.
 */
export function sqlMailsRecusDesEvenements(avecMessageId: boolean): string {
  const filtres = `an.actif AND an.evenement_id IS NOT NULL AND mn.exclu_le IS NULL AND mn.sens = 'recu'`;
  if (!avecMessageId) {
    return `SELECT an.evenement_id, mn.id, mn.fil_id
              FROM gestion_affectation an JOIN gestion_message mn ON mn.fil_id = an.fil_id
             WHERE ${filtres}`;
  }
  return `SELECT an.evenement_id, mn.id, mn.fil_id
            FROM gestion_affectation an JOIN gestion_message mn ON mn.id = an.message_id
           WHERE an.message_id IS NOT NULL AND ${filtres}
          UNION ALL
          SELECT an.evenement_id, mn.id, mn.fil_id
            FROM gestion_affectation an JOIN gestion_message mn ON mn.fil_id = an.fil_id
           WHERE an.message_id IS NULL AND ${filtres}
             AND NOT EXISTS (SELECT 1 FROM gestion_affectation a2 WHERE a2.message_id = mn.id AND a2.actif)`;
}

/**
 * L'ÉCRITURE COMMUNE : poser le seuil de chaque événement de `source` (colonnes `evenement_id`, `mx`), sans jamais
 * le faire reculer. Rend le nombre d'événements dont le « New » vient de s'éteindre (ou de se poser).
 */
async function poserSeuils(source: string, params: unknown[], libelle: string, motif: MotifNouveauteVue): Promise<number> {
  const n = params.length;
  const r = await query(
    `INSERT INTO gestion_evenement_nouveaute (evenement_id, vu_jusqu_au, vu_le, vu_par_libelle, motif)
     SELECT s.evenement_id, s.mx, now(), $${n + 1}, $${n + 2} FROM (${source}) s WHERE s.mx IS NOT NULL
     ON CONFLICT (evenement_id) DO UPDATE
        SET vu_jusqu_au = EXCLUDED.vu_jusqu_au, vu_le = now(),
            vu_par_libelle = EXCLUDED.vu_par_libelle, motif = EXCLUDED.motif
      WHERE EXCLUDED.vu_jusqu_au > gestion_evenement_nouveaute.vu_jusqu_au`,
    [...params, libelle.trim() === '' ? 'inconnu' : libelle.trim(), motif]);
  return r.rowCount ?? 0;
}

/**
 * ② a) LA CARTE DÉPLIÉE éteint le « New » de son événement : tous ses mails reçus sont vus. Les mails, eux, ne
 * changent pas dans Gmail — déplier n'est pas lire.
 */
export async function vuParLaCarte(evenementId: number, libelle: string): Promise<number> {
  if (!Number.isSafeInteger(evenementId) || evenementId <= 0) return 0;
  if (!(await evenementNouveauteDisponible())) return 0;
  const mails = sqlMailsRecusDesEvenements(await deplacementsDeMailsDisponibles());
  return poserSeuils(
    `SELECT m.evenement_id, max(m.id) AS mx FROM (${mails}) m WHERE m.evenement_id = $1 GROUP BY m.evenement_id`,
    [evenementId], libelle, 'carte');
}

/**
 * ② b) LE MAIL OUVERT DANS L'APPLICATION éteint le « New » de son ou ses événements : le seuil monte jusqu'au
 * dernier mail reçu DE CET ÉCHANGE. Un mail plus récent arrivé par un AUTRE échange du même événement le garde
 * allumé, et c'est juste : ce n'est pas lui qu'on vient de lire.
 */
export async function vuParLeMail(filId: number, libelle: string): Promise<number> {
  if (!Number.isSafeInteger(filId) || filId <= 0) return 0;
  if (!(await evenementNouveauteDisponible())) return 0;
  const mails = sqlMailsRecusDesEvenements(await deplacementsDeMailsDisponibles());
  return poserSeuils(
    `SELECT m.evenement_id, max(m.id) AS mx FROM (${mails}) m WHERE m.fil_id = $1 GROUP BY m.evenement_id`,
    [filId], libelle, 'mail');
}

/**
 * ② c) LE MAIL OUVERT DANS GMAIL (la collègue y travaille aussi) : la lecture de l'écran, qui vient de demander la
 * liste des non-lus à Gmail, constate qu'aucun mail reçu au-delà du seuil n'y figure plus, et monte le seuil.
 *
 * 🔴 SEULEMENT SUR UNE LISTE COMPLÈTE ET DISPONIBLE : une liste tronquée ou absente ne prouve pas qu'un mail est
 * lu — l'appelant ne nous appelle pas dans ce cas.
 *
 * 🔴 `plafond` = le plus grand identifiant de mail AU MOMENT où la liste Gmail a été lue. Un mail capturé entre la
 * liste et cette écriture n'y figurait pas encore — il n'est pas « lu » pour autant : il est simplement hors de
 * ce constat, et le prochain le jugera.
 *
 * Un événement SANS ligne y gagne la sienne dès que tous ses mails reçus sont lus : c'est l'état initial, calculé
 * en LISANT Gmail, sans jamais y écrire.
 */
export async function constaterLecturesGmail(nonLus: readonly number[], plafond: number): Promise<number> {
  if (!Number.isSafeInteger(plafond) || plafond <= 0) return 0;
  if (!(await evenementNouveauteDisponible())) return 0;
  const ids = [...new Set(nonLus.filter((n) => Number.isSafeInteger(n) && n > 0))];
  const mails = sqlMailsRecusDesEvenements(await deplacementsDeMailsDisponibles());
  return poserSeuils(
    `SELECT m.evenement_id, max(m.id) AS mx
       FROM (${mails}) m
       LEFT JOIN gestion_evenement_nouveaute v ON v.evenement_id = m.evenement_id
      WHERE m.id <= $1 AND m.id > coalesce(v.vu_jusqu_au, 0)
      GROUP BY m.evenement_id
     HAVING NOT bool_or(m.id = ANY($2::bigint[]))`,
    [plafond, ids], 'Gmail', 'gmail');
}

/** Le plus grand identifiant de mail connu — le `plafond` de `constaterLecturesGmail`, lu AVANT la liste Gmail. */
export async function plafondDesMails(): Promise<number> {
  const { rows } = await query<{ mx: string | null }>(`SELECT max(id)::text AS mx FROM gestion_message`);
  return Number(rows[0]?.mx ?? 0);
}
