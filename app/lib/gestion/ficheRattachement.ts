/**
 * MODULE « GESTION » — LOT FICHE-RATTACHEMENT : CE QUE MONTRE « VISUALISER / MODIFIER ». Module PUR : aucun import,
 * aucune base, aucun réseau, aucun DOM.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE LA FENÊTRE DISAIT AVANT CE LOT, ET POURQUOI C'ÉTAIT TROP PEU. Une ligne : « Propriétaire X —
 * automatique ». Pour rappeler le locataire, retrouver l'adresse du logement ou son numéro de lot, il fallait
 * refermer, rouvrir l'échange, déplier un message, puis ouvrir l'annuaire dans un autre onglet. On ouvrait cette
 * fenêtre pour SAVOIR, et elle ne disait presque rien.
 *
 * 🔴 LA RÈGLE D'ORDRE, ET C'EST TOUT L'OBJET DE CE FICHIER : LE BIEN D'ABORD, puis les personnes du bien, et
 * l'EXPÉDITEUR du mail en tête des personnes. On regarde cette fenêtre en ayant un mail sous les yeux : la première
 * chose qu'on cherche est « de quel logement parle-t-il », la deuxième « qui m'écrit, et comment le rappeler ».
 *
 * ⚠️ RIEN N'EST INVENTÉ — règle du module depuis `ficheBien.ts`. Une donnée absente est DITE absente
 * (« surface non renseignée », « Vacant à cette date »), jamais devinée, jamais remplacée par un tiret muet qui
 * laisserait croire qu'on n'a pas cherché.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Une coordonnée, avec le libellé de sa colonne d'origine (« Mobile 1 », « Email 2 »). */
/** 🔴 LOT FICHES-RETOUCHES — `affichage` AJOUTÉ : le numéro groupé par deux. `valeur` reste la forme
 *  canonique, qui sert aux comparaisons et au lien `tel:`. */
export interface CoordonneeFiche {
  valeur: string; affichage: string; libelle: string;
  /** 🔴 LOT ANNOTATIONS-TEL — la note grise sous le numéro, et le type que l'annotation impose. */
  note: string | null;
  typeAnnotation: 'mobile' | 'fixe' | null;
}

/** Une personne de la fiche : un propriétaire, ou un locataire à la date du mail. */
export interface PersonneRattachement {
  role: 'proprietaire' | 'locataire';
  /** La clé WIPPIMMO — l'identité qui survit à un ré-import. */
  cle: string;
  /** L'identifiant INTERNE : c'est lui, et lui seul, qui ouvre la fiche de l'annuaire (`?fiche=proprietaire-12`). */
  id: number | null;
  nom: string;
  civilite: string | null;
  telephones: CoordonneeFiche[];
  emails: CoordonneeFiche[];
  /** Pour un locataire : la période d'occupation qui couvre la date du mail. */
  depuis?: string | null;
  jusqua?: string | null;
  /**
   * 🔴 VRAI quand c'est CETTE personne qui a écrit dans l'échange. Son bloc passe en tête et porte le mot
   * « Expéditeur » — demande d'Arno, et c'est la moitié de l'utilité de la fenêtre : on répond à quelqu'un.
   */
  expediteur: boolean;
}

/** Un bien rattaché à l'échange, avec tout ce qu'on veut savoir sans rouvrir WIPPIMMO. */
export interface BienRattache {
  cle: string;
  /**
   * ══ 🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 4 — L'IDENTIFIANT INTERNE DU LOT ═══════════════════════
   *
   * Il sert UNIQUEMENT à ouvrir la fiche du bien dans l'application (« Historique du bien »), qui s'adresse par
   * `?ecran=annuaire&fiche=lot-<id>`.
   *
   * ⚠️ CE N'EST PAS `cle`, ET LES CONFONDRE OUVRIRAIT LA FICHE D'UN AUTRE BIEN. `cle` est le numéro WIPPIMMO
   * (« 459 »), celui qu'on lit à l'écran et qui désigne le lot pour les humains ; `lotId` est la clé primaire de
   * `gestion_annuaire_lot`. Le lot 459 n'est pas la ligne nº 459. C'est exactement la précaution déjà écrite pour
   * `adresseFicheAnnuaire` d'une personne.
   *
   * ⚠️ `null` = INCONNU, et le bouton est alors éteint plutôt que de mener à une fiche vide.
   */
  lotId: number | null;
  /** L'adresse COMPLÈTE : voie, code postal, commune. Une adresse sans code postal n'est pas une adresse. */
  adresseComplete: string;
  numeroLot: string;
  nature: string | null;
  typeBien: string | null;
  /** En m². `null` = la donnée n'existe pas dans l'export — et on l'écrit en toutes lettres. */
  surfaceM2: number | null;
  /** `auto` = posé par le moteur · `classe` = posé ou confirmé à la main · `a_trancher` = proposé, pas encore tranché. */
  statut: 'auto' | 'classe' | 'a_trancher';
  /** La date des mails dont ce rattachement vient — c'est elle qui décide QUI était locataire. */
  dateMail: string | null;
  /** Combien de mails de la conversation portent ce rattachement. */
  nbMails: number;
  /** L'identifiant du dossier Drive du bien, quand on a su le trouver. `null` = pas de lien proposé. */
  dossierDriveId: string | null;
  personnes: PersonneRattachement[];
  /** Les liens bruts, pour « Voir le détail par mail » et les gestes — inchangés depuis le lot BARRE-STATUT. */
  lienIds: number[];
}

