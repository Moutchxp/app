/**
 * MODULE « GESTION » — LOT RATTACHEMENT-2 : L'HISTORIQUE, LU EN BASE. IMPUR (SQL), STRICTEMENT EN LECTURE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE MODULE N'ÉCRIT RIEN, et ne sait pas écrire : aucun INSERT, aucun UPDATE. Les gestes sur les propositions
 * passent par la route des rattachements, celle du lot RATTACHEMENT-1 — il n'y a qu'un chemin d'écriture.
 *
 * 🔴 UNE SEULE DÉFINITION DE « LES MAILS DE CETTE CIBLE ». Elle est construite une fois (`cteMessages`) et partagée
 * par les TROIS questions de l'écran : la page de la frise, le compteur d'en-tête, et la liste des interlocuteurs.
 * Trois définitions donneraient trois chiffres pour une même chose, et c'est toujours celui qu'on regarde le moins qui
 * garde le faux.
 *
 * 🔴 AUCUNE REQUÊTE SUR TOUT L'HISTORIQUE D'UN COUP. La frise est paginée ; le corps des mails n'est lu qu'en EXTRAIT
 * borné. Le lot 282 porte 429 mails : il doit s'ouvrir aussi vite qu'un lot qui en porte trois.
 *
 * ⚠️ IL NE TOUCHE NI GMAIL, NI LE DRIVE. Les liens Drive déjà connus des pièces s'affichent par le composant existant,
 * qui interroge sa propre route — rien de neuf n'est demandé à Google ici.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query } from '../db/client';
// 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 1 — LA regle du lien de bien, ecrite une seule fois.
import { sqlLiensDuBien } from './rattachement';
// 🔴 LOT NOM-UNIQUE-DES-PIECES — le repli « nom d'usage, sinon nom d'origine », écrit UNE fois.
import { sqlNomAffiche } from './nomUsageSql';
import { adressesDuChamp } from './adressesMessage';
import { nomBien, nomProprietaire } from './driveArbre';
import { deplacementsDeMailsDisponibles, horsGestionDisponible, rattachementsDisponibles } from './schema';
// LOT FICHES-ANNUAIRE — LA MÊME fonction pure que la boîte : un seul verdict de statut pour tout le module.
import { capsuleStatut, sqlSortesBien, type CapsuleStatut } from './statutClassement';
import { cibleEvenement, cibleLocataire, cibleLot, cibleProprietaire, type Cible } from './rattachement';
// 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 3 — une adresse retirée d'un ré-import ne ramasse plus de courrier.
import { conditionCoordonneeVivante } from './coordonneeVivante';
import { libelleCible, type LienAffiche } from './rattachementRepo';
// 🔴🔴 LOT CONTACTS-EXTERNES — « via Me Martin, avocat » sur la ligne d'un mail de « Vie du bien ».
import { interventionsDesMessages } from './contactExterneRepo';
import {
  texteCible, INTERLOCUTEURS_MAX,
  type EnteteHistorique, type EvenementDeLigne, type FiltresHistorique, type Interlocuteur,
  type LigneHistorique, type PieceHistorique,
} from './historique';

/** L'extrait d'un mail dans la frise : assez pour reconnaître de quoi il parle, pas assez pour peser. */
export const EXTRAIT_MAX = 240;
/** Combien de destinataires on nomme par ligne. Au-delà, l'écran dit « et N autres ». */
export const DESTINATAIRES_MAX = 4;

export type Issue<T> = { etat: 'ok'; data: T } | { etat: 'sans_schema' } | { etat: 'inconnue' };

// ── LA CIBLE, ÉTENDUE ───────────────────────────────────────────────────────────────────────────────────────────

export interface CibleEtendue {
  /** La cible demandée, telle quelle. */
  cible: Cible;
  titre: string;
  sousTitre: string | null;
  /** Les clés de lot à inclure. */
  lots: string[];
  /** Les clés de propriétaire à inclure. */
  proprietaires: string[];
  /** Les identifiants d'événement à inclure. */
  evenements: number[];
  /** Nom lisible de chaque cible incluse, indexé par sa forme courte d'adresse. */
  libelles: Map<string, string>;
  /** Le propriétaire du logement demandé, quand il y en a un — sert à proposer l'interrupteur. */
  proprietaireDuLot: { cle: string; libelle: string } | null;
  /** Les logements du propriétaire demandé — sert à proposer l'interrupteur et le regroupement. */
  logementsDuProprietaire: { cle: string; libelle: string }[];
  /**
   * ══ 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 3 — L'OCCUPATION, AXE PROPRE AU LOCATAIRE ════════════════════
   *
   * RÈGLE D'ARNO (04/10/2026) : « Contenu : les mails rattachés aux biens qu'il occupe, UNIQUEMENT pendant sa
   * période d'occupation (entrée → sortie, ou aujourd'hui), plus les mails dont il est lui-même l'expéditeur ou
   * le destinataire. Jamais le courrier de ses prédécesseurs ou successeurs. »
   *
   * 🔴 CE N'EST PAS UNE LISTE DE LOTS, ET C'EST TOUTE LA DIFFÉRENCE AVEC `lots`. L'axe `lots` prend TOUT le
   * courrier d'un logement, de sa première à sa dernière ligne — c'est ce qu'on veut pour un bien ou pour son
   * propriétaire, qui le possède sans interruption. Un locataire, lui, n'a droit qu'à SA tranche : chaque lot
   * vient donc avec ses deux bornes, et un locataire de plusieurs biens (TATA CONSULTANCY) porte plusieurs
   * tranches à la fois.
   *
   * ⚠️ `jusqua: null` VEUT DIRE « ENCORE LÀ », pas « depuis toujours » : la borne haute est alors absente, et
   * l'axe court jusqu'au dernier mail. Un `depuis: null` est l'inverse — un bail dont l'export ne donne pas
   * l'entrée —, et il ouvre la tranche vers le passé plutôt que de la refermer à zéro mail.
   */
  occupations: { cle: string; libelle: string; depuis: string | null; jusqua: string | null }[];
  /**
   * 🔴 LES ADRESSES DE LA PERSONNE — le second axe d'Arno : « plus les mails dont il est lui-même l'expéditeur ou
   * le destinataire ». Sans bornes de date, et c'est voulu : un mail qu'il a écrit lui-même le concerne, qu'il
   * ait déjà rendu les clés ou pas encore signé.
   */
  adresses: string[];
}

