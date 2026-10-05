import { query, withTransaction } from '../db/client';
import { contactCarteDisponible, partieCategorieDisponible } from './schema';
import { normaliserEmail } from './annuaire';
/**
 * 🔴🔴 LA RÈGLE UNIQUE DU LIEN DE BIEN, et c'est le fragment du dépôt — jamais une condition réécrite. Elle sert
 * ici à répondre à UNE question : « quelles adresses touchent ce bien ? ». Voir l'encadré de la lecture.
 */
import { sqlLiensDuBien } from './rattachement';
import { categorieRetenue } from './partieCategorie';
/* 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — le telephone d'une signature : fonction PURE, elle ne garde rien. */
import { telephoneEnSignature } from './lisibilite';
import type { Categorie, CategorieRangee, Cote, Origine } from './partieCategorie';
import type { Auteur } from './gestes';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-1 — LE CÂBLAGE DE LA MIGRATION 304 ══════════════════════════════════════════════════
 *
 * ⚠️ PAS DE `import 'server-only'` ICI. Les commandes de ligne (`tsx`) importent les dépôts du module, et
 * `server-only` lève hors du bundle react-server. La frontière client/serveur est tenue par
 * `app/lib/garde/serverOnly.guard.test.ts` et `clientBoundary.guard.test.ts` — convention du module, voir
 * `interneMessageRepo.ts` et `horsGestionRepo.ts`.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LA RÈGLE N'EST PAS ÉCRITE ICI. Elle vit dans le module PUR `partieCategorie.ts`, lu par le navigateur comme
 * par le serveur. Ce fichier ne fait que LIRE et ÉCRIRE : il n'a aucune opinion sur ce qu'une adresse est, et
 * surtout il ne REFAIT pas la résolution en SQL. Deux écritures de la même règle — une en TypeScript pour l'écran,
 * une en SQL pour la liste — divergent au premier ajustement ; c'est exactement le défaut que le lot
 * RENOMMER-PARTOUT a payé (la modale lisait les fenêtres, la liste la marque d'échange, et les deux se
 * contredisaient sur 3 conversations).
 *
 * ═══ 🔒 SANS LA MIGRATION 304, AUCUNE DES DEUX TABLES NEUVES N'EST NOMMÉE ═════════════════════════════════════════
 *
 * Chaque fonction SONDE d'abord, et répond comme avant ce lot : une lecture rend vide, une écriture refuse en
 * disant pourquoi. La leçon est écrite en toutes lettres dans l'en-tête de `schema.ts` et elle a coûté cher ici :
 * nommer une table absente ne casse pas la fonction nouvelle, il casse TOUT l'écran.
 *
 * ⚠️ LA SONDE SE FAIT HORS TRANSACTION, jamais à l'intérieur : PostgreSQL abandonne toute la transaction à la
 * première erreur, et un repli placé après une requête qui vient d'échouer ne peut plus s'exécuter.
 *
 * ═══ 🔒 TOUT GESTE EXIGE UN AUTEUR HUMAIN NOMMÉ ═══════════════════════════════════════════════════════════════════
 *
 * Poser une catégorie à la main, poser ou retirer une carte, marquer « Vérifié » : ce sont des DÉCISIONS, et une
 * décision a un auteur. Un auteur anonyme ou littéralement « automatique » est refusé ICI **et** par la base
 * (`gestion_partie_categorie_auteur_chk`, `gestion_contact_carte_auteur_chk`) — deux gardes pour la même règle,
 * parce qu'un garde applicatif se contourne au prochain script et une contrainte non.
 *
 * ⚠️ LA PASSE DE REPRISE, ELLE, N'EST PAS UN GESTE : elle écrit des `origine = 'defaut'` / `'propose'` et des
 * cartes `origine = 'auto'`, signées « automatique », ce qui est la vérité. Elle n'emprunte donc AUCUNE des
 * fonctions de ce fichier — elle a ses propres instructions, dans son script, et ne peut pas poser de `manuel`.
 *
 * 🔴 RIEN N'EST JAMAIS SUPPRIMÉ. Aucun `DELETE` dans ce fichier : retirer écrit une date, un auteur et un motif.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① CE QUE L'ÉCRAN LIT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Une catégorie vivante, telle que la base la porte. */
export interface LigneCategorie {
  id: number;
  adresse: string;
  /** `null` = catégorie GLOBALE (`independant`), rangée une fois pour tous les biens. */
  lotCle: string | null;
  categorie: Categorie;
  origine: Origine;
  verifieLe: string | null;
  verifiePar: string | null;
  poseLe: string;
  posePar: string;
}

/**
 * CE QU'ON SAIT D'UNE ADRESSE SUR UN BIEN : les deux lignes possibles, et ce qui l'emporte.
 *
 * ⚠️ `retenue` EST CALCULÉE PAR LE MODULE PUR, jamais par la requête : l'écran et le serveur doivent répondre
 * pareil, et une seule écriture de la règle le garantit.
 */
export interface CategorieDuBien {
  adresse: string;
  parBien: LigneCategorie | null;
  globale: LigneCategorie | null;
  retenue: CategorieRangee | null;
}

/** Une carte de contact vivante. */
export interface LigneCarte {
  id: number;
  lotCle: string;
  cote: Cote;
  adresse: string;
  nom: string | null;
  telephone: string | null;
  origine: 'auto' | 'manuel';
  verifieLe: string | null;
  verifiePar: string | null;
  creeLe: string;
  creePar: string;
}

