/**
 * MODULE « GESTION » — LOT 2 : LECTURE de l'écran à deux côtés. IMPUR (base), mais STRICTEMENT EN LECTURE : ce fichier
 * n'émet que des SELECT. Aucun INSERT, aucun UPDATE, aucun DELETE — les gestes (affecter, classer sans suite) sont le lot 4.
 *
 * 🔴 LA RÈGLE QUI COMMANDE CE FICHIER : « ATTEND UNE RÉPONSE DE NOTRE PART » EST DÉRIVÉ, JAMAIS STOCKÉ.
 * Aucune colonne ne le porte — elle mentirait dès le message suivant. Le calcul se fait à chaque lecture et s'appuie sur
 * l'index partiel `gestion_message_attente_idx (fil_id, recu_le DESC) WHERE exclu_le IS NULL` posé par la migration 228
 * exprès pour lui. Sa DÉFINITION, elle, vit dans `attente.ts` — une seule, partagée par la file et par les cartes, pour
 * que les deux colonnes de l'écran ne puissent pas se contredire (lot 4d : trois sortes d'expéditeurs, pas deux).
 *
 * L'ORDRE DEMANDÉ À L'ÉCRAN : ce qui attend une réponse depuis LE PLUS LONGTEMPS d'abord. Donc, dans les deux colonnes :
 * ce qui attend passe devant ce qui n'attend pas, puis du plus ANCIEN au plus récent.
 */
import { query } from '../db/client';
import { ATTEND, ATTEND_CARTE, CTE_MESSAGES_DEPLACES, cteDernier, ctesAttente, jointuresAttente } from './attente';
import { chargerConfigGestion } from './config';
import { toleranceVeilleValide, VEILLE_INTERVALLES_DEFAUT, type VeilleReleve } from './ecran';
import { adressesDe, libelleExpediteur, lirePartenairesInternes, type PartenaireInterne } from './partenaires';
import { deplacementsDeMailsDisponibles, reglageVeilleDisponible, suiteReleveDisponible } from './schema';
import type { SuiteVue } from './suiteReleve';

/** Une ligne de la FILE (colonne de gauche) : un FIL de discussion, jamais un message isolé. */
export interface LigneFile {
  filId: number;
  objet: string | null;
  interlocuteur: string | null;   // nom affiché du dernier message, à défaut son adresse
  dernierLe: string;              // ISO — date du dernier message non exclu
  nbMessages: number;
  nbPieces: number;
  attend: boolean;                // DÉRIVÉ : le dernier message non exclu est reçu ET probablement humain
}

/** Une CARTE d'événement (colonne de droite). */
export interface CarteEvenement {
  evenementId: number;
  reference: string;
  objet: string;
  demandeur: string | null;       // nom, à défaut adresse — ce que le mail contenait, rien de plus
  adresseLibre: string | null;
  etat: 'a_traiter' | 'en_cours' | 'traite';
  ouvertLe: string;               // ISO
  dernierEchangeLe: string | null; // ISO — dernier message non exclu de ses fils, ou null s'il n'en a aucun
  nbFils: number;
  /** LOT 4d — des mails isolés, rattachés à cette carte sans leur échange. Comptés à part : ce ne sont pas des échanges. */
  nbMailsDeplaces: number;
  attend: boolean;                // DÉRIVÉ : au moins un de ses fils — ou le dernier mail déplacé — attend une réponse
}

export interface EtatEcran {
  file: LigneFile[];
  filsTotal: number;              // total de la file (pour dire honnêtement « N affichés sur M »)
  // LOT 4b — FENÊTRE D'ACTIVITÉ : ce que la file ne montre pas, et depuis quand. Annoncé à l'écran, jamais tu.
  fenetreJours: number;
  filsTropAnciens: number;
  // LOT 4b — les échanges CLASSÉS SANS SUITE, pour que le geste soit RÉVERSIBLE depuis l'écran et pas seulement en base.
  sansSuite: LigneSansSuite[];
  sansSuiteTotal: number;
  evenements: CarteEvenement[];
  evenementsTotal: number;
  messagesCaptures: number;       // TOUS les messages capturés, exclus compris — la preuve que la relève a tourné
  messagesExclus: number;         // tenus hors de la file par une règle (jamais supprimés)
  derniereReleveLe: string | null; // fin de la dernière relève réussie, ou null si aucune n'a jamais tourné
  /** LOT 5-VEILLE — de quoi dire si la relève AUTOMATIQUE tourne encore. Voir `etatVeille` dans `ecran.ts`. */
  veille: VeilleReleve;
  /**
   * LOT RATTACHEMENT-2 — ce que la dernière passe automatique a fait APRÈS l'import (adresses, rattachement).
   * Tout à `null` = migration 258 absente, ou aucune passe depuis ce lot : le bandeau se tait. Voir `etatSuite`.
   */
  suite: SuiteVue;
}

