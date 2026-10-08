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
/* 🔴🔴 LOT HISTORIQUE-BIEN-10, POINT 2 — les trois rôles qui font « participer » à un mail, écrits UNE fois :
   le compteur des capsules et le filtre du listing lisent la MÊME liste (règle d'Arno). */
import {
  adressesDuChamp, personnesDuChamp, ROLES_DE_PARTICIPATION, ROLES_RECEPTION, ROLE_EXPEDITEUR,
} from './adressesMessage';
/* 🔴 LOT RECHERCHE-MAILS-PAR-ADRESSE — le relevé des adresses d'un corps de mail. Module PUR, éprouvé à part :
   aucune expression régulière n'est écrite dans ce dépôt-ci. */
import { adressesDuTexte } from './rechercheAdresses';
/* 🔴 LOT FRISE-PICTOS-PLUS-GRANDS-ET-RECHERCHE-BIEN-ENTIER — LA MÊME DÉCOUPE DE LA SAISIE QUE L'ÉCRAN. Deux
   découpes auraient fini par ne pas répondre pareil, et le tamis du serveur aurait contredit celui de l'écran. */
import { motsRecherches } from './historiqueBien';
import { nomsCherchablesAvec } from './nomUsageSql';
import { nomBien, nomProprietaire } from './driveArbre';
import {
  deplacementsDeMailsDisponibles, horsGestionDisponible, nomUsageDisponible, rattachementsDisponibles,
} from './schema';
// LOT FICHES-ANNUAIRE — LA MÊME fonction pure que la boîte : un seul verdict de statut pour tout le module.
import { capsuleStatut, sqlSortesBien, type CapsuleStatut } from './statutClassement';
import { cibleEvenement, cibleLocataire, cibleLot, cibleProprietaire, type Cible } from './rattachement';
// 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 3 — une adresse retirée d'un ré-import ne ramasse plus de courrier.
import { conditionCoordonneeVivante } from './coordonneeVivante';
import { libelleCible, type LienAffiche } from './rattachementRepo';
// 🔴🔴 LOT CONTACTS-EXTERNES — « via Me Martin, avocat » sur la ligne d'un mail de « Vie du bien ».
import { interventionsDesMessages } from './contactExterneRepo';
/* 🔴🔴 LOT FILTRE-COMME-ETIQUETTE — « ouvert » vient du module pur, et l'étiquette comme le filtre le lisent au
   même endroit (décision d'Arno du 07/10/2026 : « même code, pas de second chemin »).
   🔴🔴 LOT ETAT-PAR-LA-FRISE (08/10/2026) — et cet endroit est désormais `etatParLaFrise` : « ouvert » ne se
   demande plus à la colonne `etat`, il se DÉDUIT des cartes de borne de la frise. Les périodes avec. */
