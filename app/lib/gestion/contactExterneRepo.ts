import { query, withTransaction } from '../db/client';
import {
  annuaireDisponible, interventionsDisponibles, rattachementsDisponibles, typesLibresDisponibles,
} from './schema';
import { conditionCoordonneeVivante } from './coordonneeVivante';
import { adresseComplete } from './ficheBien';
// 🔴 LA LISTE DE NOS DOMAINES, écrite UNE fois dans le dépôt (lot BOITE-INTERNE-CORBEILLE).
import { estAdresseInterne } from './adresseInterne';
// 🔴 LES PARTENAIRES INTERNES (la comptabilité externalisée, lot 4d) : ni nous ni un client, donc jamais une clé.
import { adressesDe, lirePartenairesInternes } from './partenaires';
// 🔴🔴 « ce mail est-il un de nos envois automatiques ? » — module PUR, une seule définition pour tout le dépôt.
import { estDocumentEnvoye } from './documentsAuto';
import {
  clePersonne, etape2Requise, motifIntervention, mentionVia,
  roleLocataireALaDate, roleLocataireParmiOccupations, roleRecu, typeLibreRecu, typeRecu, typesProposes,
  MOTIF_INTERVENTION_PAR_SUIVI, MOTIF_INTERVENTION_RETIREE_PAR_SUIVI, MOTIF_INTERVENTION_SANS_BIEN,
  REGLE_INTERVENTION,
  type ContactExterne, type ContexteEtape2, type InterventionDeFiche, type MotifSansEtape2,
  type PersonneEtape2, type RoleInstantane, type TypeContactExterne,
} from './contactExterne';
import type { Auteur } from './gestes';

/**
 * ══ 🔴🔴 LOT CONTACTS-EXTERNES — LES ADRESSES INCONNUES, LES PERSONNES DU DOSSIER, ET LES INTERVENTIONS ═════════
 *
 * ⚠️ PAS DE `import 'server-only'` ICI — convention du module (voir `horsGestionRepo.ts`, `periodeRepo.ts`).
 *
 * ═══ 🔴🔴 LE PARTAGE DES RÔLES, ET IL EST TOUT ════════════════════════════════════════════════════════════════
 *
 *   · `contactExterne.ts` (PUR) DÉCIDE : faut-il l'étape 2, quel est le rôle d'une personne à la date du mail,
 *     dans quel ordre les personnes s'affichent, ce que « Le bien uniquement » exclut, et les MOTS. Tout s'y
 *     éprouve sur une table de cas, sans base.
 *   · CE FICHIER LIT ET ÉCRIT : il rapporte les faits (adresses des fiches, occupations, dates) et pose les
 *     liens. Il ne décide RIEN — pas une seule condition métier n'est réécrite ici.
 *
 * ═══ 🔴🔴 TANT QUE LA MIGRATION 293 MANQUE, RIEN N'EST NOMMÉ ══════════════════════════════════════════════════
 *
 * Chaque fonction qui touche à `gestion_contact_externe`, à `role_instantane` ou aux deux tables de personnes
 * SORT AVANT SA REQUÊTE quand la sonde répond « non ». Nommer une colonne qui n'existe pas ferait échouer TOUT
 * l'écran, pas seulement la nouveauté — c'est la leçon du lot 4a, inscrite en tête de `schema.ts`.
 *
 * ⚠️ `contexteEtape2` EST LA SEULE EXCEPTION, ET ELLE EST VOULUE : elle ne lit que l'annuaire et le message, qui
 * existent depuis toujours. C'est ce qui permet à l'écran de savoir qu'il y a une étape à faire même sur une base
 * qui n'a pas encore la migration — et donc de le DIRE, au lieu de classer en silence une information qu'Arno
 * voudra plus tard.
 */

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① TOUTES LES ADRESSES DE TOUTES LES CARTES DES FICHES D'UN BIEN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 LES ADRESSES CONNUES DES BIENS COCHÉS. LECTURE SEULE. ════════════════════════════════════════════════
 *
 * Demande d'Arno, mot pour mot : « compare l'adresse de l'expéditeur à TOUTES les adresses de TOUTES les cartes
 * des fiches propriétaires et locataires de CHAQUE bien coché, locataires sortants compris (historique complet,
 * sans limite) ».
 *
 * 🔴 « HISTORIQUE COMPLET, SANS LIMITE » EST LA MOITIÉ QUI COMPTE, et c'est ce qui distingue cette requête de
 * toutes les autres du module : partout ailleurs on lit les parties À LA DATE DU MAIL. Ici, NON — un locataire
 * sorti en 2023 qui écrit en 2026 n'est pas un inconnu, c'est quelqu'un du dossier. Lui redemander « pour qui
 * intervenez-vous ? » serait absurde, et c'est exactement le faux positif qu'Arno a voulu fermer d'avance.
 *
 * ⚠️ `archive_le IS NULL` (via `conditionCoordonneeVivante`) : une adresse qu'Arno vient de RETIRER d'une fiche
 * n'est plus une adresse de la fiche. Elle doit donc redevenir inconnue, et déclencher l'étape 2 — sinon son geste
 * n'aurait servi qu'à moitié, ce qui est pire que rien (règle du lot FICHES-ANNUAIRE, étape C).
 *
 * ⚠️ `absent_le IS NULL` AUSSI, et les deux ne disent pas la même chose : « absente » = plus dans le dernier
 * export WIPPIMMO. Une adresse disparue de l'export n'est plus un moyen de joindre la personne ; la compter
 * comme connue ferait classer sans rien demander un mail venu d'une boîte que l'annuaire ne donne plus.
 *
 * ⚠️ UNE SEULE REQUÊTE POUR TOUS LES BIENS COCHÉS, jamais une par bien : un mail peut en cocher dix.
 */
export async function adressesDesFiches(clesBiens: readonly string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const cles = [...new Set(clesBiens.map((c) => (c ?? '').trim()).filter((c) => c !== ''))];
  if (cles.length === 0 || !(await annuaireDisponible())) return out;

  const vivante = await conditionCoordonneeVivante('c');
  /**
   * 🔴 TROIS VOIES VERS LES PERSONNES D'UN BIEN, ET IL FAUT LES TROIS :
   *   · le propriétaire DIRECT de l'import (`lo.proprietaire_id`) — la vérité d'aujourd'hui pour les 365 lots ;
   *   · les propriétaires AJOUTÉS À LA MAIN (`gestion_annuaire_lot_proprietaire`, migration 278) — la
   *     co-propriété et la vente. ⚠️ SANS FILTRE `jusqu_a IS NULL` : un ANCIEN propriétaire qui écrit n'est pas
   *     un inconnu non plus (« historique complet, sans limite ») ;
   *   · TOUTES les occupations du lot, sorties comprises.
   *
   * ⚠️ AUCUNE SONDE SUR LA 278 ICI, et c'est sûr : la table existe depuis la migration 278, qui est appliquée
   * (sinon `annuaireModifiableDisponible` serait faux et `conditionCoordonneeVivante` rendrait la chaîne vide —
   * mais la TABLE, elle, est nommée par la 278 elle-même). Un `LEFT JOIN` sur une table absente ferait échouer la
   * requête : on la nomme donc dans un bloc à part, dont l'échec est rattrapé juste en dessous.
   */
  const { rows } = await query<{ adresse: string }>(
    `WITH lots AS (
       SELECT id, proprietaire_id FROM gestion_annuaire_lot WHERE wippimmo_id = ANY($1::text[])
     ),
     personnes AS (
       SELECT 'proprietaire'::text AS sujet, l.proprietaire_id AS sujet_id
         FROM lots l WHERE l.proprietaire_id IS NOT NULL
       UNION
       SELECT 'proprietaire'::text, lp.proprietaire_id
         FROM gestion_annuaire_lot_proprietaire lp JOIN lots l ON l.id = lp.lot_id
       UNION
       SELECT 'locataire'::text, o.locataire_id
         FROM gestion_annuaire_occupation o JOIN lots l ON l.id = o.lot_id
     )
     SELECT DISTINCT lower(btrim(c.valeur)) AS adresse
       FROM gestion_annuaire_contact c JOIN personnes p
         ON p.sujet = c.sujet AND p.sujet_id = c.sujet_id
      WHERE c.sorte = 'email' AND c.absent_le IS NULL${vivante}
        AND btrim(coalesce(c.valeur, '')) <> ''`, [cles]);

  for (const r of rows) out.add(r.adresse);
  return out;
}