/**
 * 🔴🔴 LOT HISTORIQUE-BIEN-3 — `retires` PORTE LES IDENTIFIANTS QUE LE GESTE A RETIRÉS.
 *
 * DEMANDE D'ARNO (05/10/2026) : « après le dépôt, petit message “Fanny Rosky → Locataire” avec “Annuler”
 * quelques secondes. »
 *
 * 🔴 SANS CES IDENTIFIANTS, « ANNULER » NE POUVAIT PAS ÊTRE EXACT. Reposer la catégorie d'avant aurait laissé une
 * ligne `manuel` là où il n'y avait qu'une PROPOSITION — c'est-à-dire aurait transformé l'annulation en une
 * seconde décision humaine, que l'automatisation ne reprendra plus jamais. L'annulation ROUVRE donc exactement
 * la ligne que le geste avait retirée, et retire celle qu'il avait posée. C'est la convention de ce dépôt
 * (« rien n'est supprimé ») appliquée dans les deux sens.
 *
 * ⚠️ FACULTATIF, pour que les appelants d'avant ce lot restent inchangés.
 */
export type IssuePartieCategorie =
  | { ok: true; id: number | null; nb: number; retires?: readonly number[] }
  | { ok: false; motif: string };

const SANS_304 = 'Mise à jour de la base à appliquer (migration 304) : le rangement des parties n’est pas encore '
  + 'installé.';
const SANS_304_CARTES = 'Mise à jour de la base à appliquer (migration 304) : les cartes de contact ne sont pas '
  + 'encore installées.';

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LES GARDES COMMUNS — PURS, ET DONC TESTABLES SANS BASE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * 🔒 L'AUTEUR EST-IL UN HUMAIN NOMMÉ ? La même règle que `auteurHumainInterneMessage`, au mot près — et la même
 * raison : « automatique » n'est pas quelqu'un, et un libellé vide ne se défend pas six mois plus tard.
 */
export function auteurHumainPartieCategorie(a: { libelle?: string | null } | null | undefined): boolean {
  const l = (a?.libelle ?? '').trim();
  return l !== '' && l.toLowerCase() !== 'automatique';
}

/**
 * L'ADRESSE, NORMALISÉE COMME PARTOUT AILLEURS (`normaliserEmail`), ou `null` si elle n'est pas une adresse.
 *
 * ⚠️ UNE SEULE DÉFINITION DE « LA MÊME ADRESSE » DANS TOUT LE MODULE. Si l'on normalisait ici autrement que le
 * relevé des adresses d'un message, une catégorie posée à la main ne retrouverait jamais le courrier qu'elle
 * concerne — et la base, dont la contrainte exige des minuscules, refuserait l'écriture sans dire pourquoi.
 */
function adressePropre(brut: string | null | undefined): string | null {
  return normaliserEmail(brut ?? '');
}

/** Une clé de lot propre, ou `null`. Bornée : on refuse un payload absurde, pas une saisie. */
function lotPropre(brut: string | null | undefined): string | null {
  const s = (brut ?? '').trim();
  return s === '' || s.length > 200 ? null : s;
}