/**
 * CE QUE « L'HISTORIQUE DE CETTE CIBLE » RECOUVRE EXACTEMENT, selon les interrupteurs. LECTURE SEULE.
 *
 * 🔴 UN ÉVÉNEMENT RECOUVRE AUSSI SES ÉCHANGES AFFECTÉS, et c'est une décision qu'il faut dire. Le moteur ne propose
 * jamais d'événement (aucune adresse ne désigne une carte) : un historique d'événement limité aux rattachements serait
 * donc vide, et le point d'entrée « carte » ne servirait à rien. On y joint donc les échanges que
 * `gestion_affectation` pose sur cette carte — l'axe du flux de travail, qui existait bien avant ce lot. Chaque ligne
 * DIT d'où elle vient (`source`), pour que les deux axes ne se confondent pas.
 */
export async function etendreCible(cible: Cible, f: FiltresHistorique): Promise<Issue<CibleEtendue>> {
  if (!(await rattachementsDisponibles())) return { etat: 'sans_schema' };

  const vide: CibleEtendue = {
    cible, titre: '', sousTitre: null, lots: [], proprietaires: [], evenements: [],
    libelles: new Map(), proprietaireDuLot: null, logementsDuProprietaire: [],
    occupations: [], adresses: [],
  };

  if (cible.sorte === 'evenement') {
    const { rows } = await query<{ reference: string; objet: string; etat: string }>(
      'SELECT reference, objet, etat FROM gestion_evenement WHERE id = $1', [cible.id ?? 0]);
    if (rows.length === 0) return { etat: 'inconnue' };
    const titre = `${rows[0].reference} — ${rows[0].objet}`;
    return {
      etat: 'ok',
      data: {
        ...vide, titre, sousTitre: `carte ${libelleEtat(rows[0].etat)}`,
        evenements: [cible.id ?? 0], libelles: new Map([[texteCible(cible), titre]]),
      },
    };
  }

  if (cible.sorte === 'lot') {
    const { rows } = await query<{
      prop: string | null; prop_nom: string | null; adresse: string | null; cp: string | null;
      commune: string | null; nature: string | null; type_bien: string | null; absent: boolean;
    }>(`SELECT pr.wippimmo_id AS prop, pr.nom_complet AS prop_nom, lo.adresse, lo.code_postal AS cp, lo.commune,
               lo.nature, lo.type_bien, (lo.absent_le IS NOT NULL) AS absent
          FROM gestion_annuaire_lot lo
          LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id
         WHERE lo.wippimmo_id = $1`, [cible.cle ?? '']);
    if (rows.length === 0) return { etat: 'inconnue' };
    const l = rows[0];
    const titre = nomBien({
      wippimmoId: cible.cle ?? '', proprietaireWippimmoId: l.prop, adresse: l.adresse, codePostal: l.cp,
      commune: l.commune, nature: l.nature, typeBien: l.type_bien,
    });
    const proprietaireDuLot = l.prop === null ? null : {
      cle: l.prop,
      libelle: nomProprietaire({ wippimmoId: l.prop, nomComplet: l.prop_nom ?? '' }),
    };
    const libelles = new Map([[texteCible(cible), titre]]);
    if (proprietaireDuLot !== null) {
      libelles.set(texteCible(cibleProprietaire(proprietaireDuLot.cle)), proprietaireDuLot.libelle);
    }
    return {
      etat: 'ok',
      data: {
        ...vide, titre,
        sousTitre: l.absent ? 'ce logement n’est plus dans l’export de gestion' : proprietaireDuLot?.libelle ?? null,
        lots: [cible.cle ?? ''],
        proprietaires: f.avecProprietaire && proprietaireDuLot !== null ? [proprietaireDuLot.cle] : [],
        libelles, proprietaireDuLot,
      },
    };
  }

  /**
   * ══ 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 3 — UN LOCATAIRE ═════════════════════════════════════════════
   *
   * DEMANDE D'ARNO : « HISTORIQUE PAR LOCATAIRE (nouveau) : sur le modèle de l'historique propriétaire, même
   * présentation, accessible depuis la fiche annuaire du locataire, avec le même fragment unique. »
   *
   * 🔴 LA DIFFÉRENCE AVEC LE PROPRIÉTAIRE TIENT EN UN MOT : LES BORNES. Un propriétaire reçoit `lots: [...]` et
   * voit tout le courrier de ses logements. Un locataire reçoit `occupations: [...]` — les mêmes logements, mais
   * chacun avec sa tranche de temps. Remplir `lots` pour lui lui montrerait le courrier de ses prédécesseurs et
   * de ses successeurs, ce qu'Arno interdit explicitement.
   *
   * ⚠️ `lots` RESTE DONC VIDE, et ce n'est pas un oubli : c'est ce qui garantit qu'aucun mail hors période ne
   * puisse entrer par cet axe-là.
   *
   * 🔴 ON PREND TOUTES SES OCCUPATIONS, PASSÉES COMPRISES. « entrée → sortie, ou aujourd'hui » : un bail terminé
   * reste une tranche légitime de SON histoire. Ne garder que les baux en cours effacerait l'ancien locataire
   * dont on cherche justement ce qu'on lui avait écrit.
   */
  if (cible.sorte === 'locataire') {
    const { rows: lc } = await query<{ id: string; nom: string; absent: boolean }>(
      `SELECT id::text, nom, (absent_le IS NOT NULL) AS absent
         FROM gestion_annuaire_locataire WHERE wippimmo_id = $1`, [cible.cle ?? '']);
    if (lc.length === 0) return { etat: 'inconnue' };
    const titre = lc[0].nom.trim() === '' ? `locataire ${cible.cle ?? ''}` : lc[0].nom;

    const { rows: occ } = await query<{
      cle: string; adresse: string | null; cp: string | null; commune: string | null;
      nature: string | null; type_bien: string | null; prop: string | null;
      depuis: string | null; jusqua: string | null;
    }>(
      `SELECT lo.wippimmo_id AS cle, lo.adresse, lo.code_postal AS cp, lo.commune, lo.nature, lo.type_bien,
              pr.wippimmo_id AS prop, o.entree::text AS depuis, o.sortie::text AS jusqua
         FROM gestion_annuaire_occupation o
         JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
         LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id
        WHERE o.locataire_id = $1
        ORDER BY o.entree DESC NULLS LAST, lo.wippimmo_id`, [lc[0].id]);

    const occupations = occ.map((o) => ({
      cle: o.cle,
      libelle: nomBien({
        wippimmoId: o.cle, proprietaireWippimmoId: o.prop, adresse: o.adresse, codePostal: o.cp,
        commune: o.commune, nature: o.nature, typeBien: o.type_bien,
      }),
      depuis: o.depuis, jusqua: o.jusqua,
    }));

    /**
     * 🔴 SES ADRESSES ÉLECTRONIQUES VIVANTES, et elles seules. `absent_le IS NULL` + la condition de coordonnée
     * vivante : une adresse qu'un ré-import a retirée ne doit pas continuer à ramasser du courrier dans son
     * historique — c'est la même règle que les cartes de la fenêtre.
     */
    const { rows: ads } = await query<{ valeur: string }>(
      `SELECT DISTINCT valeur FROM gestion_annuaire_contact
        WHERE sujet = 'locataire' AND sujet_id = $1 AND sorte = 'email'
          AND absent_le IS NULL${await conditionCoordonneeVivante()}`, [lc[0].id]);

    const libelles = new Map([[texteCible(cible), titre]]);
    for (const o of occupations) libelles.set(texteCible(cibleLot(o.cle)), o.libelle);

    const nbLots = new Set(occupations.map((o) => o.cle)).size;
    return {
      etat: 'ok',
      data: {
        ...vide, titre,
        sousTitre: lc[0].absent
          ? 'ce locataire n’est plus dans l’export de gestion'
          : nbLots === 0
            ? 'aucun logement connu pour cette personne'
            : `${nbLots} logement${nbLots > 1 ? 's' : ''} occupé${nbLots > 1 ? 's' : ''}`,
        /* 🔴 `lots` VIDE À DESSEIN — voir l'encadré ci-dessus. Tout passe par les tranches. */
        occupations,
        adresses: ads.map((a) => a.valeur),
        libelles,
      },
    };
  }

  // ── UN PROPRIÉTAIRE ──────────────────────────────────────────────────────────────────────────────────────────
  const { rows: pr } = await query<{ nom_complet: string; absent: boolean }>(
    'SELECT nom_complet, (absent_le IS NOT NULL) AS absent FROM gestion_annuaire_proprietaire WHERE wippimmo_id = $1',
    [cible.cle ?? '']);
  if (pr.length === 0) return { etat: 'inconnue' };
  const titre = nomProprietaire({ wippimmoId: cible.cle ?? '', nomComplet: pr[0].nom_complet });

  const { rows: lots } = await query<{
    cle: string; adresse: string | null; cp: string | null; commune: string | null;
    nature: string | null; type_bien: string | null;
  }>(`SELECT lo.wippimmo_id AS cle, lo.adresse, lo.code_postal AS cp, lo.commune, lo.nature, lo.type_bien
        FROM gestion_annuaire_lot lo
        JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id
       WHERE pr.wippimmo_id = $1 ORDER BY lo.wippimmo_id`, [cible.cle ?? '']);

  const logements = lots.map((l) => ({
    cle: l.cle,
    libelle: nomBien({
      wippimmoId: l.cle, proprietaireWippimmoId: cible.cle, adresse: l.adresse, codePostal: l.cp,
      commune: l.commune, nature: l.nature, typeBien: l.type_bien,
    }),
  }));

  const libelles = new Map([[texteCible(cible), titre]]);
  for (const l of logements) libelles.set(texteCible(cibleLot(l.cle)), l.libelle);

  return {
    etat: 'ok',
    data: {
      ...vide, titre,
      sousTitre: pr[0].absent
        ? 'ce propriétaire n’est plus dans l’export de gestion'
        : `${logements.length} logement${logements.length > 1 ? 's' : ''} en gestion`,
      proprietaires: [cible.cle ?? ''],
      lots: f.avecLogements ? logements.map((l) => l.cle) : [],
      libelles, logementsDuProprietaire: logements,
    },
  };
}

