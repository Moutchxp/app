/**
 * ══ 🔴🔴 LOT TACHES-1-BIS — LES CONTACTS D'UNE TÂCHE : LA RÈGLE UNIQUE ═══════════════════════════════════════════
 *
 * DEMANDE D'ARNO (13/10/2026) : « choisir un ou plusieurs contacts liés à la fiche du bien […] ; leurs coordonnées
 * intégrées directement au texte de la tâche. Texte de la tâche = la note libre + un bloc “Contacts” généré
 * automatiquement […]. La note libre reste entièrement modifiable. Le bloc “Contacts” est régénéré quand on coche
 * ou décoche, sans jamais toucher à la note libre. »
 *
 * 🔴 LA NOTE ET LE BLOC SONT DEUX CHOSES, ET C'EST CE QUI REND LA PROMESSE TENABLE : la note est un champ que la
 * personne écrit ; le bloc est CALCULÉ à partir des contacts cochés (`blocContacts`). Cocher ou décocher ne peut donc
 * pas toucher la note — elle n'est même pas lue. Le texte complet (`texteCompletTache`) les met bout à bout ; c'est
 * lui qui servira de description à l'événement Google au lot 2.
 *
 * 🔴 LES FAMILLES SONT CELLES DU BLOC PARTIES, AVEC SES COULEURS : la couleur n'est pas choisie ici, l'écran la
 * demande à `tonDuGroupe` (historiqueBien.ts), la source unique. Seul le MOT de la famille est propre à la tâche
 * (« Locataire en place », parce que les anciens y sont une famille à part, avec leur violet).
 *
 * PUR : aucune base, aucun réseau, aucun écran. Chargeable dans le navigateur.
 */

export type FamilleContact =
  | 'proprietaire' | 'locataire' | 'ancien_locataire' | 'syndic_immeuble' | 'independant' | 'a_repartir';

/** L'ordre du bloc PARTIES, les anciens locataires juste après ceux en place. */
export const ORDRE_FAMILLES: readonly FamilleContact[] =
  ['proprietaire', 'locataire', 'ancien_locataire', 'syndic_immeuble', 'independant', 'a_repartir'];

export const MOT_FAMILLE: Record<FamilleContact, string> = {
  proprietaire: 'Propriétaire',
  locataire: 'Locataire en place',
  ancien_locataire: 'Ancien locataire',
  syndic_immeuble: 'Syndic & immeuble',
  independant: 'Tiers indépendant',
  a_repartir: 'Non affectés',
};

export function estFamille(x: unknown): x is FamilleContact {
  return typeof x === 'string' && (ORDRE_FAMILLES as readonly string[]).includes(x);
}

/** Une coordonnée, avec son libellé (« Portable », « Ligne directe », « Standard »…). */
export interface CoordonneeContact {
  sorte: 'telephone' | 'email';
  /** Le libellé lu dans la fiche ; `null` ⇒ « Téléphone » ou « E-mail ». */
  libelle: string | null;
  /** La valeur brute — ce qu'on compose ou à qui l'on écrit. */
  valeur: string;
  /** Ce qui s'affiche (« 06 12 34 56 78 ») ; `null` ⇒ la valeur. */
  affichage: string | null;
}

/** Un contact du bien, tel que la fiche le montre AUJOURD'HUI. */
export interface ContactSource {
  /** Clé STABLE (« proprietaire:12 », « carte:77 », « adresse:x@y.fr »…). */
  cle: string;
  famille: FamilleContact;
  nom: string;
  /** Qualité ou fonction (« Gérant », « Gardien », « Responsable de copropriété »…). */
  qualite: string | null;
  /** Le cabinet, pour un contact du syndic. */
  organisation: string | null;
  /** Une adresse postale (celle du cabinet pour le syndic). */
  adresse: string | null;
  coordonnees: CoordonneeContact[];
}

/** Un contact COPIÉ dans une tâche : la copie, et sa date. */
export interface ContactTache extends ContactSource {
  copieLe: string;
}

const net = (x: string | null | undefined): string => (x ?? '').trim();

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LE BLOC « CONTACTS »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export const TITRE_BLOC_CONTACTS = 'Contacts';

/** Le libellé d'une coordonnée : celui de la fiche, sinon le mot générique. PUR. */
export function libelleCoordonnee(c: CoordonneeContact): string {
  return net(c.libelle) || (c.sorte === 'email' ? 'E-mail' : 'Téléphone');
}

/** « Nom · Famille · Qualité », puis une ligne par coordonnée, puis le cabinet et l'adresse. PUR. */
export function lignesContact(c: ContactSource): string[] {
  const tete = [net(c.nom), MOT_FAMILLE[c.famille], net(c.qualite)].filter((x) => x !== '').join(' · ');
  const out = [`— ${tete}`];
  if (net(c.organisation) !== '') out.push(`  Cabinet : ${net(c.organisation)}`);
  for (const k of c.coordonnees) out.push(`  ${libelleCoordonnee(k)} : ${net(k.affichage) || net(k.valeur)}`);
  if (net(c.adresse) !== '') out.push(`  Adresse : ${net(c.adresse)}`);
  return out;
}

/** Le bloc « Contacts », dans l'ordre des familles puis l'ordre reçu. Vide quand aucun contact. PUR. */
export function blocContacts(contacts: readonly ContactSource[]): string {
  if (contacts.length === 0) return '';
  const tries = ordonnerContacts(contacts);
  return [TITRE_BLOC_CONTACTS, ...tries.flatMap((c) => lignesContact(c))].join('\n');
}