/** Un texte court, borné, ou `null`. Jamais de chaîne vide en base : l'absence se dit `NULL`. */
function texteCourt(brut: string | null | undefined, max = 300): string | null {
  const s = (brut ?? '').trim();
  return s === '' ? null : s.slice(0, max);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LIRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const HORODATAGE = `to_char(%s AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
const ts = (col: string): string => HORODATAGE.replace('%s', col);

function ligneCategorie(r: {
  id: string; adresse: string; lot_cle: string | null; categorie: string; origine: string;
  verifie_le: string | null; verifie_par: string | null; pose_le: string; pose_par: string;
}): LigneCategorie {
  return {
    id: Number(r.id), adresse: r.adresse, lotCle: r.lot_cle,
    categorie: r.categorie as Categorie, origine: r.origine as Origine,
    verifieLe: r.verifie_le, verifiePar: r.verifie_par, poseLe: r.pose_le, posePar: r.pose_par,
  };
}

/**
 * LES CATÉGORIES QUI CONCERNENT UN BIEN — celles POSÉES SUR CE BIEN, et les GLOBALES des mêmes adresses.
 *
 * 🔴 LES DEUX SONT INDISPENSABLES, et c'est tout l'intérêt de la lecture : sans la ligne globale, un prestataire
 * rangé `independant` une fois pour toutes réapparaîtrait comme « contact du propriétaire » sur chaque bien où une
 * ligne par défaut a été posée. La résolution (`categorieRetenue`) a besoin des deux pour trancher.
 *
 * ⚠️ UNE SEULE REQUÊTE POUR TOUTE LA FICHE : règle du module. Elle rend aussi les adresses qui n'ont QU'une ligne
 * globale et aucune ligne sur ce bien — un indépendant vu sur ce bien est une information utile à l'écran
 * (« 2 indépendants vus »), même s'il n'y est pas rattaché.
 */
export async function lireCategoriesDuBien(lotCle: string): Promise<CategorieDuBien[]> {
  const lot = lotPropre(lotCle);
  if (lot === null || !(await partieCategorieDisponible())) return [];

  const { rows } = await query<{
    id: string; adresse: string; lot_cle: string | null; categorie: string; origine: string;
    verifie_le: string | null; verifie_par: string | null; pose_le: string; pose_par: string;
  }>(
    /* ⚠️ LES GLOBALES SONT BORNÉES AUX ADRESSES QUI TOUCHENT CE BIEN (la sous-requête `adresses`), jamais « toutes
       les globales » : il y en a 65 aujourd'hui, et rien ne dit qu'il n'y en aura pas mille. */
    /**
     * ══ 🔴🔴 DÉFAUT TROUVÉ À L'ÉCRAN, ET IL VIDAIT LE GROUPE « INDÉPENDANT » ENTIER ════════════════════════════
     *
     * La première écriture de cette requête définissait « les adresses qui touchent ce bien » comme **celles qui
     * portent déjà une ligne de catégorie sur ce bien**. Or la reprise donne à une adresse **soit** une ligne
     * globale `independant`, **soit** une ligne par bien — jamais les deux. Mesuré en base le 04/10/2026 :
     * **65 indépendants globaux**, et **0 adresse** possédant à la fois une ligne sur un lot et une ligne
     * globale. La sous-requête était donc toujours vide de ces adresses-là : **aucun indépendant ne pouvait
     * jamais sortir de cette lecture**, et le groupe « Indépendant » de l'écran restait vide quoi qu'on range.
     *
     * 🔴 L'ENCADRÉ DE CETTE FONCTION PROMETTAIT POURTANT LE CONTRAIRE (« elle rend aussi les adresses qui n'ont
     * QU'une ligne globale et aucune ligne sur ce bien »). C'est le pire genre de défaut : la documentation
     * disait l'intention, le SQL faisait autre chose, et rien ne rougissait.
     *
     * 🔴 LA BONNE DÉFINITION EST LE COURRIER : une adresse touche ce bien si elle apparaît dans un mail rattaché
     * à ce bien. On l'écrit avec `sqlLiensDuBien`, le fragment unique du dépôt — pas avec une condition
     * recopiée. Et l'on garde l'union avec les lignes posées sur ce lot : une adresse rangée à la main doit
     * rester lisible même si son dernier mail a été détaché depuis.
     */
    `WITH adresses AS (
        SELECT DISTINCT lower(btrim(a.adresse)) AS adresse
          FROM gestion_rattachement r
          JOIN gestion_message_adresse a ON a.message_id = r.message_id
         WHERE r.cible_cle = $1 AND ${sqlLiensDuBien('r')}
        UNION
        SELECT DISTINCT adresse FROM gestion_partie_categorie
         WHERE retire_le IS NULL AND lot_cle = $1
      )
      SELECT c.id::text, c.adresse, c.lot_cle, c.categorie, c.origine,
             ${ts('c.verifie_le')} AS verifie_le, c.verifie_par_libelle AS verifie_par,
             ${ts('c.pose_le')} AS pose_le, c.pose_par_libelle AS pose_par
        FROM gestion_partie_categorie c
       WHERE c.retire_le IS NULL
         AND (c.lot_cle = $1 OR (c.lot_cle IS NULL AND c.adresse IN (SELECT adresse FROM adresses)))
       ORDER BY c.adresse, c.lot_cle NULLS LAST`, [lot]);

  const par = new Map<string, CategorieDuBien>();
  for (const r of rows) {
    const l = ligneCategorie(r);
    const e = par.get(l.adresse) ?? { adresse: l.adresse, parBien: null, globale: null, retenue: null };
    if (l.lotCle === null) e.globale = l; else e.parBien = l;
    par.set(l.adresse, e);
  }
  /* 🔴 LA RÉSOLUTION EST FAITE PAR LE MODULE PUR, après la lecture. Jamais en SQL. */
  for (const e of par.values()) {
    e.retenue = categorieRetenue({
      parBien: e.parBien === null ? null : { categorie: e.parBien.categorie, origine: e.parBien.origine },
      globale: e.globale === null ? null : { categorie: e.globale.categorie, origine: e.globale.origine },
    });
  }
  return [...par.values()];
}

/**
 * LES CARTES DE CONTACT D'UN BIEN, les deux côtés.
 *
 * ⚠️ LES VÉRIFIÉES D'ABORD : ce sont les seules qui s'affichent d'emblée, les autres étant repliées derrière leur
 * nombre au-delà de six (`SEUIL_REPLI_CARTES`). L'ordre de la requête épargne un tri à l'écran, et surtout il
 * épargne DEUX tris qui divergeraient.
 */
export async function lireCartesDuBien(lotCle: string): Promise<LigneCarte[]> {
  const lot = lotPropre(lotCle);
  if (lot === null || !(await contactCarteDisponible())) return [];

  const { rows } = await query<{
    id: string; lot_cle: string; cote: string; adresse: string; nom: string | null; telephone: string | null;
    origine: string; verifie_le: string | null; verifie_par: string | null; cree_le: string; cree_par: string;
  }>(
    `SELECT id::text, lot_cle, cote, adresse, nom, telephone, origine,
            ${ts('verifie_le')} AS verifie_le, verifie_par_libelle AS verifie_par,
            ${ts('cree_le')} AS cree_le, cree_par_libelle AS cree_par
       FROM gestion_contact_carte
      WHERE retire_le IS NULL AND lot_cle = $1
      ORDER BY cote, (verifie_le IS NULL), coalesce(nom, adresse), id`, [lot]);

  return rows.map((r) => ({
    id: Number(r.id), lotCle: r.lot_cle, cote: r.cote as Cote, adresse: r.adresse,
    nom: r.nom, telephone: r.telephone, origine: r.origine as 'auto' | 'manuel',
    verifieLe: r.verifie_le, verifiePar: r.verifie_par, creeLe: r.cree_le, creePar: r.cree_par,
  }));
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — LE NOM ET LE TÉLÉPHONE À PRÉ-REMPLIR DANS LA CARTE ═════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026) : la carte qu'ouvre le « + » « est pré-remplie : nom, adresse, téléphone trouvé en
 * signature ».
 *
 * 🔴 POURQUOI ÇA VALAIT LE DÉTOUR, MESURÉ AVANT D'ÊTRE ÉCRIT. Sur les 485 cartes actives du 05/10/2026, **zéro**
 * porte un téléphone : la colonne existe depuis la migration 304 et rien ne l'a jamais remplie. Or sur les 183
 * adresses de ces cartes qui ont RÉELLEMENT écrit, **151 — 83 %** portent un numéro français dans le corps de
 * leurs mails. Renseigner cela à la main 151 fois est exactement le travail qu'Arno veut éviter.
 *
 * 🔴 UNE SEULE LECTURE POUR TOUT LE BIEN, ET AUCUNE ADRESSE DANS UNE URL. L'écran reçoit ces coordonnées AVEC la
 * liste des parties, au même appel : le « + » n'a donc rien à demander au moment du clic. C'est aussi ce qui
 * évite de faire voyager une adresse personnelle dans une chaîne de requête — ce que ce dépôt refuse partout,
 * et que je ne vais pas autoriser pour une commodité de pré-remplissage.
 *
 * 🔴 LE NOM VIENT DU MAIL, PAS D'UNE DEVINETTE : `gestion_message_adresse.adresse_brute` porte le « Nom
 * <adresse> » tel qu'il a été reçu, et c'est le nom le PLUS FRÉQUENT qui gagne. Une personne signe parfois
 * « J. Mercier » et parfois « Jean Mercier (Puro Flow) » ; le plus fréquent est celui qu'elle emploie.
 *
 * ⚠️ BORNÉE À SES DERNIERS MAILS, et c'est ce qui rend la lecture tenable : on cherche une signature, et la plus
 * récente est la bonne. Lire tout l'historique d'un bien bavard coûterait des centaines de corps pour un champ
 * de formulaire.
 *
 * ⚠️ LE CORPS N'EST LU QUE POUR LE TÉLÉPHONE, et par une fonction PURE (`telephoneEnSignature`) qui n'en garde
 * rien. Aucun extrait de courrier ne sort de cette fonction.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export interface CoordonneesTrouvees {
  adresse: string;
  nom: string | null;
  telephone: string | null;
}

/**
 * Combien de mails récents on examine par adresse. Les mails qu'elle a ÉCRITS passent en tête, donc ces huit
 * places vont d'abord aux seuls qui peuvent porter sa signature ; les autres ne servent qu'à lire son nom.
 */
const MAILS_POUR_LA_SIGNATURE = 8;

export async function coordonneesDesParties(lotCle: string): Promise<CoordonneesTrouvees[]> {
  const lot = lotPropre(lotCle);
  /**
   * 🔴 ELLE SONDE LA 304 COMME TOUTES SES VOISINES, et ce n'est pas une formalité : sans la migration, aucune
   * carte de contact ne peut naître (`poserCarteAlaMain` refuse), donc chercher de quoi la PRÉ-REMPLIR serait du
   * travail pour rien — une lecture de corps de mails sur tout un bien, pour un formulaire qui ne s'ouvrira pas.
   *
   * ⚠️ ELLE NE NOMME AUCUNE DES DEUX TABLES NEUVES : elle lit `gestion_rattachement` et
   * `gestion_message_adresse`, qui existaient avant. La sonde dit ici « ce travail a-t-il un destinataire ? »,
   * et non « la table existe-t-elle ? ».
   */
  if (lot === null || !(await contactCarteDisponible())) return [];

  /**
   * ══ 🔴🔴 LE NOM SE LIT PARTOUT, LE TÉLÉPHONE SEULEMENT DANS CE QU'ELLE A ÉCRIT ══════════════════════════════
   *
   * 🔴 ET CETTE DISTINCTION VIENT D'UN ESSAI RÉEL, PAS D'UNE INTUITION. Ma première version ne lisait que les
   * mails où l'adresse est EXPÉDITRICE. Essayée sur lot-299, elle rendait du vide pour
   * `puroflowparis@gmail.com` : en base, cette adresse n'y apparaît qu'en `copie` et en `destinataire` — elle
   * n'a jamais écrit sur ce bien. Son NOM, lui, est parfaitement connu (« Puro Flow Paris <…> » dans
   * `adresse_brute` d'une ligne « copie »).
   *
   *   · LE NOM vient de `adresse_brute`, QUEL QUE SOIT LE RÔLE : c'est l'en-tête du mail qui le porte, et
   *     « Nom <adresse> » s'écrit pareil qu'on soit expéditeur, destinataire ou en copie.
   *   · LE TÉLÉPHONE ne se cherche QUE dans les mails qu'elle a ÉCRITS : une signature est au bas de SON
   *     message. Dans un mail où elle est en copie, le numéro du bas est celui de quelqu'un d'autre — et
   *     proposer ce numéro-là serait pire que de n'en proposer aucun.
   *
   * ⚠️ LES MAILS QU'ELLE A ÉCRITS PASSENT EN TÊTE (`ORDER BY (role = 'expediteur') DESC`), et la borne par
   * adresse les attrape donc en priorité. Le `row_number` fait cette borne PAR ADRESSE et non globale : sans
   * lui, un seul correspondant bavard consommerait les places et tous les autres ressortiraient sans rien.
   *
   * ⚠️ LE CORPS N'EST LU QUE POUR LES MAILS ÉCRITS PAR ELLE, et le `CASE` le dit en SQL plutôt qu'en TypeScript :
   * c'est des milliers de corps de mails qui ne traversent pas le réseau de la base.
   */
  const { rows } = await query<{
    adresse: string; adresse_brute: string | null; corps: string | null;
  }>(
    `WITH liens AS (
       SELECT DISTINCT r.message_id
         FROM gestion_rattachement r
        WHERE r.cible_sorte = 'lot' AND r.cible_cle = $1 AND r.statut = 'confirme'),
     vues AS (
       SELECT a.adresse, a.adresse_brute, a.role, m.corps_texte,
              row_number() OVER (
                PARTITION BY a.adresse
                ORDER BY (a.role = 'expediteur') DESC, m.recu_le DESC NULLS LAST, m.id DESC) AS rang
         FROM gestion_message_adresse a
         JOIN gestion_message m ON m.id = a.message_id
        WHERE a.message_id IN (SELECT message_id FROM liens) AND NOT a.interne)
     SELECT adresse, adresse_brute,
            CASE WHEN role = 'expediteur' THEN left(coalesce(corps_texte, ''), 8000) END AS corps
       FROM vues WHERE rang <= $2
      ORDER BY adresse, rang`, [lot, MAILS_POUR_LA_SIGNATURE]);

  /** Par adresse : les noms vus (pour élire le plus fréquent) et le premier téléphone trouvé. */
  const parAdresse = new Map<string, { noms: Map<string, number>; telephone: string | null }>();
  for (const r of rows) {
    const cle = r.adresse.trim().toLowerCase();
    const e = parAdresse.get(cle) ?? { noms: new Map<string, number>(), telephone: null };
    const nom = nomDeLAdresseBrute(r.adresse_brute, cle);
    if (nom !== null) e.noms.set(nom, (e.noms.get(nom) ?? 0) + 1);
    if (e.telephone === null) e.telephone = telephoneEnSignature(r.corps);
    parAdresse.set(cle, e);
  }

  return [...parAdresse.entries()].map(([adresse, e]) => ({
    adresse,
    /* LE PLUS FRÉQUENT GAGNE ; à égalité, le plus long — il porte en général le prénom ET le nom. */
    nom: [...e.noms.entries()].sort((a, b) => (b[1] - a[1]) || (b[0].length - a[0].length))[0]?.[0] ?? null,
    telephone: e.telephone,
  }));
}

/**
 * Le nom lisible d'une adresse brute « Nom <adresse> », ou `null` si elle n'en porte pas.
 *
 * ⚠️ ON REFUSE UN « NOM » QUI EST L'ADRESSE ELLE-MÊME : beaucoup de clients de messagerie recopient l'adresse
 * dans le champ du nom, et pré-remplir « puroflowparis@gmail.com » dans la case « Nom » n'apprendrait rien.
 */
function nomDeLAdresseBrute(brute: string | null, adresse: string): string | null {
  const b = (brute ?? '').trim();
  if (b === '') return null;
  const m = /^\s*"?([^"<]*?)"?\s*<[^>]*>\s*$/.exec(b);
  const nom = (m?.[1] ?? '').trim();
  if (nom === '' || nom.toLowerCase() === adresse) return null;
  return nom;
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — LES BIENS OÙ DES ADRESSES SONT DES CONTACTS RATTACHÉS ══════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026) : « But (à rappeler dans le code) : ce contact, désormais rattaché à une partie du
 * bien, permet ensuite de rattacher automatiquement ses nouveaux mails au bien. Vérifie que la passe de
 * rattachement automatique utilise bien ces cartes de contact (côté propriétaire et côté locataire) ; si ce n'est
 * pas le cas, branche-la. »
 *
 * 🔴 ELLE NE LES UTILISAIT PAS, ET C'EST LA MESURE QUI LE DIT : avant ce lot, `gestion_contact_carte` n'était lue
 * que par ce fichier — c'est-à-dire par l'écran qui POSE les cartes, et par personne d'autre. Le « + » de la
 * fiche d'un bien n'avait donc aucune suite. C'est cette fonction qui lui en donne une : elle alimente le cas (f)
 * de `proposerBiens`, pour la passe automatique ET pour l'écran de classement.
 *
 * 🔴 POURQUOI ELLE EST **ICI** ET NON CHEZ SES DEUX APPELANTS. Ce dépôt est le seul endroit du code autorisé à
 * nommer les tables de la migration 304, et un garde l'éprouve (`partieCategorieRepo.test.ts`) en refusant toute
 * liste blanche qu'on allongerait. La règle n'est pas décorative : deux lecteurs auraient fini par ne plus
 * s'accorder sur ce qu'est une carte VIVANTE — et c'est le genre de divergence qui fait classer un mail chez le
 * mauvais propriétaire.
 *
 * ⚠️ UNE SEULE REQUÊTE, BORNÉE AUX ADRESSES DEMANDÉES. Une passe complète traverse des milliers de messages : une
 * requête par adresse serait des milliers d'accès.
 *
 * ⚠️ LES CARTES RETIRÉES NE COMPTENT PAS. Une carte retirée est un rattachement défait ; la faire encore proposer
 * son bien rendrait le geste de retrait sans effet.
 *
 * ⚠️ LES DEUX CÔTÉS COMPTENT, ET SEULS LES DEUX EXISTENT : la colonne `cote` est contrainte à
 * `proprietaire | locataire`. Les TIERS INDÉPENDANTS ne peuvent donc pas avoir de carte — la règle d'Arno (« ils
 * restent exclus de l'automatisation ») est tenue par le schéma avant de l'être par le code.
 *
 * ⚠️ SANS LA TABLE, LA CARTE REVIENT VIDE et le cas (f) ne joue pas : la passe se comporte exactement comme avant
 * ce lot. Une sonde voyage avec sa donnée — règle du module.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export async function biensDesContacts(
  adresses: readonly string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const uniques = [...new Set(adresses.map((a) => a.trim().toLowerCase()).filter((a) => a !== ''))];
  if (uniques.length === 0 || !(await contactCarteDisponible())) return out;

  const { rows } = await query<{ adresse: string; lot_cle: string }>(
    `SELECT DISTINCT adresse, lot_cle
       FROM gestion_contact_carte
      WHERE retire_le IS NULL AND adresse = ANY($1::text[])
      ORDER BY adresse, lot_cle`, [uniques]);

  for (const r of rows) {
    const cle = r.adresse.trim().toLowerCase();
    out.set(cle, [...(out.get(cle) ?? []), r.lot_cle]);
  }
  return out;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ ÉCRIRE — À LA MAIN, ET SEULEMENT À LA MAIN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * POSER UNE CATÉGORIE À LA MAIN. `origine = 'manuel'`, toujours — cette fonction ne sait rien écrire d'autre.
 *
 * 🔴 LE CHOIX MANUEL PRIME, ET C'EST ÉCRIT DANS LA DONNÉE, pas seulement dans l'ordre d'affichage : la reprise
 * saute les lignes `manuel`, et `categorieRetenue` les place devant. Poser à la main est donc définitif jusqu'au
 * prochain geste humain.
 *
 * 🔴 LA PORTÉE EST DÉDUITE DE LA CATÉGORIE, JAMAIS DEMANDÉE À L'APPELANT : `independant` est GLOBAL
 * (`lot_cle = NULL`), toute autre catégorie porte le bien. La base refuse l'autre combinaison
 * (`gestion_partie_categorie_portee_chk`), et déduire ici évite à chaque appelant d'avoir à y penser — c'est-à-dire
 * d'avoir à se tromper.
 *
 * ⚠️ UNE SEULE TRANSACTION, ET LE RETRAIT AVANT LA POSE : l'index d'unicité ne tolère qu'une ligne vivante par
 * (adresse, lot). Les deux instructions doivent donc être indissociables — sinon un échec entre les deux laisserait
 * l'adresse sans aucune catégorie.
 *
 * ⚠️ PIÈGE `withTransaction` (déjà payé ailleurs) : la transaction COMMITTE au retour normal. Tous les refus sont
 * donc rendus AVANT d'ouvrir la transaction, jamais à l'intérieur après une écriture.
 */
export async function poserCategorieAlaMain(o: {
  adresse: string; lotCle: string | null; categorie: Categorie; auteur: Auteur; motif?: string | null;
}): Promise<IssuePartieCategorie> {
  if (!(await partieCategorieDisponible())) return { ok: false, motif: SANS_304 };
  if (!auteurHumainPartieCategorie(o.auteur)) {
    return { ok: false, motif: 'Ce rangement se fait à la main : l’auteur du geste doit être identifié.' };
  }
  const adresse = adressePropre(o.adresse);
  if (adresse === null) return { ok: false, motif: 'Adresse illisible.' };

  const global = o.categorie === 'independant';
  const lot = global ? null : lotPropre(o.lotCle);
  if (!global && lot === null) {
    return { ok: false, motif: 'Un contact du propriétaire ou du locataire se range toujours sur un bien.' };
  }
  const motif = texteCourt(o.motif);

  const retires: number[] = [];
  const id = await withTransaction(async (q) => {
    /* ① LA LIGNE VIVANTE EN PLACE EST RETIRÉE — datée, signée, jamais supprimée.
       🔴 ET SON IDENTIFIANT EST GARDÉ (lot HISTORIQUE-BIEN-3) : c'est lui, et lui seul, qui permet à « Annuler »
          de ROUVRIR exactement la ligne d'avant au lieu d'en reposer une nouvelle à la main. */
    const { rows: anciens } = await q<{ id: string }>(
      `UPDATE gestion_partie_categorie
          SET retire_le = now(), retire_par = $3, retire_par_libelle = $4,
              retire_motif = coalesce($5, 'remplacée par un rangement manuel')
        WHERE retire_le IS NULL AND adresse = $1 AND coalesce(lot_cle, '') = coalesce($2, '')
        RETURNING id::text`,
      [adresse, lot, o.auteur.id, o.auteur.libelle, motif]);
    for (const r of anciens) retires.push(Number(r.id));

    /* ② PUIS LA NOUVELLE. `origine` est en dur : cette fonction est le geste manuel, et rien d'autre. */
    const { rows } = await q<{ id: string }>(
      `INSERT INTO gestion_partie_categorie
         (adresse, lot_cle, categorie, origine, pose_par, pose_par_libelle,
          verifie_le, verifie_par, verifie_par_libelle)
       VALUES ($1, $2, $3, 'manuel', $4, $5, now(), $4, $5)
       RETURNING id::text`,
      [adresse, lot, o.categorie, o.auteur.id, o.auteur.libelle]);
    return Number(rows[0]?.id ?? 0);
  });

  return { ok: true, id: id === 0 ? null : id, nb: 1, retires };
}

/**
 * MARQUER UNE CATÉGORIE « VÉRIFIÉ ». Elle ne CHANGE PAS la catégorie : elle retire la mention « à vérifier ».
 *
 * 🔴 ET ELLE N'OUVRE RIEN. Vérifier un `independant` veut dire « oui, c'est bien un prestataire » : il ne sert pas
 * davantage à l'automatisation après qu'avant (`sertALAutomatisation` ne lit pas l'origine, exprès). L'intuition
 * inverse — « vérifié donc de confiance donc automatisable » — est l'erreur que tout ce lot existe pour empêcher.
 */
export async function marquerCategorieVerifiee(o: {
  id: number; auteur: Auteur;
}): Promise<IssuePartieCategorie> {
  if (!(await partieCategorieDisponible())) return { ok: false, motif: SANS_304 };
  if (!auteurHumainPartieCategorie(o.auteur)) {
    return { ok: false, motif: 'Vérifier est un geste humain : l’auteur doit être identifié.' };
  }
  if (!Number.isSafeInteger(o.id) || o.id <= 0) return { ok: false, motif: 'Aucune catégorie désignée.' };

  const { rows } = await query<{ id: string }>(
    `UPDATE gestion_partie_categorie
        SET verifie_le = now(), verifie_par = $2, verifie_par_libelle = $3
      WHERE id = $1 AND retire_le IS NULL
      RETURNING id::text`, [o.id, o.auteur.id, o.auteur.libelle]);
  return { ok: true, id: rows.length === 0 ? null : Number(rows[0].id), nb: rows.length };
}

/**
 * POSER UNE CARTE DE CONTACT À LA MAIN sur un côté d'un bien (`origine = 'manuel'`).
 *
 * ⚠️ UNE CARTE POSÉE À LA MAIN NAÎT VÉRIFIÉE : quelqu'un vient de la regarder et de l'écrire. Laisser la mention
 * « à vérifier » sur ce qu'on vient de saisir soi-même ferait du libellé un bruit de fond — et le repli au-delà de
 * six la masquerait, alors qu'elle est justement celle qu'on veut voir.
 *
 * ⚠️ `ON CONFLICT … DO UPDATE` SUR L'INDEX PARTIEL DES VIVANTES, AVEC SON PRÉDICAT RÉPÉTÉ : sans le prédicat,
 * PostgreSQL rend « there is no unique or exclusion constraint matching the ON CONFLICT specification » — erreur
 * payée une fois le 04/10/2026 sur `gestion_piece_drive`. Reposer la même carte COMPLÈTE donc la précédente au
 * lieu d'échouer : c'est le geste attendu quand on ajoute un téléphone à une carte née sans nom.
 */
export async function poserCarteAlaMain(o: {
  lotCle: string; cote: Cote; adresse: string; nom?: string | null; telephone?: string | null; auteur: Auteur;
}): Promise<IssuePartieCategorie> {
  if (!(await contactCarteDisponible())) return { ok: false, motif: SANS_304_CARTES };
  if (!auteurHumainPartieCategorie(o.auteur)) {
    return { ok: false, motif: 'Une carte se pose à la main : l’auteur du geste doit être identifié.' };
  }
  const lot = lotPropre(o.lotCle);
  if (lot === null) return { ok: false, motif: 'Aucun bien désigné.' };
  const adresse = adressePropre(o.adresse);
  if (adresse === null) return { ok: false, motif: 'Adresse illisible.' };
  if (o.cote !== 'proprietaire' && o.cote !== 'locataire') {
    return { ok: false, motif: 'Une carte se range du côté du propriétaire ou du côté du locataire.' };
  }

  const { rows } = await query<{ id: string }>(
    `INSERT INTO gestion_contact_carte
       (lot_cle, cote, adresse, nom, telephone, origine, cree_par, cree_par_libelle,
        verifie_le, verifie_par, verifie_par_libelle)
     VALUES ($1, $2, $3, $4, $5, 'manuel', $6, $7, now(), $6, $7)
     ON CONFLICT (lot_cle, cote, adresse) WHERE retire_le IS NULL DO UPDATE
       SET nom = coalesce(EXCLUDED.nom, gestion_contact_carte.nom),
           telephone = coalesce(EXCLUDED.telephone, gestion_contact_carte.telephone),
           origine = 'manuel',
           verifie_le = now(), verifie_par = EXCLUDED.verifie_par,
           verifie_par_libelle = EXCLUDED.verifie_par_libelle
     RETURNING id::text`,
    [lot, o.cote, adresse, texteCourt(o.nom), texteCourt(o.telephone, 60), o.auteur.id, o.auteur.libelle]);

  return { ok: true, id: rows.length === 0 ? null : Number(rows[0].id), nb: rows.length };
}

/**
 * RETIRER UNE CARTE. 🔴 AUCUN `DELETE` : la ligne reste, avec qui l'a retirée, quand et pourquoi.
 *
 * ⚠️ POURQUOI LE MOTIF COMPTE ICI PLUS QU'AILLEURS. Une carte retirée est presque toujours une carte MAL RANGÉE —
 * un indépendant pris pour un contact du propriétaire. Le motif est ce qui permettra, plus tard, de distinguer
 * « ce n'est pas le contact de cette partie » de « cette personne n'a plus rien à voir avec le bien ».
 */
export async function retirerCarte(o: {
  id: number; auteur: Auteur; motif?: string | null;
}): Promise<IssuePartieCategorie> {
  if (!(await contactCarteDisponible())) return { ok: false, motif: SANS_304_CARTES };
  if (!auteurHumainPartieCategorie(o.auteur)) {
    return { ok: false, motif: 'L’auteur du geste doit être identifié.' };
  }
  if (!Number.isSafeInteger(o.id) || o.id <= 0) return { ok: false, motif: 'Aucune carte désignée.' };

  const { rows } = await query<{ id: string }>(
    `UPDATE gestion_contact_carte
        SET retire_le = now(), retire_par = $2, retire_par_libelle = $3, retire_motif = $4
      WHERE id = $1 AND retire_le IS NULL
      RETURNING id::text`,
    [o.id, o.auteur.id, o.auteur.libelle, texteCourt(o.motif)]);
  return { ok: true, id: rows.length === 0 ? null : Number(rows[0].id), nb: rows.length };
}

/** MARQUER UNE CARTE « VÉRIFIÉ » : elle sort du repli et s'affiche d'emblée. Geste humain, comme les autres. */
export async function marquerCarteVerifiee(o: { id: number; auteur: Auteur }): Promise<IssuePartieCategorie> {
  if (!(await contactCarteDisponible())) return { ok: false, motif: SANS_304_CARTES };
  if (!auteurHumainPartieCategorie(o.auteur)) {
    return { ok: false, motif: 'Vérifier est un geste humain : l’auteur doit être identifié.' };
  }
  if (!Number.isSafeInteger(o.id) || o.id <= 0) return { ok: false, motif: 'Aucune carte désignée.' };

  const { rows } = await query<{ id: string }>(
    `UPDATE gestion_contact_carte
        SET verifie_le = now(), verifie_par = $2, verifie_par_libelle = $3
      WHERE id = $1 AND retire_le IS NULL
      RETURNING id::text`, [o.id, o.auteur.id, o.auteur.libelle]);
  return { ok: true, id: rows.length === 0 ? null : Number(rows[0].id), nb: rows.length };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT HISTORIQUE-BIEN-3 — ANNULER UN RANGEMENT, EXACTEMENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Ce qu'un geste de rangement a touché. Rendu par la route, renvoyé par elle pour annuler. */
export interface GesteDeRangement {
  categoriesPosees: readonly number[];
  categoriesRetirees: readonly number[];
  cartesPosees: readonly number[];
  cartesRetirees: readonly number[];
}

/**
 * ══ 🔴🔴 ANNULER UN RANGEMENT : RETIRER CE QU'IL A POSÉ, ROUVRIR CE QU'IL A RETIRÉ ══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026) : « après le dépôt, petit message “Fanny Rosky → Locataire” avec “Annuler”
 * quelques secondes. »
 *
 * 🔴 POURQUOI « ANNULER » NE PEUT PAS ÊTRE « REPOSER LA CATÉGORIE D'AVANT ». Reposer aurait écrit une ligne
 * `manuel` là où il n'y avait qu'une PROPOSITION de la règle à trois étages. Or un rangement manuel PRIME pour
 * toujours : l'annulation aurait donc gelé la proposition en décision humaine, et l'automatisation n'aurait plus
 * jamais repris cette adresse. C'est l'inverse de ce qu'« Annuler » promet.
 *
 * 🔴 L'ORDRE DES DEUX MOITIÉS EST LA RÈGLE, ET PAS UN DÉTAIL DE STYLE. On RETIRE d'abord ce que le geste a posé,
 * on ROUVRE ensuite ce qu'il avait retiré. L'inverse violerait l'index unique partiel sur les lignes VIVANTES
 * (une seule par clé) : la réouverture se heurterait à la ligne encore vivante, et toute l'annulation échouerait
 * — en laissant l'état à moitié défait, ce qui est pire que de n'avoir rien annulé.
 *
 * 🔴 UNE SEULE TRANSACTION. Les quatre écritures sont une seule décision ; un échec au milieu laisserait une
 * catégorie annulée avec sa carte en place, c'est-à-dire exactement la désynchronisation que ce lot existe pour
 * empêcher.
 *
 * ⚠️ ROUVRIR EFFACE LA SIGNATURE DE RETRAIT, ET C'EST JUSTE : la ligne n'a plus été retirée. Ce n'est PAS une
 * suppression — la ligne, elle, n'a jamais cessé d'exister, et c'est le geste d'annulation qui est, lui, tracé
 * sur la ligne qu'il retire.
 *
 * ⚠️ LA GARDE N'EST PAS RELÂCHÉE : annuler est un geste humain, donc l'auteur doit être identifié — même règle
 * que poser. Sans elle, une passe automatique aurait pu défaire un rangement fait à la main.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export async function annulerGesteDeRangement(o: {
  geste: GesteDeRangement; auteur: Auteur;
}): Promise<IssuePartieCategorie> {
  if (!(await partieCategorieDisponible())) return { ok: false, motif: SANS_304 };
  if (!auteurHumainPartieCategorie(o.auteur)) {
    return { ok: false, motif: 'Annuler est un geste humain : l’auteur doit être identifié.' };
  }
  const nombres = (v: readonly number[]): number[] =>
    [...new Set(v)].filter((n) => Number.isSafeInteger(n) && n > 0);

  const catPosees = nombres(o.geste.categoriesPosees);
  const catRetirees = nombres(o.geste.categoriesRetirees);
  const cartPosees = nombres(o.geste.cartesPosees);
  const cartRetirees = nombres(o.geste.cartesRetirees);
  if (catPosees.length + catRetirees.length + cartPosees.length + cartRetirees.length === 0) {
    return { ok: false, motif: 'Rien à annuler.' };
  }

  const MOTIF = 'rangement annulé';
  const nb = await withTransaction(async (q) => {
    let n = 0;
    /* ① CE QUE LE GESTE A POSÉ EST RETIRÉ — daté, signé, motivé. */
    if (catPosees.length > 0) {
      const { rows } = await q<{ id: string }>(
        `UPDATE gestion_partie_categorie
            SET retire_le = now(), retire_par = $2, retire_par_libelle = $3, retire_motif = $4
          WHERE retire_le IS NULL AND id = ANY($1::bigint[])
          RETURNING id::text`,
        [catPosees, o.auteur.id, o.auteur.libelle, MOTIF]);
      n += rows.length;
    }
    if (cartPosees.length > 0) {
      const { rows } = await q<{ id: string }>(
        `UPDATE gestion_contact_carte
            SET retire_le = now(), retire_par = $2, retire_par_libelle = $3, retire_motif = $4
          WHERE retire_le IS NULL AND id = ANY($1::bigint[])
          RETURNING id::text`,
        [cartPosees, o.auteur.id, o.auteur.libelle, MOTIF]);
      n += rows.length;
    }
    /* ② PUIS CE QU'IL AVAIT RETIRÉ EST ROUVERT. La clé est libre, puisque ① vient de la libérer. */
    if (catRetirees.length > 0) {
      const { rows } = await q<{ id: string }>(
        `UPDATE gestion_partie_categorie
            SET retire_le = NULL, retire_par = NULL, retire_par_libelle = NULL, retire_motif = NULL
          WHERE retire_le IS NOT NULL AND id = ANY($1::bigint[])
          RETURNING id::text`,
        [catRetirees]);
      n += rows.length;
    }
    if (cartRetirees.length > 0) {
      const { rows } = await q<{ id: string }>(
        `UPDATE gestion_contact_carte
            SET retire_le = NULL, retire_par = NULL, retire_par_libelle = NULL, retire_motif = NULL
          WHERE retire_le IS NOT NULL AND id = ANY($1::bigint[])
          RETURNING id::text`,
        [cartRetirees]);
      n += rows.length;
    }
    return n;
  });

  return { ok: true, id: null, nb };
}
