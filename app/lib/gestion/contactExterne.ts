/**
 * ══ 🔴🔴 LOT CONTACTS-EXTERNES — UN MAIL D'UNE ADRESSE QU'AUCUNE FICHE NE CONNAÎT. Module PUR. ══════════════════
 *
 * DEMANDE D'ARNO (02/10/2026), « Classement des e-mails et contacts externes » : quand on classe un mail reçu
 * d'une adresse INCONNUE des fiches propriétaires et locataires du bien choisi, la modale ne se ferme pas — elle
 * ouvre une 2ᵉ ÉTAPE qui demande POUR QUI ce contact intervient : le bien seul (artisan, syndic, expert), ou une
 * ou plusieurs personnes nommées des fiches.
 *
 * ═══ 🔴🔴 CE QUE CE LOT N'EST PAS, ET IL FAUT LE LIRE D'ABORD ═══════════════════════════════════════════════════
 *
 * ⚠️ UN CONTACT EXTERNE NE DEVIENT JAMAIS PROPRIÉTAIRE NI LOCATAIRE. Il n'entre dans aucune fiche de l'annuaire,
 * il n'occupe aucun logement, il ne possède rien. Il est MÉMORISÉ à part, avec son e-mail et trois champs
 * facultatifs (nom, téléphone, type) — et c'est tout. L'avocat d'un locataire n'est pas un locataire.
 *
 * ⚠️ LA RELATION AUX PERSONNES NE REMPLACE PAS LE LIEN AU BIEN, elle s'y AJOUTE. Le mail reste rattaché au(x)
 * bien(s) exactement comme aujourd'hui — même lien, mêmes compteurs, même « Vie du bien ». C'est la règle n° 1 du
 * lot : ne rien casser.
 *
 * ⚠️ CE N'EST PAS LA CATÉGORIE `document_auto` (migration 291). Un document automatique est rangé chez une
 * personne SANS bien ; une intervention est rangée chez une personne AVEC le bien du même mail. Deux faits
 * différents, deux règles nommées — les confondre mêlerait les quittances d'un locataire aux courriers de son
 * avocat dans la même liste.
 *
 * ═══ 🔴 POURQUOI UN MODULE PUR, ET CE QU'IL DÉCIDE ══════════════════════════════════════════════════════════════
 *
 * Tout ce qui est DÉCISION vit ici et nulle part ailleurs : faut-il l'étape 2, quel est le rôle d'une personne À
 * LA DATE DU MAIL, dans quel ordre les personnes s'affichent, ce que « Le bien uniquement » exclut, et les MOTS
 * (ceux d'Arno, cités). L'écran place et peint ; le dépôt lit et écrit. Aucun import, aucune base, aucun réseau,
 * aucune horloge : chaque règle s'éprouve sur une table de cas, à la main.
 */

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LA RÈGLE NOMMÉE, ET SES MOTS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * 🔴🔴 LA RÈGLE QUI NOMME CES LIENS, et la SEULE que la base accepte vers une fiche en plus de `document_auto`
 * (migration 293). Elle est déclarée ICI, dans le module pur, pour que l'écran, le dépôt, la projection des
 * fenêtres de conversation et le garde-fou de la base partagent UNE seule définition.
 *
 * ⚠️ LE VERROU DE LA 273 N'EST PAS LEVÉ POUR AUTANT : « rattacher ce mail à M. DUPONT » reste REFUSÉ par la base.
 * Ce qui est permis, c'est « ce mail concerne M. DUPONT à propos de son logement » — et seulement sous ce nom, et
 * seulement tant qu'un lien vivant vers le BIEN du même mail existe.
 */
export const REGLE_INTERVENTION = 'intervention';

/**
 * LES TYPES DE CONTACT EXTERNE, dans l'ordre d'Arno. FACULTATIFS, et jamais bloquants.
 *
 * ⚠️ « autre » EST DANS LA LISTE, EN DERNIER : sans lui, un contact qui n'entre dans aucune case obligerait à
 * mentir ou à laisser vide. Laisser vide reste permis — c'est bien pour cela que le champ est facultatif —, mais
 * « autre » dit « j'ai regardé et aucun ne convient », ce qui n'est pas la même information.
 */
export const TYPES_CONTACT_EXTERNE = [
  'avocat', 'garant', 'artisan', 'syndic', 'expert', 'assurance', 'notaire', 'autre',
] as const;