export interface FicheRattachementFil {
  filId: number;
  objet: string | null;
  /** Le nombre de mails de la CONVERSATION, pas des rattachements : « N mails dans la conversation ». */
  nbMailsDuFil: number;
  biens: BienRattache[];
  /** Vrai quand l'échange porte la marque « Hors gestion » — on le DIT, au lieu de montrer un cadre vide. */
  horsGestion: boolean;
  /**
   * LE MAIL LE PLUS RÉCENT DE L'ÉCHANGE. C'est sur LUI que porte « Rattacher à un bien » depuis cette fenêtre —
   * un rattachement se pose sur un MAIL, jamais sur un échange (convention du lot RATTACHEMENT-1).
   *
   * ⚠️ LE PLUS RÉCENT, et non le premier : c'est celui qu'on vient de lire dans la liste, et celui dont la date
   * décide des parties. `null` quand l'échange est vide, ce qui ne devrait pas arriver mais se dit quand même.
   */
  messageRecentId: number | null;
  /**
   * 🔴🔴 LOT VISUALISER-UNIFIE-ET-BROUILLON-EN-HAUT — L'EN-TÊTE DU MAIL DONT LA FENÊTRE PARLE.
   *
   * Le mail demandé, ou à défaut le plus récent de l'échange — celui que la ligne de liste affiche. `null` quand
   * l'échange est vide, ou quand les rattachements ne sont pas installés.
   */
  enTete: EnTeteMailFenetre | null;
  /** `false` = migration 257 ou annuaire absents : l'écran le dit au lieu de montrer une liste vide. */
  disponible: boolean;
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES MOTS
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LA SURFACE, ÉCRITE. PUR.
 *
 * 🔴🔴 « ÉCRIRE “surface non renseignée” SI LA DONNÉE MANQUE, NE JAMAIS L'INVENTER » — demande d'Arno, mot pour
 * mot. Et elle manque TOUJOURS aujourd'hui : l'export WIPPIMMO ne porte aucune colonne de surface (mesuré le
 * 28/09/2026 sur les 365 lots ; `gestion_annuaire_lot` n'a ni `surface`, ni `surface_m2`, ni équivalent).
 *
 * ⚠️ ON NE LA DÉDUIT PAS DU TYPE. « Type 2 » dit un nombre de pièces, pas des mètres carrés : un Type 2 fait 28 m²
 * ou 62 m² selon l'immeuble. Une surface déduite serait écrite dans un mail au locataire le jour même.
 */
export function motSurface(surfaceM2: number | null): string {
  if (surfaceM2 === null || !Number.isFinite(surfaceM2) || surfaceM2 <= 0) return 'surface non renseignée';
  const n = Math.round(surfaceM2 * 10) / 10;
  return `${String(n).replace('.', ',')} m²`;
}

/** Le mot du statut d'un bien rattaché, en toutes lettres — jamais une couleur seule. PUR. */
export function motStatutBien(s: BienRattache['statut']): string {
  if (s === 'classe') return 'Classé';
  if (s === 'auto') return 'Auto';
  return 'À trancher';
}

/**
 * LES LOCATAIRES, OU LEUR ABSENCE. PUR.
 *
 * 🔴 « VACANT À CETTE DATE » EST UNE RÉPONSE, pas un vide. Un logement sans locataire à la date du mail est un
 * fait utile : il explique pourquoi le mail vient du bailleur, et il évite de chercher un occupant qui n'existait
 * pas. Laisser la place blanche ferait croire à une donnée manquante.
 */
export function motSansLocataire(dateMail: string | null): string {
  return dateMail === null ? 'Vacant (aucune date de mail connue)' : `Vacant à cette date (${dateFr(dateMail)})`;
}

/** Une date ISO (AAAA-MM-JJ) en date française. Rend la chaîne telle quelle si elle n'a pas cette forme. PUR. */
export function dateFr(iso: string | null): string {
  if (iso === null) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m === null ? iso : `${m[3]}/${m[2]}/${m[1]}`;
}

/** La période d'occupation d'un locataire, dite en clair. `null` quand l'export ne donne aucune borne. PUR. */
export function motPeriode(p: { depuis?: string | null; jusqua?: string | null }): string | null {
  const d = (p.depuis ?? '').trim();
  const f = (p.jusqua ?? '').trim();
  if (d === '' && f === '') return null;
  if (f === '') return `depuis le ${dateFr(d)}`;
  if (d === '') return `jusqu’au ${dateFr(f)}`;
  return `du ${dateFr(d)} au ${dateFr(f)}`;
}

/** Le titre d'une personne : son nom, et « Société » quand l'export marque la civilité « Sté ». PUR. */
export function qualitePersonne(civilite: string | null): string | null {
  const c = (civilite ?? '').trim();
  if (c === '') return null;
  return /^st[ée]?\.?$/i.test(c) || /^soci[ée]t[ée]$/i.test(c) || /^s\.?a\.?r\.?l\.?$/i.test(c) ? 'Société' : c;
}

/** Le mot du rôle, au singulier. PUR. */
export function motRole(r: PersonneRattachement['role']): string {
  return r === 'proprietaire' ? 'Propriétaire' : 'Locataire';
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES ORDRES
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴 L'ORDRE DES PERSONNES D'UN BIEN. PUR. ═════════════════════════════════════════════════════════════════════
 *
 * 🔴 L'EXPÉDITEUR EN PREMIER, quel que soit son rôle — demande d'Arno, et c'est le point :
 *   · « Mail envoyé par le propriétaire : son bloc en premier, mis en évidence Expéditeur » ;
 *   · « Mail envoyé par un locataire : le bloc locataire en premier ».
 * On ouvre cette fenêtre en ayant un mail sous les yeux, et le geste suivant est presque toujours de rappeler ou de
 * répondre à celui qui a écrit. Le faire chercher au milieu d'une colocation est exactement ce qu'on veut éviter.
 *
 * ⚠️ À DÉFAUT D'EXPÉDITEUR RECONNU, l'ordre est le PROPRIÉTAIRE PUIS LES LOCATAIRES — l'ordre du dossier, celui
 * qu'on a en tête. Et jamais un tri alphabétique, qui séparerait les deux membres d'un couple.
 *
 * ⚠️ L'ORDRE D'ARRIVÉE EST CONSERVÉ à rôle égal : c'est celui de l'import WIPPIMMO (les occupations les plus
 * récentes d'abord), et le réordonner ferait mentir la première ligne d'une colocation.
 */
export function ordonnerPersonnes(personnes: readonly PersonneRattachement[]): PersonneRattachement[] {
  const rang = (p: PersonneRattachement): number => {
    if (p.expediteur) return 0;
    return p.role === 'proprietaire' ? 1 : 2;
  };
  return [...personnes]
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rang(a.p) - rang(b.p) || a.i - b.i)
    .map((x) => x.p);
}

/**
 * ══ 🔴 L'ORDRE DES BIENS. PUR. ═══════════════════════════════════════════════════════════════════════════════════
 *
 * Les biens CLASSÉS (posés ou confirmés à la main) d'abord, puis les automatiques, puis ceux qui restent à
 * trancher — c'est l'ordre de certitude, le même que partout ailleurs dans le module. À certitude égale, celui qui
 * porte le plus de mails de la conversation : c'est le dossier principal de l'échange.
 */
export function ordonnerBiens(biens: readonly BienRattache[]): BienRattache[] {
  const rang = (b: BienRattache): number => (b.statut === 'classe' ? 0 : b.statut === 'auto' ? 1 : 2);
  return [...biens].sort((a, b) =>
    rang(a) - rang(b)
    || b.nbMails - a.nbMails
    || a.adresseComplete.localeCompare(b.adresseComplete, 'fr'));
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES LIENS SORTANTS
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔒 L'ADRESSE DU DOSSIER DU BIEN DANS GOOGLE DRIVE. PUR. ══════════════════════════════════════════════════════
 *
 * 🔒 C'EST UNE ADRESSE DE CONSULTATION, ET RIEN D'AUTRE. `/drive/folders/<id>` ouvre le dossier dans Google Drive,
 * dans l'onglet du navigateur, avec les droits Google de la personne connectée : l'application ne lit rien, ne
 * télécharge rien, ne crée rien. C'est Google qui autorise ou refuse, dossier par dossier — la bonne autorité.
 *
 * ⚠️ `null` QUAND ON NE SAIT PAS. Un lien fabriqué sur un identifiant vide mènerait à une page d'erreur Google, et
 * l'on croirait le dossier disparu.
 */
export function adresseDossierDrive(dossierId: string | null): string | null {
  const id = idDossierDrive(dossierId);
  return id === null ? null : `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;
}

/**
 * ══ 🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 4 — « A-T-ON UN DOSSIER, OUI OU NON ? » PUR. ════════════════
 *
 * L'identifiant utile du dossier, ou `null` s'il n'y en a pas. C'est LA question du bouton « Ouvrir le Drive du
 * bien » : avec un identifiant il ouvre, sans il s'éteint et dit « Dossier Drive non renseigné ».
 *
 * 🔴 UNE SEULE RÈGLE POUR LES DEUX USAGES, et c'est pour cela que cette fonction existe. `adresseDossierDrive`
 * jugeait déjà « vide après trim ⇒ rien » ; recopier ce test dans le composant aurait permis qu'un jour l'un
 * accepte ce que l'autre refuse — un bouton actif au-dessus d'un lien absent, ou l'inverse.
 */
export function idDossierDrive(dossierId: string | null): string | null {
  const id = (dossierId ?? '').trim();
  return id === '' ? null : id;
}

/**
 * ══ L'ADRESSE DE LA FICHE D'ANNUAIRE D'UNE PERSONNE, DANS L'APPLICATION. PUR. ════════════════════════════════════
 *
 * ⚠️ ELLE SE CONSTRUIT SUR L'IDENTIFIANT INTERNE, pas sur la clé WIPPIMMO : c'est ce que l'écran de l'annuaire
 * attend (`?fiche=proprietaire-12`), et confondre les deux ouvrirait la fiche de quelqu'un d'autre.
 *
 * ⚠️ `null` SANS IDENTIFIANT : pas de lien plutôt qu'un lien mort.
 */
export function adresseFicheAnnuaire(p: Pick<PersonneRattachement, 'role' | 'id'>): string | null {
  if (p.id === null || !Number.isSafeInteger(p.id) || p.id <= 0) return null;
  return `/admin/gestion?ecran=annuaire&fiche=${p.role}-${p.id}`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 4 — LES DEUX GRANDS BOUTONS DE CHAQUE CARTE DE BIEN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DEMANDE D'ARNO (03/10/2026) : « sur chaque carte de bien, à la place de la ligne “Ouvrir le dossier du bien ↗
   — dans Google Drive, en lecture”, DEUX boutons rouges allongés côte à côte, remplissant ensemble la largeur de
   la carte :
     a) “Ouvrir le Drive du bien” — ouvre NOTRE outil Drive, positionné directement dans le dossier Drive du bien.
        Si le dossier est sous “Documents clients scannés” : consultation seule, aucune écriture possible (gardes
        existantes, refus serveur). Si le bien n'a pas de dossier connu : bouton grisé “Dossier Drive non
        renseigné”.
     b) “Historique du bien” — ouvre la fiche du bien avec son historique (“Vie du bien”), dans l'application. »

   🔴 CE QUE CES DEUX BOUTONS REMPLACENT, ET POURQUOI C'EST MIEUX. La ligne d'avant envoyait dans Google Drive,
   hors de l'application : on y perdait le mail, les gardes de l'archive n'y existent pas, et le retour se faisait
   par un onglet qu'il fallait refermer. Le même dossier s'ouvre désormais dans l'outil qui connaît nos règles.

   ⚠️ LES MOTS VIVENT ICI, comme tous les mots de cette fenêtre : un libellé recopié dans le composant ne se
   relit plus, et deux libellés pour un bouton finissent par ne plus dire la même chose. */

/** a) LE DOSSIER DU BIEN, DANS NOTRE OUTIL. */
export const MOT_DRIVE_DU_BIEN = 'Ouvrir le Drive du bien';

/**
 * …et son absence, DITE. Un bouton éteint sans mot laisse croire à une panne ; celui-ci nomme ce qui manque, et
 * ce qui manque est une donnée de l'annuaire — pas un droit refusé.
 */
export const MOT_DRIVE_ABSENT = 'Dossier Drive non renseigné';

/** b) LA FICHE DU BIEN ET SON « Vie du bien ». */
export const MOT_HISTORIQUE_DU_BIEN = 'Historique du bien';

/** L'aide des deux boutons : elle dit OÙ l'on va, pas ce qu'on clique. */
export const AIDE_DRIVE_DU_BIEN =
  'Ouvre le dossier Drive de ce bien dans la fenêtre Drive de l’application.';
export const AIDE_DRIVE_ABSENT =
  'Aucun dossier Drive n’est connu pour ce bien : il n’y a donc rien à ouvrir.';
export const AIDE_HISTORIQUE_DU_BIEN =
  'Ouvre la fiche de ce bien, sur « Vie du bien ».';
/** ⚠️ Ne devrait pas arriver : un bien de cette fenêtre vient de l'annuaire, donc il a une ligne. On le dit quand même. */
export const AIDE_HISTORIQUE_ABSENT =
  'Ce bien n’a pas de fiche dans l’annuaire : il n’y a pas d’historique à ouvrir.';

/**
 * ══ L'ADRESSE DE LA FICHE DU BIEN, DANS L'APPLICATION. PUR. ══════════════════════════════════════════════════════
 *
 * 🔴 UNE ADRESSE, ET NON UN APPEL DE COMPOSANT. C'est ce qui fait tenir la dernière phrase d'Arno : « la flèche
 * retour revient à la fenêtre ou au mail d'origine (règle existante) ». Une navigation ordinaire empile un cran
 * dans l'historique du navigateur ; le mail, lui, vit déjà dans l'adresse (`?fil=…&message=…`) depuis le lot
 * 5-FUSION. « Précédent » ramène donc exactement là d'où l'on vient, sans qu'une seule ligne ne le gère.
 *
 * ⚠️ MÊME GARDE QUE `adresseFicheAnnuaire`, et pour la même raison : un identifiant absent, négatif ou non entier
 * ne fabrique PAS de lien. Mieux vaut un bouton éteint qu'une fiche vide — voir `lotId`.
 */
export function adresseHistoriqueDuBien(lotId: number | null): string | null {
  if (lotId === null || !Number.isSafeInteger(lotId) || lotId <= 0) return null;
  return `/admin/gestion?ecran=annuaire&fiche=lot-${lotId}`;
}

/**
 * LE TITRE DE LA FENÊTRE : l'objet, et le nombre de mails. PUR.
 *
 * ⚠️ « N mails dans la conversation » AU PLURIEL EXACT : « 1 mails » se lit comme un bogue, et fait douter du
 * reste de la fenêtre.
 */
export function motNbMails(n: number): string {
  return n <= 1 ? '1 mail dans la conversation' : `${n} mails dans la conversation`;
}

/**
 * ══ 🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 2 — LE COMPTEUR EN TÊTE DE LA FENÊTRE ════════════════════
 *
 * DEMANDE D'ARNO (03/10/2026) : « remplace “N mails dans la conversation” par “N bien(s) rattaché(s) à ce mail”.
 * Il se met à jour EN DIRECT pendant la modification : il compte les biens qui seront rattachés si l'on valide
 * (cartes du haut cochées + biens cochés dans les propositions ou la recherche). Après validation, il reflète
 * l'état enregistré. »
 *
 * 🔴 POURQUOI LE CHANGEMENT EST JUSTE. « N mails dans la conversation » répondait à une question qu'on ne se pose
 * pas dans cette fenêtre-ci : elle parle d'UN mail, et de ses biens. Le nombre de mails de l'échange y était un
 * reste de l'époque où la fenêtre montrait « les biens de cet échange ».
 *
 * ⚠️ « À CE MAIL », PAS « À CET ÉCHANGE » : c'est la même précision que le titre, et c'est elle qui distingue
 * cette fenêtre de tout le reste du module.
 *
 * ⚠️ `motNbMails` RESTE : la fenêtre n'est pas seule à compter des mails, et ce lot ne retire rien d'autre que
 * son emploi ici.
 */
export function motNbBiensRattaches(n: number): string {
  if (n <= 0) return 'Aucun bien rattaché à ce mail';
  return n === 1 ? '1 bien rattaché à ce mail' : `${n} biens rattachés à ce mail`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT VISUALISER-MAIL-ET-REPERE-FENETRE, POINT 1 — « BIEN(S) DE CE MAIL »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   CONSTAT D'ARNO (03/10/2026), fil 3490 (« Réfrigérateur-congélateur en panne… », TCS) : il a rattaché un mail à
   UN SEUL bien (2 Square Henri Régnault, lot 484), et la fenêtre « Visualiser / Modifier » lui montrait AUSSI
   tous les biens possibles de l'expéditeur — lots 247, 282, 169, 491, 4 — marqués « À trancher ». « On n'y
   comprend rien. »

   🔴 CE QUE LA BASE DIT, ET QUI EXPLIQUE TOUT. Le moteur pose un lien `statut='propose'` sur CHAQUE mail pour
   CHAQUE bien possible de l'expéditeur : relevé sur ce fil, le mail 57472 en porte cinq, plus le bien confirmé.
   Ces propositions sont utiles — elles alimentent la modale « Rattacher ce mail à… » — mais elles n'ont rien à
   faire dans une fenêtre qui prétend dire à quoi ce mail EST rattaché.

   RÈGLE D'ARNO : « la fenêtre ouverte depuis “Visualiser / Modifier” d'un mail n'affiche QUE le ou les biens
   rattachés à CE mail (lien vivant) […]. Plus de cartes “À trancher” des autres biens possibles dans cette
   fenêtre. »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * 🔴🔴 LOT FENETRE-BIENS-LIBELLES-ET-VIDEOS — LES MOTS D'ARNO, À LA LETTRE (03/10/2026).
 *
 * « Titre : “Bien(s) rattaché(s) à ce mail” (au lieu de “Bien(s) de ce mail”). Bouton : “Modifier les biens
 * rattachés à ce mail”. »
 *
 * 🔴 « RATTACHÉ(S) » DIT CE QUE LA FENÊTRE MONTRE, et c'est tout l'écart. « Bien(s) de ce mail » pouvait se lire
 * « les biens dont ce mail parle » — c'est-à-dire les propositions. La fenêtre, elle, ne montre que les liens
 * vivants et confirmés : le mot le dit désormais lui-même.
 */
export const TITRE_BIENS_DU_MAIL = 'Bien(s) rattaché(s) à ce mail';
export const AUCUN_BIEN_DU_MAIL = 'Aucun bien rattaché à ce mail';

/**
 * ══ ⚠️ DEUX MOTS RETIRÉS AU LOT VISUALISER-UNIFIE-ET-BROUILLON-EN-HAUT, ET IL FAUT DIRE POURQUOI ═════════════════
 *
 * `TITRE_BIENS_DE_L_ECHANGE` (« Bien(s) de cet échange ») et `MOT_AJOUTER_A_UN_AUTRE_BIEN` (« + Ajouter ce mail à
 * un autre bien ») nommaient la SECONDE fenêtre et le geste d'ajout ponctuel. Arno les a l'un et l'autre
 * explicitement remplacés le 03/10/2026 : « une SEULE fenêtre, quel que soit le point d'entrée » et « l'“ajout
 * ponctuel” du lot a7f5f968 est remplacé par ce mécanisme d'exception ».
 *
 * 🔴 CE QU'ILS NOMMAIENT N'EXISTE PLUS : les garder aurait laissé, dans le vocabulaire du module, deux mots que
 * plus aucun écran n'écrit — et c'est ainsi qu'on finit par rouvrir un chemin qu'on croyait fermé. Les LIENS déjà
 * posés en ajout ponctuel, eux, sont intacts : ils gardent `MOTIF_AJOUT_PONCTUEL` et s'affichent toujours comme
 * des biens du mail, avec leur mention `MENTION_AJOUT_PONCTUEL` (ci-dessous).
 */

/**
 * ══ 🔴🔴 LE MOTIF D'UN AJOUT PONCTUEL — ET C'EST LUI QUI GARANTIT LA PROMESSE D'ARNO ═════════════════════════════
 *
 * RÈGLE D'ARNO : « ce rattachement ponctuel n'a AUCUNE influence sur les fenêtres de suivi : aucune période
 * créée, modifiée ou fermée, aucun repère “À partir d'ici”, aucun effet sur les mails suivants ni précédents. »
 *
 * 🔴 LA PROMESSE NE TIENT PAS À UNE INTENTION, ELLE TIENT À DEUX FAITS DU CODE :
 *   ① le geste POSE UN LIEN, et rien d'autre : il n'écrit ni période ni exception, donc il n'y a rien qui
 *      puisse produire un repère ni déplacer une fenêtre ;
 *   ② `projeterLeFil` NE RETIRE QUE CE QU'ELLE A POSÉ ELLE-MÊME (`motif = MOTIF_POSE_PAR_SUIVI`). Un lien portant
 *      CE motif-ci n'est donc jamais touché par une projection — ni défait au prochain geste de suivi.
 *
 * ⚠️ IL EST DISTINCT DE « rattaché à la main » À DESSEIN : c'est lui qui permet d'ÉCRIRE « ajout ponctuel » sur
 * la carte. Un motif partagé aurait fait porter la mention à des liens qui ne sont pas ponctuels du tout.
 */
export const MOTIF_AJOUT_PONCTUEL = 'ajout ponctuel à ce mail';
export const MENTION_AJOUT_PONCTUEL = 'ajout ponctuel';

/** Ce qu'il faut savoir d'un lien pour décider s'il rattache CE mail. */
export interface LienDuMail {
  id: number;
  messageId: number;
  statut: string;
  motif?: string | null;
}

/**
 * ══ 🔴🔴 LES BIENS RATTACHÉS À **CE** MAIL. PUR. ═════════════════════════════════════════════════════════════════
 *
 * Deux conditions, et il faut les deux :
 *   ① le lien porte sur CE mail — c'est la demande littérale d'Arno ;
 *   ② il est CONFIRMÉ. Un lien `propose` est une proposition du moteur, pas un rattachement : c'est précisément
 *      ce qui produisait les cartes « À trancher » qu'Arno ne comprenait pas. Un lien `retire` est, lui, mort.
 *
 * ⚠️ `nbMails` ET `lienIds` SONT RECALCULÉS SUR CE SEUL MAIL : sans cela, la carte annoncerait « sur 6 mails de
 * la conversation » dans une fenêtre qui ne parle que d'un, et « Voir le détail par mail » montrerait les autres.
 *
 * ⚠️ LE `statut` DE LA CARTE EST RECALCULÉ LUI AUSSI, sur les seuls liens retenus : une carte ne peut plus être
 * « À trancher » ici, par construction, et c'est ce qu'on veut lire.
 */
export function biensDuMail<T extends {
  lienIds: number[]; nbMails: number; statut: BienRattache['statut'];
}>(
  biens: readonly T[], liens: readonly LienDuMail[], messageId: number,
): (T & { ponctuel: boolean })[] {
  const retenus = new Map(liens
    .filter((l) => l.messageId === messageId && l.statut === 'confirme')
    .map((l) => [l.id, l]));
  const sortie: (T & { ponctuel: boolean })[] = [];
  for (const b of biens) {
    const siens = b.lienIds.filter((id) => retenus.has(id));
    if (siens.length === 0) continue;
    sortie.push({
      ...b,
      lienIds: siens,
      nbMails: 1,
      /* 🔴 PLUS JAMAIS « À trancher » DANS CETTE FENÊTRE : seuls des liens confirmés y entrent. */
      statut: siens.some((id) => (retenus.get(id)?.motif ?? '') === MOTIF_AJOUT_PONCTUEL) ? 'classe' : b.statut,
      /**
       * 🔴 « Il est marqué “ajout ponctuel” dans la fenêtre » (Arno). Un bien n'est ponctuel que si TOUS ses
       * liens sur ce mail le sont : un bien rattaché par le suivi ET réajouté ponctuellement reste un bien de
       * la conversation, et l'annoncer comme ponctuel ferait croire qu'il s'en ira tout seul.
       */
      ponctuel: siens.length > 0
        && siens.every((id) => (retenus.get(id)?.motif ?? '') === MOTIF_AJOUT_PONCTUEL),
    });
  }
  return sortie;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT VISUALISER-UNIFIE-ET-BROUILLON-EN-HAUT, POINT 2 — UNE SEULE FENÊTRE, QUEL QUE SOIT LE POINT D'ENTRÉE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   CONSTAT D'ARNO (03/10/2026) : « depuis la LIGNE de la Réception (fil 3490), la fenêtre “Bien(s) de cet échange”
   affiche encore tous les biens proposés pour l'expéditeur (lots 247, 282, 169, 491, 4 — “À trancher”). Le lot
   a7f5f968 n'a corrigé que la fenêtre ouverte depuis un mail. »

   🔴 LA CAUSE, EN UNE LIGNE DE CODE : la fenêtre avait DEUX comportements selon qu'on lui donnait un mail ou non.
   Ouverte depuis une ligne de liste, elle rendait `fiche.biens` tel quel — c'est-à-dire les liens PROPOSÉS du
   moteur avec les liens confirmés. Corriger un seul des deux chemins ne pouvait pas suffire : il fallait qu'il
   n'y en ait plus qu'un.

   RÈGLE D'ARNO :
     · une SEULE fenêtre, quel que soit le point d'entrée (ligne de liste dans tous les dossiers, recherche, ligne
       de mail dans la conversation, mail ouvert) ;
     · elle porte sur UN mail précis : le mail cliqué, ou depuis une ligne de liste LE MAIL AFFICHÉ SUR LA LIGNE
       (le plus récent de l'échange). En tête : expéditeur, date, objet de ce mail ;
     · elle n'affiche QUE les biens rattachés officiellement à ce mail (lien vivant confirmé), avec leurs parties.
       JAMAIS les propositions ni les cartes « À trancher ».

   🔴 CE QUE CELA SUPPRIME DÉFINITIVEMENT : la notion de « biens de l'échange ». Un rattachement se pose sur un
   MAIL (convention du lot RATTACHEMENT-1) ; « les biens de l'échange » était une somme, et une somme ne se
   modifie pas. C'est d'ailleurs ce qui rendait l'ancienne fenêtre impossible à corriger à moitié.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** L'en-tête de la fenêtre : de quel mail elle parle. Rien de plus que ce qu'il faut pour le reconnaître. */
export interface EnTeteMailFenetre {
  messageId: number;
  de: string;
  deNom: string | null;
  recuLe: string;
  objet: string | null;
}

/** Le grand bouton, et le lien qui lui fait pendant. Écrits ici, lus par l'écran — jamais recopiés. */
export const MOT_MODIFIER_BIENS_DU_MAIL = 'Modifier les biens rattachés à ce mail';
export const MOT_CHANGER_REGLE_SUIVI =
  'Changer plutôt la règle de suivi de la conversation à partir de ce mail';

/**
 * ══ 🔴🔴 L'ENCADRÉ QUI DIT CE QUE « VALIDER » VA FAIRE ═══════════════════════════════════════════════════════════
 *
 * Mot pour mot la demande d'Arno : « un encadré clair : “Ce changement ne concerne que ce mail (exception). La
 * règle de suivi de la conversation reste inchangée pour les autres mails.” »
 *
 * 🔴 IL EST ÉCRIT AVANT LE GESTE, PAS APRÈS. C'est la règle de la maison (« personne ne doit découvrir l'effet
 * après coup ») et c'est d'autant plus vrai ici : la différence entre une exception et une règle de suivi ne se
 * voit pas à l'écran une fois le geste fait — elle se voit trois mails plus loin.
 */
/**
 * Le titre de la zone des propositions du panneau. Écrit ici, lu par l'écran — jamais recopié d'un composant à
 * l'autre.
 */
export const ZONE_AUTRES_PROPOSES = 'Autres biens proposés';

/**
 * ══ ⚠️ CE TITRE NE S'AFFICHE PLUS NULLE PART, ET C'EST VOULU (LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS) ═══════════
 *
 * DÉCISION D'ARNO (03/10/2026) : « supprime la zone “Bien(s) déjà rattaché(s) à ce mail” du panneau de
 * modification : elle répète les cartes du haut. » La décision se prend désormais SUR la carte, par une case —
 * là où le bien est décrit, avec son adresse, son lot et ses personnes.
 *
 * 🔴 IL RESTE EXPORTÉ POUR UNE SEULE RAISON : une épreuve vérifie qu'il n'apparaît PLUS à l'écran. Un garde qui
 * recopierait la phrase cesserait de garder quoi que ce soit le jour où quelqu'un la reformulerait.
 */
export const ZONE_DEJA_RATTACHES = 'Bien(s) déjà rattaché(s) à ce mail';

export const ENCADRE_EXCEPTION_CE_MAIL =
  'Ce changement ne concerne que ce mail (exception). La règle de suivi de la conversation reste inchangée pour '
  + 'les autres mails.';

/**
 * ══ CE QUE LA MODIFICATION VA ÉCRIRE, EN UNE PHRASE. PUR. ════════════════════════════════════════════════════════
 *
 * 🔴🔴 « AUCUN CHANGEMENT » EST UNE RÉPONSE, et la plus importante des trois. Arno : « un retour à la
 * configuration de la fenêtre en vigueur SUPPRIME l'exception (règle du dernier choix, rien d'écrit) ». L'écran
 * doit donc pouvoir dire « rien ne sera écrit » — sans quoi on cliquerait « Valider » en croyant poser quelque
 * chose.
 *
 * ⚠️ ON COMPTE LES DEUX SENS : ajoutés ET retirés. Une modification qui n'annoncerait que les ajouts cacherait
 * exactement la moitié du geste — et c'est la moitié qui défait.
 */
export function resumeModificationBiens(o: {
  avant: readonly string[];
  apres: readonly string[];
}): string {
  const avant = new Set(o.avant);
  const apres = new Set(o.apres);
  const ajoutes = [...apres].filter((c) => !avant.has(c)).length;
  const retires = [...avant].filter((c) => !apres.has(c)).length;
  if (ajoutes === 0 && retires === 0) return 'Aucun changement : rien ne sera écrit.';
  const bouts: string[] = [];
  if (ajoutes > 0) bouts.push(`${ajoutes} bien${ajoutes > 1 ? 's' : ''} ajouté${ajoutes > 1 ? 's' : ''}`);
  if (retires > 0) bouts.push(`${retires} bien${retires > 1 ? 's' : ''} retiré${retires > 1 ? 's' : ''}`);
  return `${bouts.join(', ')} sur ce mail.`;
}

/**
 * ══ L'EN-TÊTE DE LA FENÊTRE, ÉCRIT. PUR. ═════════════════════════════════════════════════════════════════════════
 *
 * « En tête : expéditeur, date, objet de ce mail » (Arno). Trois faits, dans cet ordre : on ouvre cette fenêtre
 * pour savoir de quel mail on parle, et c'est l'expéditeur qu'on reconnaît en premier.
 *
 * ⚠️ UN OBJET VIDE SE DIT, il ne se saute pas : une fenêtre qui n'affiche rien à cette place laisse croire
 * qu'elle n'a pas fini de charger.
 */
export function motEnTeteMail(e: EnTeteMailFenetre, dateEcrite: string): string {
  const qui = (e.deNom ?? '').trim() === '' ? e.de : (e.deNom as string);
  return `${qui} · ${dateEcrite} · ${(e.objet ?? '').trim() === '' ? '(sans objet)' : (e.objet as string)}`;
}