/** L'état d'une carte, en mots. PUR. */
function libelleEtat(e: string): string {
  if (e === 'a_traiter') return 'à traiter';
  if (e === 'en_cours') return 'en cours';
  return 'traitée';
}

// ── LA DÉFINITION PARTAGÉE DES MAILS DE LA CIBLE ────────────────────────────────────────────────────────────────

/**
 * LE `WITH` QUI DIT « CES MAILS-LÀ », une fois pour les trois questions de l'écran.
 *
 * Les paramètres sont TOUJOURS dans le même ordre : $1 lots, $2 propriétaires, $3 événements. La suite du SQL ajoute
 * les siens à partir de $4.
 *
 * ⚠️ `DISTINCT ON (message_id)` EN MODE PLAT, pour qu'un mail rattaché à la fois au logement et à son propriétaire
 * n'apparaisse pas deux fois dans la frise. La priorité choisit la cible la plus PRÉCISE (logement avant
 * propriétaire) : c'est celle qui renseigne le plus. En mode GROUPÉ, au contraire, on garde les deux lignes — un mail
 * qui concerne deux logements doit apparaître sous les deux.
 */
function cteMessages(o: {
  avecCarte: boolean; deplacements: boolean; grouper: boolean;
  /**
   * ══ 🔴🔴 POINT 3 — LES DEUX AXES DU LOCATAIRE, OU AUCUN. UN SEUL INTERRUPTEUR, ET C'EST VOULU ═════════════════
   *
   * ⚠️ POSTGRESQL REFUSE UNE REQUÊTE QU'ON SUR-ALIMENTE : « bind message supplies 8 parameters, but prepared
   * statement requires 3 ». Les cinq paramètres du locataire ($4 à $8) ne peuvent donc pas être liés « au cas
   * où » : ils doivent être NOMMÉS par la requête exactement quand ils sont fournis.
   *
   * 🔴 D'OÙ UN SEUL DRAPEAU POUR LES DEUX AXES. Deux drapeaux indépendants auraient fait quatre combinaisons de
   * numérotation ($4-$6 seuls, $4-$5 pour les adresses si l'occupation manque…), et un placeholder décalé lie une
   * valeur au mauvais endroit SANS ERREUR visible. Avec un seul drapeau, la base compte 3 paramètres ou 8, jamais
   * autre chose. Les tableaux VIDES ne coûtent rien : `unnest('{}')` et `= ANY('{}')` ne rendent aucune ligne.
   */
  avecLocataire?: boolean;
}): string {
  const carte = o.avecCarte
    ? `
     UNION ALL
     -- LES ÉCHANGES POSÉS SUR CETTE CARTE (axe du flux de travail, antérieur à ce lot). Voir \`etendreCible\`.
     SELECT m2.id AS message_id, 'evenement'::text AS cible_sorte, NULL::text AS cible_cle,
            af.evenement_id AS cible_id, NULL::text AS cible_libelle, 4 AS prio, 'carte'::text AS source
       FROM gestion_affectation af
       JOIN gestion_message m2 ON ${o.deplacements
    ? '((af.message_id IS NULL AND m2.fil_id = af.fil_id) OR af.message_id = m2.id)'
    : 'm2.fil_id = af.fil_id'}
      WHERE af.actif AND af.evenement_id = ANY($3::bigint[])`
    : '';

  /**
   * ══ 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 1 — L'AXE « BIEN » PASSE PAR LE FRAGMENT UNIQUE ═══════════════
   *
   * `sqlLiensDuBien('r')` porte LA règle « qu'est-ce qu'un bien rattaché à un mail » — statut confirmé, cible de
   * sorte « lot », clé non nulle, lien posé sur le MAIL et non sur une pièce. La fenêtre « Visualiser / Modifier »
   * lit exactement la même, depuis `ficheRattachementRepo`. Elle était écrite deux fois ; elle l'est une.
   *
   * ⚠️ LA SORTIE EST IDENTIQUE AU CARACTÈRE PRÈS à ce que cette requête produisait : le prédicat global
   * (`statut = 'confirme' AND piece_id IS NULL`) est redescendu DANS chacune des trois branches, ce qui est la
   * même condition logique, simplement écrite là où elle s'applique.
   *
   * 🔴 LES DEUX AUTRES AXES GARDENT LEUR PROPRE CONDITION, ET CE N'EST PAS UN OUBLI : un propriétaire et une
   * carte ne sont pas des biens. Les faire passer par un fragment nommé « liens du bien » aurait écrit noir sur
   * blanc qu'un nom de personne est un bien — la confusion exacte que la liste blanche de `rattachement.ts` a
   * coûté une nuit à défaire, le 28/09/2026.
   */
  const vivantConfirme = "r.statut = 'confirme' AND r.piece_id IS NULL";

  /**
   * ══ 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 3 — L'AXE « OCCUPATION » ═════════════════════════════════════
   *
   * LE MÊME FRAGMENT QUE LES TROIS AUTRES ÉCRANS (`sqlLiensDuBien`) — condition d'Arno, et c'est aussi ce qui
   * rend ce nouvel axe digne de confiance : il ne redéfinit pas « un mail rattaché à un bien », il le réutilise.
   * Il n'ajoute QUE la tranche de temps.
   *
   * 🔴 LA TRANCHE EST JOINTE PAR LOT, PAS APPLIQUÉE GLOBALEMENT. `unnest($4, $5, $6)` déplie les triplets
   * (clé, entrée, sortie) : un locataire de plusieurs biens — TATA CONSULTANCY — voit chacun sur SA période.
   * Une seule paire de bornes pour tout le monde aurait mélangé les baux et laissé entrer le courrier d'un autre
   * logement à une date où il n'y habitait pas encore.
   *
   * ⚠️ LES BORNES SE COMPARENT EN JOUR CIVIL UTC, comme partout dans le module (`recu_le AT TIME ZONE 'UTC'`), et
   * la borne haute est INCLUSE : un mail du jour de la sortie est encore le sien — c'est le jour où il rend les
   * clés, et souvent celui de l'état des lieux.
   *
   * ⚠️ UNE BORNE NULLE N'EST PAS ZÉRO. `entrée` absente ouvre la tranche vers le passé ; `sortie` absente la
   * laisse courir jusqu'au dernier mail (« ou aujourd'hui », dit Arno). Les traiter comme des dates nulles
   * aurait rendu un historique vide pour tout bail dont l'export ne donne pas les deux dates.
   */
  const occupation = o.avecLocataire === true
    ? `
     UNION ALL
     SELECT ro.message_id, 'lot'::text AS cible_sorte, ro.cible_cle, NULL::bigint AS cible_id,
            NULL::text AS cible_libelle, 1 AS prio, 'rattachement'::text AS source
       FROM gestion_rattachement ro
       JOIN gestion_message mo ON mo.id = ro.message_id
       JOIN unnest($4::text[], $5::date[], $6::date[]) AS per(cle, d1, d2) ON per.cle = ro.cible_cle
      WHERE ${sqlLiensDuBien('ro')}
        AND (per.d1 IS NULL OR (mo.recu_le AT TIME ZONE 'UTC')::date >= per.d1)
        AND (per.d2 IS NULL OR (mo.recu_le AT TIME ZONE 'UTC')::date <= per.d2)`
    : '';

  /**
   * ══ 🔴🔴 POINT 3 — L'AXE « CORRESPONDANCE » : « les mails dont il est lui-même l'expéditeur ou le destinataire »
   *
   * 🔴 `gestion_message_adresse` PORTE LES DEUX SENS, et c'est pour cela qu'on l'interroge plutôt que
   * `de_adresse` : un mail qu'on lui a ÉCRIT le concerne autant qu'un mail qu'il a écrit. C'est la même table que
   * le filtre « interlocuteurs » de l'écran, donc le même périmètre, déjà éprouvé.
   *
   * ⚠️ SANS BORNES DE DATE, À DESSEIN. Un mail signé de sa main le concerne, qu'il ait déjà rendu les clés ou
   * pas encore signé le bail — et c'est ce qu'Arno a écrit : les bornes portent sur les mails DU BIEN, pas sur
   * son propre courrier.
   *
   * 🔴 LA LIGNE SE DIT « locataire », PAS « lot ». Un mail qui n'est rattaché à aucun bien n'a pas de bien à
   * nommer : lui en inventer un serait écrire un rattachement qui n'existe pas. `prio 1` le laisse perdre contre
   * une ligne de bien quand le même mail arrive par les deux axes — on préfère nommer le logement.
   */
  const correspondance = o.avecLocataire === true
    ? `
     UNION ALL
     SELECT ia.message_id, 'locataire'::text AS cible_sorte, $8::text AS cible_cle, NULL::bigint AS cible_id,
            NULL::text AS cible_libelle, 2 AS prio, 'rattachement'::text AS source
       FROM gestion_message_adresse ia
      WHERE ia.adresse = ANY($7::text[])`
    : '';

  return `liens AS (
     SELECT r.message_id, r.cible_sorte, r.cible_cle, r.cible_id, r.cible_libelle,
            CASE r.cible_sorte WHEN 'lot' THEN 1 WHEN 'proprietaire' THEN 2 ELSE 3 END AS prio,
            'rattachement'::text AS source
       FROM gestion_rattachement r
      WHERE ((${sqlLiensDuBien('r')} AND r.cible_cle = ANY($1::text[]))
          OR (${vivantConfirme} AND r.cible_sorte = 'proprietaire' AND r.cible_cle = ANY($2::text[]))
          OR (${vivantConfirme} AND r.cible_sorte = 'evenement'    AND r.cible_id  = ANY($3::bigint[])))${carte}${occupation}${correspondance}
   ),
   choisis AS (
     ${o.grouper
    ? `SELECT DISTINCT message_id, cible_sorte, cible_cle, cible_id, cible_libelle, prio, source FROM liens`
    : `SELECT DISTINCT ON (message_id) message_id, cible_sorte, cible_cle, cible_id, cible_libelle, prio, source
          FROM liens ORDER BY message_id, prio`}
   )`;
}