/** Un échange classé sans suite — assez pour le reconnaître et le rouvrir, rien de plus. */
export interface LigneSansSuite {
  filId: number;
  objet: string | null;
  motif: string | null;
  classeLe: string;        // ISO
  classePar: string | null;
}

/** Combien de lignes au plus par colonne. Le total réel est renvoyé à côté → l'écran ne ment jamais sur ce qu'il montre. */
export const PAGE = 50;

/** Ce qu'il faut connaître pour trancher « qui parle » : nos partenaires internes, et notre propre adresse. */
export interface ContexteExpediteurs {
  partenaires: readonly PartenaireInterne[];
  adresseGestion: string;
  /** La migration 234 est-elle appliquée ? Si non, les mails suivent leur échange, comme avant (cf. `schema.ts`). */
  deplacements: boolean;
}

interface LigneFileDB {
  fil_id: number; objet: string | null; interlocuteur: string | null; de_adresse: string;
  dernier_le: string; nb_messages: number; nb_pieces: number; attend: boolean;
}

/**
 * LA FILE : les fils À CLASSER qui portent encore au moins un message non exclu.
 *  - « non affectés » : `etat = 'a_classer'` (un fil affecté passe à 'affecte', un fil écarté à la main à 'sans_suite') ;
 *  - « non exclus » : la jointure sur le dernier message non exclu écarte d'elle-même un fil dont TOUS les messages ont
 *    été tenus hors de la file par une règle — sans jamais rien supprimer, et le fil revient si la règle s'éteint.
 */
export async function lireFile(
  fenetreJours: number, ctx: ContexteExpediteurs, limite = PAGE,
): Promise<{ lignes: LigneFile[]; total: number; tropAnciens: number }> {
  const adresses = adressesDe(ctx.partenaires);
  const { rows } = await query<LigneFileDB>(
    `WITH ${ctesAttente('$3', '$4', ctx.deplacements)}
     SELECT f.id::int AS fil_id,
            f.objet_initial AS objet,
            d.interlocuteur, d.de_adresse,
            to_char(d.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS dernier_le,
            -- Les compteurs disent ce que l'écran MONTRERA : un mail déplacé vers une autre carte n'y est plus.
            (SELECT count(*) FROM gestion_message m2 WHERE m2.fil_id = f.id AND m2.exclu_le IS NULL
              ${ctx.deplacements ? 'AND NOT EXISTS (SELECT 1 FROM gestion_affectation am2 WHERE am2.message_id = m2.id AND am2.actif)' : ''})::int AS nb_messages,
            (SELECT count(*) FROM gestion_piece p JOIN gestion_message m3 ON m3.id = p.message_id
              WHERE m3.fil_id = f.id AND m3.exclu_le IS NULL
              ${ctx.deplacements ? 'AND NOT EXISTS (SELECT 1 FROM gestion_affectation am3 WHERE am3.message_id = m3.id AND am3.actif)' : ''})::int AS nb_pieces,
            ${ATTEND} AS attend
       FROM gestion_fil f
       JOIN dernier d ON d.fil_id = f.id
       ${jointuresAttente('f.id')}
      WHERE f.etat = 'a_classer' AND d.recu_le >= now() - ($2::int * interval '1 day')
      ORDER BY ${ATTEND} DESC, d.recu_le ASC, f.id ASC
      LIMIT $1`,
    [limite, fenetreJours, adresses, ctx.adresseGestion],
  );
  // DEUX comptes, jamais un seul : ce que la file montre, ET ce qu'elle tait. Le second est affiché à l'écran —
  //   un outil qui cache sans le dire ment ; un outil qui dit ce qu'il ne montre pas reste honnête.
  const { rows: t } = await query<{ dedans: number; trop_anciens: number }>(
    `WITH dernier AS (${cteDernier(ctx.deplacements)})
     SELECT count(*) FILTER (WHERE d.recu_le >= now() - ($1::int * interval '1 day'))::int AS dedans,
            count(*) FILTER (WHERE d.recu_le <  now() - ($1::int * interval '1 day'))::int AS trop_anciens
       FROM gestion_fil f JOIN dernier d ON d.fil_id = f.id WHERE f.etat = 'a_classer'`,
    [fenetreJours],
  );
  return {
    lignes: rows.map((r) => ({
      filId: r.fil_id, objet: r.objet,
      // Le libellé d'un partenaire interne PRIME sur le nom porté par le mail : « Service Gestion » se confondait
      //   avec notre propre boîte, « Comptabilité (ADHOC Gestion) » dit qui parle et à quel titre.
      interlocuteur: libelleExpediteur(ctx.partenaires, r.de_adresse, r.interlocuteur),
      dernierLe: r.dernier_le,
      nbMessages: r.nb_messages, nbPieces: r.nb_pieces, attend: r.attend === true,
    })),
    total: t[0]?.dedans ?? 0,
    tropAnciens: t[0]?.trop_anciens ?? 0,
  };
}