import { sqlDansUnePeriodeOuverte, sqlEvenementOuvertParLaFrise } from './etatParLaFrise';
import {
  texteCible, CONTACTS_PAR_LOCATAIRE_MAX, INTERLOCUTEURS_MAX, MAILS_DE_LA_FRISE_MAX,
  PORTEURS_DE_PIECES_MAX,
  type EnteteHistorique, type EvenementDeLigne, type FiltresHistorique, type Interlocuteur,
  type LigneHistorique, type MessagePorteurDePieces, type PieceHistorique,
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
 *
 * 🔴🔴 LOT FILTRE-COMME-ETIQUETTE — `deplacements` EST LA SONDE DE LA MIGRATION 234, et elle entre ici parce que
 * le filtre « Événement ouvert » appelle désormais la requête de l'étiquette, qui ne nomme `gestion_affectation.
 * message_id` que si la colonne existe. La valeur vient des CINQ appelants, qui l'ont déjà en main pour
 * `cteMessages` : la recalculer ici aurait fait une seconde sonde, donc un jour deux réponses dans une même
 * requête — la moitié nommant une colonne que l'autre moitié croit absente.
 */
function conditions(
  f: FiltresHistorique, apres: number, deplacements: boolean,
  /**
   * 🔴 LA RÉPONSE DE LA SONDE, EN PARAMÈTRE — patron du module (`nomsCherchablesAvec` : « il reçoit donc la
   * réponse de la sonde en paramètre, comme il reçoit déjà `spamConnu` et `corbeilleConnue` »). Sans la
   * migration 286, la recherche porte sur le seul nom reçu, et la requête est celle d'avant.
   */
  avecNomUsage = false,
): { sql: string; params: unknown[] } {
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
    /**
     * ══ 🔴🔴 LOT HISTORIQUE-BIEN-10, POINT 2 — LE FILTRE REGARDE **DE / À / CC**, ET RIEN D'AUTRE ══════════════
     *
     * CONSTAT D'ARNO : deux contacts à « a écrit : 0 · en copie : 0 », cochés seuls, ramenaient 2 mails.
     * MESURÉ : ces deux adresses n'existent sur ce bien que sous le rôle `transfere` — une adresse lue DANS LE
     * CORPS d'un mail transféré. Le compteur, lui, ne compte que `expediteur` et `destinataire`+`copie` : il
     * disait vrai. C'est ce filtre-ci qui acceptait TOUS les rôles.
     *
     * 🔴 LA LISTE VIENT DU MODULE PUR (`ROLES_DE_PARTICIPATION`), et c'est elle qui tient la règle d'Arno :
     * « le compteur et le filtre reposent sur UN SEUL calcul ». Recopier `'expediteur', 'destinataire', 'copie'`
     * ici aurait fait deux listes — et c'est toujours celle qu'on relit le moins qui se périme.
     */
    bouts.push(`EXISTS (SELECT 1 FROM gestion_message_adresse ia
                         WHERE ia.message_id = m.id AND ia.adresse = ANY(${ajouter(f.interlocuteurs)}::text[])
                           AND ia.role = ANY(${ajouter([...ROLES_DE_PARTICIPATION])}::text[]))`);
  }
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — LES MAILS QUE **NOUS** AVONS ÉCRITS, QUAND L'AGENCE EST DÉCOCHÉE ════
   *
   * DEMANDE D'ARNO : « Agence décochée → les mails écrits par nous sont retirés du listing. »
   *
   * 🔴 `role = 'expediteur'`, ET C'EST TOUTE LA DIFFÉRENCE AVEC LE FILTRE DU DESSUS. Nos adresses sont des deux
   * côtés de presque tous les mails d'un bien : écarter ceux où elles APPARAISSENT aurait vidé le listing. Ce
   * qu'on retire, ce sont les mails dont NOUS sommes l'auteur.
   *
   * ⚠️ `NOT EXISTS` ET NON `<> ALL` : un mail porte plusieurs lignes d'adresses, et comparer « l'expéditeur
   * n'est pas dans la liste » ligne à ligne aurait gardé le mail dès qu'une AUTRE ligne (un destinataire) ne
   * figurait pas dans la liste — c'est-à-dire toujours.
   */
  if (f.expediteursExclus.length > 0) {
    bouts.push(`NOT EXISTS (SELECT 1 FROM gestion_message_adresse xa
                             WHERE xa.message_id = m.id AND xa.role = 'expediteur'
                               AND xa.adresse = ANY(${ajouter(f.expediteursExclus)}::text[]))`);
  }
  if (f.du !== null) bouts.push(`m.recu_le >= ${ajouter(f.du)}::date`);
  // BORNE HAUTE INCLUSE : « au 7 mars » doit contenir le 7 mars, donc on compare au lendemain à minuit.
  if (f.au !== null) bouts.push(`m.recu_le < (${ajouter(f.au)}::date + 1)`);
  if (f.pieces === 'avec') bouts.push('EXISTS (SELECT 1 FROM gestion_piece p WHERE p.message_id = m.id)');
  if (f.pieces === 'sans') bouts.push('NOT EXISTS (SELECT 1 FROM gestion_piece p WHERE p.message_id = m.id)');
  /**
   * ══ 🔴🔴 LA RECHERCHE, SUR TOUT LE BIEN — LOT FRISE-PICTOS-PLUS-GRANDS-ET-RECHERCHE-BIEN-ENTIER ═════════════
   *
   * ARNO (point 3) : « Quand une recherche est active, elle doit porter sur TOUS les mails du bien qui
   * correspondent aux autres filtres en cours […] avec les mêmes champs que dans 21e8f777 (From, To, Cc, Bcc,
   * Reply-To, adresses dans le texte, objet, corps, pièces jointes) et les mêmes étiquettes de rôle. »
   *
   * ══ 🔴🔴 CE QUE CETTE CONDITION VALAIT, ET CE QU'ELLE RATAIT ════════════════════════════════════════════════
   *
   * UNE SEULE expression, sur deux champs : `(objet ILIKE p OR corps_texte ILIKE p)`. Ni les adresses, ni les
   * noms, ni les pièces — et un seul motif pour toute la saisie, donc « fuite cuisine » ne trouvait que les
   * mails portant ces deux mots D'AFFILÉE.
   *
   * 🔴 CHAQUE MOT EST UN TAMIS, ET ILS S'ADDITIONNENT (ET), chacun pouvant être trouvé dans un champ
   * DIFFÉRENT (OU). C'est MOT POUR MOT la règle de l'écran (`filtrerParMots`) : « plusieurs mots = tous
   * présents ; un mot peut être trouvé dans des champs différents ». Les deux tamis répondent donc pareil, ce
   * qui est la condition pour que l'écran cesse de refiltrer sans que le résultat bouge.
   *
   * 🔴 LES ADRESSES PASSENT PAR `gestion_message_adresse`, qui porte DÉJÀ expéditeur, destinataire, copie,
   * répondre-à et transféré, avec le nom d'affichage dans `adresse_brute` — c'est la table que le rattachement
   * alimente. Le Cci n'y est pas (décision de `releverAdresses` : « on ne sait pas s'il a été lu »), on le lit
   * donc dans sa colonne.
   *
   * ⚠️ LE CORPS EST LU AVEC SON REPLI HTML, exactement comme le relevé d'adresses de la page : 545 des 11 736
   * mails de biens n'ont AUCUN corps_texte. Sans le repli, leurs adresses citées resteraient introuvables.
   * Le HTML n'est lu QUE pour ces mails-là (nullif + coalesce), ce qui evite d'attraper tout mail en HTML sur
   * un mot comme « table » ou « span ».
   *
   * ⚠️ AUCUN INDEX N'EST AJOUTE, ET C'EST MESURE : la condition ne s'applique JAMAIS seule — elle vient apres
   * la restriction au bien (CTE « choisis »), soit 140 mails pour le bien 315 et 332 pour le plus fourni du
   * portefeuille. Un ILIKE '%x%' n'est de toute facon servi par aucun btree ; il faudrait un index trigramme,
   * pour un gain nul sur trois cents lignes.
   * AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral gabarit.
   */
  for (const mot of motsRecherches(f.texte)) {
    /* 🔴 LE MOT EST DÉJÀ NORMALISÉ par `motsRecherches` (sans accent, en minuscules) : la colonne subit donc
       le MÊME traitement, `lower(svv_unaccent_immutable(…))`. Sans cela, « preavis » tapé sans accent ne
       trouverait plus « préavis » — c'est-à-dire une régression sur la recherche de tous les jours, au
       moment même où l'on élargit celle des adresses. La fonction est IMMUTABLE et date de la migration 049. */
    const p = ajouter(`%${mot}%`);
    const sansAccent = (x: string): string => `lower(svv_unaccent_immutable(coalesce(${x}, '')))`;
    bouts.push(`(
      ${sansAccent('m.objet')} LIKE ${p}
      OR ${sansAccent("nullif(btrim(m.corps_texte), ''), m.corps_html")} LIKE ${p}
      OR ${sansAccent('m.de_adresse')} LIKE ${p}
      OR ${sansAccent('m.de_nom')} LIKE ${p}
      OR ${sansAccent('m.dest_cci::text')} LIKE ${p}
      OR EXISTS (SELECT 1 FROM gestion_message_adresse ma
                  WHERE ma.message_id = m.id
                    AND (${sansAccent('ma.adresse')} LIKE ${p}
                         OR ${sansAccent('ma.adresse_brute')} LIKE ${p}))
      OR EXISTS (SELECT 1 FROM gestion_piece pj
                  WHERE pj.message_id = m.id
                    AND ${sansAccent(nomsCherchablesAvec(avecNomUsage, 'pj'))} LIKE ${p})
    )`);
  }
  /**
   * ══ 🔴🔴 LOT FILTRE-COMME-ETIQUETTE — « AVEC ÉVÉNEMENT OUVERT » : LE FILTRE N'A PLUS DE RÈGLE À LUI ══════════
   *
   * DÉCISION D'ARNO (07/10/2026) : « le filtre montre exactement les mails qui portent l'étiquette ». La
   * condition ne s'écrit donc plus ici : elle est FAITE des deux requêtes de l'étiquette, bornées au mail
   * courant. Tout est dit dans l'encadré de `sqlFiltreEvenementOuvert` — y compris le piège de l'alias `m`.
   *
   * 🔴 CE QUI ÉTAIT ÉCRIT ICI AVANT : « une affectation active du fil de ce mail vers un événement non traité ».
   * C'était la voie du fil, et RIEN D'AUTRE — ni le bien, ni la fenêtre d'ouverture. L'étiquette, depuis le lot
   * EVENEMENT-MINIMALISTE, connaît les deux voies : une ligne pouvait donc porter l'étiquette sans passer le
   * filtre. C'est ce désaccord-là qu'Arno ferme.
   */
  if (f.evenementOuvert) bouts.push(sqlFiltreEvenementOuvert(deplacements));
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
  const [, , evs] = clesDe(c);
  const base = baseParams(c);
  const deplacements = await deplacementsDeMailsDisponibles();
  // 🔴 LA SONDE AVANT LES CONDITIONS : le filtre « Événement ouvert » en a besoin (voir `conditions`).
  const cond = conditions(f, decalage(c), deplacements, await nomUsageDisponible());
  const cte = cteMessages({
    avecCarte: evs.length > 0, deplacements, grouper: f.grouper, avecLocataire: estLocataire(c),
  });

  const pTaille = base.length + 1 + cond.params.length;
  const { rows } = await query<{
    message_id: string; fil_id: string; recu_le: string; sens: string; de: string; de_nom: string | null;
    objet: string | null; extrait: string | null; dest_a: string | null; dest_cc: string | null;
    dest_cci: string | null; repondre_a: string | null; corps_adresses: string | null;
    cible_sorte: string; cible_cle: string | null; cible_id: string | null; cible_libelle: string | null;
    source: string; message_id_rfc: string | null;
  }>(
    `WITH ${cte}
     SELECT m.id AS message_id, m.fil_id,
            -- 🔴🔴 POINT 5 — le Message-ID RFC : il ne sert qu'a « voir dans Gmail » sur une piece non conservee.
            m.message_id AS message_id_rfc,
            to_char(m.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS recu_le,
            m.sens, m.de_adresse AS de, m.de_nom, m.objet,
            left(coalesce(m.corps_texte, ''), ${EXTRAIT_MAX}) AS extrait,
            m.dest_a::text, m.dest_cc::text,
            /* 🔴🔴 LOT HISTORIQUE-BIEN-10, POINT 3 — la copie cachée, pour NOS envois : on ne la connaît que si
               l'on y était. Mesuré : 790 messages en portent une, jamais plus de six adresses. */
            m.dest_cci::text,
            /* 🔴🔴 LOT RECHERCHE-MAILS-PAR-ADRESSE — LE « RÉPONDRE-À », cinquième famille d'adresses d'un mail.
               La colonne existe depuis longtemps ; personne ne la lisait ici. Mesuré le 08/10/2026 : 1 090 des
               11 736 mails de biens en portent un. */
            m.repondre_a::text,
            /**
             * 🔴🔴 LE CORPS, POUR Y RELEVER LES ADRESSES — et SEULEMENT pour cela.
             *
             * ARNO : « et les adresses écrites dans le corps (ex. historique cité “De : … <x@y.fr>”, messages
             * transférés) ». L'écran ne reçoit du corps qu'un extrait de 240 caractères : une adresse citée
             * dans un fil repris vit bien plus bas, et aucune recherche d'écran ne pouvait l'atteindre.
             *
             * 🔴 LE RELEVÉ SE FAIT ICI, PAS À L'ÉCRAN : la page ne part qu'avec les adresses trouvées (dix au
             * plus en pratique), et non avec 20 000 caractères de corps par mail — cent fois son poids.
             *
             * ⚠️ corps_html EN REPLI, et il sert vraiment : 545 des 11 736 mails de biens n'ont AUCUN
             * corps_texte mais portent un HTML (mesure). Sans ce repli, leurs adresses resteraient
             * AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral gabarit.
             * introuvables, et c'est le genre d'absence qu'on ne remarque jamais.
             *
             * ⚠️ BORNÉ À 20 000 CARACTÈRES : au-delà, on est dans les pieds de page et les désabonnements, et
             * la page lirait 25 fois un corps entier à chaque affichage.
             */
            left(coalesce(nullif(btrim(m.corps_texte), ''), m.corps_html, ''), 20000) AS corps_adresses,
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
  const evenements = await evenementsDesFils(gardees.map((r) => Number(r.message_id)));
  /**
   * 🔴🔴 LOT EVENEMENT-MINIMALISTE, POINT 5 — LA SECONDE VOIE : tout mail du BIEN, dans la FENÊTRE de
   * l'événement. Voir l'encadré de `sqlEvenementsDesMessages`. UNE requête pour la page entière.
   */
  const evenementsParBien = await evenementsDesMessages(gardees.map((r) => Number(r.message_id)));
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
        messageIdRfc: r.message_id_rfc,
        sens: r.sens === 'envoye' ? 'envoye' : 'recu',
        de: r.de, deNom: r.de_nom, objet: r.objet,
        extrait: (r.extrait ?? '').trim() === '' ? null : (r.extrait ?? '').trim(),
        destinataires: destinatairesLisibles(r.dest_a, r.dest_cc),
        /* 🔴🔴 LOT HISTORIQUE-BIEN-10, POINT 3 — les trois champs SÉPARÉS et COMPLETS, nom et adresse à part.
           ⚠️ NON BORNÉS, contrairement à `destinataires` : Arno demande « TOUS les destinataires ». Mesuré, le
           pire mail du dépôt en porte 52 — c'est une ligne qui se replie, pas une liste qui explose. */
        a: personnesDuChamp(r.dest_a),
        cc: personnesDuChamp(r.dest_cc),
        cci: personnesDuChamp(r.dest_cci),
        /* 🔴 LOT RECHERCHE-MAILS-PAR-ADRESSE — les deux dernières familles d'adresses. Le relevé du corps passe
           par le module PUR `rechercheAdresses`, éprouvé à part : le dépôt ne connaît aucune expression. */
        repondreA: personnesDuChamp(r.repondre_a),
        adressesTexte: adressesDuTexte(r.corps_adresses),
        pieces: pieces.get(Number(r.message_id)) ?? [],
        parCible,
        // Le libellé FIGÉ du lien quand il y en a un ; sinon celui que l'annuaire donne aujourd'hui.
        cibleLibelle: r.cible_libelle ?? c.libelles.get(texteCible(parCible)) ?? libelleCible(parCible, {
          lots: new Map(), proprietaires: new Map(),
        }),
        source: r.source === 'carte' ? 'carte' : 'rattachement',
        /**
         * 🔴🔴 LES DEUX VOIES S'UNISSENT (lot EVENEMENT-MINIMALISTE, point 5) : celle du FIL (une affectation
         * active) et celle du BIEN (le mail tombe dans la fenêtre de l'événement). Un événement n'apparaît
         * qu'une fois — c'est la règle du lot HISTORIQUE-BIEN-5, et elle vaut pour l'union comme pour chaque
         * voie prise à part.
         */
        evenements: unirEvenements(
          evenements.get(Number(r.message_id)) ?? [],
          evenementsParBien.get(Number(r.message_id)) ?? [],
        ),
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
 *
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 3 — UN ÉVÉNEMENT N'APPARAÎT QU'UNE FOIS PAR MAIL ══════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT (relevé au lot 4, accordé par Arno le 05/10/2026) : sur le bien 315, le message **57188** rendait
 * `evenements: [1, 1, 1, 1, 1]` — la même carte cinq fois —, et l'écran affichait cinq capsules identiques en
 * criant « Encountered two children with the same key » dans la console.
 *
 * 🔴 CE N'ÉTAIT PAS UNE DONNÉE ABÎMÉE, et c'est ce qui rendait le défaut invisible en base. `gestion_affectation`
 * porte DEUX PORTÉES, tenues par deux index uniques partiels :
 *   · `message_id IS NULL` → l'affectation couvre TOUT le fil (un seul actif par fil) ;
 *   · `message_id = X`     → elle ne couvre QUE ce message (un seul actif par message).
 * MESURÉ LE 05/10/2026 : le fil 36475 porte **cinq** affectations actives, une par message (57123, 57145, 57188,
 * 57202, 57224), toutes vers l'événement 1 — cinq lignes parfaitement légitimes. La base entière n'en compte que
 * six actives : cinq « un message » et une « fil entier ».
 *
 * 🔴 LE DÉFAUT ÉTAIT DANS LA LECTURE : la requête joignait `gestion_affectation` par `fil_id` SEUL. Cinq lignes
 * pour un fil ⇒ cinq fois l'événement, pour CHACUN des huit messages du fil. La correction dédoublonne le couple
 * (fil, événement) AVANT la jointure : c'est le fil qui porte un événement, pas chacune de ses affectations.
 *
 * ⚠️ CE QUI N'EST **PAS** CHANGÉ, ET POURQUOI. La portée reste celle du FIL : les huit messages continuent de
 * porter l'événement, y compris les trois qu'aucune affectation ne vise nommément. Scoper par message aurait
 * RETIRÉ la capsule de ces trois-là — un changement de comportement qu'Arno n'a pas demandé, et qui
 * désaccorderait au passage le filtre « Événement ouvert », qui raisonne lui aussi par fil.
 *   🔭 **Question posée à Arno** : veut-il que l'affectation « un message » n'éclaire QUE son message ? La base
 *      le permet (la colonne existe et est renseignée), c'est un lot à part entière, et cela toucherait le
 *      filtre autant que l'affichage.
 *
 * ⚠️ LE DÉDOUBLONNAGE EST DANS LA REQUÊTE, PAS DANS LA BOUCLE qui suit — demande d'Arno, mot pour mot : « Corrige
 * la requête, pas seulement l'affichage. » Une boucle qui filtre aurait laissé la base rendre cinq lignes pour
 * en garder une, et tout autre lecteur de cette table aurait hérité du même piège sans le savoir.
 */
/**
 * 🔴🔴 LA REQUÊTE, NOMMÉE ET EXPORTÉE — comme `sqlPageBoite` et `sqlCompteBoite` avant elle, et pour la même
 * raison : elle porte une RÈGLE (« un événement n'apparaît qu'une fois par mail ») qui doit pouvoir être éprouvée
 * sans base. L'épreuve lit donc ce que le dépôt émet VRAIMENT, et non une copie recollée dans un test.
 *
 * 🔴 LE COUPLE (fil, événement) EST RENDU UNIQUE AVANT LA JOINTURE : un fil porte un événement, et le nombre
 * d'affectations qui l'y ont posé ne regarde pas l'écran. Le `DISTINCT` est dans la sous-requête et non sur le
 * `SELECT` final, pour que `ev.ouvert_le` reste disponible au tri sans entrer dans la clé de dédoublonnage.
 */
/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-11, POINT 5 — LES PIÈCES DE **TOUTE** LA SÉLECTION ══════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (05/10/2026) : « propriétaire ET locataire cochés → les mails des deux familles s'affichent,
 * mais le résumé ne montre pas les pièces des deux. Suspect : “le résumé porte sur les 100 mails affichés”. »
 * SA RÈGLE : « le résumé contient les pièces de TOUS les mails de la sélection […] pas seulement des 100
 * chargés. Le compteur “N pièces dans cette sélection” = la somme réelle. »
 *
 * 🔴 SON SOUPÇON ÉTAIT EXACT, ET LA MESURE LE CHIFFRE. Sur lot-290 (bien 421) : **344 pièces** sur les 326 mails
 * du bien, mais **106 seulement** appartiennent aux 100 mails chargés. Le résumé en montrait donc moins d'un
 * tiers — et il en montrait d'autant moins que la sélection était large, ce qui est exactement l'inverse de ce
 * qu'on attend d'un récapitulatif.
 *
 * ═══ 🔴 POURQUOI UNE LECTURE À PART, ET NON UNE PAGE PLUS GRANDE ══════════════════════════════════════════════════
 *
 * Lever le plafond de la page aurait fait voyager 326 mails avec leur extrait, leurs destinataires, leurs
 * événements, leurs statuts et leurs interventions — pour n'en garder que les pièces. Cette lecture-ci ne rend
 * QUE ce que le résumé affiche : l'identité du mail, sa date, son expéditeur, son objet, et ses pièces. Et elle
 * ne regarde que les mails qui en PORTENT (`EXISTS gestion_piece`), ce qui écarte d'emblée les trois quarts d'un
 * bien ordinaire.
 *
 * ⚠️ LES MÊMES CONDITIONS QUE LE LISTING, PAR LA MÊME FONCTION (`conditions`) : parties cochées, période, options.
 * Une seconde écriture des filtres aurait fini par montrer les pièces d'une sélection que le fil n'affichait
 * pas — c'est le genre de divergence que ce dépôt a déjà payée plusieurs fois.
 *
 * ⚠️ BORNÉE, PARCE QU'UNE LECTURE SANS BORNE EST UNE PANNE QUI ATTEND — et la borne est MESURÉE, non devinée.
 * Recensement du 05/10/2026 sur les 338 biens qui portent du courrier, par la règle de sélection elle-même
 * (`sqlLiensDuBien`) :
 *
 *     bien 421 : 326 mails · **142 porteurs** · 344 pièces   (lot-290, le bien de la demande — le pire en mails)
 *     bien 282 : 131 mails ·   124 porteurs   · 782 pièces   (le plus fourni en PIÈCES)
 *     bien 315 : 139 mails ·    31 porteurs   ·  55 pièces
 *     lot 47   :  47 mails ·    15 porteurs   ·  21 pièces
 *     médiane  :  14 pièces par bien ; 2 biens sur 338 dépassent 300 pièces
 *
 * 🔴 LA BORNE EST À 2 000 MAILS PORTEURS, soit quatorze fois le pire cas réel (voir `PORTEURS_DE_PIECES_MAX`,
 * qui dit aussi pourquoi une première mesure — faite par les cartes de contact, qui ne font pas entrer un mail
 * dans un bien — annonçait vingt fois trop).
 *
 * ⚠️ AU-DELÀ, LA LISTE EST TRONQUÉE ET `tronque` LE DIT — l'écran l'écrit (`motPorteeDuResume`) plutôt que de
 * mentir par omission. La borne vit dans le module PUR (`historique.ts`) parce que la phrase affichée la NOMME :
 * deux écritures du même nombre auraient fini par se contredire à l'écran.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

export async function porteursDePieces(
  c: CibleEtendue, f: FiltresHistorique,
): Promise<{ messages: MessagePorteurDePieces[]; tronque: boolean }> {
  const base = baseParams(c);
  const deplacements = await deplacementsDeMailsDisponibles();
  const [, , evs] = clesDe(c);
  const cte = cteMessages({ avecCarte: evs.length > 0, deplacements, grouper: false, avecLocataire: estLocataire(c) });
  /* 🔴 LA PAGINATION N'A PAS DE SENS ICI : on veut la sélection ENTIÈRE. Les champs `page` et `taille` des
     filtres sont donc ignorés — ils ne font pas partie de `conditions`, qui ne lit que les tamis. */
  const cond = conditions(f, decalage(c), deplacements, await nomUsageDisponible());
  const pLimite = base.length + 1 + cond.params.length;

  const { rows } = await query<{
    message_id: string; recu_le: string; sens: string; de: string; de_nom: string | null; objet: string | null;
    dest_a: string | null; dest_cc: string | null;
  }>(
    /* 🔴🔴 LOT HISTORIQUE-BIEN-14 — `dest_a` ET `dest_cc` ENTRENT DANS CETTE LECTURE. Deux colonnes `jsonb` déjà
       présentes sur la ligne lue : aucune jointure, aucune requête de plus. Elles servent deux choses que seul le
       destinataire peut dire — écarter du résumé la pièce envoyée par une partie NON cochée (point 1), et dire à
       QUELLE partie nous avons envoyé un document (point 2). */
    `WITH ${cte}
     SELECT m.id AS message_id,
            to_char(m.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS recu_le,
            m.sens, m.de_adresse AS de, m.de_nom, m.objet,
            m.dest_a::text, m.dest_cc::text
       FROM choisis ch
       JOIN gestion_message m ON m.id = ch.message_id
      WHERE true${cond.sql}
        AND EXISTS (SELECT 1 FROM gestion_piece p WHERE p.message_id = m.id)
      ORDER BY m.recu_le DESC, m.id DESC
      LIMIT $${pLimite}`,
    // UNE ligne de plus que la borne : sa présence, et elle seule, dit que la liste est tronquée.
    [...base, ...cond.params, PORTEURS_DE_PIECES_MAX + 1]);

  const tronque = rows.length > PORTEURS_DE_PIECES_MAX;
  const gardes = rows.slice(0, PORTEURS_DE_PIECES_MAX);
  /* 🔴 LES PIÈCES EN UNE SEULE REQUÊTE, par la MÊME fonction que le listing : une requête par mail se verrait. */
  const pieces = await piecesDesMessages(gardes.map((r) => Number(r.message_id)));

  return {
    tronque,
    messages: gardes.map((r) => ({
      messageId: Number(r.message_id), recuLe: r.recu_le,
      sens: r.sens === 'envoye' ? 'envoye' : 'recu',
      de: r.de, deNom: r.de_nom, objet: r.objet,
      /* ⚠️ LA MÊME FONCTION QUE LE LISTING (`personnesDuChamp`) : une seconde lecture du même `jsonb` aurait fini
         par découper les noms autrement, et les pastilles De / À / Cc n'auraient plus désigné les mêmes gens. */
      a: personnesDuChamp(r.dest_a), cc: personnesDuChamp(r.dest_cc),
      pieces: pieces.get(Number(r.message_id)) ?? [],
    })),
  };
}

/**
 * ══ 🔴🔴 LOT EVENEMENT-MINIMALISTE, POINT 5 — LA SECONDE VOIE DE L'ÉTIQUETTE « ÉVÉNEMENT OUVERT » ════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (07/10/2026) : « L'événement GES-2026-000001 est en cours, mais les 3 mails les plus récents de
 * l'historique n'ont pas l'étiquette “Événement ouvert”, alors que ceux du 28-29 sept. l'ont. » SA RÈGLE :
 * « l'étiquette s'affiche pour tout mail du bien rattaché à l'événement (ou à une conversation liée à
 * l'événement) daté entre son ouverture et sa clôture. »
 *
 * ═══ 🔴🔴 LA CAUSE, MESURÉE AVANT D'ÉCRIRE UNE LIGNE ════════════════════════════════════════════════════════════
 *
 * La règle d'avant ne connaissait qu'UNE voie : le FIL du mail porte une affectation active vers un événement non
 * traité (`sqlEvenementsDesFils`). Elle ne regardait NI le bien, NI la date.
 *
 *   mail 57597 « Devis - 67 rue de Normandie »      fil 36756  06/10 12:28  événement du fil : AUCUN
 *   mail 57276 « Fwd: Nouveau message de Art&F… »   fil 36573  30/09 12:26  événement du fil : AUCUN
 *   mail 57258 « Fwd: Nouveau message de Art&F… »   fil 36573  30/09 11:14  événement du fil : AUCUN
 *   (témoin)   57188 « Re: EDLS DI FIORE »          fil 36475  29/09 14:33  événement du fil : 1
 *
 * Les trois sont bien RATTACHÉS AU BIEN 315 — c'est ainsi qu'ils apparaissent dans l'historique — et tombent dans
 * la fenêtre de l'événement 1 (ouvert le 23/09/2026, toujours ouvert). Mais personne ne les a AFFECTÉS à
 * l'événement, et l'ancienne règle ne connaissait que cette porte.
 *
 * ═══ 🔴 SIMULATION CHIFFRÉE, VALIDÉE PAR ARNO AVANT APPLICATION ═════════════════════════════════════════════════
 *
 *   avant : 10 couples mail-événement étiquetés · après : 14 · GAGNÉS : 4 · PERDUS : 0
 *
 * Les quatre : les trois d'Arno, plus 55969 « Re: Facture diagnostic » du 24/09 — même bien, même fenêtre.
 *
 * 🔴 L'ANCIENNE VOIE EST CONSERVÉE, ET C'EST POURQUOI PERSONNE NE PERD RIEN. Les deux voies s'UNISSENT : un mail
 * affecté à l'événement garde son étiquette même hors fenêtre (il a été classé là exprès), et un mail du bien la
 * gagne dans la fenêtre. Remplacer l'une par l'autre aurait retiré l'étiquette à des mails qui l'avaient.
 *
 * 🔴 LES BIENS DE L'ÉVÉNEMENT VIENNENT DES DEUX AXES, comme partout : parties déclarées ET rattachements
 * confirmés de ses mails. L'événement 1 n'a AUCUNE partie déclarée — son bien ne vient que de ses mails. Ne lire
 * qu'un axe n'aurait rien réparé.
 *
 * ⚠️ LA FENÊTRE EST FERMÉE À DROITE PAR LA CLÔTURE quand elle existe : un mail arrivé APRÈS la clôture ne
 * concerne plus cet événement. L'étiquette ne s'affiche de toute façon que pour un événement ouvert
 * (`estEvenementOuvert`, module pur), mais la borne est écrite — la règle d'Arno la nomme, et un événement
 * rouvert plus tard ne doit pas repêcher les mails de l'intervalle où il était clos.
 *
 * ⚠️ CLÉ = LE MESSAGE, ET NON LE FIL. C'est une date de MAIL qui décide, et deux mails d'un même fil peuvent
 * tomber de part et d'autre d'une ouverture. L'ancienne voie, elle, reste par fil — c'est sa nature.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function sqlEvenementsDesMessages(avecMessageId: boolean, messages: string): string {
  const jointure = avecMessageId
    ? `ON (aa.message_id IS NOT NULL AND mm.id = aa.message_id)
          OR (aa.message_id IS NULL AND mm.fil_id = aa.fil_id)`
    : 'ON mm.fil_id = aa.fil_id';
  /* ⚠️ `aa.message_id` N'EXISTE QUE DEPUIS LA MIGRATION 234 : sans elle, nommer la colonne fait tomber l'écran.
     Même prudence que partout ailleurs dans ce module. */
  return `WITH biens_evt AS (
            SELECT DISTINCT p.evenement_id, p.cle
              FROM gestion_evenement_partie p
             WHERE p.sorte = 'lot' AND p.retire_le IS NULL AND btrim(coalesce(p.cle, '')) <> ''
            UNION
            SELECT DISTINCT aa.evenement_id, rr.cible_cle
              FROM gestion_affectation aa
              JOIN gestion_message mm ${jointure}
              JOIN gestion_rattachement rr ON rr.message_id = mm.id
             WHERE aa.actif AND rr.cible_sorte = 'lot' AND rr.statut = 'confirme' AND rr.piece_id IS NULL
               AND btrim(coalesce(rr.cible_cle, '')) <> ''
          )
          SELECT DISTINCT r.message_id, ev.id, ev.reference, ev.objet,
                 ${sqlEvenementOuvertParLaFrise('ev')} AS ouvert, ev.ouvert_le
            FROM gestion_rattachement r
            JOIN gestion_message msg ON msg.id = r.message_id
            JOIN biens_evt be ON be.cle = r.cible_cle
            JOIN gestion_evenement ev ON ev.id = be.evenement_id
           WHERE r.message_id = ANY(${messages})
             AND r.cible_sorte = 'lot' AND r.statut = 'confirme' AND r.piece_id IS NULL
             AND ${sqlDansUnePeriodeOuverte('ev', 'msg.recu_le')}
           ORDER BY r.message_id, ev.ouvert_le DESC, ev.id DESC`;
}

/**
 * ══ 🔴🔴 LOT ETAT-PAR-LA-FRISE — LA VOIE DU FIL EST BORNÉE PAR LES PÉRIODES, ELLE AUSSI ══════════════════════════
 *
 * RÈGLE D'ARNO (08/10/2026), point 5 : « Un mail ne porte “Événement en cours” (et ne compte dans l'événement)
 * que s'il est daté DANS une période ouverte. Un mail reçu entre une Clôture et la Réouverture suivante n'est PAS
 * étiqueté. »
 *
 * 🔴 CE QUI CHANGE, ET IL FAUT LE DIRE : jusqu'ici, un mail AFFECTÉ à l'événement gardait son étiquette même hors
 * fenêtre — « il a été classé là exprès » (lot EVENEMENT-MINIMALISTE). Arno écrit « un mail », sans distinguer la
 * voie, et il nomme le cas : le trou entre une Clôture et la Réouverture suivante. La voie du fil prend donc la
 * même borne que la voie du bien.
 *
 * ⚠️ SIMULATION CHIFFRÉE AVANT APPLICATION (règle du dépôt), relevée le 08/10/2026 sur TOUTE la base, en
 * comparant les couples (mail, événement) étiquetés par l'ancienne règle et par la nouvelle :
 *
 *   avant : 0 couple étiqueté · après : 12 · GAGNÉS : 12 · PERDUS : 0
 *
 * Les douze sont les mails de GES-2026-000001, du 24/09 au 06/10 : l'ancienne règle n'en étiquetait AUCUN,
 * parce que la colonne disait « traité » — alors que la carte Clôture de cet événement avait été retirée.
 * C'est exactement le constat d'Arno, mesuré.
 *
 * 🔴 ET PERSONNE NE PERD RIEN, ce qui n'allait pas de soi : borner la voie du fil pouvait retirer l'étiquette
 * à des mails affectés hors période. Mesuré : zéro. Aucun mail de la base ne tombe dans un trou fermé.
 *
 * 🔴 L'AFFECTATION RESTE LA CONDITION D'ENTRÉE : c'est elle qui dit que ce fil appartient à ce dossier. La période
 * ne fait que borner QUAND. Les deux voies continuent donc de dire des choses différentes, et de s'unir.
 */
export function sqlEvenementsDesFils(messages: string): string {
  /**
   * 🔴 ELLE PREND DÉSORMAIS DES **MESSAGES**, ET NON DES FILS, et c'est la période qui l'exige : la borne se
   * compare à une DATE DE MAIL. Le fil reste la condition d'appartenance (`af.fil_id = msg.fil_id`) ; le
   * message n'apporte que son instant. Les deux voies prennent donc le même ensemble, ce qui simplifie aussi
   * le filtre : une seule expression corrélée, `ARRAY[m.id]`, des deux côtés.
   *
   * ⚠️ L'ALIAS INTERNE EST `msg`, ET JAMAIS `m` : les cinq requêtes de l'écran nomment `m` leur table de
   * messages, et une seconde déclaration de `m` ici MASQUERAIT la première dans le `EXISTS` du filtre — la
   * corrélation deviendrait une tautologie, sans la moindre erreur de PostgreSQL. Piège déjà payé au lot
   * FILTRE-COMME-ETIQUETTE, et documenté juste en dessous.
   */
  return `SELECT DISTINCT msg.id AS message_id, ev.id, ev.reference, ev.objet,
                 ${sqlEvenementOuvertParLaFrise('ev')} AS ouvert, ev.ouvert_le
            FROM gestion_message msg
            JOIN gestion_affectation af ON af.actif AND af.fil_id = msg.fil_id
            JOIN gestion_evenement ev ON ev.id = af.evenement_id
           WHERE msg.id = ANY(${messages})
             AND ${sqlDansUnePeriodeOuverte('ev', 'msg.recu_le')}
           ORDER BY msg.id, ev.ouvert_le DESC, ev.id DESC`;
}

/**
 * ══ 🔴🔴 LOT FILTRE-COMME-ETIQUETTE — LE FILTRE EST FAIT DES DEUX REQUÊTES DE L'ÉTIQUETTE ════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (07/10/2026), mot pour mot : « aligne le filtre “Événement ouvert” de l'historique sur la même
 * règle que l'étiquette (MÊME CODE, PAS DE SECOND CHEMIN) : le filtre montre exactement les mails qui portent
 * l'étiquette. »
 *
 * ═══ 🔴🔴 CE QUE « MÊME CODE » VEUT DIRE ICI, ET POURQUOI CE N'EST PAS UNE COPIE ════════════════════════════════
 *
 * Le filtre n'a PAS sa propre idée de « ce mail porte un événement ouvert ». Il prend les DEUX requêtes qui
 * fabriquent l'étiquette — `sqlEvenementsDesFils` et `sqlEvenementsDesMessages`, les mêmes fonctions, le même
 * texte SQL — et il ne leur change qu'UNE chose : l'ensemble de messages sur lequel elles portent. L'étiquette
 * les borne à la page affichée (`$1::bigint[]`, cent mails) ; le filtre les borne au mail courant
 * (`ARRAY[m.id]`). Le reste — les deux voies, la fenêtre d'ouverture, le dédoublonnage — n'existe qu'à un seul
 * endroit du dépôt, et c'est ce qui rend l'égalité vraie par CONSTRUCTION et non par surveillance.
 *
 * 🔴 ET C'EST POUR CELA QUE LES DEUX FONCTIONS PRENNENT DÉSORMAIS LEUR ENSEMBLE EN PARAMÈTRE. Le premier jet
 * recopiait la condition du bien et de la fenêtre dans le filtre : deux textes à garder d'accord, c'est-à-dire
 * exactement le défaut que cette décision vient réparer. C'est le même procédé que `sqlLiensDuBien(alias)`,
 * déjà en place dans ce module pour « qu'est-ce qu'un bien rattaché à un mail ».
 *
 * ═══ 🔴🔴 LE PIÈGE QUI A FAILLI PASSER : L'ALIAS `m` MASQUÉ ════════════════════════════════════════════════════
 *
 * Les cinq requêtes de cet écran nomment `m` la table des messages, et c'est sur `m.id` que ce filtre se
 * corrèle. `sqlEvenementsDesMessages` nommait AUSSI `m` sa propre jointure sur `gestion_message` : glissée dans
 * un `EXISTS`, cette seconde déclaration MASQUAIT la première, `r.message_id = ANY(ARRAY[m.id])` devenait une
 * tautologie (la jointure interne l'impose déjà), et le filtre aurait rendu VRAI pour tout mail dès qu'UN SEUL
 * mail de la base portait un événement ouvert. Aucune erreur de PostgreSQL, aucun test de type : juste un filtre
 * qui ne filtre plus. L'alias interne s'appelle donc `msg`.
 *
 * ⚠️ SIMULATION CHIFFRÉE AVANT APPLICATION (règle d'Arno), relevée sur toute la base le 07/10/2026 :
 *   avant : 10 mails passent le filtre · après : 14 · ENTRENT : 4 · SORTENT : 0
 *   Les quatre sont sur le MÊME bien — le 315 —, tous dans la fenêtre de GES-2026-000001 : 57597 (06/10 12:28),
 *   57276 (30/09 12:26), 57258 (30/09 11:14), 55969 (24/09 09:40). Ce sont EXACTEMENT les quatre mails qui
 *   avaient gagné l'étiquette au lot précédent — la preuve, en chiffres, que les deux listes se rejoignent.
 *
 * ⚠️ PERSONNE NE PERD RIEN, ET CE N'EST PAS UN HASARD : l'ancienne condition du filtre (« une affectation active
 * du fil vers un événement non traité ») est, au caractère près, la voie du fil de l'étiquette. Le filtre ne
 * s'étend donc que de la seconde voie ; aucune ligne ne peut en sortir.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function sqlFiltreEvenementOuvert(avecMessageId: boolean): string {
  /* 🔴 LOT ETAT-PAR-LA-FRISE — LES DEUX VOIES PRENNENT LE MÊME ENSEMBLE (`ARRAY[m.id]`), parce que la voie du
     fil est bornée par la période du mail, elle aussi. Et « ouvert » n'est plus demandé à la colonne : chaque
     voie le rend déjà, calculé sur les cartes de BORNE de la frise. */
  return `EXISTS (
            SELECT 1 FROM (
              SELECT vf.ouvert FROM (${sqlEvenementsDesFils('ARRAY[m.id]')}) vf
              UNION ALL
              SELECT vb.ouvert FROM (${sqlEvenementsDesMessages(avecMessageId, 'ARRAY[m.id]')}) vb
            ) porte
             WHERE porte.ouvert)`;
}