/** Le texte COMPLET de la tâche : la note libre, puis le bloc. La note n'est jamais modifiée. PUR. */
export function texteCompletTache(note: string | null, contacts: readonly ContactSource[]): string {
  const n = (note ?? '').replace(/\s+$/, '');
  const b = blocContacts(contacts);
  if (b === '') return n;
  return n === '' ? b : `${n}\n\n${b}`;
}

/** Les contacts dans l'ordre des familles du bloc PARTIES ; à famille égale, l'ordre reçu. PUR. */
export function ordonnerContacts<T extends Pick<ContactSource, 'famille'>>(contacts: readonly T[]): T[] {
  return contacts.map((c, i) => ({ c, i }))
    .sort((a, b) => ORDRE_FAMILLES.indexOf(a.c.famille) - ORDRE_FAMILLES.indexOf(b.c.famille) || a.i - b.i)
    .map((x) => x.c);
}

/** Les contacts groupés par famille, familles vides omises, dans l'ordre. PUR. */
export function grouperParFamille<T extends Pick<ContactSource, 'famille'>>(contacts: readonly T[]): { famille: FamilleContact; contacts: T[] }[] {
  return ORDRE_FAMILLES
    .map((famille) => ({ famille, contacts: contacts.filter((c) => c.famille === famille) }))
    .filter((g) => g.contacts.length > 0);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LA COPIE DATÉE : « COORDONNÉES MODIFIÉES DEPUIS »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * L'EMPREINTE de ce qu'un contact dit : nom, qualité, cabinet, adresse et coordonnées (sorte, libellé, valeur).
 * L'ordre des coordonnées compte peu : on les trie. Les espaces et la casse des e-mails non plus. PUR.
 */
export function empreinteContact(c: ContactSource): string {
  const coords = c.coordonnees
    .map((k) => `${k.sorte}|${net(k.libelle).toLowerCase()}|${k.sorte === 'email' ? net(k.valeur).toLowerCase() : net(k.valeur).replace(/[^\d+]/g, '')}`)
    .sort();
  return JSON.stringify([net(c.nom), net(c.qualite), net(c.organisation), net(c.adresse), coords]);
}

export type EtatCopie =
  /** La fiche dit la même chose que la copie. */
  | 'a_jour'
  /** La fiche a changé depuis la copie : « Coordonnées modifiées depuis » + « Mettre à jour ». */
  | 'modifie'
  /** Le contact n'est plus lié au bien (syndic changé, locataire sorti…) : la copie reste telle quelle. */
  | 'plus_lie';

/** Où en est la copie d'un contact par rapport à la fiche d'aujourd'hui. PUR. */
export function etatCopie(copie: ContactSource, sources: readonly ContactSource[]): EtatCopie {
  const s = sources.find((x) => x.cle === copie.cle);
  if (s === undefined) return 'plus_lie';
  return empreinteContact(s) === empreinteContact(copie) ? 'a_jour' : 'modifie';
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LA RECHERCHE, AU-DELÀ DE 8 CONTACTS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Arno : « un petit champ de recherche si la liste dépasse 8 contacts ». */
export const SEUIL_RECHERCHE_CONTACTS = 8;

const plier = (x: string): string => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Les contacts dont le nom, la famille, la qualité, le cabinet ou une coordonnée contient le texte. PUR. */
export function chercherContacts<T extends ContactSource>(contacts: readonly T[], texte: string): T[] {
  const q = plier(texte.trim());
  if (q === '') return [...contacts];
  return contacts.filter((c) => plier([
    c.nom, MOT_FAMILLE[c.famille], c.qualite ?? '', c.organisation ?? '',
    ...c.coordonnees.map((k) => `${k.valeur} ${k.affichage ?? ''}`),
  ].join(' ')).includes(q));
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ CE QUI VIENT DU NAVIGATEUR
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Les clés de contacts envoyées par l'écran, nettoyées ; `undefined` ⇒ « ne pas toucher aux contacts ». PUR. */
export function lireClesContacts(brut: unknown): string[] | undefined {
  if (!Array.isArray(brut)) return undefined;
  return [...new Set(brut.filter((x): x is string => typeof x === 'string').map((x) => x.trim())
    .filter((x) => x !== '' && x.length <= 300))].slice(0, 50);
}

/** Relit une liste de coordonnées venue de la base (jsonb) : ce qui n'est pas lisible est ignoré. PUR. */
export function coordonneesLisibles(brut: unknown): CoordonneeContact[] {
  if (!Array.isArray(brut)) return [];
  const out: CoordonneeContact[] = [];
  for (const x of brut as Record<string, unknown>[]) {
    if ((x?.sorte !== 'telephone' && x?.sorte !== 'email') || typeof x.valeur !== 'string' || net(x.valeur) === '') continue;
    out.push({
      sorte: x.sorte, valeur: net(x.valeur),
      libelle: typeof x.libelle === 'string' && net(x.libelle) !== '' ? net(x.libelle) : null,
      affichage: typeof x.affichage === 'string' && net(x.affichage) !== '' ? net(x.affichage) : null,
    });
  }
  return out;
}

/** Le lien « tel: » d'un numéro : chiffres et « + » seulement. PUR. */
export function lienTelephone(valeur: string): string {
  return `tel:${valeur.replace(/[^\d+]/g, '')}`;
}
