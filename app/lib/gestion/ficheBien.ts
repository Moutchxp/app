/**
 * MODULE « GESTION » — LOT FICHE-PROPOSITION : COMMENT S'ÉCRIT LA FICHE D'UN BIEN PROPOSÉ. Module PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE CE FICHIER DÉCIDE, ET POURQUOI IL EST PUR. Une proposition de classement ne sert à rien si, pour agir,
 * il faut rouvrir WIPPIMMO dans un autre onglet : on classe un mail EN SACHANT de quel logement il parle, qui en
 * est le propriétaire et qui l'occupe. Toute la question est donc « qu'affiche-t-on, dans quel ordre, et sous quel
 * mot » — un calcul sans base ni écran, qui s'éprouve ligne à ligne.
 *
 * 🔴🔴 RIEN N'EST INVENTÉ. Demande d'Arno, mot pour mot : « affiche tout ce qui existe en base, rien d'inventé ;
 * un champ vide n'est pas affiché ». Ce que l'import WIPPIMMO porte RÉELLEMENT pour un lot, mesuré le 28/09/2026
 * sur les 365 lots en gestion :
 *   · `immeuble`      (360/365) — le bâtiment ;
 *   · `nature`        (365/365) — Appartement · Appartement meublé · Maison · Box · Garage · Parking ·
 *                                 Local commercial · « A renseigner ». C'est LUI qui dit meublé ou non ;
 *   · `type_bien`     (327/365) — Studio · Type 1 … Type 8 · Garage. C'est LUI qui dit le nombre de pièces ;
 *   · `adresse`, `code_postal`, `commune` (365/365) ;
 *   · `gestion_debut` (365/365), `gestion_fin` (0/365 — aucun lot sorti de gestion à ce jour).
 *
 * ⚠️ LA SURFACE, L'ÉTAGE ET LES ANNEXES NE SONT PAS DANS L'IMPORT. Ils ne sont donc affichés nulle part, et ce
 * fichier ne les invente pas — pas même sous une forme « inconnu », qui laisserait croire qu'on a cherché. Le jour
 * où l'import les apportera, la seule chose à faire sera d'ajouter une ligne à `CARACTERISTIQUES`.
 *
 * ⚠️ « A renseigner » EST UNE VALEUR DE L'IMPORT, PAS UNE VALEUR UTILE. WIPPIMMO l'écrit quand la nature n'a pas
 * été saisie : l'afficher remplirait la fiche d'un mot qui ne dit rien. On la traite comme un champ vide.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * 🔴 LOT CONTACTS-ET-EVENEMENT — UNE COORDONNÉE, ET LE LIBELLÉ DE SA COLONNE D'ORIGINE.
 *
 * Le constat d'Arno (fil 36488, lot 494) : sous « MARS AVENIR », deux téléphones et deux e-mails en vrac, sans
 * qu'on puisse savoir à qui appartenait chacun. La reconnaissance des exports a établi que l'export NE PERMET PAS
 * de le savoir — une seule personne par ligne, des cellules à plusieurs valeurs, et un ordre qui s'inverse d'une
 * colonne à l'autre. On n'invente donc aucune attribution : on écrit d'où sort chaque valeur.
 */
export interface Coordonnee {
  /** La forme CANONIQUE (`+33659088256`). C'est elle qu'on compare, jamais ce qui est affiché. */
  valeur: string;
  /**
   * 🔴 LOT FICHES-RETOUCHES — CE QU'ON MONTRE : « 06 59 08 82 56 ». AJOUTÉ, rien n'est retiré : `valeur` reste la
   * forme canonique, et c'est toujours elle qui sert aux comparaisons et au lien `tel:`. Les deux doivent
   * coexister — afficher la canonique donnait « +33659088256 », qu'on ne sait pas lire à voix haute.
   */
  affichage: string;
  /** « Mobile 1 », « Email 2 », « Télécoms »… JAMAIS vide : voir `libelleContact` dans `annuaire.ts`. */
  libelle: string;
}

/** Une personne de l'annuaire, avec ses moyens de contact. Le même objet pour un propriétaire et un locataire. */
export interface PersonneFiche {
  role: 'proprietaire' | 'locataire';
  /** La clé WIPPIMMO : la seule identité qui survive à un ré-import de l'annuaire. */
  cle: string;
  nom: string;
  /**
   * 🔴 LA CIVILITÉ, quand l'export la donne. « Sté » y désigne une SOCIÉTÉ : la carte porte alors la mention
   * « Société » au lieu d'un prénom qui n'existe pas.
   */
  civilite?: string | null;
  /** Dans l'ordre de l'import (`rang`) : la première adresse est celle que WIPPIMMO donne en premier. */
  emails: Coordonnee[];
  telephones: Coordonnee[];
  /** Renseignés pour un locataire : la période d'occupation qui couvre la date du mail. */
  depuis?: string | null;
  jusqua?: string | null;
}