/**
 * ══ 🔴🔴 LOT SUIVI-CONVERSATION-NON-RATTACHEE — L'EXPÉDITEUR DE CE MAIL EST-IL CONNU DES FICHES ? ═════════════
 *
 * Demande d'Arno (02/10/2026), règle ② : sur une conversation JAMAIS rattachée, le bloc à 3 choix s'affiche
 * toujours — « expéditeur CONNU des fiches propriétaires/locataires ».
 *
 * 🔴 « CONNU » SE MESURE : l'adresse est contact d'au moins une fiche VIVANTE. C'est la même définition que
 * `adressesDesFiches`, sans la restriction aux biens cochés — parce que la question posée ici n'est pas « connu
 * sur CE dossier » mais « connu de la maison ». Un ancien locataire d'un autre immeuble reste quelqu'un dont on
 * sait qui il est, et le bloc doit lui être offert.
 *
 * 🔴 ET C'EST CE QUI TIENT L'INVARIANT : le bloc à 3 choix et l'étape 2 ne s'affichent jamais ensemble. Une
 * adresse inconnue de TOUTES les fiches l'est forcément de celles des biens cochés — donc l'étape 2 s'ouvrira, et
 * le bloc, lui, sera resté fermé.
 *
 * ⚠️ NOS PROPRES ADRESSES RENDENT « NON », et c'est la lettre de la règle : elles ne sont contact d'aucune fiche.
 * Un mail que NOUS envoyons n'ouvre donc pas le bloc sur une conversation jamais rattachée. À signaler à Arno —
 * ce n'est pas un oubli, c'est ce qu'il a écrit.
 *
 * ⚠️ `archive_le` ET `absent_le` : mêmes conditions que partout ailleurs. Une adresse qu'Arno vient de retirer
 * d'une fiche n'est plus une adresse de la fiche — sinon son geste n'aurait servi qu'à moitié.
 */