/**
 * ══ 🔴 UN ÉVÉNEMENT N'APPARAÎT QU'UNE FOIS PAR MAIL, MÊME EN UNISSANT DEUX VOIES ═════════════════════════════════
 *
 * C'est la règle du lot HISTORIQUE-BIEN-5, point 3 — née d'un défaut mesuré : le message 57188 rendait
 * `evenements: [1, 1, 1, 1, 1]`, et l'écran criait « two children with the same key ». Les deux voies de ce lot
 * désignent souvent LE MÊME événement (un mail affecté ET dans la fenêtre de son bien) : sans ce dédoublonnage,
 * le défaut reviendrait par la porte d'à côté.
 *
 * ⚠️ LA VOIE DU FIL PASSE EN PREMIER, ET SON EXEMPLAIRE GAGNE : c'est l'affectation explicite, celle que
 * quelqu'un a posée à la main. La voie du bien est une déduction ; à information égale, la décision humaine
 * l'emporte.
 */
function unirEvenements(
  parFil: readonly EvenementDeLigne[], parBien: readonly EvenementDeLigne[],
): EvenementDeLigne[] {
  const vus = new Set<number>();
  const out: EvenementDeLigne[] = [];
  for (const e of [...parFil, ...parBien]) {
    if (vus.has(e.id)) continue;
    vus.add(e.id);
    out.push(e);
  }
  return out;
}