/**
 * LES CONDITIONS DE FILTRE, et les paramètres qu'elles ajoutent à partir de $4 ($1 à $3 étant les clés de cible).
 *
 * 🔴 UNE SEULE FONCTION AJOUTE UN PARAMÈTRE, ET ELLE REND SON NUMÉRO. Le premier jet empilait la valeur puis
 * calculait le numéro à partir de `params.length` — donc TOUJOURS un de trop, puisque la valeur venait d'être
 * ajoutée. La requête liait alors le tableau des interlocuteurs au `LIMIT`, et PostgreSQL refusait :
 * « argument of LIMIT must be type bigint, not type text[] » (mesuré sur le cluster jetable le 26/09/2026). Un
 * placeholder calculé à la main est un défaut qui attend son heure ; ici il ne peut plus diverger de sa valeur.
 */
function conditions(f: FiltresHistorique, apres: number): { sql: string; params: unknown[] } {
  const bouts: string[] = [];
  const params: unknown[] = [];
  /**
   * Ajoute une valeur et rend SON placeholder. Les deux ne peuvent plus se désaccorder.
   *
   * 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 3 — `apres` REMPLACE LE 3 EN DUR. L'historique d'un locataire lie
   * cinq paramètres de base de plus ; un décalage figé à 3 aurait lié le premier filtre par-dessus la clé du
   * locataire, SANS erreur de PostgreSQL — juste un historique faux. Le nombre vient donc de `decalage(cible)`,
   * c'est-à-dire du même endroit que la liste des valeurs.
   */
  const ajouter = (v: unknown): string => `$${params.push(v) + apres}`;

  if (f.interlocuteurs.length > 0) {
    bouts.push(`EXISTS (SELECT 1 FROM gestion_message_adresse ia
                         WHERE ia.message_id = m.id AND ia.adresse = ANY(${ajouter(f.interlocuteurs)}::text[]))`);
  }
  if (f.du !== null) bouts.push(`m.recu_le >= ${ajouter(f.du)}::date`);
  // BORNE HAUTE INCLUSE : « au 7 mars » doit contenir le 7 mars, donc on compare au lendemain à minuit.
  if (f.au !== null) bouts.push(`m.recu_le < (${ajouter(f.au)}::date + 1)`);
  if (f.pieces === 'avec') bouts.push('EXISTS (SELECT 1 FROM gestion_piece p WHERE p.message_id = m.id)');
  if (f.pieces === 'sans') bouts.push('NOT EXISTS (SELECT 1 FROM gestion_piece p WHERE p.message_id = m.id)');
  if (f.texte.trim() !== '') {
    const p = ajouter(`%${f.texte.trim()}%`);
    // L'objet ET le texte : chercher « préavis » sans regarder le corps ne trouverait que les mails bien intitulés.
    bouts.push(`(coalesce(m.objet, '') ILIKE ${p} OR coalesce(m.corps_texte, '') ILIKE ${p})`);
  }
  /**
   * 🔴 LOT FICHES-ANNUAIRE — « AVEC ÉVÉNEMENT OUVERT ». Un événement est posé sur l'ÉCHANGE, pas sur le mail :
   * la condition remonte donc au fil. « Ouvert » se lit « pas encore traité » — les trois états sont
   * `a_traiter`, `en_cours` et `traite` (contrainte de la table), et les deux premiers attendent une réponse.
   */
  if (f.evenementOuvert) {
    bouts.push(`EXISTS (SELECT 1 FROM gestion_affectation af
                          JOIN gestion_evenement ev ON ev.id = af.evenement_id
                         WHERE af.fil_id = m.fil_id AND af.actif AND ev.etat <> 'traite')`);
  }
  return { sql: bouts.length === 0 ? '' : ` AND ${bouts.join(' AND ')}`, params };
}