/**
 * LE TITRE D'UNE CARTE DE PERSONNE. PUR.
 *
 * 🔴 UNE SOCIÉTÉ EST DITE COMME TELLE. L'export marque `Civilité = « Sté »` : sans cette mention, « MARS AVENIR »
 * se lit comme un patronyme, et l'on cherche un prénom qui n'existera jamais. La raison sociale reste le titre —
 * c'est le nom sous lequel on l'appelle — et « Société » la qualifie.
 *
 * ⚠️ LE NOM N'EST JAMAIS RECOMPOSÉ ICI. `nom_complet` porte déjà « NOM Prénom » tel que l'import l'a écrit, et
 * c'est la forme que WIPPIMMO emploie partout : la réécrire ferait diverger l'écran de l'annuaire.
 */
export function titreCarte(p: Pick<PersonneFiche, 'nom' | 'civilite'>): { nom: string; qualite: string | null } {
  const civ = (p.civilite ?? '').trim();
  const societe = /^st[ée]?\.?$/i.test(civ) || /^soci[ée]t[ée]$/i.test(civ) || /^s\.?a\.?r\.?l\.?$/i.test(civ);
  return { nom: p.nom, qualite: societe ? 'Société' : (civ === '' ? null : civ) };
}

/** Une caractéristique de lot, telle qu'elle s'affiche : un intitulé, une valeur. */
export interface CaracteristiqueLot { libelle: string; valeur: string }

/** Ce qu'un lot porte, réduit aux colonnes que l'import remplit vraiment. */
export interface LotFiche {
  cle: string;
  adresse: string | null;
  codePostal: string | null;
  commune: string | null;
  immeuble: string | null;
  nature: string | null;
  typeBien: string | null;
  gestionDebut: string | null;
  gestionFin: string | null;
}

/** Une valeur vide, ou le mot que WIPPIMMO écrit quand rien n'a été saisi. PUR. */
export function valeurVide(v: string | null | undefined): boolean {
  const t = (v ?? '').trim();
  return t === '' || t.toLowerCase() === 'a renseigner' || t.toLowerCase() === 'à renseigner';
}

/**
 * L'ADRESSE COMPLÈTE d'un lot : voie, code postal, commune. PUR.
 *
 * ⚠️ LE CODE POSTAL ÉTAIT ABSENT de l'ancien libellé (« 22 Boulevard Richard Wallace, PUTEAUX »). Il est ici parce
 * qu'on copie parfois cette adresse dans un courrier, et qu'une adresse sans code postal n'est pas une adresse.
 */
export function adresseComplete(l: Pick<LotFiche, 'adresse' | 'codePostal' | 'commune'>): string {
  const ville = [l.codePostal, l.commune].map((x) => (x ?? '').trim()).filter((x) => x !== '').join(' ');
  return [(l.adresse ?? '').trim(), ville].filter((x) => x !== '').join(', ');
}

/**
 * 🔴 LES CARACTÉRISTIQUES DU LOT, dans l'ordre d'affichage. PUR.
 *
 * L'ORDRE VA DU PLUS PARLANT AU PLUS ADMINISTRATIF : ce qu'est le bien, puis sa taille, puis son bâtiment, puis
 * depuis quand nous le gérons. C'est l'ordre dans lequel on se les pose en classant un mail.
 *
 * ⚠️ UN CHAMP VIDE N'EST PAS AFFICHÉ — pas même avec un tiret. Une fiche pleine de tirets se lit « on ne sait
 * rien », alors qu'on sait simplement autre chose.
 *
 * ⚠️ LE BÂTIMENT N'EST PAS RÉPÉTÉ QUAND IL EST L'ADRESSE. Dans l'import, `immeuble` vaut très souvent exactement
 * l'adresse du lot (« 22 Boulevard Richard Wallace ») : l'écrire deux fois ferait croire à deux informations.
 */
export function caracteristiquesDuLot(l: LotFiche): CaracteristiqueLot[] {
  const out: CaracteristiqueLot[] = [];
  const ajouter = (libelle: string, valeur: string | null | undefined): void => {
    if (!valeurVide(valeur)) out.push({ libelle, valeur: (valeur as string).trim() });
  };

  // `nature` dit la nature ET le meublé (« Appartement meublé ») : c'est l'import qui les réunit, pas nous.
  ajouter('Nature', l.nature);
  // `type_bien` dit le nombre de pièces (« Type 4 ») ou la taille (« Studio »).
  ajouter('Type', l.typeBien);
  const memeQueAdresse = (l.immeuble ?? '').trim().toLowerCase() === (l.adresse ?? '').trim().toLowerCase();
  if (!memeQueAdresse) ajouter('Bâtiment', l.immeuble);
  ajouter('En gestion depuis', dateFr(l.gestionDebut));
  ajouter('Gestion terminée le', dateFr(l.gestionFin));
  return out;
}

