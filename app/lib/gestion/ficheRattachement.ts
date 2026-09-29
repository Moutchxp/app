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
export interface CoordonneeFiche { valeur: string; affichage: string; libelle: string }

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
  const id = (dossierId ?? '').trim();
  return id === '' ? null : `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;
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

/**
 * LE TITRE DE LA FENÊTRE : l'objet, et le nombre de mails. PUR.
 *
 * ⚠️ « N mails dans la conversation » AU PLURIEL EXACT : « 1 mails » se lit comme un bogue, et fait douter du
 * reste de la fenêtre.
 */
export function motNbMails(n: number): string {
  return n <= 1 ? '1 mail dans la conversation' : `${n} mails dans la conversation`;
}