function clesDe(c: CibleEtendue): [string[], string[], number[]] {
  return [c.lots, c.proprietaires, c.evenements];
}

/**
 * ══ 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 3 — LES PARAMÈTRES DE BASE, EN UN SEUL ENDROIT ════════════════════
 *
 * 🔴 TROIS POUR TOUTE CIBLE, HUIT POUR UN LOCATAIRE. Les cinq de plus ($4 à $8) ne sont liés QUE quand la requête
 * les nomme : PostgreSQL refuse une requête sur-alimentée (« bind message supplies 8 parameters, but prepared
 * statement requires 3 »). Voir l'encadré d'`avecLocataire` dans `cteMessages`.
 *
 * 🔴 ET C'EST LA MÊME FONCTION POUR LES TROIS QUESTIONS DE L'ÉCRAN — la frise, le compteur, les interlocuteurs.
 * Trois listes recopiées finiraient par ne plus être dans le même ordre, et un placeholder décalé lie une valeur
 * au mauvais endroit SANS la moindre erreur : le filtre d'interlocuteurs deviendrait un `LIMIT`. C'est exactement
 * l'incident du 26/09/2026, documenté dans `conditions`.
 */
function baseParams(c: CibleEtendue): unknown[] {
  const base: unknown[] = [c.lots, c.proprietaires, c.evenements];
  if (!estLocataire(c)) return base;
  return [
    ...base,
    c.occupations.map((o) => o.cle),
    c.occupations.map((o) => o.depuis),
    c.occupations.map((o) => o.jusqua),
    c.adresses,
    c.cible.cle ?? '',
  ];
}

/** La cible demandée EST un locataire ⇒ les deux axes de plus, et les cinq paramètres qui vont avec. */
function estLocataire(c: CibleEtendue): boolean { return c.cible.sorte === 'locataire'; }

/** Combien de paramètres de base la requête lie, donc à partir d'où les filtres numérotent les leurs. */
function decalage(c: CibleEtendue): number { return estLocataire(c) ? 8 : 3; }

// ── LES TROIS QUESTIONS ─────────────────────────────────────────────────────────────────────────────────────────

export interface PageHistorique {
  lignes: LigneHistorique[];
  /** Vrai quand d'autres mails suivent. L'écran le DIT plutôt que de laisser croire qu'on a tout vu. */
  suite: boolean;
}