/**
 * Les échanges CLASSÉS SANS SUITE, les plus récemment classés d'abord. C'est la contrepartie du geste : ce qu'on écarte
 * doit rester VISIBLE et se rouvrir d'un clic, sinon « classer sans suite » est une suppression déguisée.
 */
export async function lireSansSuite(limite = 20): Promise<{ lignes: LigneSansSuite[]; total: number }> {
  const { rows } = await query<{ fil_id: number; objet: string | null; motif: string | null; classe_le: string; classe_par: string | null }>(
    `SELECT id::int AS fil_id, objet_initial AS objet, sans_suite_motif AS motif,
            to_char(sans_suite_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS classe_le,
            sans_suite_par_libelle AS classe_par
       FROM gestion_fil WHERE etat = 'sans_suite'
      ORDER BY sans_suite_le DESC NULLS LAST, id DESC LIMIT $1`, [limite]);
  const { rows: t } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM gestion_fil WHERE etat = 'sans_suite'`);
  return {
    lignes: rows.map((r) => ({ filId: r.fil_id, objet: r.objet, motif: r.motif, classeLe: r.classe_le, classePar: r.classe_par })),
    total: t[0]?.n ?? 0,
  };
}

interface CarteDB {
  evenement_id: number; reference: string; objet: string; demandeur: string | null; adresse_libre: string | null;
  etat: string; ouvert_le: string; dernier_echange_le: string | null; nb_fils: number; nb_mails: number; attend: boolean;
}

/**
 * LES CARTES : tous les événements, les OUVERTS d'abord (un événement traité n'attend plus rien), puis ceux qui attendent
 * une réponse, puis du plus ancien au plus récent. `attend_depuis` = la plus ANCIENNE attente parmi ses fils : c'est elle
 * qui décide du rang, pas la date d'ouverture de la carte — une carte ouverte hier mais dont le locataire attend depuis
 * trois semaines doit passer devant.
 */
export async function lireEvenements(ctx: ContexteExpediteurs, limite = PAGE): Promise<{ cartes: CarteEvenement[]; total: number }> {
  const { rows } = await query<CarteDB>(
    `WITH ${ctesAttente('$2', '$3', ctx.deplacements)},
          messages_deplaces AS (${ctx.deplacements ? CTE_MESSAGES_DEPLACES : 'SELECT NULL::bigint AS evenement_id, NULL::text AS sens, NULL::boolean AS automatique, NULL::timestamptz AS recu_le WHERE false'})
     SELECT e.id::int AS evenement_id, e.reference, e.objet,
            coalesce(nullif(btrim(e.demandeur_nom), ''), e.demandeur_email) AS demandeur,
            e.adresse_libre, e.etat,
            to_char(e.ouvert_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ouvert_le,
            -- La dernière activité d'une carte, c'est le plus récent de SES échanges ET des mails qu'on y a déplacés.
            to_char(greatest(max(d.recu_le), max(md.recu_le)) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS dernier_echange_le,
            count(a.fil_id)::int AS nb_fils,
            ${ctx.deplacements ? `(SELECT count(*) FROM gestion_affectation am
                WHERE am.evenement_id = e.id AND am.actif AND am.message_id IS NOT NULL)::int` : '0'} AS nb_mails,
            ${ATTEND_CARTE} AS attend
       FROM gestion_evenement e
       -- message_id IS NULL : une affectation de MAIL ne compte pas comme un échange rattaché, sans quoi une carte
       --   annoncerait « 3 échanges » là où elle n'en a qu'un et deux mails isolés.
       LEFT JOIN gestion_affectation a ON a.evenement_id = e.id AND a.actif${ctx.deplacements ? ' AND a.message_id IS NULL' : ''}
       LEFT JOIN dernier d ON d.fil_id = a.fil_id
       LEFT JOIN messages_deplaces md ON md.evenement_id = e.id
       ${jointuresAttente('a.fil_id')}
      GROUP BY e.id
      ORDER BY (e.traite_le IS NOT NULL) ASC,
               ${ATTEND_CARTE} DESC,
               coalesce(min(d.recu_le) FILTER (WHERE ${ATTEND}), min(md.recu_le), e.ouvert_le) ASC,
               e.id ASC
      LIMIT $1`,
    [limite, adressesDe(ctx.partenaires), ctx.adresseGestion],
  );
  const { rows: t } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM gestion_evenement`);
  return {
    cartes: rows.map((r) => ({
      evenementId: r.evenement_id, reference: r.reference, objet: r.objet, demandeur: r.demandeur,
      adresseLibre: r.adresse_libre,
      etat: (r.etat === 'en_cours' || r.etat === 'traite' ? r.etat : 'a_traiter'),
      ouvertLe: r.ouvert_le, dernierEchangeLe: r.dernier_echange_le,
      nbFils: r.nb_fils, nbMailsDeplaces: r.nb_mails, attend: r.attend === true,
    })),
    total: t[0]?.n ?? 0,
  };
}

/**
 * Repères d'HONNÊTETÉ de l'écran : combien de messages ont été capturés, combien sont tenus hors de la file, et quand la
 * dernière relève a réussi. Sans eux, une page vide est ambiguë — « rien n'est arrivé » et « on n'a jamais relevé » se
 * ressemblent, et c'est exactement la confusion que le journal des passes existe pour lever.
 */
export async function lireReperes(): Promise<{ messagesCaptures: number; messagesExclus: number; derniereReleveLe: string | null }> {
  const { rows } = await query<{ captures: number; exclus: number }>(
    `SELECT count(*)::int AS captures, count(exclu_le)::int AS exclus FROM gestion_message`);
  const { rows: r } = await query<{ le: string | null }>(
    `SELECT to_char(max(termine_le) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS le
       FROM gestion_releve_run WHERE resultat = 'ok'`);
  return {
    messagesCaptures: rows[0]?.captures ?? 0,
    messagesExclus: rows[0]?.exclus ?? 0,
    derniereReleveLe: r[0]?.le ?? null,
  };
}

/**
 * LOT 5-VEILLE — LA DERNIÈRE PASSE AUTOMATIQUE, et elle seule.
 *
 * 🔴 `declencheur = 'planifie'` : ni « manuel » (un clic), ni « rattrapage » (une opération d'historique). C'est toute
 * la question que l'écran doit pouvoir poser — « l'ordonnanceur tourne-t-il encore ? » — et à laquelle un clic humain
 * répondrait faussement oui.
 *
 * 🔴 ON PREND LA DERNIÈRE PASSE TERMINÉE, RÉUSSIE OU NON. Ne regarder que les réussites masquerait exactement le cas
 * qu'il faut voir : un ordonnanceur qui tourne et qui échoue à chaque tour.
 *
 * ⚠️ Les lignes « en_cours » sont écartées : une passe commencée il y a deux secondes n'est pas encore une preuve, et
 * une passe abandonnée par un plantage brutal resterait « en_cours » pour toujours — elle ne doit pas éteindre
 * l'alerte à elle seule.
 */
export async function lireDernierePasseAuto(): Promise<{ le: string | null; resultat: 'ok' | 'erreur' | null; erreur: string | null }> {
  const { rows } = await query<{ le: string; resultat: 'ok' | 'erreur'; erreur: string | null }>(
    `SELECT to_char(termine_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS le, resultat, erreur
       FROM gestion_releve_run
      WHERE declencheur = 'planifie' AND resultat IN ('ok', 'erreur') AND termine_le IS NOT NULL
      ORDER BY termine_le DESC
      LIMIT 1`);
  const r = rows[0];
  return r ? { le: r.le, resultat: r.resultat, erreur: r.erreur } : { le: null, resultat: null, erreur: null };
}

/**
 * LOT RATTACHEMENT-2 — CE QUE LA DERNIÈRE PASSE AUTOMATIQUE A FAIT *APRÈS* AVOIR RELEVÉ LE COURRIER.
 *
 * ⚠️ LU À PART, et surtout PAS ajouté au SELECT de `lireDernierePasseAuto` : celui-ci nomme trois colonnes qui
 * existent depuis toujours, et y glisser une colonne de la migration 258 ferait échouer la requête — donc perdre
 * l'alerte de veille elle-même — le temps que la migration soit appliquée. Même précaution que pour
 * `lireToleranceVeille`, et pour la même raison.
 *
 * ⚠️ MIGRATION 258 ABSENTE ⇒ TOUT À `null`, ce qui veut dire « on ne sait pas » et non « tout va bien » : le bandeau
 * se tait alors, il ne rassure pas.
 */
export async function lireSuiteDernierePasse(): Promise<SuiteVue> {
  if (!await suiteReleveDisponible()) return { resultat: null, detail: null, ms: null };
  try {
    const { rows } = await query<{ r: 'ok' | 'erreur' | 'ignore' | null; d: string | null; ms: number | null }>(
      `SELECT suite_resultat AS r, suite_detail AS d, suite_ms AS ms
         FROM gestion_releve_run
        WHERE declencheur = 'planifie' AND resultat IN ('ok', 'erreur') AND termine_le IS NOT NULL
        ORDER BY termine_le DESC
        LIMIT 1`);
    const r = rows[0];
    return r ? { resultat: r.r, detail: r.d, ms: r.ms } : { resultat: null, detail: null, ms: null };
  } catch {
    return { resultat: null, detail: null, ms: null }; // le bandeau se tait plutôt que d'empêcher l'écran de s'afficher
  }
}

/**
 * LOT 5-VEILLE — combien d'intervalles de retard avant de crier. RÉGLAGE (migration 249), jamais un chiffre en dur.
 *
 * ⚠️ Lu À PART, et surtout PAS ajouté au SELECT de `chargerConfigGestion` : celui-ci retombe sur un jeu de colonnes
 * réduit dès qu'UNE colonne manque (42703), ce qui ferait perdre, le temps que la migration soit appliquée, tous les
 * réglages des migrations 230 à 241 — intervalle de relève compris, c'est-à-dire l'étalon même de cette alerte.
 */
export async function lireToleranceVeille(): Promise<number> {
  if (!await reglageVeilleDisponible()) return VEILLE_INTERVALLES_DEFAUT;
  try {
    const { rows } = await query<{ n: number }>(
      `SELECT veille_releve_intervalles AS n FROM gestion_config WHERE id = 1`);
    return toleranceVeilleValide(rows[0]?.n);
  } catch {
    return VEILLE_INTERVALLES_DEFAUT; // le réglage n'est pas la fonctionnalité : l'écran s'affiche quand même
  }
}

/** L'état complet de l'écran, en une fois. LECTURE SEULE de bout en bout. */
export async function lireEcran(limite = PAGE): Promise<EtatEcran> {
  // La fenêtre d'activité ET la liste des partenaires internes viennent de la BASE, jamais du code. Les deux sont lues
  //   d'abord : l'attente ne se calcule pas sans savoir qui est qui (lot 4d).
  const [config, partenaires, deplacements] = await Promise.all([
    chargerConfigGestion(), lirePartenairesInternes(), deplacementsDeMailsDisponibles(),
  ]);
  const ctx: ContexteExpediteurs = { partenaires, adresseGestion: config.adresseGestion, deplacements };
  const [file, evenements, reperes, sansSuite, auto, tolerance, suite] = await Promise.all([
    lireFile(config.fenetreActiviteJours, ctx, limite), lireEvenements(ctx), lireReperes(), lireSansSuite(),
    lireDernierePasseAuto(), lireToleranceVeille(), lireSuiteDernierePasse(),
  ]);
  return {
    file: file.lignes, filsTotal: file.total,
    fenetreJours: config.fenetreActiviteJours, filsTropAnciens: file.tropAnciens,
    // La CADENCE ATTENDUE vient du même réglage que la relève elle-même : l'alerte et la boucle ne peuvent pas
    //   diverger, et changer `releve_continue_secondes` déplace les deux du même coup.
    veille: {
      derniereLe: auto.le, resultat: auto.resultat, erreur: auto.erreur,
      intervalleS: config.releveContinueSecondes, toleranceIntervalles: tolerance,
    },
    suite,
    sansSuite: sansSuite.lignes, sansSuiteTotal: sansSuite.total,
    evenements: evenements.cartes, evenementsTotal: evenements.total,
    ...reperes,
  };
}