export async function expediteurConnuDesFiches(messageId: number): Promise<boolean> {
  if (!(await annuaireDisponible())) return false;
  try {
    const vivante = await conditionCoordonneeVivante('c');
    const { rows } = await query<{ connu: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM gestion_annuaire_contact c
          WHERE c.sorte = 'email' AND c.absent_le IS NULL${vivante}
            AND lower(btrim(c.valeur)) = (
              SELECT lower(btrim(coalesce(m.de_adresse, ''))) FROM gestion_message m WHERE m.id = $1)
            AND btrim(coalesce(c.valeur, '')) <> ''
       ) AS connu`, [messageId]);
    return rows[0]?.connu === true;
  } catch (e) {
    /**
     * ⚠️ SILENCIEUX, ET « NON ». Entre les deux réponses possibles, « inconnu » CACHE le bloc — c'est le
     * comportement d'avant ce lot, et une lecture en échec ne doit jamais faire apparaître une décision de plus.
     */
    console.error('[gestion/contacts] expéditeur connu ? lecture impossible (message=%d)', messageId, e);
    return false;
  }
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② CE QU'IL FAUT POUR DÉCIDER, ET POUR AFFICHER L'ÉTAPE 2
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Un bien de l'étape 2 : son en-tête (adresse et type), et ses personnes. */
export interface BienEtape2 {
  cle: string;
  /** L'adresse COMPLÈTE : voie, code postal, commune. Une adresse sans code postal n'est pas une adresse. */
  adresseComplete: string;
  /** « Appartement », « Parking », « Box »… — la NATURE WIPPIMMO, telle quelle. */
  nature: string | null;
  typeBien: string | null;
  personnes: PersonneEtape2[];
}

export interface ReponseEtape2 {
  messageId: number;
  filId: number | null;
  /** La date de RÉCEPTION du mail, en jour ISO. C'est elle qui décide de chaque rôle instantané. */
  dateMail: string | null;
  /** L'adresse de l'expéditeur, en minuscules. */
  expediteur: string;
  /** Le nom affiché de l'expéditeur, quand le mail en porte un : il pré-remplit le champ « nom ». */
  expediteurNom: string | null;
  /** L'étape 2 est-elle demandée, et sinon pourquoi (motif nommé par Arno). */
  requise: boolean;
  motif: MotifSansEtape2 | null;
  biens: BienEtape2[];
  /** Le contact externe déjà connu pour cette adresse — ses trois champs pré-remplis (demande d'Arno). */
  contact: ContactExterne | null;
  /**
   * 🔴 LES DEUX CHOIX DE SUIVI NE S'AFFICHENT QU'AU PREMIER CLASSEMENT DE CE CONTACT DANS CETTE CONVERSATION
   * (demande d'Arno). Le serveur répond, parce que lui seul connaît la conversation.
   */
  premierClassement: boolean;
  /**
   * 🔴 LA DERNIÈRE CONFIGURATION VALIDÉE DE CETTE CONVERSATION, pour la pré-coche du « Classement ponctuel ».
   * `null` = aucune : rien n'est pré-coché, et c'est la règle « rien de pré-coché à la première fois ».
   */
  precoche: { personnes: string[]; bienUniquement: boolean; suivi: 'auto' | 'ponctuel' } | null;
  /**
   * 🔴🔴 `false` = MIGRATION 293 NON APPLIQUÉE. L'écran le DIT en tête de l'étape : le classement du bien sera
   * enregistré, les relations aux personnes ne le seront pas encore. Il ne bloque rien et ne cache rien.
   */
  disponible: boolean;
  /**
   * ══ 🔴 LOT URGENT-VERIF-SUIVI-ET-76-BIENS — LES TYPES QUE LE CHOIX PROPOSE ═══════════════════════════════════
   *
   * Composés par le SERVEUR, parce que lui seul sait deux choses : ce que la base accepte (migration 294), et
   * quels types ont déjà été écrits à la main. L'écran rend la liste qu'on lui donne — il n'en invente aucune.
   */
  typesProposes: string[];
  /** 🔴 `false` = migration 294 absente : le choix « Personnaliser… » ne s'affiche pas. */
  typeLibre: boolean;
}

/**
 * ══ 🔴🔴 CE QU'IL FAUT POUR L'ÉTAPE 2. LECTURE SEULE. ═════════════════════════════════════════════════════════
 *
 * ⚠️ AUCUNE ÉCRITURE, et aucune décision : la seule condition métier de cette fonction est l'appel à
 * `etape2Requise` (module PUR). Tout le reste est du rapport de faits.
 */
export async function contexteEtape2(o: {
  messageId: number;
  /** Les biens cochés à l'étape 1 — ce sont EUX qui définissent « les fiches du bien choisi ». */
  biensCoches: readonly string[];
  interne: boolean;
  horsGestion: boolean;
}): Promise<ReponseEtape2 | null> {
  const { rows: msg } = await query<{
    fil_id: string | null; recu_le: string | null; de: string | null; de_nom: string | null;
    sens: string | null; objet: string | null; exclu_par_regle_id: number | null;
  }>(
    `SELECT m.fil_id::text AS fil_id,
            to_char(m.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS recu_le,
            m.de_adresse AS de, m.de_nom, m.sens, m.objet, m.exclu_par_regle_id
       FROM gestion_message m WHERE m.id = $1`, [o.messageId]);
  const m = msg[0];
  if (m === undefined) return null;

  const expediteur = (m.de ?? '').trim().toLowerCase();
  const filId = m.fil_id === null ? null : Number(m.fil_id);
  const cles = [...new Set(o.biensCoches.map((c) => (c ?? '').trim()).filter((c) => c !== ''))];

  /**
   * 🔴 NOS DOMAINES *ET* LES PARTENAIRES INTERNES (la comptabilité externalisée, lot 4d). La liste vit en base et
   * ce module n'a pas à la recopier : `estAdresseInterne` est la SEULE définition du dépôt, et elle la reçoit.
   */
  const partenaires = adressesDe(await lirePartenairesInternes());
  const connues = await adressesDesFiches(cles);

  const contexte: ContexteEtape2 = {
    sens: m.sens === 'envoye' ? 'envoye' : m.sens === 'recu' ? 'recu' : null,
    expediteurConnu: expediteur !== '' && connues.has(expediteur),
    expediteurInterne: estAdresseInterne(expediteur, partenaires),
    document: estDocumentEnvoye({
      sens: m.sens, objet: m.objet, exclusionRegleId: m.exclu_par_regle_id,
    }),
    biensCoches: cles,
    interne: o.interne,
    horsGestion: o.horsGestion,
  };
  const verdict = etape2Requise(contexte);
  const disponible = await interventionsDisponibles();

  // ⚠️ ON NE CHARGE LES PERSONNES QUE SI L'ÉTAPE EST DEMANDÉE : une requête par bien pour un écran qui ne
  //   s'affichera pas serait du travail pour personne — et c'est le cas le plus fréquent, de loin.
  if (!verdict.requise) {
    return {
      messageId: o.messageId, filId, dateMail: m.recu_le, expediteur, expediteurNom: m.de_nom,
      requise: false, motif: verdict.motif, biens: [], contact: null,
      premierClassement: true, precoche: null, disponible,
      // ⚠️ L'étape ne s'affichera pas : la liste des types n'a personne à qui s'adresser.
      typesProposes: [], typeLibre: false,
    };
  }

  const [biens, contact, memoire, types] = await Promise.all([
    personnesDesBiens(cles, m.recu_le ?? ''),
    lireContactExterne(expediteur),
    memoireDuFil(filId, o.messageId),
    typesAProposer(),
  ]);

  return {
    messageId: o.messageId, filId, dateMail: m.recu_le, expediteur, expediteurNom: m.de_nom,
    requise: true, motif: null, biens, contact,
    premierClassement: memoire.premierClassement, precoche: memoire.precoche, disponible,
    typesProposes: types.liste, typeLibre: types.libre,
  };
}

/**
 * ══ 🔴🔴 LES TYPES QUE LE CHOIX PROPOSE, ET CE QUE LA BASE ACCEPTE. LECTURE SEULE. ════════════════════════════
 *
 * Deux réponses en une, et elles vont ensemble :
 *   · `liste` — ce que l'écran affiche. Sans la migration 294, ce sont les HUIT types que la contrainte de la
 *     293 autorise ; avec elle, les neuf (« Diagnostiqueur » compris) PLUS tous ceux déjà écrits à la main ;
 *   · `libre` — le choix « Personnaliser… » s'affiche-t-il.
 *
 * 🔴 ON NE PROPOSE JAMAIS CE QUE LA BASE REFUSERAIT. Les trois champs du contact ne bloquent pas le classement :
 * un type refusé disparaîtrait donc en silence, et Arno croirait l'avoir enregistré. La liste affichée est
 * exactement la liste enregistrable.
 *
 * ⚠️ LA DÉCISION EST AU MODULE PUR (`typesProposes`) : ici on ne fait que lire la sonde et la base.
 */
export async function typesAProposer(): Promise<{ liste: string[]; libre: boolean }> {
  const libre = await typesLibresDisponibles();
  if (!libre) return { liste: typesProposes([], { typeLibre: false }), libre: false };
  try {
    // ⚠️ `DISTINCT` SUR LA COLONNE, pas un parcours : la table est petite, mais la requête doit le rester.
    const { rows } = await query<{ type: string }>(
      "SELECT DISTINCT type FROM gestion_contact_externe WHERE type IS NOT NULL AND btrim(type) <> ''");
    return { liste: typesProposes(rows.map((r) => r.type), { typeLibre: true }), libre: true };
  } catch (e) {
    // ⚠️ SILENCIEUX : une lecture en échec ne doit pas empêcher de classer. On retombe sur la liste de départ.
    console.error('[gestion/contacts] lecture des types impossible', e);
    return { liste: typesProposes([], { typeLibre: true }), libre: true };
  }
}

/**
 * ══ 🔴🔴 LES PERSONNES DES BIENS COCHÉS, AVEC LEUR RÔLE À LA DATE DU MAIL. LECTURE SEULE. ═════════════════════
 *
 * Demande d'Arno : « PROPRIÉTAIRE(S) : chaque carte ou personne de la fiche propriétaire, case à cocher.
 * LOCATAIRE(S) : chaque carte ou personne, avec sa pastille de statut CALCULÉE À LA DATE DE RÉCEPTION DU MAIL. »
 *
 * 🔴 TOUTES LES OCCUPATIONS, PASSÉES COMPRISES — et c'est l'inverse de `SQL_PARTIES` dans `classementBien.ts`,
 * qui ne retient que l'occupation couvrant la date du mail. Ici on les veut toutes, parce qu'Arno demande « le
 * locataire sortant le plus récent, puis “Voir tous les anciens locataires…” qui déplie le reste ». La DATE ne
 * sert donc pas à FILTRER, elle sert à ÉTIQUETER : c'est `roleLocataireALaDate` (module pur) qui décide du mot.
 *
 * ⚠️ DEUX REQUÊTES POUR TOUS LES BIENS, jamais deux par bien. Le lot le plus fourni compte une poignée
 * d'occupations ; dix biens cochés feraient vingt requêtes pour trente lignes.
 *
 * ⚠️ L'ORDRE EST CELUI DE L'IMPORT, et il est conservé : propriétaire direct d'abord (c'est celui que WIPPIMMO
 * donne), puis ceux ajoutés à la main par rang ; occupations les plus récentes d'abord. Le module pur ne retrie
 * qu'à l'intérieur de ses catégories.
 */
export async function personnesDesBiens(
  clesBiens: readonly string[], dateMail: string,
): Promise<BienEtape2[]> {
  const cles = [...new Set(clesBiens.map((c) => (c ?? '').trim()).filter((c) => c !== ''))];
  if (cles.length === 0 || !(await annuaireDisponible())) return [];

  const { rows: lots } = await query<{
    id: string; cle: string; adresse: string | null; code_postal: string | null; commune: string | null;
    immeuble: string | null; nature: string | null; type_bien: string | null;
    gestion_debut: string | null; gestion_fin: string | null;
  }>(
    `SELECT lo.id::text, lo.wippimmo_id AS cle, lo.adresse, lo.code_postal, lo.commune, lo.immeuble,
            lo.nature, lo.type_bien,
            lo.gestion_debut::text AS gestion_debut, lo.gestion_fin::text AS gestion_fin
       FROM gestion_annuaire_lot lo
      WHERE lo.wippimmo_id = ANY($1::text[])
      ORDER BY lo.commune NULLS LAST, lo.adresse NULLS LAST, lo.wippimmo_id`, [cles]);
  if (lots.length === 0) return [];

  const ids = lots.map((l) => Number(l.id));

  /**
   * LES PROPRIÉTAIRES DE CHAQUE LOT. `actif` dit « en cours » : Arno demande « propriétaire(s) actif(s) » en
   * tête, et un ancien propriétaire d'un bien vendu n'a rien à faire là.
   *
   * ⚠️ `rang` : `0` EST LE PROPRIÉTAIRE DE L'IMPORT (la voie directe), et il passe en premier — c'est la même
   * règle d'ordre que `ficheDuLot` dans `annuaireRepo.ts`, et deux ordres différents pour la même liste
   * finiraient par se contredire d'un écran à l'autre.
   */
  const { rows: props } = await query<{
    lot_id: string; id: string; cle: string; nom: string; civilite: string | null; actif: boolean; rang: number;
  }>(
    `SELECT l.id::text AS lot_id, pr.id::text, pr.wippimmo_id AS cle, pr.nom_complet AS nom, pr.civilite,
            true AS actif, 0 AS rang
       FROM gestion_annuaire_lot l JOIN gestion_annuaire_proprietaire pr ON pr.id = l.proprietaire_id
      WHERE l.id = ANY($1::bigint[]) AND pr.supprime_le IS NULL
     UNION ALL
     SELECT lp.lot_id::text, pr.id::text, pr.wippimmo_id, pr.nom_complet, pr.civilite,
            (lp.jusqu_a IS NULL) AS actif, greatest(lp.rang, 1) AS rang
       FROM gestion_annuaire_lot_proprietaire lp
       JOIN gestion_annuaire_proprietaire pr ON pr.id = lp.proprietaire_id
      WHERE lp.lot_id = ANY($1::bigint[]) AND pr.supprime_le IS NULL
      ORDER BY 1, 7, 2`, [ids]);

  /**
   * TOUTES les occupations, du plus récent au plus ancien : `entree DESC` comme partout dans le module.
   *
   * ══ 🔴🔴 L'IDENTITÉ D'UN LOCATAIRE EST `cle_personne`, JAMAIS `wippimmo_id` ════════════════════════════════
   *
   * MESURÉ EN BASE (02/10/2026) : sur les 510 fiches locataires, `cle_personne` et `wippimmo_id` ne coïncident
   * JAMAIS (0 sur 510). `cle_personne` (« abidi aymen#abidiaymen05@gmail.com ») porte l'unique index unique de la
   * table ; `wippimmo_id` est un numéro de dossier que rien ne garantit unique.
   *
   * 🔴 ET C'EST DÉJÀ LA CLÉ QU'EMPLOIENT LES DOCUMENTS AUTOMATIQUES : `documentsAutoRepo` écrit `lo.cle_personne`
   * dans `cible_cle`, et la route `annuaire/documents` la relit par `cle_personne`. Écrire ici `wippimmo_id`
   * ferait des interventions INTROUVABLES depuis la fiche — un lien posé, et une liste vide en face.
   *
   * ⚠️ NE PAS LA CONFONDRE AVEC `PartieBien.cle` DE `classementBien.ts`, qui rend `wippimmo_id` : celle-là ne sert
   * qu'à L'AFFICHAGE d'une partie, et n'a jamais servi de cible de rattachement.
   */
  const { rows: occ } = await query<{
    lot_id: string; id: string; cle: string; nom: string; civilite: string | null;
    entree: string | null; sortie: string | null;
  }>(
    `SELECT o.lot_id::text, lc.id::text, lc.cle_personne AS cle, lc.nom, lc.civilite,
            o.entree::text AS entree, o.sortie::text AS sortie
       FROM gestion_annuaire_occupation o
       JOIN gestion_annuaire_locataire lc ON lc.id = o.locataire_id
      WHERE o.lot_id = ANY($1::bigint[]) AND lc.supprime_le IS NULL
      ORDER BY o.lot_id, o.entree DESC NULLS LAST, o.id DESC`, [ids]);

  return lots.map((l) => {
    const personnes: PersonneEtape2[] = [];
    // ⚠️ DÉDOUBLONNÉ PAR CLÉ : un propriétaire peut arriver par les DEUX voies (import + ajout à la main). Le
    //   premier rencontré gagne, et c'est l'import — celui dont l'ordre est sûr.
    const vues = new Set<string>();
    for (const p of props.filter((x) => x.lot_id === l.id)) {
      if (vues.has(`proprietaire:${p.cle}`)) continue;
      vues.add(`proprietaire:${p.cle}`);
      personnes.push({
        sorte: 'proprietaire', cle: p.cle, id: Number(p.id), nom: p.nom, civilite: p.civilite,
        role: 'proprietaire', actif: p.actif === true,
      });
    }
    for (const x of occ.filter((y) => y.lot_id === l.id)) {
      if (vues.has(`locataire:${x.cle}`)) continue;
      vues.add(`locataire:${x.cle}`);
      personnes.push({
        sorte: 'locataire', cle: x.cle, id: Number(x.id), nom: x.nom, civilite: x.civilite,
        // 🔴 LE MOT VIENT DU MODULE PUR, et de lui seul : l'écran place et peint, le dépôt rapporte les dates.
        role: roleLocataireALaDate({ entree: x.entree, sortie: x.sortie, dateMail }),
        entree: x.entree, sortie: x.sortie,
      });
    }
    return {
      cle: l.cle,
      // ⚠️ `adresseComplete` NE PREND QUE TROIS CHAMPS (`Pick<LotFiche, …>`) : la nature et le type s'affichent à
      //   part dans l'en-tête de l'étape, parce qu'Arno demande « adresse ET type du bien », côte à côte.
      adresseComplete: adresseComplete({
        adresse: l.adresse, codePostal: l.code_postal, commune: l.commune,
      }),
      nature: l.nature, typeBien: l.type_bien,
      personnes,
    };
  });
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 ②-bis LE RÔLE INSTANTANÉ, RECALCULÉ MAIL PAR MAIL
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** La clé d'un couple (mail, personne) dans la carte des rôles. PUR. */
export function cleRole(messageId: number, p: { sorte: string; cle: string }): string {
  return `${messageId}|${p.sorte}:${p.cle}`;
}

/**
 * ══ 🔴🔴 LE RÔLE DE CHAQUE PERSONNE À LA DATE DE CHAQUE MAIL. LECTURE SEULE. ══════════════════════════════════
 *
 * Demande d'Arno, sur le suivi automatique : « Les mails suivants de la conversation (dans les deux sens) en
 * héritent, rôle instantané recalculé à la date de chaque mail. »
 *
 * 🔴 C'EST POUR ÇA QUE LA FENÊTRE NE PORTE PAS LE RÔLE. Un courrier de mars et un courrier de septembre, sous la
 * même fenêtre, peuvent concerner la même personne comme OCCUPANTE puis comme SORTANTE. Figer le rôle dans la
 * fenêtre donnerait au second le mot du premier — et ce mot est ensuite gravé pour toujours.
 *
 * ⚠️ LE RÔLE SE CALCULE SUR LES OCCUPATIONS DES BIENS **DE CE CLASSEMENT**, et non sur toutes celles de la
 * personne : « le locataire sortant » veut dire « sortant de CE logement ». Une personne qui occupe un autre lot
 * ailleurs n'en est pas pour autant occupante ici.
 *
 * ⚠️ DEUX REQUÊTES POUR TOUTE LA CONVERSATION, jamais deux par mail : un échange porte parfois trente messages.
 * La DÉCISION, elle, reste au module pur (`roleLocataireParmiOccupations`).
 */
export async function rolesALaDateDesMails(
  demandes: readonly {
    messageId: number;
    /** La date de RÉCEPTION du mail, en jour ISO. */
    dateMail: string;
    /** Les clés des biens de SON classement. */
    biens: readonly string[];
    personnes: readonly { sorte: 'proprietaire' | 'locataire'; cle: string }[];
  }[],
): Promise<Map<string, RoleInstantane>> {
  const out = new Map<string, RoleInstantane>();
  if (demandes.length === 0) return out;

  // ① UN PROPRIÉTAIRE EST UN PROPRIÉTAIRE — aucune date à lire, aucune requête à faire.
  for (const d of demandes) {
    for (const p of d.personnes) {
      if (p.sorte === 'proprietaire') out.set(cleRole(d.messageId, p), 'proprietaire');
    }
  }

  const clesLocataires = [...new Set(demandes.flatMap(
    (d) => d.personnes.filter((p) => p.sorte === 'locataire').map((p) => p.cle)))];
  const clesBiens = [...new Set(demandes.flatMap((d) => [...d.biens]))];
  if (clesLocataires.length === 0) return out;

  // ② TOUTES LES OCCUPATIONS UTILES, EN UNE REQUÊTE : (lot de ce classement) × (locataire coché).
  const { rows } = await query<{
    cle: string; lot_cle: string; entree: string | null; sortie: string | null;
  }>(
    `SELECT lc.cle_personne AS cle, lo.wippimmo_id AS lot_cle,
            o.entree::text AS entree, o.sortie::text AS sortie
       FROM gestion_annuaire_occupation o
       JOIN gestion_annuaire_locataire lc ON lc.id = o.locataire_id
       JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
      WHERE lc.cle_personne = ANY($1::text[]) AND lo.wippimmo_id = ANY($2::text[])`,
    [clesLocataires, clesBiens]);

  for (const d of demandes) {
    const biens = new Set(d.biens);
    for (const p of d.personnes) {
      if (p.sorte !== 'locataire') continue;
      const miennes = rows
        .filter((r) => r.cle === p.cle && biens.has(r.lot_cle))
        .map((r) => ({ entree: r.entree, sortie: r.sortie }));
      out.set(cleRole(d.messageId, p), roleLocataireParmiOccupations(miennes, d.dateMail));
    }
  }
  return out;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LA MÉMOIRE DE LA CONVERSATION — JAMAIS CELLE DE L'ADRESSE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 CE QUE CETTE CONVERSATION A DÉJÀ DÉCIDÉ. LECTURE SEULE. ══════════════════════════════════════════════
 *
 * Deux réponses, et deux demandes distinctes d'Arno :
 *   ① « Les 2 choix de l'étape 2 ne s'affichent qu'au PREMIER classement de ce contact externe dans cette
 *      conversation. » ⇒ `premierClassement` ;
 *   ② « Au mail suivant de la conversation : la modale propose la dernière configuration pré-cochée (étape 1 :
 *      biens ; étape 2 : personnes ; même choix de suivi). » ⇒ `precoche`.
 *
 * 🔴🔴 LA MÉMOIRE EST LIÉE À LA CONVERSATION, JAMAIS À L'ADRESSE (demande expresse d'Arno). Elle se lit donc dans
 * les PÉRIODES et les EXCEPTIONS du fil (migration 290), qui sont indexées par le fil. Le même avocat sur deux
 * biens et deux conversations a deux mémoires indépendantes — par construction, pas par discipline.
 *
 * ⚠️ `premierClassement` SE DÉDUIT DES PERSONNES, pas des biens. Une conversation peut être classée depuis
 * longtemps sans qu'aucun contact externe n'y soit passé : les deux choix doivent alors s'afficher, parce que
 * c'est bien le PREMIER classement d'un contact.
 *
 * ⚠️ ON IGNORE LE MAIL COURANT. Reclasser deux fois le même mail ne doit pas faire disparaître les deux choix
 * entre la première et la seconde fois : on n'a pas changé de mail, donc pas d'échange.
 */
export async function memoireDuFil(filId: number | null, messageIdCourant: number): Promise<{
  premierClassement: boolean;
  precoche: { personnes: string[]; bienUniquement: boolean; suivi: 'auto' | 'ponctuel' } | null;
}> {
  const vide = { premierClassement: true, precoche: null };
  if (filId === null || !(await interventionsDisponibles())) return vide;
  try {
    /**
     * LES PERSONNES DE LA DERNIÈRE DÉCISION DU FIL, période ou exception. On prend la plus RÉCENTE des deux par
     * sa date de création : c'est elle qui dit « la dernière configuration », au sens d'Arno.
     *
     * ⚠️ `remplacee_le IS NULL` / `retiree_le IS NULL` : une décision remplacée est de l'HISTOIRE. La proposer
     * d'avance ferait revenir un classement que quelqu'un a explicitement défait.
     */
    const { rows } = await query<{
      source: string; cree_le: string; personnes: { sorte: string; cle: string }[] | null;
    }>(
      `SELECT 'periode' AS source, p.cree_le::text,
              (SELECT json_agg(json_build_object('sorte', x.cible_sorte, 'cle', x.cible_cle))
                 FROM gestion_fil_periode_personne x WHERE x.periode_id = p.id) AS personnes
         FROM gestion_fil_periode p
        WHERE p.fil_id = $1 AND p.remplacee_le IS NULL AND p.depuis_message_id <> $2
       UNION ALL
       SELECT 'exception', e.cree_le::text,
              (SELECT json_agg(json_build_object('sorte', x.cible_sorte, 'cle', x.cible_cle))
                 FROM gestion_message_exception_personne x WHERE x.exception_id = e.id) AS personnes
         FROM gestion_message_exception e JOIN gestion_message m ON m.id = e.message_id
        WHERE m.fil_id = $1 AND e.retiree_le IS NULL AND e.message_id <> $2
       ORDER BY 2 DESC`, [filId, messageIdCourant]);

    /**
     * 🔴 UN CONTACT EST DÉJÀ PASSÉ DANS CETTE CONVERSATION dès qu'UNE décision y porte des personnes. Une
     * décision sans personne (le cas de l'immense majorité du courrier) ne compte pas : elle n'a rien dit des
     * contacts externes.
     */
    const avecPersonnes = rows.filter((r) => (r.personnes ?? []).length > 0);
    if (avecPersonnes.length === 0) return vide;

    const derniere = avecPersonnes[0];
    return {
      premierClassement: false,
      precoche: {
        personnes: (derniere.personnes ?? []).map((p) => clePersonne({
          sorte: p.sorte === 'locataire' ? 'locataire' : 'proprietaire', cle: p.cle,
        })),
        // ⚠️ « Le bien uniquement » N'EST PAS MÉMORISÉ COMME UN FAIT : il EST l'absence de personne. Une décision
        //   qui porte des personnes ne peut donc pas l'avoir coché, et la pré-coche le reflète.
        bienUniquement: false,
        suivi: derniere.source === 'exception' ? 'ponctuel' : 'auto',
      },
    };
  } catch (e) {
    // ⚠️ SILENCIEUX : la mémoire est un CONFORT (une pré-coche). Une lecture en échec ne doit pas empêcher de
    //   classer — l'étape 2 s'affiche alors vierge, ce qui est le comportement « première fois ».
    console.error('[gestion/contacts] mémoire du fil illisible (fil=%d)', filId, e);
    return vide;
  }
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LE CONTACT EXTERNE — MÉMORISÉ, ET JAMAIS DANS UNE FICHE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Les bornes de SÛRETÉ des trois champs facultatifs : on refuse un payload absurde, jamais une saisie. */
const MAX_NOM = 200;
const MAX_TEL = 60;

/** L'adresse, mise sous la forme que la base exige (minuscules, sans blancs). PUR. */
function normaliserEmail(brut: unknown): string {
  return (typeof brut === 'string' ? brut : '').trim().toLowerCase();
}

/**
 * LE CONTACT EXTERNE DÉJÀ CONNU POUR CETTE ADRESSE. LECTURE SEULE.
 *
 * Demande d'Arno : « Si l'adresse est déjà un contact externe connu, ces champs sont pré-remplis. »
 */
export async function lireContactExterne(email: string): Promise<ContactExterne | null> {
  const adresse = normaliserEmail(email);
  if (adresse === '' || !(await interventionsDisponibles())) return null;
  try {
    const { rows } = await query<{
      email: string; nom: string | null; telephone: string | null; type: string | null;
    }>('SELECT email, nom, telephone, type FROM gestion_contact_externe WHERE email = $1', [adresse]);
    const r = rows[0];
    /**
     * ⚠️ LE TYPE EST RENDU TEL QUE LA BASE LE PORTE, et non re-validé contre la liste des neuf. C'était le cas
     * avant « Personnaliser… », et ça rendait `null` pour tout type écrit à la main : on enregistrait
     * « huissier de justice » et on le relisait vide (mesuré par l'épreuve C-10).
     *
     * 🔴 LA FORME EST DÉJÀ GARANTIE PAR LA BASE (contrainte de la 294 : minuscules, non vide, borné). La relire
     * avec une règle PLUS ÉTROITE que celle de l'écriture, c'est perdre en silence ce qu'on vient d'écrire.
     */
    return r === undefined
      ? null
      : {
        email: r.email, nom: r.nom, telephone: r.telephone,
        type: (r.type ?? '').trim() === '' ? null : r.type,
      };
  } catch (e) {
    console.error('[gestion/contacts] lecture du contact externe impossible', e);
    return null;
  }
}

export type IssueContact = { ok: true; id: number } | { ok: false; motif: string };

/**
 * ══ 🔴🔴 MÉMORISE UN CONTACT EXTERNE, OU COMPLÈTE CELUI QUI EXISTE ════════════════════════════════════════════
 *
 * 🔴 IL NE DEVIENT JAMAIS PROPRIÉTAIRE NI LOCATAIRE, et il n'est ajouté à AUCUNE fiche. Cette table est la seule
 * qui le porte, et aucune lecture de l'annuaire ne la joint. C'est écrit ici parce que c'est la règle la plus
 * facile à perdre le jour où quelqu'un voudra « enrichir l'annuaire ».
 *
 * 🔴 UN MÊME CONTACT PEUT INTERVENIR POUR PLUSIEURS BIENS ET PLUSIEURS CLIENTS (demande d'Arno) : d'où l'unicité
 * sur l'ADRESSE seule, et aucune colonne « bien » ni « fiche » dans cette table. Le lien au dossier vit dans
 * `gestion_rattachement`, une ligne par mail et par personne — c'est-à-dire là où il peut être multiple.
 *
 * ⚠️ ON NE VIDE JAMAIS UN CHAMP DÉJÀ RENSEIGNÉ AVEC DU VIDE. Arno a saisi « Me Martin, avocat » la semaine
 * dernière ; un classement rapide qui laisse les champs blancs ne doit pas effacer son travail. Remplacer par une
 * valeur NOUVELLE, oui — c'est une correction ; remplacer par rien, non — c'est une omission.
 */
export async function enregistrerContactExterne(o: {
  email: string;
  nom?: string | null;
  telephone?: string | null;
  /**
   * ⚠️ `string` ET NON `TypeContactExterne` (lot URGENT-VERIF-SUIVI-ET-76-BIENS) : un type peut être écrit à la
   * main. C'est CETTE fonction qui décide ce que la base acceptera — voir le bloc `type` plus bas.
   */
  type?: string | null;
  auteur: Auteur;
}): Promise<IssueContact> {
  if (!(await interventionsDisponibles())) {
    return { ok: false, motif: 'Mise à jour de la base à appliquer (migration 293).' };
  }
  const email = normaliserEmail(o.email);
  // ⚠️ LA MÊME EXIGENCE QUE LA CONTRAINTE DE LA BASE : on ne lui envoie pas une ligne qu'elle rejettera.
  if (email === '' || email.indexOf('@') < 1) {
    return { ok: false, motif: 'Adresse électronique illisible.' };
  }
  const libelle = (o.auteur.libelle ?? '').trim();
  if (libelle === '') return { ok: false, motif: 'L’auteur doit être identifié.' };

  const nom = (o.nom ?? '').trim().slice(0, MAX_NOM);
  const tel = (o.telephone ?? '').trim().slice(0, MAX_TEL);
  /**
   * ══ 🔴🔴 LE TYPE EST VALIDÉ SELON CE QUE LA BASE ACCEPTE, ET NULLE PART AILLEURS ══════════════════════════
   *
   * Avec la migration 294 : n'importe quel type, mis sous sa forme canonique (`typeLibreRecu`).
   * Sans elle : les huit de la liste de la 293, et rien d'autre (`typeRecu`) — un type hors liste serait REFUSÉ
   * par la contrainte, et comme les trois champs ne bloquent jamais le classement, il disparaîtrait en silence.
   *
   * 🔴 C'EST LE DÉPÔT QUI TRANCHE, PAS LA ROUTE. La route ne connaît pas la sonde, et deux endroits qui
   * décideraient de la même chose finiraient par ne plus décider pareil. L'écran, lui, ne propose déjà que ce
   * qui est enregistrable (`typesAProposer`) : cette ligne est le filet, pas la règle visible.
   */
  const type = (await typesLibresDisponibles()) ? typeLibreRecu(o.type) : typeRecu(o.type);

  const { rows } = await query<{ id: string }>(
    `INSERT INTO gestion_contact_externe (email, nom, telephone, type, cree_par, cree_par_libelle)
     VALUES ($1, nullif($2, ''), nullif($3, ''), $4, $5, $6)
     ON CONFLICT (email) DO UPDATE
        SET nom       = coalesce(nullif(excluded.nom, ''), gestion_contact_externe.nom),
            telephone = coalesce(nullif(excluded.telephone, ''), gestion_contact_externe.telephone),
            type      = coalesce(excluded.type, gestion_contact_externe.type),
            maj_le    = now(),
            maj_par_libelle = excluded.cree_par_libelle
     RETURNING id::text`,
    [email, nom, tel, type, o.auteur.id, libelle]);
  return { ok: true, id: Number(rows[0].id) };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 ⑤ POSER LES INTERVENTIONS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Une personne à relier à un mail, avec son rôle DÉJÀ figé par l'appelant. */
export interface PersonneAIntervenir {
  sorte: 'proprietaire' | 'locataire';
  cle: string;
  libelle: string;
  role: RoleInstantane;
  /** Le contact externe par qui CE mail est passé. `null` = aucun n'a été mémorisé (ce qui est permis). */
  contactExterneId?: number | null;
}

export type IssueInterventions = { ok: true; posees: number; retirees: number } | { ok: false; motif: string };

/**
 * ══ 🔴🔴 LES INTERVENTIONS D'UN MAIL, POSÉES EN DIFF ══════════════════════════════════════════════════════════
 *
 * 🔴 UN DIFF, ET NON UNE RÉÉCRITURE — la même règle que la modale de rattachement et que la projection des
 * périodes, et pour la même raison : un lien reposé perdrait sa date de création, son auteur, son motif et SON
 * RÔLE INSTANTANÉ. Or le rôle instantané est précisément ce qu'on a promis de ne jamais changer.
 *
 * 🔴 L'ORDRE DES GESTES EST LA FONCTIONNALITÉ : on POSE avant de RETIRER. La base refuse une intervention sans
 * lien vivant vers un bien ; elle ne dit rien du nombre d'interventions. Poser d'abord ne peut donc jamais
 * échouer à cause d'un retrait, alors que l'inverse laisserait une fenêtre où le mail n'a plus rien.
 *
 * ⚠️ `rattacher()` N'EST PAS EMPRUNTÉ, ET C'EST VOULU : il REFUSE les cibles « personne » (`sortePermise`), ce
 * qui est exactement le verrou qu'on ne lève pas. Les interventions passent donc par leur propre écriture, comme
 * les documents automatiques (`documentsAutoRepo.poserLien`) — une porte nommée, pas une brèche dans la porte
 * commune. Le journal est écrit ici, à la main, dans la même transaction.
 *
 * ⚠️ `piece_id` RESTE NULL : une intervention porte sur un MAIL, jamais sur une pièce jointe. Un fichier se
 * classe dans un dossier, ce qui est une autre question (lot CLASSEMENT-1).
 */
export async function poserInterventions(o: {
  messageId: number;
  personnes: readonly PersonneAIntervenir[];
  /** Le contact, pour écrire le motif en clair. `null` ⇒ « un contact extérieur ». */
  contact: ContactExterne | null;
  auteur: Auteur;
  /**
   * ══ 🔴🔴 VRAI QUAND C'EST UNE **FENÊTRE** QUI POSE, ET NON UNE PERSONNE ═════════════════════════════════════
   *
   * Il change DEUX choses, et la seconde est un garde-fou :
   *   ① le MOTIF écrit sur le lien (« posée par le suivi de la conversation ») ;
   *   ② 🔴 CE QUE LE DIFF S'AUTORISE À RETIRER. Une fenêtre ne retire QUE ce qu'une fenêtre a posé.
   *
   * 🔴 POURQUOI ②. C'est exactement le défaut que le scénario S11 a trouvé sur les BIENS le 01/10/2026 : la
   * projection retirait tout lien confirmé qu'une fenêtre ne voulait plus — y compris celui qu'une personne avait
   * posé à la main. Arno : « Un rattachement posé à la main n'est jamais déplacé par un changement de fenêtre. »
   * La règle vaut pour les interventions sans qu'on ait eu besoin de la redécouvrir une seconde fois.
   */
  parLeSuivi?: boolean;
  /**
   * ══ 🔴🔴 LOT MONGA-1, POINT 2 — « STATUT AUTO » SUR LE PROPRIÉTAIRE ET LE LOCATAIRE AUSSI ═══════════════════
   *
   * Arno demande un classement « statut “Auto” » qui porte l'événement, les biens ET les personnes. Laisser les
   * personnes en « manuel » aurait fait dire à l'écran « posé à la main » d'un lien que personne n'a posé — et
   * c'est précisément la question qu'on doit pouvoir trancher six mois après.
   *
   * 🔴 ET COMME DANS `rattacher`, UN LIEN « AUTO » SIGNE SON STATUT. `retirerLiensPerimes` retire tout lien
   * `origine = 'automatique'` dont `statut_par_libelle IS NULL` et que le moteur ne propose plus : le moteur ne
   * propose JAMAIS de personne (il n'émet que des lots), donc une intervention « automatique » non signée
   * aurait disparu à la relève suivante, sans trace. Le défaut (`'manuel'`) garde la conduite d'avant ce lot.
   */
  origine?: 'manuel' | 'automatique';
  /**
   * ══ 🔴🔴 LOT MONGA-1, POINT 3 — UN MOTIF IMPOSÉ, QUAND L'APPELANT DOIT POUVOIR SE RECONNAÎTRE ═══════════════
   *
   * 🔴 LE DÉFAUT TROUVÉ PAR L'ESSAI RÉEL, ET IL ÉTAIT DOUBLE. `motifIntervention` composait ici
   * « intervention de un contact extérieur — locataire » : d'une part la phrase est fautive quand aucun contact
   * n'est donné (branche jamais empruntée avant ce lot — la projection des fenêtres passe par
   * `MOTIF_INTERVENTION_PAR_SUIVI`) ; d'autre part, et surtout, ce motif ne disait RIEN de qui avait posé le
   * lien. L'« Annuler » du classement Monga cherchait sa signature et ne trouvait rien : il laissait derrière
   * lui le propriétaire et le locataire de six liens.
   *
   * ⚠️ FACULTATIF, DÉFAUT INCHANGÉ : sans lui, `motifIntervention` et `MOTIF_INTERVENTION_PAR_SUIVI` décident
   * comme avant ce lot, et la projection des fenêtres ne change pas d'un caractère.
   */
  motif?: string;
}): Promise<IssueInterventions> {
  if (!(await interventionsDisponibles())) {
    return { ok: false, motif: 'Mise à jour de la base à appliquer (migration 293).' };
  }
  if (!(await rattachementsDisponibles())) {
    return { ok: false, motif: 'Mise à jour de la base à appliquer (migration 257).' };
  }
  const libelle = (o.auteur.libelle ?? '').trim();
  if (libelle === '') return { ok: false, motif: 'L’auteur doit être identifié.' };

  const voulues = new Map(o.personnes
    .filter((p) => (p.cle ?? '').trim() !== '')
    .map((p) => [clePersonne(p), p]));

  return withTransaction(async (q) => {
    /**
     * ⚠️ `FOR UPDATE` AVANT TOUTE ÉCRITURE, et ce n'est pas un ornement : `withTransaction` VALIDE au retour
     * normal. Lire après avoir écrit laisserait passer en base un geste qu'on s'apprêtait à refuser — piège
     * mesuré et consigné dans les conventions du dépôt.
     */
    const { rows: actuelles } = await q<{
      id: string; cible_sorte: string; cible_cle: string; par_le_suivi: boolean;
    }>(
      `SELECT id::text, cible_sorte, cible_cle, (coalesce(motif, '') = $3) AS par_le_suivi
         FROM gestion_rattachement
        WHERE message_id = $1 AND regle = $2 AND statut IN ('propose', 'confirme') AND piece_id IS NULL
        FOR UPDATE`, [o.messageId, REGLE_INTERVENTION, MOTIF_INTERVENTION_PAR_SUIVI]);
    const presentes = new Map(actuelles.map((r) => [
      `${r.cible_sorte}:${r.cible_cle}`, { id: Number(r.id), parLeSuivi: r.par_le_suivi === true },
    ]));

    /**
     * 🔴 ON POSE AVANT DE RETIRER. La base refuse une intervention sans lien vivant vers un bien ; elle ne dit
     * rien du nombre d'interventions. Poser d'abord ne peut donc jamais échouer à cause d'un retrait, alors que
     * l'inverse laisserait une fenêtre où le mail n'a plus rien.
     */
    let posees = 0;
    for (const [cle, p] of voulues) {
      if (presentes.has(cle)) continue;
      const motif = o.motif ?? (o.parLeSuivi === true
        // 🔴 LE MOTIF DIT QUI A POSÉ, et c'est lui — pas `origine` — qui protège le geste humain d'une fenêtre :
        //   même discipline que `MOTIF_POSE_PAR_SUIVI` dans `periodeRepo.ts`, et pour la même raison.
        ? MOTIF_INTERVENTION_PAR_SUIVI
        : motifIntervention({ contact: o.contact, role: p.role }));
      const { rows } = await q<{ id: string }>(
        `INSERT INTO gestion_rattachement
           (message_id, piece_id, cible_sorte, cible_cle, cible_libelle, origine, regle, confiance,
            motif, statut, cree_par, cree_par_libelle, role_instantane, contact_externe_id,
            statut_le, statut_par, statut_par_libelle, statut_motif)
         VALUES ($1, NULL, $2, $3, $4, $11, $5, 'haute', $6, 'confirme', $7, $8, $9, $10,
                 CASE WHEN $11 = 'automatique' THEN now() END,
                 CASE WHEN $11 = 'automatique' THEN $7::bigint END,
                 CASE WHEN $11 = 'automatique' THEN $8::text END,
                 CASE WHEN $11 = 'automatique' THEN $6::text END)
         RETURNING id::text`,
        [o.messageId, p.sorte, p.cle, p.libelle, REGLE_INTERVENTION, motif,
          o.auteur.id, libelle, p.role, p.contactExterneId ?? null,
          (o.origine ?? 'manuel') === 'automatique' ? 'automatique' : 'manuel']);
      await journaliser(q, Number(rows[0].id), 'rattacher', o.auteur,
        `intervention posée : ${p.sorte} ${p.cle} (${p.role})`, null, 'confirme');
      posees += 1;
    }

    let retirees = 0;
    for (const [cle, l] of presentes) {
      if (voulues.has(cle)) continue;
      /**
       * 🔴🔴 UNE FENÊTRE NE RETIRE QUE CE QU'UNE FENÊTRE A POSÉ (voir l'encadré de `parLeSuivi`). Un geste humain
       * — quelqu'un qui a coché une personne en lisant le mail — reste, parce qu'il a été décidé en regardant ce
       * mail-là, ce que la fenêtre ne fait pas.
       */
      if (o.parLeSuivi === true && !l.parLeSuivi) continue;
      await q(
        `UPDATE gestion_rattachement
            SET statut = 'retire', statut_le = now(), statut_par = $2, statut_par_libelle = $3, statut_motif = $4
          WHERE id = $1`,
        [l.id, o.auteur.id, libelle,
          o.parLeSuivi === true ? MOTIF_INTERVENTION_RETIREE_PAR_SUIVI : 'intervention retirée à la main']);
      await journaliser(q, l.id, 'retirer', o.auteur, `intervention retirée : ${cle}`, 'confirme', 'retire');
      retirees += 1;
    }
    return { ok: true, posees, retirees };
  });
}

/** Écrit une ligne de journal. Append-only garanti EN BASE par un trigger : personne ne la corrige après coup. */
type Requete = Parameters<Parameters<typeof withTransaction>[0]>[0];
async function journaliser(
  q: Requete, lienId: number, action: string, auteur: Auteur, commentaire: string,
  avant: string | null, apres: string | null,
): Promise<void> {
  await q(
    `INSERT INTO gestion_journal
       (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
     VALUES ('rattachement', $1, $2, $3, $4, $5, $6, $7)`,
    [lienId, action, avant, apres, commentaire, auteur.id, auteur.libelle]);
}

/**
 * ══ 🔴🔴 LE RETRAIT EN CASCADE — CE QUE LA BASE NE PEUT PAS FAIRE ═════════════════════════════════════════════
 *
 * La migration 293 refuse de CRÉER une intervention sans lien vivant vers un bien. Elle ne refuse PAS qu'on
 * retire le bien plus tard : ce refus-là casserait « Valider — aucun bien », la fenêtre « Modifier », la file à
 * trier et la projection des périodes — quatre gestes déjà validés. L'encadré de la migration le dit.
 *
 * 🔴 C'EST DONC ICI QUE L'INVARIANT TIENT DANS L'AUTRE SENS : après tout geste qui a pu retirer des liens
 * « bien », on appelle cette fonction. Elle retire les interventions des mails qui n'ont plus aucun bien vivant —
 * datées, signées, motivées, et remettables comme tout dans cette table.
 *
 * ⚠️ ELLE AVALE SES ERREURS. C'est un RATTRAPAGE D'ÉTAT, pas le geste lui-même : faire échouer un classement de
 * bien parce qu'une cascade n'a pas abouti serait pire que la lacune qu'elle comble. Même discipline que
 * `leverHorsGestionApresRattachement` dans `rattachementRepo.ts`.
 */
export async function retirerInterventionsSansBien(
  messageIds: readonly number[], auteur: Auteur,
): Promise<number> {
  const ids = [...new Set(messageIds)].filter((n) => Number.isSafeInteger(n) && n > 0);
  if (ids.length === 0) return 0;
  if (!(await interventionsDisponibles())) return 0;
  try {
    const { rows } = await query<{ id: string }>(
      `UPDATE gestion_rattachement r
          SET statut = 'retire', statut_le = now(), statut_par = $2, statut_par_libelle = $3, statut_motif = $4
        WHERE r.message_id = ANY($1::bigint[])
          AND r.regle = $5 AND r.statut IN ('propose', 'confirme')
          AND NOT EXISTS (
            SELECT 1 FROM gestion_rattachement b
             WHERE b.message_id = r.message_id AND b.cible_sorte = 'lot'
               AND b.statut IN ('propose', 'confirme') AND b.piece_id IS NULL)
        RETURNING r.id::text`,
      [ids, auteur.id, (auteur.libelle ?? '').trim() || 'automatique',
        MOTIF_INTERVENTION_SANS_BIEN, REGLE_INTERVENTION]);
    return rows.length;
  } catch (e) {
    console.error('[gestion/contacts] cascade du retrait impossible', e);
    return 0;
  }
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ LA LECTURE : LES INTERVENTIONS D'UNE FICHE, ET CELLES D'UN MAIL
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LES INTERVENTIONS D'UNE FICHE, de la plus récente à la plus ancienne. LECTURE SEULE.
 *
 * Demande d'Arno : « le mail apparaît dans “Vie du bien” ET dans l'historique de chaque carte ou fiche concernée,
 * avec le rôle instantané et le contact externe (“via Me Martin, avocat”). C'est une section ou un filtre DISTINCT
 * des “Documents automatiques”. »
 *
 * ⚠️ RETOURNE UNE LISTE VIDE SANS LA MIGRATION, et ne nomme alors AUCUNE colonne nouvelle : la sonde répond
 * « non » et la fonction sort avant la requête. Règle du module depuis l'incident du lot 4a.
 *
 * 🔴 LES BIENS DU MÊME MAIL SONT JOINTS, ET CE N'EST PAS DÉCORATIF : une intervention ne vit jamais sans son
 * bien. Les afficher prouve l'invariant à l'écran — et une ligne qui n'en montrerait aucun serait le signe d'une
 * intervention orpheline, c'est-à-dire exactement ce que la lacune nommée dans la migration peut produire.
 */
export async function interventionsDeLaFiche(
  sorte: 'proprietaire' | 'locataire', cle: string, limite = 300,
): Promise<InterventionDeFiche[]> {
  if (!(await interventionsDisponibles())) return [];
  const borne = Number.isSafeInteger(limite) && limite > 0 ? Math.min(limite, 1000) : 300;
  try {
    const { rows } = await query<{
      message_id: number; fil_id: number | null; le: string; objet: string | null;
      role_instantane: string | null; email: string | null; nom: string | null; type: string | null;
      biens: { cle: string; libelle: string }[] | null;
    }>(
      `SELECT r.message_id::int, m.fil_id::int, m.recu_le::date::text AS le, m.objet,
              r.role_instantane, ce.email, ce.nom, ce.type,
              (SELECT json_agg(json_build_object('cle', b.cible_cle,
                                                 'libelle', coalesce(b.cible_libelle, b.cible_cle)))
                 FROM gestion_rattachement b
                WHERE b.message_id = r.message_id AND b.cible_sorte = 'lot'
                  AND b.statut IN ('propose', 'confirme') AND b.piece_id IS NULL) AS biens
         FROM gestion_rattachement r
         JOIN gestion_message m ON m.id = r.message_id
         LEFT JOIN gestion_contact_externe ce ON ce.id = r.contact_externe_id
        WHERE r.cible_sorte = $1 AND r.cible_cle = $2 AND r.regle = $3
          AND r.statut IN ('propose', 'confirme') AND r.piece_id IS NULL
        ORDER BY m.recu_le DESC, m.id DESC LIMIT $4`,
      [sorte, cle, REGLE_INTERVENTION, borne]);

    return rows.map((r) => ({
      messageId: r.message_id,
      filId: r.fil_id ?? 0,
      le: r.le,
      objet: (r.objet ?? '').trim(),
      /**
       * ⚠️ UN RÔLE ILLISIBLE N'EST PAS « occupant » PAR DÉFAUT. Une ligne historique mal formée doit se voir, pas
       * se déguiser : on rend le mot le plus neutre, et la pastille grise le dit.
       */
      role: roleRecu(r.role_instantane) ?? 'locataire_a_venir',
      via: r.email === null ? null : (mentionVia({
        email: r.email, nom: r.nom, telephone: null, type: (r.type ?? '').trim() === '' ? null : r.type,
      }) || null),
      biens: r.biens ?? [],
    }));
  } catch (e) {
    console.error('[gestion/contacts] interventions de la fiche illisibles', e);
    return [];
  }
}

/**
 * ══ 🔴🔴 CES MAILS PORTENT-ILS ENCORE UNE INTERVENTION VIVANTE ? LECTURE SEULE. ═══════════════════════════════
 *
 * 🔴 POURQUOI CETTE QUESTION EXISTE. La projection d'une fenêtre doit passer par le diff même quand la fenêtre ne
 * veut AUCUNE personne : c'est ainsi qu'elle retire ce qu'elle avait posé avant qu'on ne décoche tout. Mais
 * l'immense majorité des conversations n'a jamais eu de contact externe, et leur faire lire les dates de tous
 * leurs mails puis les occupations de tous leurs biens, pour ne rien trouver, serait du travail pour personne.
 *
 * ⚠️ UNE SEULE REQUÊTE, ET ELLE EST INDEXÉE (`gestion_rattachement_intervention_message_idx`, migration 293). Ce
 * défaut-là a été TROUVÉ par l'épreuve C-5 (« décocher toutes les personnes d'une fenêtre retire ce qu'elle avait
 * posé ») : la version d'avant sortait trop tôt, et le lien restait.
 */
export async function aDesInterventions(messageIds: readonly number[]): Promise<boolean> {
  const ids = [...new Set(messageIds)].filter((n) => Number.isSafeInteger(n) && n > 0);
  if (ids.length === 0 || !(await interventionsDisponibles())) return false;
  const { rows } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM gestion_rattachement
      WHERE message_id = ANY($1::bigint[]) AND regle = $2
        AND statut IN ('propose', 'confirme') AND piece_id IS NULL`, [ids, REGLE_INTERVENTION]);
  return (rows[0]?.n ?? 0) > 0;
}

/** Une intervention vue DEPUIS un mail : de qui il s'agit, à quel titre, et par qui il est passé. */
export interface InterventionDeMail {
  sorte: 'proprietaire' | 'locataire';
  cle: string;
  libelle: string;
  role: RoleInstantane;
  /** « via Me Martin, avocat », ou `null` quand aucun contact n'a été mémorisé. */
  via: string | null;
}

/**
 * LES INTERVENTIONS DE TOUT UN PAQUET DE MAILS. LECTURE SEULE.
 *
 * ⚠️ UNE SEULE REQUÊTE POUR LA PAGE ENTIÈRE, jamais une par ligne : « Vie du bien » en affiche vingt-cinq, et
 * c'est la règle du module depuis le bandeau « Rattaché à ».
 *
 * ⚠️ CARTE VIDE SANS LA MIGRATION : les lignes de « Vie du bien » n'affichent alors aucune mention, exactement
 * comme avant ce lot.
 */
export async function interventionsDesMessages(
  messageIds: readonly number[],
): Promise<Map<number, InterventionDeMail[]>> {
  const out = new Map<number, InterventionDeMail[]>();
  const ids = [...new Set(messageIds)].filter((n) => Number.isSafeInteger(n) && n > 0);
  if (ids.length === 0 || !(await interventionsDisponibles())) return out;
  try {
    const { rows } = await query<{
      message_id: string; cible_sorte: string; cible_cle: string; cible_libelle: string | null;
      role_instantane: string | null; email: string | null; nom: string | null; type: string | null;
    }>(
      `SELECT r.message_id::text, r.cible_sorte, r.cible_cle, r.cible_libelle, r.role_instantane,
              ce.email, ce.nom, ce.type
         FROM gestion_rattachement r
         LEFT JOIN gestion_contact_externe ce ON ce.id = r.contact_externe_id
        WHERE r.message_id = ANY($1::bigint[]) AND r.regle = $2
          AND r.statut IN ('propose', 'confirme') AND r.piece_id IS NULL
        ORDER BY r.message_id, r.cible_sorte, r.id`, [ids, REGLE_INTERVENTION]);
    for (const r of rows) {
      const m = Number(r.message_id);
      out.set(m, [...(out.get(m) ?? []), {
        sorte: r.cible_sorte === 'locataire' ? 'locataire' : 'proprietaire',
        cle: r.cible_cle,
        libelle: (r.cible_libelle ?? '').trim() === '' ? r.cible_cle : (r.cible_libelle as string),
        role: roleRecu(r.role_instantane) ?? 'locataire_a_venir',
        via: r.email === null ? null : (mentionVia({
          email: r.email, nom: r.nom, telephone: null, type: (r.type ?? '').trim() === '' ? null : r.type,
        }) || null),
      }]);
    }
  } catch (e) {
    console.error('[gestion/contacts] interventions des mails illisibles', e);
  }
  return out;
}