/** UNE PAGE DE LA FRISE, la plus récente en haut. LECTURE SEULE. */
export async function pageHistorique(c: CibleEtendue, f: FiltresHistorique): Promise<PageHistorique> {
  const cond = conditions(f, decalage(c));
  const [, , evs] = clesDe(c);
  const base = baseParams(c);
  const deplacements = await deplacementsDeMailsDisponibles();
  const cte = cteMessages({
    avecCarte: evs.length > 0, deplacements, grouper: f.grouper, avecLocataire: estLocataire(c),
  });

  const pTaille = base.length + 1 + cond.params.length;
  const { rows } = await query<{
    message_id: string; fil_id: string; recu_le: string; sens: string; de: string; de_nom: string | null;
    objet: string | null; extrait: string | null; dest_a: string | null; dest_cc: string | null;
    cible_sorte: string; cible_cle: string | null; cible_id: string | null; cible_libelle: string | null;
    source: string;
  }>(
    `WITH ${cte}
     SELECT m.id AS message_id, m.fil_id,
            to_char(m.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS recu_le,
            m.sens, m.de_adresse AS de, m.de_nom, m.objet,
            left(coalesce(m.corps_texte, ''), ${EXTRAIT_MAX}) AS extrait,
            m.dest_a::text, m.dest_cc::text,
            ch.cible_sorte, ch.cible_cle, ch.cible_id, ch.cible_libelle, ch.source
       FROM choisis ch
       JOIN gestion_message m ON m.id = ch.message_id
      WHERE true${cond.sql}
      ORDER BY m.recu_le DESC, m.id DESC
      LIMIT $${pTaille} OFFSET $${pTaille + 1}`,
    // UNE ligne de plus que la page : sa présence, et elle seule, dit qu'il y a une suite.
    [...base, ...cond.params, f.taille + 1, f.page * f.taille]);

  const suite = rows.length > f.taille;
  const gardees = rows.slice(0, f.taille);
  const pieces = await piecesDesMessages(gardees.map((r) => Number(r.message_id)));
  // 🔴 LOT FICHES-ANNUAIRE — les événements des ÉCHANGES de cette page, en UNE requête (jamais une par ligne).
  const evenements = await evenementsDesFils(gardees.map((r) => Number(r.fil_id)));
  // 🔴 … et la capsule de statut de chaque MAIL, par la MÊME fonction pure que la boîte.
  const statuts = await statutsDesMessages(gardees.map((r) => Number(r.message_id)));
  /**
   * 🔴🔴 LOT CONTACTS-EXTERNES — les personnes que chaque mail concerne AUSSI, et la mention « via … ». UNE
   * requête pour la page entière, jamais une par ligne. Carte VIDE sans la migration 293 : la fonction sort
   * avant sa requête, et les lignes n'affichent alors rien de plus — exactement comme avant ce lot.
   */
  const interventions = await interventionsDesMessages(gardees.map((r) => Number(r.message_id)));

  return {
    suite,
    lignes: gardees.map((r) => {
      /**
       * 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 3 — LA BRANCHE « locataire » EST OBLIGATOIRE ICI. Sans elle,
       * une ligne venue de l'axe « correspondance » (un mail qu'il a écrit, rattaché à aucun bien) aurait été
       * rendue comme un PROPRIÉTAIRE — le dernier terme de la chaîne attrapant tout ce qui n'est ni carte ni lot.
       * On aurait affiché un nom de locataire sous l'étiquette « propriétaire ».
       */
      const parCible: Cible = r.cible_sorte === 'evenement'
        ? cibleEvenement(r.cible_id === null ? 0 : Number(r.cible_id))
        : r.cible_sorte === 'lot' ? cibleLot(r.cible_cle ?? '')
          : r.cible_sorte === 'locataire' ? cibleLocataire(r.cible_cle ?? '')
            : cibleProprietaire(r.cible_cle ?? '');
      return {
        messageId: Number(r.message_id), filId: Number(r.fil_id), recuLe: r.recu_le,
        sens: r.sens === 'envoye' ? 'envoye' : 'recu',
        de: r.de, deNom: r.de_nom, objet: r.objet,
        extrait: (r.extrait ?? '').trim() === '' ? null : (r.extrait ?? '').trim(),
        destinataires: destinatairesLisibles(r.dest_a, r.dest_cc),
        pieces: pieces.get(Number(r.message_id)) ?? [],
        parCible,
        // Le libellé FIGÉ du lien quand il y en a un ; sinon celui que l'annuaire donne aujourd'hui.
        cibleLibelle: r.cible_libelle ?? c.libelles.get(texteCible(parCible)) ?? libelleCible(parCible, {
          lots: new Map(), proprietaires: new Map(),
        }),
        source: r.source === 'carte' ? 'carte' : 'rattachement',
        evenements: evenements.get(Number(r.fil_id)) ?? [],
        statut: statuts.get(Number(r.message_id))?.statut ?? null,
        statutDetail: statuts.get(Number(r.message_id))?.detail ?? null,
        // 🔴 LOT CONTACTS-EXTERNES — on ne garde que ce que la ligne affiche : le nom, le rôle figé, et le « via ».
        interventions: (interventions.get(Number(r.message_id)) ?? []).map((x) => ({
          sorte: x.sorte, libelle: x.libelle, role: x.role, via: x.via,
        })),
      };
    }),
  };
}

/**
 * ══ 🔴 LA CAPSULE DE STATUT DE CHAQUE MAIL D'UNE PAGE ═════════════════════════════════════════════════════════
 *
 * Les mêmes entrées que la boîte (`boiteRepo`), passées à la MÊME fonction pure (`capsuleStatut`) : rattachements
 * CONFIRMÉS vers un logement ou un propriétaire, et « quelqu'un a-t-il tranché » (origine manuelle, ou statut
 * touché par une main). Deux calculs du même verdict finiraient par se contredire, et c'est celui qu'on regarde
 * le moins qui garderait l'erreur.
 *
 * ⚠️ DEUX SONDES, ET ELLES VOYAGENT AVEC LEUR TABLE : sans la 257 on ne nomme pas `gestion_rattachement`, sans la
 * 266 on ne nomme pas `gestion_hors_gestion`. Une carte vide vaut mieux qu'un écran qui tombe.
 */
async function statutsDesMessages(
  messageIds: readonly number[],
): Promise<Map<number, { statut: CapsuleStatut; detail: string | null }>> {
  const out = new Map<number, { statut: CapsuleStatut; detail: string | null }>();
  const uniques = [...new Set(messageIds)];
  if (uniques.length === 0) return out;
  const [avecRattachements, avecHorsGestion] = await Promise.all([
    rattachementsDisponibles(), horsGestionDisponible(),
  ]);
  if (!avecRattachements) return out;
  const { rows } = await query<{
    message_id: string; n: number; humain: boolean | null; detail: string | null; hg: boolean | null;
  }>(
    `SELECT m.id AS message_id,
            coalesce(cl.n, 0)::int AS n, cl.humain, cl.detail,
            ${avecHorsGestion ? 'hg.marque' : 'NULL::boolean'} AS hg
       FROM gestion_message m
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS n,
                bool_or(r.origine = 'manuel' OR r.statut_par_libelle IS NOT NULL) AS humain,
                string_agg(coalesce(nullif(btrim(r.cible_libelle), ''), r.cible_cle), ' · ' ORDER BY r.id) AS detail
           FROM gestion_rattachement r
          WHERE r.message_id = m.id AND r.statut = 'confirme'
            -- 🔴🔴 LOT STATUT-LIGNE-APRES-CLASSEMENT — « un bien » vient de SORTES_BIEN, jamais d'une liste
            --    recopiee ici : cette clause nommait 'lot' et 'proprietaire' seuls, et disait donc « A classer »
            --    la ou la pastille du mail disait « Classe ». Voir l'encadre de sqlSortesBien.
            --    (Aucun accent GRAVE ici : ce commentaire vit DANS un litteral gabarit, qu'un seul terminerait.)
            AND r.cible_sorte IN (${sqlSortesBien()})
       ) cl ON true
       ${avecHorsGestion ? `LEFT JOIN LATERAL (
         SELECT true AS marque FROM gestion_hors_gestion h
          WHERE h.message_id = m.id AND h.retire_le IS NULL LIMIT 1
       ) hg ON true` : ''}
      WHERE m.id = ANY($1::bigint[])`, [uniques]);
  for (const r of rows) {
    out.set(Number(r.message_id), {
      statut: capsuleStatut({ nbActifs: r.n, parUnHumain: r.humain === true, horsGestion: r.hg === true }),
      detail: r.detail,
    });
  }
  return out;
}