export type TypeContactExterne = typeof TYPES_CONTACT_EXTERNE[number];

/** Le type, écrit comme on le lit. PUR. */
export function motTypeContact(t: TypeContactExterne): string {
  const mots: Record<TypeContactExterne, string> = {
    avocat: 'Avocat', garant: 'Garant', artisan: 'Artisan', syndic: 'Syndic',
    expert: 'Expert', assurance: 'Assurance', notaire: 'Notaire', autre: 'Autre',
  };
  return mots[t];
}

/** Un type reçu du navigateur, re-validé contre la liste fermée. `null` = aucun, ce qui est permis. PUR. */
export function typeRecu(brut: unknown): TypeContactExterne | null {
  const s = typeof brut === 'string' ? brut.trim().toLowerCase() : '';
  return (TYPES_CONTACT_EXTERNE as readonly string[]).includes(s) ? (s as TypeContactExterne) : null;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 ② LE RÔLE INSTANTANÉ — FIGÉ À LA DATE DU MAIL, POUR TOUJOURS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DEMANDE D'ARNO, mot pour mot : « sa pastille de statut CALCULÉE À LA DATE DE RÉCEPTION DU MAIL à partir des
   dates d'entrée et de sortie : “Locataire occupant” (vert) si la date du mail tombe dans l'occupation,
   “Locataire sortant” (rouge) si la sortie est antérieure à la date du mail. Ce sont les mots d'Arno : pas
   “en place”. »

   Et : « avec un INSTANTANÉ du rôle à la date du mail. Il ne change jamais ensuite, même quand le locataire
   part. »

   🔴 POURQUOI UN INSTANTANÉ, ET NON UNE LECTURE À L'AFFICHAGE. Un courrier d'avocat d'août 2025 parle du
   locataire d'août 2025. Si l'on relisait le rôle aujourd'hui, le même courrier se présenterait l'an prochain
   comme écrit « pour le locataire sortant », puis « pour un ancien locataire », et finirait par ne plus rien
   désigner quand l'occupation disparaîtra de l'export. Le rôle est donc ÉCRIT au moment du classement, et relu
   tel quel — c'est la même règle que `cible_libelle` pour les biens, et pour la même raison.

   ⚠️ UN QUATRIÈME CAS QU'ARNO N'A PAS NOMMÉ, ET QU'ON N'INVENTE PAS : le locataire dont l'ENTRÉE est POSTÉRIEURE
   à la date du mail. C'est le cas réel de l'avocat d'un entrant qui écrit avant la signature du bail. Les trois
   mots d'Arno ne le couvrent pas, et le ranger de force en « occupant » ou en « sortant » serait faux dans les
   deux sens. Il a donc son mot — « Locataire à venir », en gris — et il vit derrière le lien de dépliage avec les
   autres. 🔴 À SOUMETTRE À ARNO : c'est le seul endroit de ce lot où un mot n'est pas de lui.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export type RoleInstantane =
  | 'proprietaire'
  | 'locataire_occupant'
  | 'locataire_sortant'
  | 'locataire_a_venir';

/** Les quatre valeurs, pour la re-validation côté serveur et la contrainte de la base. */
export const ROLES_INSTANTANES: readonly RoleInstantane[] = [
  'proprietaire', 'locataire_occupant', 'locataire_sortant', 'locataire_a_venir',
];

/** Le rôle, écrit avec LES MOTS D'ARNO. PUR. */
export function motRoleInstantane(r: RoleInstantane): string {
  const mots: Record<RoleInstantane, string> = {
    proprietaire: 'Propriétaire',
    locataire_occupant: 'Locataire occupant',
    locataire_sortant: 'Locataire sortant',
    locataire_a_venir: 'Locataire à venir',
  };
  return mots[r];
}

/**
 * LE TON DE LA PASTILLE. PUR.
 *
 * ⚠️ LE MOT PORTE L'INFORMATION, LE TON NE FAIT QUE L'APPUYER — règle du module depuis la première capsule. Un
 * daltonien lit « Locataire sortant » ; la couleur ne lui apprend rien de plus, et ne lui cache rien.
 */
export function tonRoleInstantane(r: RoleInstantane): 'vert' | 'rouge' | 'gris' {
  if (r === 'locataire_occupant') return 'vert';
  if (r === 'locataire_sortant') return 'rouge';
  return 'gris';
}

/** Un rôle reçu du navigateur ou relu en base, re-validé. `null` = inconnu, et l'appelant refuse. PUR. */
export function roleRecu(brut: unknown): RoleInstantane | null {
  const s = typeof brut === 'string' ? brut.trim() : '';
  return (ROLES_INSTANTANES as readonly string[]).includes(s) ? (s as RoleInstantane) : null;
}

/**
 * ══ 🔴🔴 LE RÔLE D'UN LOCATAIRE À LA DATE D'UN MAIL. PUR. ═════════════════════════════════════════════════════
 *
 * Les dates sont des jours ISO (`AAAA-MM-JJ`). La comparaison de chaînes suffit et c'est VOULU : deux jours ISO
 * se comparent exactement comme deux dates, sans fuseau, sans heure d'été, sans `new Date` — c'est-à-dire sans
 * le piège consigné dans ce dépôt (une date civile passée par `toISOString` recule d'un jour en hiver).
 *
 * ⚠️ LES BORNES SONT INCLUSES. Un mail reçu LE JOUR de la sortie parle encore du locataire qui part : c'est même
 * le jour où l'on en parle le plus (état des lieux, remise des clés, dépôt de garantie). Idem le jour d'entrée.
 *
 * ⚠️ UNE BORNE ABSENTE N'EST PAS UNE BORNE À ZÉRO. `entree = null` veut dire « l'export ne la donne pas », donc
 * « depuis toujours » ; `sortie = null` veut dire « toujours en cours ». C'est déjà la convention de
 * `SQL_PARTIES` dans `classementBien.ts`, et on ne la change pas ici.
 */
export function roleLocataireALaDate(o: {
  entree: string | null;
  sortie: string | null;
  /** La date de RÉCEPTION du mail, en jour ISO (`AAAA-MM-JJ`). */
  dateMail: string;
}): RoleInstantane {
  const jour = (o.dateMail ?? '').slice(0, 10);
  const entree = (o.entree ?? '').slice(0, 10);
  const sortie = (o.sortie ?? '').slice(0, 10);
  // ⚠️ SANS DATE DE MAIL LISIBLE, ON NE TRANCHE PAS : « occupant » par défaut serait une affirmation gratuite.
  //   On rend le mot le plus neutre, qui dit « on n'a pas su dater » sans se contredire.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return 'locataire_a_venir';
  if (entree !== '' && jour < entree) return 'locataire_a_venir';
  if (sortie !== '' && jour > sortie) return 'locataire_sortant';
  return 'locataire_occupant';
}

/**
 * ══ 🔴🔴 LE RÔLE D'UN LOCATAIRE QUI A PLUSIEURS OCCUPATIONS. PUR. ═════════════════════════════════════════════
 *
 * Le cas réel : la même personne a occupé le studio, puis le deux-pièces du même immeuble. À la date d'un mail,
 * elle peut être occupante de l'un et sortante de l'autre. Il faut UN mot, et un seul, parce qu'une intervention
 * désigne UNE personne (sa clé), pas un couple personne-logement.
 *
 * 🔴 L'ORDRE EST CELUI DE LA CERTITUDE, ET IL SE LIT : si elle occupe quelque chose à cette date, elle est
 * OCCUPANTE — c'est l'information la plus forte et la plus utile. Sinon, si elle est sortie de quelque chose
 * avant cette date, elle est SORTANTE. Sinon, elle n'est pas encore entrée.
 *
 * ⚠️ UNE LISTE VIDE N'EST PAS « occupante ». Une personne dont on ne connaît aucune occupation pour les biens de
 * ce classement ne peut pas être dite occupante : ce serait affirmer ce qu'on n'a pas. On rend le mot neutre, et
 * la pastille grise le dit. (Piège du lot 71 : l'ensemble vide n'est jamais « satisfait ».)
 */
export function roleLocataireParmiOccupations(
  occupations: readonly { entree: string | null; sortie: string | null }[],
  dateMail: string,
): RoleInstantane {
  if (occupations.length === 0) return 'locataire_a_venir';
  const roles = occupations.map((o) => roleLocataireALaDate({ ...o, dateMail }));
  if (roles.includes('locataire_occupant')) return 'locataire_occupant';
  if (roles.includes('locataire_sortant')) return 'locataire_sortant';
  return 'locataire_a_venir';
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 ③ FAUT-IL L'ÉTAPE 2 ?
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DEMANDE D'ARNO : « au clic sur Valider, compare l'adresse de l'expéditeur à TOUTES les adresses de TOUTES les
   cartes des fiches propriétaires et locataires de CHAQUE bien coché, locataires sortants compris (historique
   complet, sans limite). Si l'adresse correspond : comportement actuel, rien de nouveau. Si elle ne correspond
   pas : la modale ne se ferme pas et affiche une 2ᵉ ÉTAPE. »

   « Jamais d'étape 2 pour : un mail envoyé par nous ; les adresses @sansvisavis.com et @criterimmo.fr ; Interne et
   Hors gestion ; un “Document CRITERIMMO” ; un expéditeur connu sur un des biens cochés. »

   🔴 « SUR UN DES BIENS COCHÉS » EST LA MOITIÉ QUI COMPTE. Connu sur UN SEUL des biens suffit à ne pas demander :
   c'est déjà quelqu'un du dossier, et redemander à chaque bien coché ferait de la modale un questionnaire.

   🔴 ET « AU MOINS UN BIEN COCHÉ », qui n'est pas dit mais qui découle de tout le reste : « Valider — aucun bien »
   RETIRE les rattachements (demande d'Arno au lot CLASSER-SUR-CHAQUE-MAIL). Demander pour qui un contact
   intervient au moment où l'on dit « ce mail ne concerne aucun bien » serait absurde — et la base refuserait le
   lien, puisqu'une intervention exige un bien vivant.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Pourquoi l'étape 2 n'est pas demandée. Chaque motif est un cas nommé par Arno — aucun n'est un fourre-tout. */
export type MotifSansEtape2 =
  /** Un mail que NOUS avons envoyé. */
  | 'envoye'
  /** Une de nos adresses (@sansvisavis.com, @criterimmo.fr) — ou une adresse illisible. */
  | 'adresse_interne'
  /** « Interne — échange entre collègues ». */
  | 'interne'
  /** « Hors gestion ». */
  | 'hors_gestion'
  /** Un « Document CRITERIMMO » : il ne va dans aucun bien, donc dans aucune intervention. */
  | 'document'
  /** Aucun bien coché : « Valider — aucun bien » retire les rattachements. */
  | 'aucun_bien'
  /** L'expéditeur est déjà contact d'une fiche d'un des biens cochés. */
  | 'expediteur_connu';

export interface ContexteEtape2 {
  /** Le sens du mail, tel que la base le porte. */
  sens: 'recu' | 'envoye' | null;
  /**
   * 🔴 VRAI quand l'adresse de l'expéditeur figure parmi les adresses des fiches des biens COCHÉS, locataires
   * sortants compris. La comparaison se fait dans le dépôt (il a l'annuaire) ; la DÉCISION se prend ici.
   */
  expediteurConnu: boolean;
  /** VRAI pour @sansvisavis.com / @criterimmo.fr — décidé par `estAdresseInterne`, passé ici. */
  expediteurInterne: boolean;
  /** VRAI pour un « Document CRITERIMMO » que NOUS envoyons — décidé par `estDocumentEnvoye`, passé ici. */
  document: boolean;
  /** Les clés des biens cochés dans l'étape 1. */
  biensCoches: readonly string[];
  interne: boolean;
  horsGestion: boolean;
}

/**
 * L'ÉTAPE 2 EST-ELLE DEMANDÉE, ET SINON POURQUOI ? PUR.
 *
 * ⚠️ L'ORDRE DES REFUS EST CELUI DE LA LISTE D'ARNO, et il est lisible : le motif rendu est le PREMIER qui
 * s'applique. Un mail envoyé par nous ET interne rend « envoye » — ce qui est la bonne réponse, parce que c'est
 * celle qu'on vérifierait d'abord en relisant le cas à la main.
 */
export function etape2Requise(c: ContexteEtape2): { requise: boolean; motif: MotifSansEtape2 | null } {
  if (c.sens !== 'recu') return { requise: false, motif: 'envoye' };
  if (c.expediteurInterne) return { requise: false, motif: 'adresse_interne' };
  if (c.interne) return { requise: false, motif: 'interne' };
  if (c.horsGestion) return { requise: false, motif: 'hors_gestion' };
  if (c.document) return { requise: false, motif: 'document' };
  if (c.biensCoches.length === 0) return { requise: false, motif: 'aucun_bien' };
  if (c.expediteurConnu) return { requise: false, motif: 'expediteur_connu' };
  return { requise: true, motif: null };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 ④ CE QUE L'ÉTAPE 2 MONTRE, ET DANS QUEL ORDRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DEMANDE D'ARNO : « Ordre : propriétaire(s) actif(s), locataire(s) occupant(s), le locataire sortant le plus
   récent, puis le lien “Voir tous les anciens locataires…” qui déplie le reste. »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Le mot du lien de dépliage, écrit UNE fois — les mots d'Arno, au caractère près. */
export const LIEN_ANCIENS_LOCATAIRES = 'Voir tous les anciens locataires…';

/** Le mot du choix exclusif, et son sous-titre — les mots d'Arno. */
export const BIEN_UNIQUEMENT = 'Le bien uniquement';
export const BIEN_UNIQUEMENT_AIDE = 'Artisan, syndic, expert… aucune personne spécifique';

/** Les deux titres de section de l'étape 2 — les mots d'Arno, en capitales comme sur sa maquette. */
export const TITRE_PROPRIETAIRES = 'PROPRIÉTAIRE(S)';
export const TITRE_LOCATAIRES = 'LOCATAIRE(S)';

/** Le titre de l'étape et celui du bloc de suivi — les mots d'Arno. */
export const TITRE_ETAPE2 = 'Classer ce nouveau contact';
export const TITRE_INTERVIENT = 'Ce contact intervient pour :';
export const TITRE_SUIVI = 'Suivi des prochains échanges';

/** Une personne proposée à l'étape 2. Son identité est (sorte, clé) — jamais un identifiant interne. */
export interface PersonneEtape2 {
  sorte: 'proprietaire' | 'locataire';
  /** La clé WIPPIMMO de la CARTE. C'est elle qui survit à un ré-import, et elle seule. */
  cle: string;
  /** L'identifiant interne : il n'ouvre que la fiche de l'annuaire, il ne sert jamais d'identité. */
  id: number | null;
  nom: string;
  civilite: string | null;
  /** Le rôle À LA DATE DU MAIL — calculé par `roleLocataireALaDate` pour un locataire. */
  role: RoleInstantane;
  /** Les bornes de l'occupation, pour l'affichage (« du 01/02/2024 au 31/08/2025 »). */
  entree?: string | null;
  sortie?: string | null;
  /**
   * 🔴 VRAI pour un propriétaire EN COURS (aucune date de fin). Arno dit « propriétaire(s) actif(s) » en premier :
   * un ancien propriétaire d'un bien vendu existe en base et n'a rien à faire en tête de liste.
   */
  actif?: boolean;
}

/**
 * ══ 🔴🔴 L'ORDRE, ET CE QUI SE REPLIE. PUR. ═══════════════════════════════════════════════════════════════════
 *
 * Rendues en deux listes, parce que l'écran en fait deux choses différentes : `visibles` s'affichent, `repliees`
 * attendent le lien. Les deux gardent leur ordre, et une personne n'est jamais dans les deux.
 *
 * 🔴 « LE LOCATAIRE SORTANT LE PLUS RÉCENT » EST UN SEUL : celui dont la SORTIE est la plus tardive. Les autres
 * sortants vont derrière le lien. Sans date de sortie lisible, un sortant passe derrière le lien : le présenter
 * comme « le plus récent » demanderait de le dater, et on ne devine pas.
 *
 * ⚠️ L'ORDRE D'ARRIVÉE EST CONSERVÉ À RANG ÉGAL, et il vient du dépôt (propriétaires par rang d'import,
 * occupations les plus récentes d'abord). Le réordonner alphabétiquement séparerait les deux membres d'un couple.
 */
export function ordonnerEtape2(personnes: readonly PersonneEtape2[]): {
  visibles: PersonneEtape2[]; repliees: PersonneEtape2[];
} {
  const proprios = personnes.filter((p) => p.sorte === 'proprietaire');
  const proprioActifs = proprios.filter((p) => p.actif !== false);
  const proprioAnciens = proprios.filter((p) => p.actif === false);
  const locataires = personnes.filter((p) => p.sorte === 'locataire');
  const occupants = locataires.filter((p) => p.role === 'locataire_occupant');
  const sortants = locataires.filter((p) => p.role === 'locataire_sortant');
  const aVenir = locataires.filter((p) => p.role === 'locataire_a_venir');

  /**
   * ⚠️ `localeCompare` SUR DES JOURS ISO, ET NON `new Date` : on compare deux chaînes `AAAA-MM-JJ`, ce qui est
   * exactement l'ordre chronologique, et ce qui évite de fabriquer des dates pour les jeter aussitôt.
   */
  const datee = sortants.filter((p) => ((p.sortie ?? '').slice(0, 10)) !== '');
  const sansDate = sortants.filter((p) => ((p.sortie ?? '').slice(0, 10)) === '');
  const triee = [...datee].sort((a, b) => ((b.sortie ?? '')).localeCompare(a.sortie ?? ''));
  const dernierSortant = triee.length === 0 ? [] : [triee[0]];
  const autresSortants = triee.slice(1);

  return {
    visibles: [...proprioActifs, ...occupants, ...dernierSortant],
    repliees: [...autresSortants, ...sansDate, ...aVenir, ...proprioAnciens],
  };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 ⑤ L'EXCLUSIVITÉ DE « LE BIEN UNIQUEMENT »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DEMANDE D'ARNO : « “Le bien uniquement” est EXCLUSIF : le cocher décoche les personnes, et cocher une personne
   le décoche. » Et : « Rien de pré-coché à la première fois. Valider reste inactif tant qu'aucun choix n'est
   fait. »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** La clé d'une personne dans la sélection : sa sorte et sa clé, jamais la clé seule. PUR. */
export function clePersonne(p: { sorte: 'proprietaire' | 'locataire'; cle: string }): string {
  return `${p.sorte}:${p.cle}`;
}

/** Ce que l'étape 2 a sous les cases. `bienUniquement` et `personnes` ne sont JAMAIS vrais ensemble. */
export interface ChoixEtape2 {
  bienUniquement: boolean;
  /** Les clés `sorte:cle` des personnes cochées, toutes fiches et tous biens confondus. */
  personnes: readonly string[];
}

export const CHOIX_ETAPE2_VIDE: ChoixEtape2 = { bienUniquement: false, personnes: [] };

/**
 * BASCULER UNE CASE. PUR.
 *
 * ⚠️ UN SEUL POINT D'ENTRÉE POUR LES DEUX SORTES DE CASE, et c'est ce qui rend l'exclusivité impossible à perdre :
 * il n'y a pas un chemin qui coche une personne et un autre qui coche « Le bien uniquement ». `cle === null`
 * désigne « Le bien uniquement » — le seul choix qui n'a pas de personne derrière lui.
 */
export function basculerEtape2(c: ChoixEtape2, cle: string | null): ChoixEtape2 {
  if (cle === null) {
    // Cocher « Le bien uniquement » DÉCOCHE les personnes ; le re-cliquer ne coche rien d'autre.
    return c.bienUniquement ? CHOIX_ETAPE2_VIDE : { bienUniquement: true, personnes: [] };
  }
  const deja = c.personnes.includes(cle);
  const personnes = deja ? c.personnes.filter((x) => x !== cle) : [...c.personnes, cle];
  // Cocher une personne DÉCOCHE « Le bien uniquement ».
  return { bienUniquement: false, personnes };
}

/**
 * « VALIDER » EST-IL ACTIF ? PUR.
 *
 * 🔴 « Valider reste inactif tant qu'aucun choix n'est fait » (Arno). C'est la seule garde : les trois champs du
 * contact externe (nom, téléphone, type) sont FACULTATIFS et ne bloquent JAMAIS — c'est écrit deux fois dans son
 * cahier des charges, et c'est la différence entre un service et un formulaire.
 */
export function etape2Validable(c: ChoixEtape2): boolean {
  return c.bienUniquement || c.personnes.length > 0;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 ⑥ LE SUIVI DES PROCHAINS ÉCHANGES — DEUX CHOIX, ET LEUR TRADUCTION DANS LE MÉCANISME EXISTANT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DEMANDE D'ARNO : « “Suivi automatique de cette conversation” (coché par défaut) ; “Classement ponctuel —
   revalidation au prochain message”. »

   🔴🔴 ET SA TRADUCTION, QUI EST TOUT L'INTÉRÊT : ces deux choix ne sont pas un second mécanisme. Ils tombent
   EXACTEMENT sur les fenêtres de conversation qui existent déjà (lot SUIVI-CONVERSATION, migration 290) :

       · « Suivi automatique »   → le choix `suite` : une NOUVELLE PÉRIODE à partir de ce mail, qui porte le(s)
                                   bien(s) ET les relations aux personnes. Les mails suivants en héritent, avec le
                                   rôle instantané RECALCULÉ à la date de chacun ;
       · « Classement ponctuel » → le choix `mail` : une EXCEPTION sur ce mail seul. Aucune période n'est ouverte,
                                   donc AUCUN mail suivant n'est rattaché automatiquement — c'est la définition
                                   même d'une exception, écrite au lot SUIVI-CONVERSATION.

   ⚠️ C'EST POUR CELA QU'IL N'Y A PAS DE TROISIÈME TABLE. Un second mécanisme de mémoire aurait divergé du premier
   au premier ajustement, et l'on aurait vu un mail suivre deux règles contradictoires selon l'écran qui le lit.

   ⚠️ LA MÉMOIRE EST LIÉE À LA CONVERSATION, JAMAIS À L'ADRESSE (demande expresse d'Arno). C'est déjà vrai par
   construction : une période vit dans `gestion_fil_periode`, dont la clé est le FIL. Le même avocat sur deux biens
   et deux conversations a donc deux mémoires indépendantes — et c'est ce que le scénario C9 éprouve.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export type SuiviContact = 'auto' | 'ponctuel';

/** Le choix coché d'avance — « coché par défaut » (Arno). */
export const SUIVI_CONTACT_DEFAUT: SuiviContact = 'auto';

/** Les deux choix, dans l'ordre d'Arno, avec leur phrase d'aide. Écrits ICI et nulle part ailleurs. */
export const CHOIX_SUIVI_CONTACT: readonly { cle: SuiviContact; mot: string; aide: string }[] = [
  {
    cle: 'auto', mot: 'Suivi automatique de cette conversation',
    aide: 'Les prochains messages de cet échange, dans les deux sens, reprennent ce classement '
      + 'et ces personnes. Le rôle est recalculé à la date de chaque message.',
  },
  {
    cle: 'ponctuel', mot: 'Classement ponctuel — revalidation au prochain message',
    aide: 'Ce message seul est classé. Le prochain reste « À classer », avec ce choix proposé d’avance.',
  },
];

/**
 * LE CHOIX DE SUIVI DE LA CONVERSATION QUE CE CHOIX-CI PRODUIT. PUR.
 *
 * ⚠️ `'suite'` ET `'mail'` SONT LES MOTS DU MODULE `periodesConversation`, et on les rend tels quels : traduire
 * ici dans un troisième vocabulaire ferait un dictionnaire à maintenir pour deux valeurs.
 */
export function choixSuiviDeContact(s: SuiviContact): 'suite' | 'mail' {
  return s === 'auto' ? 'suite' : 'mail';
}

/** Un choix reçu du navigateur, re-validé. Inconnu ⇒ le défaut d'Arno, jamais « ponctuel » par surprise. PUR. */
export function suiviContactRecu(brut: unknown): SuiviContact {
  return brut === 'ponctuel' ? 'ponctuel' : 'auto';
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 ⑦ LES MOTS DU CONTACT EXTERNE, ET LA MENTION « via … »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Un contact externe, réduit à ce qui le nomme. */
export interface ContactExterne {
  email: string;
  nom: string | null;
  telephone: string | null;
  type: TypeContactExterne | null;
}

/** Le libellé du bas de l'étape — les mots d'Arno : « Contact externe : <adresse> ». PUR. */
export function libelleContactExterne(email: string): string {
  return `Contact externe : ${(email ?? '').trim()}`;
}

/**
 * ══ 🔴 LA MENTION « via Me Martin, avocat ». PUR. ═════════════════════════════════════════════════════════════
 *
 * Demande d'Arno : le mail apparaît dans « Vie du bien » ET dans l'historique de chaque carte ou fiche concernée,
 * « avec le rôle instantané et le contact externe (“via Me Martin, avocat”) ».
 *
 * ⚠️ LE NOM EST CELUI QU'ARNO A SAISI, Y COMPRIS SON « Me ». On ne le fabrique pas depuis le type : « Me » devant
 * un syndic serait faux, et deviner la civilité d'un nom est exactement ce que ce dépôt ne fait jamais.
 *
 * ⚠️ SANS NOM, L'ADRESSE FAIT OFFICE DE NOM. « via contact@belmonts.fr » est moins beau mais vrai ; « via (sans
 * nom) » ne dirait rien à personne et ferait croire à une donnée perdue.
 */
export function mentionVia(c: ContactExterne): string {
  const nom = (c.nom ?? '').trim();
  const qui = nom === '' ? (c.email ?? '').trim() : nom;
  if (qui === '') return '';
  return c.type === null ? `via ${qui}` : `via ${qui}, ${motTypeContact(c.type).toLowerCase()}`;
}

/**
 * LA PHRASE D'UNE FICHE SANS AUCUNE INTERVENTION. Écrite une fois : l'écran ne doit pas l'inventer deux fois.
 *
 * ⚠️ ELLE DIT CE QUE C'EST, pas « aucune donnée ». Une fiche sans intervention est le cas NORMAL — la plupart des
 * locataires n'ont jamais d'avocat.
 */
export const AUCUNE_INTERVENTION = 'Aucun échange passé par un contact extérieur';

/** Le titre de la section, et la phrase qui la distingue des « Documents automatiques » (demande d'Arno). */
export const TITRE_INTERVENTIONS = 'Échanges par un contact extérieur';
export const INTRO_INTERVENTIONS =
  'Des mails rattachés à un bien, qui concernent aussi cette personne par un intermédiaire '
  + '(avocat, garant, syndic…). C’est une liste distincte des « Documents automatiques » : '
  + 'ceux-là partent de chez nous et ne concernent aucun bien.';

/** Une intervention telle que la fiche l'affiche. Déclarée dans le module PUR : l'écran est un composant client. */
export interface InterventionDeFiche {
  messageId: number;
  filId: number;
  /** Date de réception, en jour ISO. */
  le: string;
  objet: string;
  /** Le rôle FIGÉ à la date du mail. Il ne bouge plus. */
  role: RoleInstantane;
  /** « via Me Martin, avocat » — déjà composé par le dépôt, ou `null` quand aucun contact n'est nommé. */
  via: string | null;
  /** Le ou les biens du même mail : une intervention ne vit jamais sans eux. */
  biens: readonly { cle: string; libelle: string }[];
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 ⑧ LES MOTIFS ÉCRITS SUR LES LIENS — ILS SE RELISENT DANS DEUX ANS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LE MOTIF D'UNE INTERVENTION POSÉE À LA MAIN. PUR.
 *
 * 🔴 IL DIT QUI, À QUEL TITRE, ET PAR QUI. « intervention de Me Martin (avocat) — locataire sortant à la date du
 * mail » se relit sans rejouer le moteur, et c'est le seul moyen de comprendre un lien six mois plus tard.
 */
export function motifIntervention(o: { contact: ContactExterne | null; role: RoleInstantane }): string {
  const via = o.contact === null ? '' : mentionVia(o.contact);
  const qui = via === '' ? 'un contact extérieur' : via.replace(/^via /, '');
  return `intervention de ${qui} — ${motRoleInstantane(o.role).toLowerCase()} à la date du mail`;
}

/** Le motif des interventions posées par une FENÊTRE de conversation, et celui de leur retrait. Écrits une fois. */
export const MOTIF_INTERVENTION_PAR_SUIVI = 'intervention posée par le suivi de la conversation';
export const MOTIF_INTERVENTION_RETIREE_PAR_SUIVI = 'intervention retirée par le suivi de la conversation';

/**
 * ══ 🔴🔴 LE MOTIF DU RETRAIT EN CASCADE, ET POURQUOI IL EXISTE ════════════════════════════════════════════════
 *
 * La base refuse de CRÉER une intervention sans lien vivant vers le bien du même mail (migration 293). Elle ne
 * peut pas, en revanche, refuser qu'on retire le bien plus tard : ce refus-là casserait « Valider — aucun bien »,
 * la fenêtre « Modifier », la file à trier et la projection des périodes — c'est-à-dire quatre gestes validés.
 *
 * 🔴 C'EST DONC L'ÉCRITURE QUI FAIT LA CASCADE : quand le dernier lien vivant d'un mail vers un bien s'en va, les
 * interventions de ce mail sont RETIRÉES, datées et signées, avec ce motif. Jamais supprimées — elles restent
 * lisibles et remettables, comme tout dans cette table.
 *
 * ⚠️ LA LACUNE EST NOMMÉE, PAS CACHÉE : un processus qui retirerait un lien « bien » sans passer par le dépôt
 * laisserait une intervention orpheline. Elle serait VISIBLE (la lecture joint les biens du mail et n'en
 * trouverait aucun), et un contrôle la rattraperait. C'est le prix d'avoir préféré ne rien casser.
 */
export const MOTIF_INTERVENTION_SANS_BIEN = 'intervention retirée : le mail n’est plus rattaché à aucun bien';