/** La seconde voie : les événements dont la FENÊTRE contient ce mail, et dont le BIEN est celui du mail. */
async function evenementsDesMessages(messageIds: readonly number[]): Promise<Map<number, EvenementDeLigne[]>> {
  const out = new Map<number, EvenementDeLigne[]>();
  const uniques = [...new Set(messageIds)];
  if (uniques.length === 0) return out;
  const { rows } = await query<{
    message_id: string; id: string; reference: string; objet: string; ouvert: boolean;
  }>(sqlEvenementsDesMessages(await deplacementsDeMailsDisponibles(), '$1::bigint[]'), [uniques]);
  for (const r of rows) {
    const cle = Number(r.message_id);
    const liste = out.get(cle) ?? [];
    liste.push({ id: Number(r.id), reference: r.reference, objet: r.objet, ouvert: r.ouvert });
    out.set(cle, liste);
  }
  return out;
}

/**
 * La première voie : les événements auxquels le FIL de ce mail est affecté, et dont une période ouverte
 * contient ce mail.
 *
 * 🔴 LOT ETAT-PAR-LA-FRISE — ELLE EST CLÉE PAR MESSAGE, ET NON PLUS PAR FIL. Deux mails d'un même fil peuvent
 * tomber de part et d'autre d'une clôture : la question « cet événement est-il en cours POUR CE MAIL ? » ne se
 * répond donc plus à l'échelle du fil. L'appartenance, elle, reste celle du fil.
 */