/**
 * ══ 🔴 LES ÉVÉNEMENTS DES ÉCHANGES D'UNE PAGE, EN UNE REQUÊTE ═════════════════════════════════════════════════
 *
 * Une requête par ligne ferait vingt-cinq allers-retours pour une page — c'est la règle du module depuis la liste
 * de la boîte, et elle ne souffre pas d'exception ici.
 *
 * ⚠️ CLÉ = LE FIL, PAS LE MESSAGE : un événement est affecté à l'ÉCHANGE (`gestion_affectation`). Deux mails du
 * même fil portent donc les mêmes, ce qui est exact — « cet échange attend une réponse ».
 *
 * ⚠️ AFFECTATIONS ACTIVES SEULEMENT : une affectation détachée n'a plus cours, et l'afficher ferait lire comme
 * ouvert ce que quelqu'un a justement retiré.
 */
async function evenementsDesFils(filIds: readonly number[]): Promise<Map<number, EvenementDeLigne[]>> {
  const out = new Map<number, EvenementDeLigne[]>();
  const uniques = [...new Set(filIds)];
  if (uniques.length === 0) return out;
  const { rows } = await query<{
    fil_id: string; id: string; reference: string; objet: string; etat: string;
  }>(
    `SELECT af.fil_id, ev.id, ev.reference, ev.objet, ev.etat
       FROM gestion_affectation af
       JOIN gestion_evenement ev ON ev.id = af.evenement_id
      WHERE af.actif AND af.fil_id = ANY($1::bigint[])
      ORDER BY af.fil_id, ev.ouvert_le DESC, ev.id DESC`, [uniques]);
  for (const r of rows) {
    const cle = Number(r.fil_id);
    const liste = out.get(cle) ?? [];
    liste.push({
      id: Number(r.id), reference: r.reference, objet: r.objet, etat: r.etat, ouvert: r.etat !== 'traite',
    });
    out.set(cle, liste);
  }
  return out;
}

/**
 * LES DESTINATAIRES d'un mail, lisibles et bornés.
 *
 * 🔴 PAR `adressesDuChamp`, ET PAR RIEN D'AUTRE. Ces colonnes `jsonb` contiennent des OBJETS `{nom, adresse}` : un
 * `String(x)` y produit « [object Object] », défaut SILENCIEUX qui a coûté 77 678 adresses perdues au lot
 * DRIVE-2-bis. Il n'existe qu'un lecteur de ces colonnes dans tout le module, et c'est celui-là.
 *
 * ⚠️ ON EN REND UN DE PLUS QUE LA BORNE : sa présence, et elle seule, permet à l'écran de dire « et N autres ».
 */
function destinatairesLisibles(destA: string | null, destCc: string | null): string[] {
  return [...adressesDuChamp(destA), ...adressesDuChamp(destCc)].slice(0, DESTINATAIRES_MAX + 1);
}

/** Les pièces de plusieurs mails, en UNE requête. Une requête par ligne de frise se verrait à l'écran. */
async function piecesDesMessages(ids: readonly number[]): Promise<Map<number, PieceHistorique[]>> {
  const m = new Map<number, PieceHistorique[]>();
  if (ids.length === 0) return m;
  const { rows } = await query<{
    message_id: string; id: string; nom_fichier: string; type_mime: string | null; taille_octets: string | null;
    cle_stockage: string | null; motif_non_stocke: string | null;
  }>(
    `SELECT message_id, id, ${await sqlNomAffiche('gestion_piece')} AS nom_fichier,
            type_mime, taille_octets::text, cle_stockage, motif_non_stocke
       FROM gestion_piece WHERE message_id = ANY($1::bigint[]) ORDER BY message_id, id`, [ids]);
  for (const r of rows) {
    const cle = Number(r.message_id);
    m.set(cle, [...(m.get(cle) ?? []), {
      pieceId: Number(r.id), nomFichier: r.nom_fichier, typeMime: r.type_mime,
      tailleOctets: r.taille_octets === null ? null : Number(r.taille_octets),
      disponible: r.cle_stockage !== null, motifNonStocke: r.motif_non_stocke,
    }]);
  }
  return m;
}

/**
 * LE COMPTEUR D'EN-TÊTE : combien de mails, combien de pièces, du premier au dernier.
 *
 * ⚠️ DEUX CHIFFRES, PAS UN. Celui du filtre en cours (« ce que vous regardez ») ET le total sans filtre (« ce qu'il y
 * a »). N'en donner qu'un ferait croire, filtre posé, que l'historique est plus court qu'il n'est.
 */
export async function enteteHistorique(c: CibleEtendue, f: FiltresHistorique): Promise<{
  filtre: EnteteHistorique; total: EnteteHistorique;
}> {
  const [, , evs] = clesDe(c);
  const base = baseParams(c);
  const deplacements = await deplacementsDeMailsDisponibles();
  // Le compteur ne GROUPE jamais : un mail compte pour un, même s'il concerne deux logements.
  const cte = cteMessages({ avecCarte: evs.length > 0, deplacements, grouper: false, avecLocataire: estLocataire(c) });

  const compter = async (cond: { sql: string; params: unknown[] }): Promise<EnteteHistorique> => {
    const { rows } = await query<{ mails: string; pieces: string; premier: string | null; dernier: string | null }>(
      `WITH ${cte}
       SELECT count(*)::text AS mails,
              coalesce(sum((SELECT count(*) FROM gestion_piece p WHERE p.message_id = m.id)), 0)::text AS pieces,
              to_char(min(m.recu_le) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS premier,
              to_char(max(m.recu_le) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS dernier
         FROM choisis ch JOIN gestion_message m ON m.id = ch.message_id
        WHERE true${cond.sql}`,
      [...base, ...cond.params]);
    const r = rows[0];
    return {
      nbMails: Number(r.mails), nbPieces: Number(r.pieces), premierLe: r.premier, dernierLe: r.dernier,
    };
  };

  const [filtre, total] = await Promise.all([
    compter(conditions(f, decalage(c))),
    compter({ sql: '', params: [] }),
  ]);
  return { filtre, total };
}