/** Une date ISO écrite à la française, ou `null`. PUR. */
export function dateFr(iso: string | null | undefined): string | null {
  const t = (iso ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(t)) return null;
  const [a, m, j] = t.slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
}

/**
 * LA PÉRIODE D'OCCUPATION d'un locataire, écrite en toutes lettres. PUR.
 *
 * ⚠️ « DEPUIS LE … » SANS DATE DE SORTIE NE VEUT PAS DIRE « POUR TOUJOURS » : cela veut dire qu'aucune sortie n'est
 * enregistrée. On écrit donc « depuis le 19/05/2025 », et rien de plus — ajouter « toujours en place » serait une
 * conclusion que la base ne porte pas.
 */
export function periodeOccupation(depuis: string | null | undefined, jusqua: string | null | undefined): string | null {
  const d = dateFr(depuis);
  const f = dateFr(jusqua);
  if (d === null && f === null) return null;
  if (d !== null && f !== null) return `du ${d} au ${f}`;
  return d !== null ? `depuis le ${d}` : `jusqu’au ${f}`;
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES GROUPES DE PROPRIÉTAIRES
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Ce qu'il faut savoir d'un bien pour le grouper. Volontairement minimal : ce module ne connaît pas la base. */
export interface BienGroupable {
  cle: string;
  parties: readonly PersonneFiche[];
}

export interface GroupeProprietaire<T extends BienGroupable> {
  /** La clé du propriétaire, ou `''` quand le bien n'en a aucun à l'annuaire. */
  cle: string;
  /**
   * 🔴 LES PERSONNES DU GROUPE — une CARTE par personne. L'annuaire ne porte aujourd'hui qu'un enregistrement par
   * propriétaire, même pour une indivision (« MOTTAIS GRAINDORGE Didier et Sandrine » est UNE ligne, mesuré le
   * 28/09/2026 : 81 lots sur 365 ont un nom de ce genre). On rend donc une carte par ENREGISTREMENT, et on ne
   * découpe JAMAIS le nom en deux : « Didier et Sandrine » partagent un téléphone et deux adresses e-mail, et
   * deviner laquelle est à qui fabriquerait deux fiches fausses au lieu d'une fiche vraie.
   */
  personnes: PersonneFiche[];
  biens: T[];
}

/**
 * 🔴 LES BIENS PROPOSÉS, GROUPÉS PAR PROPRIÉTAIRE. PUR.
 *
 * Demande d'Arno : « s'il y a plusieurs propriétaires candidats (plusieurs biens de propriétaires différents), un
 * bloc propriétaire par groupe de biens ». C'est le cas d'un mail qui cite deux logements de deux bailleurs :
 * poser un seul bandeau « propriétaire » en tête ferait croire que les deux biens sont à la même personne.
 *
 * ⚠️ L'ORDRE DES GROUPES SUIT L'ORDRE DES BIENS, qui est déjà celui de la certitude (le plus sûr en tête). Trier
 * par nom de propriétaire remonterait un bailleur secondaire au-dessus du bien quasi certain.
 */
export function groupesParProprietaire<T extends BienGroupable>(
  biens: readonly T[],
): GroupeProprietaire<T>[] {
  const groupes: GroupeProprietaire<T>[] = [];
  const index = new Map<string, GroupeProprietaire<T>>();

  for (const b of biens) {
    const proprios = b.parties.filter((p) => p.role === 'proprietaire');
    // Un bien sans propriétaire connu forme son propre groupe, sous la clé vide : on ne le range pas ailleurs.
    const cle = proprios.map((p) => p.cle).join('|');
    const deja = index.get(cle);
    if (deja !== undefined) { deja.biens.push(b); continue; }
    const g: GroupeProprietaire<T> = { cle, personnes: [...proprios], biens: [b] };
    index.set(cle, g);
    groupes.push(g);
  }
  return groupes;
}

/** Les locataires d'un bien, à la date du mail. Vide = vacant, et l'écran le DIT. PUR. */
export function locatairesDuBien(b: BienGroupable): PersonneFiche[] {
  return b.parties.filter((p) => p.role === 'locataire');
}

/**
 * LE LIEN « appeler » d'un numéro de téléphone, ou `null` si le numéro n'en est pas un. PUR.
 *
 * ⚠️ ON NE GARDE QUE LES CHIFFRES ET LE « + » DE TÊTE. Les numéros de l'import s'écrivent « +33684318116 » aussi
 * bien que « 06 84 31 81 16 » : un `tel:` qui porterait les espaces ne serait pas composé par tous les téléphones.
 */
export function lienTelephone(numero: string): string | null {
  const brut = (numero ?? '').trim();
  const plus = brut.startsWith('+');
  const chiffres = brut.replace(/\D/g, '');
  if (chiffres.length < 6) return null;
  return `tel:${plus ? '+' : ''}${chiffres}`;
}