async function evenementsDesFils(messageIds: readonly number[]): Promise<Map<number, EvenementDeLigne[]>> {
  const out = new Map<number, EvenementDeLigne[]>();
  const uniques = [...new Set(messageIds)];
  if (uniques.length === 0) return out;
  const { rows } = await query<{
    message_id: string; id: string; reference: string; objet: string; ouvert: boolean;
  }>(
    sqlEvenementsDesFils('$1::bigint[]'), [uniques]);
  for (const r of rows) {
    const cle = Number(r.message_id);
    const liste = out.get(cle) ?? [];
    liste.push({ id: Number(r.id), reference: r.reference, objet: r.objet, ouvert: r.ouvert });
    out.set(cle, liste);
  }
  return out;
}

/**
 * ══ 🔴🔴 LOT MARQUES-EVENEMENT-EN-COURS — « CE MAIL PORTE-T-IL UN ÉVÉNEMENT EN COURS ? », POUR TOUS LES ÉCRANS ═══
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (08/10/2026) : « une capsule orange “Événement en cours” sur la PREMIÈRE LIGNE de chaque mail de
 * l'événement, juste après la capsule verte “Auto” / “Classé”, PARTOUT où ces lignes apparaissent : historique du
 * bien, boîte de réception et plein écran, recherche, conversation. »
 *
 * ═══ 🔴 POURQUOI CETTE FONCTION EXISTE, ET POURQUOI ELLE EST ICI ════════════════════════════════════════════════
 *
 * « Partout » met trois dépôts dans le coup : l'historique du bien (ce module), la liste de mails de la boîte
 * (`boiteRepo`, qui sert AUSSI le plein écran et la recherche — un seul composant de ligne pour toutes les
 * listes) et la conversation (`carteRepo`). Trois dépôts, et UNE SEULE question à poser.
 *
 * 🔴 ELLE NE DÉCIDE RIEN ELLE-MÊME. Elle appelle les DEUX voies déjà écrites — `sqlEvenementsDesFils` (le fil
 * porte une affectation active) et `sqlEvenementsDesMessages` (le mail tombe dans la fenêtre de l'événement, sur
 * le même bien) — puis `unirEvenements` et `estEvenementOuvert`. C'est la règle d'Arno du 07/10, au caractère
 * près, et c'est pour cela que la capsule de la boîte dira EXACTEMENT ce que dit déjà celle de l'historique. La
 * réécrire côté boîte, c'eût été se donner deux vérités à tenir d'accord — le défaut que ce dépôt a déjà payé.
 *
 * ⚠️ DEUX REQUÊTES POUR LA PAGE ENTIÈRE, JAMAIS UNE PAR LIGNE. Même borne que l'historique : les identifiants de
 * la page, et rien de plus. Elle rend une map VIDE sur une liste vide, sans toucher la base.
 *
 * ⚠️ SEULS LES ÉVÉNEMENTS OUVERTS SORTENT, parce que c'est tout ce que la capsule affiche. Les écrans n'ont donc
 * aucun filtre à refaire — et aucun moyen d'en oublier un.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export async function evenementsOuvertsDesMails(
  mails: readonly { messageId: number; filId: number }[],
): Promise<Map<number, EvenementDeLigne[]>> {
  const out = new Map<number, EvenementDeLigne[]>();
  if (mails.length === 0) return out;
  const parFil = await evenementsDesFils(mails.map((m) => m.messageId));
  const parBien = await evenementsDesMessages(mails.map((m) => m.messageId));
  for (const m of mails) {
    const ouverts = unirEvenements(parFil.get(m.messageId) ?? [], parBien.get(m.messageId) ?? [])
      .filter((e) => e.ouvert);
    if (ouverts.length > 0) out.set(m.messageId, ouverts);
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
    message_id: string; id: string; nom_fichier: string; nom_origine: string;
    type_mime: string | null; taille_octets: string | null;
    cle_stockage: string | null; motif_non_stocke: string | null; empreinte: string | null;
  }>(
    /**
     * 🔴 LOT HISTORIQUE-BIEN-1 — `empreinte_sha256` VOYAGE AVEC LA PIÈCE. Le résumé en miniatures du bloc
     * « Historique » dédoublonne par `dedoublonnerPieces`, qui identifie un fichier par son CONTENU. Sans cette
     * colonne, il retombait sur « nom + taille » pour TOUTES les pièces — donc deux documents différents de même
     * nom et de même taille fondus en un seul, et une pièce qui disparaît sans se voir (voir `PieceHistorique`).
     *
     * ⚠️ AUCUNE MIGRATION : la colonne existe depuis le lot de capture, et elle est renseignée pour toutes les
     * pièces qui ont des octets. Les autres rendent `null`, ce qui est la valeur que le repli attend.
     */
    /**
     * 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 3 — `nom_origine` VOYAGE AUSSI, pour que le renommage DISE VRAI.
     *
     * La visionneuse rétablie dans « Historique du bien » porte le bandeau de renommage, et ce bandeau annonce
     * « reçue sous : … ». Sans cette colonne il aurait fallu replier sur le nom AFFICHÉ — c'est-à-dire annoncer
     * comme nom d'origine le nom choisi, et effacer à l'écran la trace du renommage qu'on vient de faire.
     *
     * ⚠️ `nom_fichier` EST LE NOM REÇU ; `nom_usage` est celui qu'on a choisi. `sqlNomAffiche` rend déjà le
     * second quand il existe : les deux colonnes se lisent donc dans la même ligne, sans migration.
     */
    `SELECT message_id, id, ${await sqlNomAffiche('gestion_piece')} AS nom_fichier,
            nom_fichier AS nom_origine,
            type_mime, taille_octets::text, cle_stockage, motif_non_stocke, empreinte_sha256 AS empreinte
       FROM gestion_piece WHERE message_id = ANY($1::bigint[]) ORDER BY message_id, id`, [ids]);
  for (const r of rows) {
    const cle = Number(r.message_id);
    m.set(cle, [...(m.get(cle) ?? []), {
      pieceId: Number(r.id), nomFichier: r.nom_fichier, nomOrigine: r.nom_origine, typeMime: r.type_mime,
      tailleOctets: r.taille_octets === null ? null : Number(r.taille_octets),
      disponible: r.cle_stockage !== null, motifNonStocke: r.motif_non_stocke, empreinte: r.empreinte,
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
  /**
   * ══ 🔴🔴 LOT FRISE-PICTOS-PLUS-GRANDS-ET-RECHERCHE-BIEN-ENTIER — LE DÉNOMINATEUR DU « N SUR M » ════════════
   *
   * La SÉLECTION (période, parties, pièces, événement) SANS la recherche.
   *
   * 🔴 IL A FALLU L'AJOUTER, ET C'EST LA RECHERCHE SERVEUR QUI L'IMPOSE. « N mails sur M » comparait jusqu'ici
   * les mails trouvés à ceux de la PAGE — et c'était juste tant que l'écran filtrait lui-même : la page
   * portait la sélection entière. Maintenant que le serveur filtre, la page EST le résultat, et le compteur
   * aurait dit « 82 mails sur 82 » : vrai, et vide de sens.
   *
   * ⚠️ IL NE COÛTE RIEN QUAND ON NE CHERCHE PAS : sans recherche, la sélection EST le filtre, et l'on rend la
   * même valeur sans poser de seconde question à la base.
   */
  sansRecherche: EnteteHistorique;
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

  const avecNomUsage = await nomUsageDisponible();
  const cherche = f.texte.trim() !== '';
  const [filtre, total, sansRecherche] = await Promise.all([
    compter(conditions(f, decalage(c), deplacements, avecNomUsage)),
    compter({ sql: '', params: [] }),
    cherche
      ? compter(conditions({ ...f, texte: '' }, decalage(c), deplacements, avecNomUsage))
      : Promise.resolve(null),
  ]);
  return { filtre, total, sansRecherche: sansRecherche ?? filtre };
}

/**
 * QUI PARLE DANS CES ÉCHANGES, et combien de fois.
 *
 * 🔴 LA LISTE NE DÉPEND PAS DES INTERLOCUTEURS COCHÉS. Sinon cocher une personne ferait disparaître toutes les autres
 * du filtre, et on ne pourrait plus en ajouter une seconde — le filtre se refermerait sur lui-même. Les AUTRES filtres
 * (période, pièces, recherche), eux, s'appliquent : la liste reflète ce qu'on regarde.
 *
 * 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 1 — ET PAS DAVANTAGE DES EXPÉDITEURS ÉCARTÉS, pour exactement la même raison,
 * qui est même plus visible ici : décocher « Notre agence » aurait fait disparaître nos adresses de la liste des
 * parties, donc leurs cases avec elles — on n'aurait jamais pu les recocher. Le filtre se serait fermé sur
 * lui-même, sans retour possible.
 */
export async function interlocuteursHistorique(
  c: CibleEtendue, f: FiltresHistorique,
): Promise<{ liste: Interlocuteur[]; tronque: boolean }> {
  const [, , evs] = clesDe(c);
  const base = baseParams(c);
  const deplacements = await deplacementsDeMailsDisponibles();
  const cte = cteMessages({ avecCarte: evs.length > 0, deplacements, grouper: false, avecLocataire: estLocataire(c) });
  const cond = conditions({ ...f, interlocuteurs: [], expediteursExclus: [] }, decalage(c), deplacements, await nomUsageDisponible());
  const pLimite = base.length + 1 + cond.params.length;

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-1 — LES DEUX COMPTEURS, DANS **LA MÊME** REQUÊTE ════════════════════════════════
   *
   * DEMANDE D'ARNO : chaque adresse du tableau « PARTIES » dit « a écrit : 3 · en copie : 2 ». Et la règle du
   * module, non négociable : **une seule requête pour toute la liste**, jamais une par adresse — 76 adresses
   * (lot 155, mesuré) auraient fait 76 allers-retours pour un panneau qui s'ouvre d'un clic.
   *
   * 🔴 D'OÙ LE PALIER `par_mail` : UN MAIL NE PEUT COMPTER QU'UNE FOIS PAR ADRESSE. La table porte une ligne par
   * (message, adresse, rôle) : une adresse à la fois expéditeur et destinataire d'un même mail y a DEUX lignes,
   * et deux `count(DISTINCT …)` séparés l'auraient comptée dans les deux colonnes. MESURÉ LE 04/10/2026 :
   * **248 couples (adresse, message)** portent les deux rôles, sur **61 adresses**. On réduit donc d'abord à un
   * couple (adresse, message) avec deux booléens, puis on compte ces couples — et `NOT p.a_ecrit` fait gagner la
   * présence la plus forte, comme Arno l'a demandé.
   *
   * ⚠️ `count(*)` SUR `par_mail` EST **EXACTEMENT** L'ANCIEN `count(DISTINCT a.message_id)`, puisque `par_mail`
   * tient un seul enregistrement par (adresse, interne, message). Le total, l'ordre et le plafond ne changent
   * donc pas d'une ligne — seules deux colonnes s'ajoutent.
   *
   * ⚠️ LE NOM EST CALCULÉ DANS SON PROPRE PALIER, ET IL FALLAIT. `mode()` rend la valeur la PLUS FRÉQUENTE : la
   * calculer au-dessus de `par_mail` aurait pris le mode d'un mode (un nom par mail, puis le nom le plus fréquent
   * de ces modes), c'est-à-dire une autre statistique. `noms` lit la même population qu'avant ce lot, avec la
   * même expression au caractère près : le nom affiché est inchangé.
   */
  const { rows } = await query<{
    adresse: string; interne: boolean; n: string; n_ecrit: string; n_copie: string; nom: string | null;
  }>(
    `WITH ${cte},
     mails AS (SELECT m.id FROM choisis ch JOIN gestion_message m ON m.id = ch.message_id WHERE true${cond.sql}),
     adr AS (SELECT a.adresse, a.interne, a.message_id, a.adresse_brute, a.role
               FROM gestion_message_adresse a JOIN mails ON mails.id = a.message_id),
     par_mail AS (
       SELECT adresse, interne, message_id,
              /* 🔴🔴 LOT HISTORIQUE-BIEN-10, POINT 2 — LES DEUX COMPTEURS LISENT LA MEME LISTE QUE LE FILTRE,
                 et le filtre EST leur union (voir ROLES_DE_PARTICIPATION). Les trois mots etaient ecrits ici en
                 dur ; c'est ainsi que le filtre a pu, lui, accepter le role transfere sans que personne ne le
                 voie. (Aucun accent grave dans ce commentaire : il vit DANS un litteral gabarit.) */
              bool_or(role = '${ROLE_EXPEDITEUR}') AS a_ecrit,
              bool_or(role IN (${ROLES_RECEPTION.map((r) => "'" + r + "'").join(', ')})) AS en_copie
         FROM adr GROUP BY adresse, interne, message_id),
     -- Le nom d'affichage le plus fréquent pour cette adresse. La colonne adresse_brute porte « Nom <adr> » :
     -- on en retire la partie entre chevrons, et ce qui reste est le nom (vide quand il n'y en avait pas).
     noms AS (
       SELECT adresse, interne,
              mode() WITHIN GROUP (
                ORDER BY nullif(btrim(regexp_replace(coalesce(adresse_brute, ''), '<[^>]*>', '', 'g')), '')
              ) AS nom
         FROM adr GROUP BY adresse, interne)
     SELECT p.adresse, p.interne, count(*)::text AS n,
            count(*) FILTER (WHERE p.a_ecrit)::text AS n_ecrit,
            count(*) FILTER (WHERE p.en_copie AND NOT p.a_ecrit)::text AS n_copie,
            n.nom
       FROM par_mail p JOIN noms n ON n.adresse = p.adresse AND n.interne = p.interne
      GROUP BY p.adresse, p.interne, n.nom
      ORDER BY count(*) DESC, p.adresse
      LIMIT $${pLimite}`,
    [...base, ...cond.params, INTERLOCUTEURS_MAX + 1]);

  const tronque = rows.length > INTERLOCUTEURS_MAX;
  return {
    tronque,
    liste: rows.slice(0, INTERLOCUTEURS_MAX).map((r) => ({
      adresse: r.adresse, nom: r.nom, nbMails: Number(r.n), interne: r.interne,
      aEcrit: Number(r.n_ecrit), enCopie: Number(r.n_copie),
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

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-16, POINT 1 — LES CONTACTS ANNEXES, RATTACHÉS À LEUR LOCATION ═══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (05/10/2026, lot-146) : « locataire actuel (BRASSET / BRUERE) sélectionné → "Non affectés" montre
 * louisvaglio@live.fr (a écrit 2, en copie 2), qui appartient à la location VAGLIO ARNAUD. Quand on choisit
 * l'ancien locataire VAGLIO ARNAUD, cette adresse DISPARAÎT. C'est l'inverse de ce qu'il faut. »
 *
 * ═══ 🔴 LE DIAGNOSTIC, MESURÉ EN BASE ═══════════════════════════════════════════════════════════════════════════
 *
 * Les SEPT mails de `louisvaglio@live.fr` sur ce bien tiennent dans UN SEUL FIL (3366, « Dépôt de garantie ») et
 * vont du **11/11/2025 au 30/09/2026**. L'occupation de VAGLIO, elle, s'est achevée le **22/10/2025** : tous ces
 * mails sont donc POSTÉRIEURS à son départ — ce qui est le cours normal des choses, un dépôt de garantie se règle
 * après la sortie. Cinq de ces sept mails portent `aurelie.arnaud1402@gmail.com`, une adresse de SA carte ;
 * aucun ne porte la moindre adresse de BRASSET / BRUERE.
 *
 * Les capsules, elles, sont bâties par `interlocuteursHistorique` sur la PÉRIODE EN VIGUEUR. D'où exactement ce
 * qu'Arno voit : locataire actuel ⇒ période « tous les échanges » ⇒ l'adresse est là ; VAGLIO choisi ⇒ période
 * 06/02/2025–22/10/2025 ⇒ elle n'y est plus.
 *
 * ═══ 🔴🔴 POURQUOI LA RÈGLE DEMANDÉE NE POUVAIT PAS MARCHER, ET CE QUI LA REMPLACE ═══════════════════════════════
 *
 * Arno demande : « UNIQUEMENT les adresses qui ont participé à des mails du bien DANS LA PÉRIODE D'OCCUPATION de
 * ce locataire ». Appliquée à la lettre, cette règle échoue sur SON PROPRE cas d'épreuve, et des deux côtés :
 *   · avec VAGLIO, les sept mails sont HORS de son occupation ⇒ l'adresse resterait absente ;
 *   · avec BRASSET (22/10/2025 → aujourd'hui), ces mêmes sept mails sont DANS sa période ⇒ elle resterait là.
 * C'est l'exact contraire de ce qu'il demande d'éprouver (« présent avec VAGLIO, absent avec BRASSET »).
 *
 * 🔴 LA PÉRIODE N'EST PAS LE BON AXE. Ce qui rattache cette adresse à VAGLIO est mesurable, mais c'est la
 * CO-PARTICIPATION : elle paraît dans les mails où paraissent les adresses de SA carte, et dans aucun autre.
 * C'est d'ailleurs la même personne — `louisvaglio@live.fr` et `louis.vaglio@audencia.com`.
 *
 * Cette fonction rend donc, pour chaque carte de locataire du bien, les adresses qui participent aux mails où sa
 * carte participe, avec leurs compteurs calculés SUR CES MAILS-LÀ. L'écran garde ensuite la règle de période pour
 * tout ce qu'aucune carte ne réclame (un artisan qui n'écrit qu'à nous), et la co-participation pour le reste.
 *
 * ═══ ⚠️ CE QU'ELLE NE FAIT PAS ══════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ AUCUNE CONDITION DE PÉRIODE ICI, ET C'EST TOUT LE POINT : le rattachement d'un contact à une location ne
 * dépend pas de ce qu'on regarde. Le calculer sous la période en vigueur aurait reproduit le défaut d'Arno.
 *
 * ⚠️ LES ADRESSES INTERNES SONT ÉCARTÉES : nous paraissons dans tous les mails de toutes les locations, et nous
 * serions donc « contact annexe » de chacune. « Notre agence » a son propre groupe, qui ne change pas.
 *
 * ⚠️ LA MÊME RÈGLE DE SÉLECTION QUE LES TROIS AUTRES ÉCRANS (`sqlLiensDuBien`) : cette lecture ne redéfinit pas
 * « un mail rattaché à un bien ».
 *
 * ⚠️ MESURÉ SUR LE PIRE BIEN (421, 326 mails, 142 porteurs) : **258 ms**, et la route qui la porte est demandée
 * UNE fois par fiche — pas à chaque frappe ni à chaque changement de filtre.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export interface ContactDeLocataire {
  /** La clé de la carte, dans la forme de l'écran : `occ-<id d'occupation>`. */
  cle: string;
  adresse: string;
  nom: string | null;
  /** Combien des mails PARTAGÉS avec cette carte l'adresse a écrits, et dans combien elle n'était qu'en copie. */
  aEcrit: number;
  enCopie: number;
  nbMails: number;
}

export async function contactsParLocataire(lotCle: string): Promise<ContactDeLocataire[]> {
  const cle = (lotCle ?? '').trim();
  if (cle === '') return [];
  const { rows } = await query<{
    occ: string; adresse: string; nom: string | null; n: string; n_ecrit: string; n_copie: string;
  }>(
    `WITH mails AS (
       SELECT DISTINCT r.message_id
         FROM gestion_rattachement r
        WHERE ${sqlLiensDuBien('r')} AND r.cible_cle = $1
     ),
     cartes AS (
       SELECT o.id AS occ, lower(btrim(c.valeur)) AS adresse
         FROM gestion_annuaire_occupation o
         JOIN gestion_annuaire_lot l ON l.id = o.lot_id AND l.wippimmo_id = $1
         JOIN gestion_annuaire_contact c
           ON c.sujet = 'locataire' AND c.sujet_id = o.locataire_id
          AND c.sorte = 'email' AND c.absent_le IS NULL
        WHERE o.absent_le IS NULL AND btrim(c.valeur) <> ''
     ),
     -- Les mails où une adresse de la carte participe, à quelque titre que ce soit.
     partages AS (
       SELECT DISTINCT ca.occ, a.message_id
         FROM cartes ca
         JOIN gestion_message_adresse a ON a.adresse = ca.adresse
         JOIN mails ON mails.message_id = a.message_id
     ),
     /* Le palier « un mail ne compte qu'une fois par adresse » : la table porte une ligne par (message, adresse,
        rôle), et une adresse à la fois expéditrice et destinataire d'un même mail y figure deux fois. C'est le
        même palier que \`interlocuteursHistorique\`, pour que les deux compteurs veuillent dire la même chose. */
     par_mail AS (
       SELECT p.occ, a.adresse, a.message_id, a.adresse_brute,
              bool_or(a.role = '${ROLE_EXPEDITEUR}') AS a_ecrit,
              bool_or(a.role IN (${ROLES_RECEPTION.map((r) => "'" + r + "'").join(', ')})) AS en_copie
         FROM partages p
         JOIN gestion_message_adresse a ON a.message_id = p.message_id
        WHERE a.interne = false
        GROUP BY p.occ, a.adresse, a.message_id, a.adresse_brute
     )
     SELECT occ::text AS occ, adresse,
            mode() WITHIN GROUP (
              ORDER BY nullif(btrim(regexp_replace(coalesce(adresse_brute, ''), '<[^>]*>', '', 'g')), '')
            ) AS nom,
            count(DISTINCT message_id)::text AS n,
            count(DISTINCT message_id) FILTER (WHERE a_ecrit)::text AS n_ecrit,
            count(DISTINCT message_id) FILTER (WHERE en_copie AND NOT a_ecrit)::text AS n_copie
       FROM par_mail
      GROUP BY occ, adresse
      ORDER BY occ, count(DISTINCT message_id) DESC, adresse
      LIMIT $2`,
    [cle, CONTACTS_PAR_LOCATAIRE_MAX]);
  return rows.map((r) => ({
    cle: `occ-${r.occ}`,
    adresse: r.adresse,
    nom: r.nom === null || r.nom.trim() === '' ? null : r.nom.trim(),
    aEcrit: Number(r.n_ecrit),
    enCopie: Number(r.n_copie),
    nbMails: Number(r.n),
  }));
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-17, POINT 2 — LES MAILS DE LA FRISE : TOUTE LA SÉLECTION, EN QUATRE CHAMPS ══════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO : la frise montre « un trait vertical fin par MAIL REÇU » et, en bas, « le TOTAL des mails du
 * mois » — et l'on peut défiler « jusqu'au PREMIER mail du bien ».
 *
 * 🔴 D'OÙ UNE LECTURE À PART, ET LA RAISON EST CELLE DE LA ROUTE SŒUR `/historique/pieces`. Le listing s'arrête à
 * 100 mails ; le bien 421 en porte 326. Une frise bâtie sur la page n'aurait montré ni les traits ni les totaux
 * des deux tiers du courrier — et « jusqu'au premier mail du bien » aurait été faux de trois ans.
 *
 * 🔴 ET ELLE NE REND QUE QUATRE CHAMPS PAR MAIL : date, sens, expéditeur, objet. Pas d'extrait, pas de pièces,
 * pas de destinataires, pas d'événements, pas de statut. Lever le plafond du listing aurait fait voyager 326
 * lignes complètes pour n'en dessiner que des traits.
 *
 * ⚠️ LES **MÊMES** CONDITIONS QUE LE LISTING, PAR LA MÊME FONCTION (`conditions`) : parties cochées, période,
 * options. C'est la demande d'Arno — « la frise suit les PARTIES cochées (mêmes mails que le listing, même
 * calcul, un seul code) ». Une seconde écriture des tamis aurait fini par dessiner une frise d'une sélection que
 * le fil n'affiche pas.
 *
 * ⚠️ `page` ET `taille` SONT IGNORÉS, comme pour les pièces : on veut la sélection ENTIÈRE.
 *
 * ⚠️ BORNÉE, ET LA BORNE EST MESURÉE : le pire bien du portefeuille (421) porte 326 mails ; `MAILS_DE_LA_FRISE_MAX`
 * est à 5 000, soit quinze fois ce cas. Au-delà, la liste est tronquée et `tronque` le DIT — l'écran l'écrit
 * plutôt que de mentir par omission.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export interface MailDeLaFriseRepo {
  messageId: number;
  recuLe: string;
  sens: 'recu' | 'envoye';
  de: string;
  deNom: string | null;
  objet: string | null;
}

export async function mailsDeLaFrise(
  c: CibleEtendue, f: FiltresHistorique,
): Promise<{ mails: MailDeLaFriseRepo[]; tronque: boolean }> {
  const base = baseParams(c);
  const deplacements = await deplacementsDeMailsDisponibles();
  const [, , evs] = clesDe(c);
  const cte = cteMessages({ avecCarte: evs.length > 0, deplacements, grouper: false, avecLocataire: estLocataire(c) });
  const cond = conditions(f, decalage(c), deplacements, await nomUsageDisponible());
  const pLimite = base.length + 1 + cond.params.length;

  const { rows } = await query<{
    message_id: string; recu_le: string; sens: string; de: string; de_nom: string | null; objet: string | null;
  }>(
    `WITH ${cte}
     SELECT m.id AS message_id,
            to_char(m.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS recu_le,
            m.sens, m.de_adresse AS de, m.de_nom, m.objet
       FROM choisis ch
       JOIN gestion_message m ON m.id = ch.message_id
      WHERE true${cond.sql}
      ORDER BY m.recu_le DESC, m.id DESC
      LIMIT $${pLimite}`,
    // UNE ligne de plus que la borne : sa présence, et elle seule, dit que la liste est tronquée.
    [...base, ...cond.params, MAILS_DE_LA_FRISE_MAX + 1]);

  const tronque = rows.length > MAILS_DE_LA_FRISE_MAX;
  return {
    tronque,
    mails: rows.slice(0, MAILS_DE_LA_FRISE_MAX).map((r) => ({
      messageId: Number(r.message_id), recuLe: r.recu_le,
      sens: r.sens === 'envoye' ? 'envoye' : 'recu',
      de: r.de, deNom: r.de_nom, objet: r.objet,
    })),
  };
}