/**
 * QUI PARLE DANS CES ÉCHANGES, et combien de fois.
 *
 * 🔴 LA LISTE NE DÉPEND PAS DES INTERLOCUTEURS COCHÉS. Sinon cocher une personne ferait disparaître toutes les autres
 * du filtre, et on ne pourrait plus en ajouter une seconde — le filtre se refermerait sur lui-même. Les AUTRES filtres
 * (période, pièces, recherche), eux, s'appliquent : la liste reflète ce qu'on regarde.
 */
export async function interlocuteursHistorique(
  c: CibleEtendue, f: FiltresHistorique,
): Promise<{ liste: Interlocuteur[]; tronque: boolean }> {
  const [, , evs] = clesDe(c);
  const base = baseParams(c);
  const deplacements = await deplacementsDeMailsDisponibles();
  const cte = cteMessages({ avecCarte: evs.length > 0, deplacements, grouper: false, avecLocataire: estLocataire(c) });
  const cond = conditions({ ...f, interlocuteurs: [] }, decalage(c));
  const pLimite = base.length + 1 + cond.params.length;

  const { rows } = await query<{ adresse: string; interne: boolean; n: string; nom: string | null }>(
    `WITH ${cte},
     mails AS (SELECT m.id FROM choisis ch JOIN gestion_message m ON m.id = ch.message_id WHERE true${cond.sql})
     SELECT a.adresse, a.interne, count(DISTINCT a.message_id)::text AS n,
            -- Le nom d'affichage le plus fréquent pour cette adresse. La colonne adresse_brute porte « Nom <adr> » :
            -- on en retire la partie entre chevrons, et ce qui reste est le nom (vide quand il n'y en avait pas).
            mode() WITHIN GROUP (
              ORDER BY nullif(btrim(regexp_replace(coalesce(a.adresse_brute, ''), '<[^>]*>', '', 'g')), '')
            ) AS nom
       FROM gestion_message_adresse a
       JOIN mails ON mails.id = a.message_id
      GROUP BY a.adresse, a.interne
      ORDER BY count(DISTINCT a.message_id) DESC, a.adresse
      LIMIT $${pLimite}`,
    [...base, ...cond.params, INTERLOCUTEURS_MAX + 1]);

  const tronque = rows.length > INTERLOCUTEURS_MAX;
  return {
    tronque,
    liste: rows.slice(0, INTERLOCUTEURS_MAX).map((r) => ({
      adresse: r.adresse, nom: r.nom, nbMails: Number(r.n), interne: r.interne,
    })),
  };
}

/**
 * LES PROPOSITIONS NON CONFIRMÉES qui visent cette cible. Elles vivent dans une section À PART de la frise.
 *
 * 🔴 ELLES NE SONT PAS DANS LA FRISE, et c'est le point : la frise est ce qui EST rattaché. Mélanger des candidats
 * ferait lire comme un fait ce qui n'est qu'une hypothèse — et l'historique d'un logement ne vaut que si l'on peut
 * s'y fier. Elles portent les mêmes boutons que la file de tri, donc le même chemin d'écriture.
 */
export async function propositionsHistorique(c: CibleEtendue): Promise<{
  lignes: (LienAffiche & { objet: string | null; recuLe: string; de: string; nbPieces: number })[];
}> {
  const [lots, props, evs] = clesDe(c);
  const { rows } = await query<{
    id: string; message_id: string; piece_id: string | null; cible_sorte: string; cible_cle: string | null;
    cible_id: string | null; cible_libelle: string | null; origine: string; statut: string;
    confiance: string | null; regle: string | null; motif: string | null; adresses: string | null;
    statut_par_libelle: string | null; objet: string | null; recu_le: string; de: string; nb: string;
  }>(
    `SELECT r.id, r.message_id, r.piece_id, r.cible_sorte, r.cible_cle, r.cible_id, r.cible_libelle,
            r.origine, r.statut, r.confiance, r.regle, r.motif, r.adresses, r.statut_par_libelle,
            m.objet, to_char(m.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS recu_le,
            m.de_adresse AS de,
            (SELECT count(*) FROM gestion_piece p WHERE p.message_id = m.id)::text AS nb
       FROM gestion_rattachement r JOIN gestion_message m ON m.id = r.message_id
      WHERE r.statut = 'propose'
        AND ((r.cible_sorte = 'lot'          AND r.cible_cle = ANY($1::text[]))
          OR (r.cible_sorte = 'proprietaire' AND r.cible_cle = ANY($2::text[]))
          OR (r.cible_sorte = 'evenement'    AND r.cible_id  = ANY($3::bigint[])))
      ORDER BY m.recu_le DESC, r.id DESC
      LIMIT 50`, [lots, props, evs]);

  return {
    lignes: rows.map((r) => {
      const cible: Cible = {
        sorte: r.cible_sorte as Cible['sorte'], cle: r.cible_cle,
        id: r.cible_id === null ? null : Number(r.cible_id),
      };
      return {
        id: Number(r.id), messageId: Number(r.message_id),
        pieceId: r.piece_id === null ? null : Number(r.piece_id),
        cible, libelle: r.cible_libelle ?? texteCible(cible),
        /**
         * 🔴 LOT CLASSER-SUR-CHAQUE-MAIL — `null` ICI, ET C'EST DÉLIBÉRÉ. Cet écran-ci liste des PROPOSITIONS à
         * trancher sur l'historique d'une cible : il n'affiche aucune case verte, donc aucun résumé par
         * catégorie. Joindre l'annuaire pour un champ que personne ne lit coûterait une jointure de plus sur
         * une requête déjà bornée à 50 lignes. Le jour où cet écran montre le résumé, la jointure est à ajouter
         * ici — comme dans `rattachementRepo`, conditionnée à la sonde de l'annuaire.
         */
        categorie: null,
        // ⚠️ IDEM POUR LES FAITS DU LOT : cet écran n'affiche pas de titre calculé (voir ci-dessus).
        bien: null,
        origine: r.origine === 'manuel' ? 'manuel' : 'automatique',
        statut: 'propose', confiance: r.confiance, regle: r.regle, motif: r.motif,
        adresses: (r.adresses ?? '').split(' ').filter((a) => a !== ''),
        parUnHumain: r.statut_par_libelle !== null,
        /**
         * LOT FIL-LECTURE-2 — CET ÉCRAN NE LES DEMANDE PAS, et ne les demandera pas : c'est la liste des
         * PROPOSITIONS d'une cible, pas la fiche d'un rattachement. `null` se lit « non chargé ici » ; les lire
         * quand même coûterait quatre colonnes à chaque ligne de tous les historiques, pour rien.
         */
        creeLe: null, creePar: null, statutLe: null, statutPar: r.statut_par_libelle,
        objet: r.objet, recuLe: r.recu_le, de: r.de, nbPieces: Number(r.nb),
      };
    }),
  };
}
