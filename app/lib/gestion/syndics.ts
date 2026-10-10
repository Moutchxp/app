import { normaliserTexte } from './annuaire';

/**
 * ══ 🔴🔴 LOT ANNUAIRE-SYNDICS-ET-ENTETE-BIEN, COMMIT 2 — L'ANNUAIRE DES SYNDICS : LES RÈGLES PURES ═══════════════
 * (complété au lot FICHE-SYNDIC-FINITIONS : téléphones par paires, adresse avec code postal et ville, 2ᵉ standard,
 * contacts repliés, copropriétés « 25 rue Edith Cavell, 92400 Courbevoie ».)
 *
 * Module PUR et client-safe : la fiche syndic (écran) et le dépôt (base) lisent les mêmes types et la même
 * validation. Aucune E/S ici.
 *
 * LE MODÈLE (migrations 324 et 325) : un SYNDIC → plusieurs COPROPRIÉTÉS → plusieurs LOTS. Une copropriété est
 * désignée par la clé de son immeuble : la colonne « Immeuble » de l'export WIPPIMMO, normalisée par
 * `normaliserTexte`. Un lot appartient à une copropriété quand son immeuble normalisé vaut cette clé — il n'y a pas
 * de table de liens lot ↔ copropriété, et c'est voulu : un lot ajouté par un ré-import futur reçoit son syndic sans
 * qu'on le lui pose.
 */

export type SorteCoordonnee = 'email' | 'telephone';

/** Les titres proposés ; « Personnalisé » ouvre un champ libre. */
export const TITRES_CONTACT = ['Responsable de copropriété', 'Service comptabilité'] as const;
/** Les libellés proposés pour un TÉLÉPHONE ; « Personnalisé » ouvre un champ libre. */
export const LIBELLES_COORDONNEE = ['Ligne directe', 'Portable', 'Standard'] as const;
/**
 * LOT FICHE-SYNDIC-LIBELLES-ET-ALIGNEMENTS — les libellés proposés pour un E-MAIL (« Ligne directe / Portable /
 * Standard » quittent ce menu, avec l'accord d'Arno). Un e-mail déjà enregistré avec un ancien libellé téléphonique
 * n'est PAS réécrit : il s'ouvre sous « Personnalisé… », avec son texte, modifiable (`choixDe`).
 */
export const LIBELLES_EMAIL = ['Email direct', 'Email service'] as const;

/** Le menu des libellés d'une coordonnée, selon qu'elle est un téléphone ou un e-mail. PUR. */
export function libellesDe(sorte: SorteCoordonnee): readonly string[] {
  return sorte === 'email' ? LIBELLES_EMAIL : LIBELLES_COORDONNEE;
}

export interface CoordonneeSaisie { id?: number | null; sorte: SorteCoordonnee; libelle: string; valeur: string }
export interface ContactSaisi {
  id?: number | null; titre: string; prenom: string; nom: string; coordonnees: CoordonneeSaisie[];
  /** LOT SYNDIC-CONTACT-CIVILITE — « M. », « Mme », ou rien (facultative). */
  civilite?: Civilite | null;
  /** LOT SYNDIC-CONTACT-PARTI — « ne travaille plus ici » : ce contact EXISTANT quitte le catalogue à l'enregistrement. */
  parti?: boolean;
  /** LOT SYNDIC-CONTACT-PARTI — un ancien contact (« parti ») revient au catalogue, sans copropriété. */
  reintegre?: boolean;
  /**
   * LOT SYNDIC-CONTACTS-PAR-COPROPRIETE — les copropriétés que suit le contact : `immeubles` (les CLÉS, `cleImmeuble`).
   * LOT SYNDIC-FIN-TOUS-LES-IMMEUBLES — `tousImmeubles` vrai n'est plus qu'un RACCOURCI de saisie : la validation le
   * remplace par les copropriétés ACTUELLES de la saisie, explicitement, et le remet à faux. Absent ⇒ aucune.
   */
  tousImmeubles: boolean;
  immeubles: string[];
}
/** Un immeuble rattaché : son libellé (l'« Immeuble » de l'export, ou une adresse de la BAN), et sa commune. */
export interface ImmeubleSaisi {
  libelle: string; codePostal: string; commune: string;
  /** LOT COPRO-PLUSIEURS-ADRESSES — les adresses SECONDAIRES de cette copropriété (la principale est `libelle`).
   *  Absent : on n'y touche pas ; liste (même vide) : c'est la liste entière (les absentes sont retirées). */
  adresses?: AdresseSaisie[];
}
/** LOT COPRO-PLUSIEURS-ADRESSES — une adresse (rue, code postal, ville). */
export interface AdresseSaisie { libelle: string; codePostal: string; commune: string }
/** LOT COPRO-PLUSIEURS-ADRESSES — une adresse connue, avec sa clé. */
export interface AdresseConnue { cle: string; libelle: string; codePostal: string | null; commune: string | null }
export interface SyndicSaisi {
  nom: string; adresse: string; codePostal: string; ville: string;
  /** Les numéros sont enregistrés en CHIFFRES (un « + » en tête s'il y en a un) — jamais avec leurs espaces. */
  telephone: string; telephone2: string;
  email: string; note: string;
  contacts: ContactSaisi[];
  immeubles: ImmeubleSaisi[];
  /** LOT SYNDIC-NOTE-PAR-BIEN — la note du couple (ce lot, ce syndic), saisie depuis un bien. Absente ⇒ rien n'y touche. */
  noteBien?: { lotId: number; texte: string } | null;
  /** LOT COPRO-CONTACTS-IMMEUBLE — la liste ENTIÈRE des contacts de l'immeuble du bien (absents ⇒ retirés). Absente ⇒
   *  rien n'y touche (la liste n'a pas été lue). */
  contactsImmeuble?: { immeuble: string; contacts: ContactImmeubleSaisi[] } | null;
  /** LOT COPRO-PARCELLE-ALERTE-UNIQUE — les copropriétés (clés) pour lesquelles l'alerte « autres adresses » a été
   *  montrée : elle ne le sera plus. */
  alerteParcelle?: string[];
  /** LOT COPRO-PARCELLE-ALERTE-UNIQUE-ET-CONFLIT-SYNDICS — confirmées distinctes malgré une autre copropriété, d'un
   *  AUTRE syndic, sur la même parcelle : (la copropriété de la saisie, l'autre adresse, la parcelle). */
  conflitsParcelle?: Array<{ immeuble: string; autre: string; parcelle: string }>;
  /** LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — l'écran a fait CONFIRMER les e-mails / téléphones déjà utilisés.
   *  Absent : le serveur renvoie l'avertissement et n'écrit rien. */
  confirmeDoublons?: boolean;
}

/** LOT COPRO-CONTACTS-IMMEUBLE — les catégories d'un contact d'immeuble, en base. */
export type CategorieImmeuble = 'gardien' | 'conseil_syndical' | 'personnalise';
/** LOT COPRO-CONTACTS-IMMEUBLE — un contact PROPRE à l'immeuble (gardien, conseil syndical…), indépendant du syndic. */
export interface ContactImmeubleSaisi {
  id: number | null; categorie: CategorieImmeuble; libelle: string; civilite: Civilite | null;
  prenom: string; nom: string; note: string; coordonnees: CoordonneeSaisie[];
}
/** LOT COPRO-CONTACTS-IMMEUBLE — tel que le serveur le relit. */
export interface ContactImmeubleLu {
  id: number; categorie: CategorieImmeuble; libelle: string | null; civilite: Civilite | null;
  prenom: string | null; nom: string | null; note: string | null;
  coordonnees: Array<{ id: number; sorte: SorteCoordonnee; libelle: string | null; valeur: string }>;
}

/** Un lot d'une copropriété, tel que l'écran le montre avant de confirmer. */
export interface LotDeCopropriete {
  id: number; numero: string; adresse: string | null; commune: string | null;
  /** LOT SYNDIC-BLOC-PORTEFEUILLE — ses propriétaires (« M. JULLIEN »), et la clé de tri du premier (son nom). */
  proprietaires?: string[]; triProprietaire?: string;
}

/** Un immeuble connu : de l'annuaire (ses lots) et/ou déjà déclaré comme copropriété ; avec son syndic en cours. */
export interface ImmeubleConnu {
  cle: string; libelle: string; codePostal: string | null; commune: string | null; lots: LotDeCopropriete[];
  /** LOT SYNDIC-NOM-VILLE-ET-NOTE-VIDE — la ville du syndic sert à l'afficher « NOM / Ville » (`nomAvecVille`). */
  syndic: { id: number; nom: string; ville?: string | null } | null;
  /** LOT COPRO-PLUSIEURS-ADRESSES — cet immeuble est une adresse SECONDAIRE : la copropriété (son adresse principale)
   *  à laquelle il appartient ; son syndic est alors celui de cette copropriété. */
  principale?: AdresseConnue | null;
  /** LOT COPRO-PLUSIEURS-ADRESSES — pour une copropriété, ses adresses SECONDAIRES en cours. */
  secondaires?: AdresseConnue[];
  /** LOT COPRO-PARCELLE-ALERTE-UNIQUE — l'alerte « autres adresses postales » a déjà été montrée pour sa copropriété. */
  alerteParcelle?: boolean;
  /** LOT COPRO-PARCELLE-ALERTE-UNIQUE-ET-CONFLIT-SYNDICS — les conflits EN COURS de sa copropriété. */
  conflits?: ConflitParcelle[];
}

/** LOT COPRO-PARCELLE-ALERTE-UNIQUE-ET-CONFLIT-SYNDICS — deux copropriétés, de deux syndics, sur une même parcelle. */
export interface ConflitParcelle {
  id: number; parcelle: string | null;
  coproprietes: Array<{ cle: string; adresse: string; syndic: { id: number; nom: string; ville: string | null } }>;
}

/** Une adresse proposée par la Base Adresse Nationale LOCALE (table `adresse_ban`), hors portefeuille. */
export interface AdresseBan { cle: string; libelle: string; codePostal: string | null; commune: string }

export interface SyndicResume {
  id: number; nom: string; email: string | null; telephone: string | null;
  /** LOT SYNDIC-NOM-VILLE-ET-NOTE-VIDE — la ville de son adresse : deux Foncia se distinguent par elle. */
  ville?: string | null;
  nbCoproprietes: number; nbBiens: number;
  /** Tout ce qu'on peut chercher : nom, e-mails (génériques et des contacts), domaines. Déjà normalisé. */
  cherchable: string;
}

export interface FicheSyndic {
  id: number; nom: string; adresse: string | null; codePostal: string | null; ville: string | null;
  telephone: string | null; telephone2: string | null; email: string | null; note: string | null;
  creeLe: string; creeParLibelle: string; majLe: string | null; majParLibelle: string | null;
  contacts: Array<{
    id: number; titre: string | null; prenom: string | null; nom: string | null;
    /** LOT SYNDIC-CONTACT-CIVILITE — « M. », « Mme », ou `null` (non renseignée). */
    civilite?: Civilite | null;
    coordonnees: Array<{ id: number; sorte: SorteCoordonnee; libelle: string | null; valeur: string }>;
    /** Les clés des copropriétés suivies (LOT SYNDIC-FIN-TOUS-LES-IMMEUBLES : le marqueur n'est plus jamais vrai). */
    tousImmeubles: boolean; immeubles: string[];
  }>;
  /** Les copropriétés EN COURS, chacune avec ses lots. */
  coproprietes: Array<{
    id: number; cle: string; libelle: string; codePostal: string | null; commune: string | null; debut: string;
    lots: LotDeCopropriete[];
    /** LOT COPRO-PLUSIEURS-ADRESSES — ses adresses secondaires en cours (ses `lots` comprennent les leurs). */
    adresses?: AdresseConnue[];
  }>;
  /** Les liens FERMÉS : l'historique, jamais effacé. */
  historique: Array<{ libelle: string; debut: string; fin: string; motif: string | null }>;
  /** LOT SYNDIC-NOTE-PAR-BIEN — la note du couple (lot demandé, ce syndic), si la fiche est lue pour un bien. */
  noteBien?: string | null;
  /** LOT SYNDIC-CONTACT-PARTI — les anciens contacts (« ne travaille plus ici »), avec les coordonnées qu'ils avaient. */
  anciens?: AncienContact[];
}

/** LOT SYNDIC-CONTACT-PARTI — un contact parti : en lecture seule, avec la date de son départ. */
export interface AncienContact {
  id: number; titre: string | null; prenom: string | null; nom: string | null; civilite?: Civilite | null;
  partiLe: string;
  coordonnees: Array<{ sorte: SorteCoordonnee; libelle: string | null; valeur: string }>;
}

/** La clé d'un immeuble. PUR. */
export function cleImmeuble(libelle: string | null | undefined): string {
  return normaliserTexte(libelle);
}

// ══ LES TÉLÉPHONES — « 06 13 86 18 77 », « +33 6 13 86 18 77 » ═════════════════════════════════════════════════

/** Les CHIFFRES d'un numéro, avec son « + » de tête s'il en a un ; « 0033… » devient « +33… ». PUR. */
export function chiffresTelephone(brut: string | null | undefined): string {
  const t = (brut ?? '').trim();
  const plus = t.startsWith('+');
  let d = t.replace(/\D/g, '');
  if (!plus && d.startsWith('00') && d.length > 2) return `+${d.slice(2)}`;
  if (plus) d = `+${d}`;
  return d;
}

/**
 * LE NUMÉRO LISIBLE, PAR PAIRES. PUR — et valable pendant la frappe (un numéro incomplet se groupe aussi).
 *   « 0613861877 »   → « 06 13 86 18 77 »
 *   « +33613861877 » → « +33 6 13 86 18 77 »
 * Un autre indicatif (« +32… ») garde « +32 » puis des paires.
 */
export function formaterTelephone(brut: string | null | undefined): string {
  const d = chiffresTelephone(brut);
  const paires = (s: string): string => (s.match(/.{1,2}/g) ?? []).join(' ');
  if (d.startsWith('+33')) {
    const reste = d.slice(3);
    if (reste === '') return '+33';
    return `+33 ${reste.slice(0, 1)}${reste.length > 1 ? ` ${paires(reste.slice(1))}` : ''}`;
  }
  if (d.startsWith('+')) {
    const reste = d.slice(3);
    return reste === '' ? d : `${d.slice(0, 3)} ${paires(reste)}`;
  }
  return paires(d);
}

/**
 * LA FRAPPE DANS UN CHAMP TÉLÉPHONE : le texte tapé → le texte affiché, mis en paires. PUR.
 * ⚠️ EFFACER UN ESPACE EFFACE LE CHIFFRE D'AVANT : sans cela, la mise en paires remettrait aussitôt l'espace
 * qu'on vient de retirer, et la touche ← Retour arrière semblerait bloquée sur chaque espace.
 */
export function saisieTelephone(ancien: string, nouveau: string): string {
  const a = chiffresTelephone(ancien);
  const n = chiffresTelephone(nouveau);
  if (n === a && nouveau.length < ancien.length) return formaterTelephone(a.slice(0, -1));
  return formaterTelephone(nouveau);
}

/** Le lien `tel:` d'un numéro. PUR. */
export function lienTelephone(brut: string): string {
  return `tel:${chiffresTelephone(brut)}`;
}

// ══ LES ADRESSES — « 25 rue Edith Cavell, 92400 Courbevoie » ═══════════════════════════════════════════════════

/**
 * L'ADRESSE COMPLÈTE D'UN IMMEUBLE. PUR.
 * ⚠️ Certains « Immeuble » WIPPIMMO portent déjà leur code postal (« 12 rue X 92400 ») : on ne le répète pas.
 */
export function adresseImmeuble(libelle: string, codePostal: string | null | undefined, commune: string | null | undefined): string {
  const l = libelle.trim();
  const cp = (codePostal ?? '').trim();
  const c = (commune ?? '').trim();
  const dejaCp = cp !== '' && l.includes(cp);
  const dejaCommune = c !== '' && normaliserTexte(l).includes(normaliserTexte(c));
  const suite = [dejaCp ? '' : cp, dejaCommune ? '' : c].filter((x) => x !== '').join(' ');
  return suite === '' ? l : `${l}, ${suite}`;
}

/** Une commune affichée en casse de titre quand elle arrive EN MAJUSCULES (« COURBEVOIE » → « Courbevoie »). PUR. */
export function communeLisible(c: string | null | undefined): string {
  const t = (c ?? '').trim();
  if (t === '' || t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
}

// ══ LA VALIDATION ════════════════════════════════════════════════════════════════════════════════════════════════

const BORNE_TEXTE = 500;
const BORNE_NOTE = 5000;

function texte(brut: unknown, borne = BORNE_TEXTE): string {
  return typeof brut === 'string' ? brut.trim().slice(0, borne) : '';
}

/** Un e-mail plausible (un @, un point après). PUR. */
export function emailPlausible(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/**
 * ══ 🔴 LOT FICHE-SYNDIC-COORDONNEES-ET-ENTETE — L'ADRESSE DU SYNDIC EST OBLIGATOIRE ══════════════════════════════
 * ARNO : « “Adresse (rue)”, “Code postal” et “Ville” sont OBLIGATOIRES. Code postal : 5 chiffres. Syndics existants
 * sans code postal/ville : ils restent consultables ; l'obligation s'applique à la prochaine modification. »
 * La règle vit ICI, lue par l'écran (champ cerclé, message) ET par le serveur (`validerSyndic`) : un navigateur
 * qui contournerait l'écran ne la contourne pas.
 */
export type ChampAdresse = 'adresse' | 'codePostal' | 'ville';
export const MOTIF_ADRESSE_INCOMPLETE = 'Complétez l’adresse du syndic : rue, code postal (5 chiffres) et ville.';

/** Les champs d'adresse manquants ou invalides, dans l'ordre de l'écran. PUR. */
export function adresseManquante(f: { adresse?: string | null; codePostal?: string | null; ville?: string | null }): ChampAdresse[] {
  const out: ChampAdresse[] = [];
  if ((f.adresse ?? '').trim() === '') out.push('adresse');
  if (!/^\d{5}$/.test((f.codePostal ?? '').trim())) out.push('codePostal');
  if ((f.ville ?? '').trim() === '') out.push('ville');
  return out;
}

/** « Prénom NOM » : le nom de famille en capitales, comme dans le reste de l'annuaire. PUR. */
export function prenomNom(prenom: string | null | undefined, nom: string | null | undefined): string {
  return [(prenom ?? '').trim(), (nom ?? '').trim().toUpperCase()].filter((x) => x !== '').join(' ');
}

/** Un nom ou un titre suffit à un contact. PUR. */
export function contactNomme(c: { titre?: string; prenom?: string; nom?: string }): boolean {
  return [c.titre, c.prenom, c.nom].some((x) => (x ?? '').trim() !== '');
}

/**
 * LA SAISIE REÇUE, VÉRIFIÉE ET MISE EN FORME. PUR.
 *
 * Règles : le NOM du cabinet est obligatoire ; un contact a au moins un nom, un prénom ou un titre ; une coordonnée
 * vide est ignorée (une ligne ajoutée puis laissée vide n'est pas une erreur) ; un e-mail doit ressembler à un
 * e-mail ; un téléphone s'enregistre en chiffres. Les immeubles sont dédoublonnés par leur CLÉ ; un immeuble reçu
 * en simple texte (ancienne forme) est accepté, sans code postal ni commune.
 */
export function validerSyndic(brut: unknown): { ok: true; syndic: SyndicSaisi } | { ok: false; motif: string } {
  if (typeof brut !== 'object' || brut === null) return { ok: false, motif: 'Saisie illisible.' };
  const b = brut as Record<string, unknown>;
  const nom = texte(b.nom);
  if (nom === '') return { ok: false, motif: 'Le nom du cabinet est obligatoire.' };
  const email = texte(b.email);
  if (email !== '' && !emailPlausible(email)) return { ok: false, motif: `E-mail du cabinet illisible : « ${email} ».` };
  if (adresseManquante({ adresse: texte(b.adresse), codePostal: texte(b.codePostal), ville: texte(b.ville) }).length > 0) {
    return { ok: false, motif: MOTIF_ADRESSE_INCOMPLETE };
  }

  const contactsBruts = Array.isArray(b.contacts) ? b.contacts.slice(0, 100) : [];
  const contacts: ContactSaisi[] = [];
  for (const cb of contactsBruts) {
    if (typeof cb !== 'object' || cb === null) continue;
    const c = cb as Record<string, unknown>;
    const coordonnees: CoordonneeSaisie[] = [];
    for (const kb of (Array.isArray(c.coordonnees) ? c.coordonnees.slice(0, 50) : [])) {
      if (typeof kb !== 'object' || kb === null) continue;
      const k = kb as Record<string, unknown>;
      const sorte: SorteCoordonnee = k.sorte === 'email' ? 'email' : 'telephone';
      const valeur = sorte === 'telephone' ? chiffresTelephone(texte(k.valeur)) : texte(k.valeur);
      if (valeur === '' || valeur === '+') continue;
      if (sorte === 'email' && !emailPlausible(valeur)) return { ok: false, motif: `E-mail illisible : « ${valeur} ».` };
      coordonnees.push({ id: entierOuNull(k.id), sorte, libelle: texte(k.libelle), valeur });
    }
    const civilite = civiliteLue(c.civilite);
    if (civilite === undefined) return { ok: false, motif: `Civilité inconnue : « ${texte(c.civilite)} » (M. ou Mme).` };
    // LOT SYNDIC-CONTACT-PARTI — un départ ne vaut que pour un contact EXISTANT ; il n'emporte ni coordonnées ni
    // affectations (le serveur ferme les siennes) et n'entre pas dans les contrôles de doublons.
    const parti = c.parti === true && entierOuNull(c.id) !== null;
    const contact: ContactSaisi = {
      id: entierOuNull(c.id), titre: texte(c.titre), prenom: texte(c.prenom), nom: texte(c.nom),
      coordonnees: parti ? [] : coordonnees, civilite,
      ...(parti ? { parti: true } : {}), ...(c.reintegre === true && !parti ? { reintegre: true } : {}),
      // LOT SYNDIC-FIN-TOUS-LES-IMMEUBLES — « tous » n'est plus un suivi automatique : demandé (ancienne forme), il se
      // traduit plus bas en affectations EXPLICITES aux copropriétés ACTUELLES ; absent, aucune copropriété.
      tousImmeubles: c.tousImmeubles === true,
      immeubles: !parti && Array.isArray(c.immeubles)
        ? [...new Set(c.immeubles.map((x) => cleImmeuble(typeof x === 'string' ? x : '')).filter((x) => x !== ''))].slice(0, 300)
        : [],
    };
    if (!contactNomme(contact) && coordonnees.length === 0) continue; // un contact ajouté puis laissé vide : ignoré
    if (!contactNomme(contact)) return { ok: false, motif: 'Chaque contact doit avoir au moins un nom ou un titre.' };
    contacts.push(contact);
  }

  const vus = new Set<string>();
  const immeubles: ImmeubleSaisi[] = [];
  for (const ib of (Array.isArray(b.immeubles) ? b.immeubles.slice(0, 300) : [])) {
    const o: Record<string, unknown> = typeof ib === 'object' && ib !== null ? ib as Record<string, unknown> : { libelle: ib };
    const libelle = texte(o.libelle);
    const cle = cleImmeuble(libelle);
    if (cle === '' || vus.has(cle)) continue;
    vus.add(cle);
    // LOT COPRO-PLUSIEURS-ADRESSES — ses adresses secondaires : dédoublonnées, jamais égales à la principale.
    let adresses: AdresseSaisie[] | undefined;
    if (Array.isArray(o.adresses)) {
      adresses = [];
      const vuesIci = new Set<string>([cle]);
      for (const ab of o.adresses.slice(0, 30)) {
        if (typeof ab !== 'object' || ab === null) continue;
        const a = ab as Record<string, unknown>;
        const l = texte(a.libelle);
        const k = cleImmeuble(l);
        if (k === '' || vuesIci.has(k)) continue;
        vuesIci.add(k);
        adresses.push({ libelle: l, codePostal: texte(a.codePostal), commune: texte(a.commune) });
      }
    }
    immeubles.push({ libelle, codePostal: texte(o.codePostal), commune: texte(o.commune), ...(adresses !== undefined ? { adresses } : {}) });
  }
  // Une adresse secondaire ne peut pas être aussi une copropriété (ou l'adresse d'une autre) de la même saisie.
  {
    const toutes = new Map<string, string>();
    for (const im of immeubles) {
      for (const a of [{ libelle: im.libelle }, ...(im.adresses ?? [])]) {
        const k = cleImmeuble(a.libelle);
        const deja = toutes.get(k);
        if (deja !== undefined && deja !== im.libelle) return { ok: false, motif: `${a.libelle} figure deux fois dans les copropriétés de ce syndic.` };
        toutes.set(k, im.libelle);
      }
    }
  }

  // LOT SYNDIC-CONTACTS-ANTI-DOUBLON — dans UN syndic, deux contacts ne portent pas le même Prénom + NOM (BLOQUANT) ; le
  // même e-mail répété sur un contact est simplement dédoublonné.
  // LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — CE QU'IL Y AVAIT : « une adresse e-mail n'appartient qu'à UN
  // contact » (refus). Décision d'Arno : un e-mail (ou un téléphone) déjà utilisé n'est plus qu'un AVERTISSEMENT,
  // confirmé à l'écran — le serveur le contrôle à l'enregistrement (`confirmeDoublons`).
  const vusNoms = new Map<string, ContactSaisi>();
  for (const c of contacts) {
    if (c.parti === true) continue; // LOT SYNDIC-CONTACT-PARTI — un contact qui part libère son nom et son e-mail
    const n = cleNom(c.prenom, c.nom);
    if (n !== '') {
      const deja = vusNoms.get(n);
      if (deja !== undefined) return { ok: false, motif: `Deux contacts de ce syndic portent le même nom : ${prenomNom(c.prenom, c.nom)}.` };
      vusNoms.set(n, c);
    }
    const propres = new Set<string>();
    c.coordonnees = c.coordonnees.filter((k) => {
      if (k.sorte !== 'email') return true;
      const e = cleEmail(k.valeur);
      if (propres.has(e)) return false;
      propres.add(e);
      return true;
    });
  }

  // LOT SYNDIC-CONTACTS-PAR-COPROPRIETE — un contact ne suit que des copropriétés DE CE SYNDIC : une copropriété
  // retirée de la fiche disparaît aussi des contacts qui la suivaient. « Tous les immeubles » ⇒ aucune liste.
  // LOT SYNDIC-FIN-TOUS-LES-IMMEUBLES — « tous » ⇒ les copropriétés de CETTE saisie, explicitement ; puis le marqueur
  // tombe : le serveur n'écrit plus jamais « tous les immeubles » (une copropriété rattachée plus tard part VIDE).
  for (const c of contacts) {
    c.immeubles = c.tousImmeubles ? [...vus] : c.immeubles.filter((k) => vus.has(k));
    c.tousImmeubles = false;
  }

  // Deux standards au plus ; le second remonte si le premier est vide.
  const tels = [b.telephone, b.telephone2].map((t) => chiffresTelephone(texte(t))).filter((t) => t !== '' && t !== '+');

  // LOT SYNDIC-NOTE-PAR-BIEN — la note d'UN bien : un lot désigné et un texte (vide = la note est retirée).
  let noteBien: { lotId: number; texte: string } | null = null;
  if (typeof b.noteBien === 'object' && b.noteBien !== null) {
    const nb = b.noteBien as Record<string, unknown>;
    const lotId = entierOuNull(nb.lotId);
    if (lotId === null) return { ok: false, motif: 'Note du bien : bien non désigné.' };
    noteBien = { lotId, texte: texte(nb.texte, BORNE_NOTE) };
  }

  // LOT COPRO-CONTACTS-IMMEUBLE — les contacts de l'immeuble : une catégorie, un libellé si « Personnalisé » ; doublons
  // (même NOM + prénom, même e-mail) refusés DANS CET IMMEUBLE seulement.
  let contactsImmeuble: { immeuble: string; contacts: ContactImmeubleSaisi[] } | null = null;
  if (typeof b.contactsImmeuble === 'object' && b.contactsImmeuble !== null) {
    const ci = b.contactsImmeuble as Record<string, unknown>;
    const immeuble = texte(ci.immeuble);
    if (cleImmeuble(immeuble) === '') return { ok: false, motif: 'Contacts de l’immeuble : immeuble non désigné.' };
    const liste: ContactImmeubleSaisi[] = [];
    for (const cb of (Array.isArray(ci.contacts) ? ci.contacts.slice(0, 100) : [])) {
      if (typeof cb !== 'object' || cb === null) continue;
      const c = cb as Record<string, unknown>;
      const categorie = c.categorie === 'gardien' || c.categorie === 'conseil_syndical' || c.categorie === 'personnalise' ? c.categorie : null;
      if (categorie === null) return { ok: false, motif: 'Contact de l’immeuble : choisissez une catégorie (Gardien, Conseil syndical ou Personnalisé).' };
      const libelle = categorie === 'personnalise' ? texte(c.libelle) : '';
      if (categorie === 'personnalise' && libelle === '') {
        return { ok: false, motif: 'Contact de l’immeuble : précisez le libellé personnalisé (Habitant, Femme de ménage…).' };
      }
      const civilite = civiliteLue(c.civilite);
      if (civilite === undefined) return { ok: false, motif: `Civilité inconnue : « ${texte(c.civilite)} » (M. ou Mme).` };
      const coordonnees: CoordonneeSaisie[] = [];
      const vus = new Set<string>();
      for (const kb of (Array.isArray(c.coordonnees) ? c.coordonnees.slice(0, 50) : [])) {
        if (typeof kb !== 'object' || kb === null) continue;
        const k = kb as Record<string, unknown>;
        const sorte: SorteCoordonnee = k.sorte === 'email' ? 'email' : 'telephone';
        const valeur = sorte === 'telephone' ? chiffresTelephone(texte(k.valeur)) : texte(k.valeur);
        if (valeur === '' || valeur === '+') continue;
        if (sorte === 'email' && !emailPlausible(valeur)) return { ok: false, motif: `E-mail illisible : « ${valeur} ».` };
        if (sorte === 'email') { if (vus.has(cleEmail(valeur))) continue; vus.add(cleEmail(valeur)); }
        coordonnees.push({ id: entierOuNull(k.id), sorte, libelle: texte(k.libelle), valeur });
      }
      liste.push({ id: entierOuNull(c.id), categorie, libelle, civilite, prenom: texte(c.prenom), nom: texte(c.nom),
        note: texte(c.note, BORNE_NOTE), coordonnees });
    }
    const noms = new Set<string>();
    for (const c of liste) {
      const n = cleNom(c.prenom, c.nom);
      if (n !== '') {
        if (noms.has(n)) return { ok: false, motif: `Deux contacts de cet immeuble portent le même nom : ${prenomNom(c.prenom, c.nom)}.` };
        noms.add(n);
      }
      // LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — un e-mail partagé n'est plus un refus (avertissement confirmé).
    }
    contactsImmeuble = { immeuble, contacts: liste };
  }

  return {
    ok: true,
    syndic: {
      noteBien,
      ...(contactsImmeuble !== null ? { contactsImmeuble } : {}),
      ...(b.confirmeDoublons === true ? { confirmeDoublons: true } : {}),
      ...(Array.isArray(b.alerteParcelle) ? { alerteParcelle: b.alerteParcelle.slice(0, 30).map((x) => cleImmeuble(texte(x))).filter((x) => x !== '') } : {}),
      ...(Array.isArray(b.conflitsParcelle) ? { conflitsParcelle: b.conflitsParcelle.slice(0, 30)
        .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
        .map((x) => ({ immeuble: texte(x.immeuble), autre: texte(x.autre), parcelle: texte(x.parcelle) }))
        .filter((x) => cleImmeuble(x.immeuble) !== '' && cleImmeuble(x.autre) !== '') } : {}),
      nom, adresse: texte(b.adresse), codePostal: texte(b.codePostal), ville: texte(b.ville),
      telephone: tels[0] ?? '', telephone2: tels[1] ?? '',
      email, note: texte(b.note, BORNE_NOTE), contacts, immeubles,
    },
  };
}

function entierOuNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// ══ L'APERÇU, LA RECHERCHE ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * LES BIENS QUI RECEVRONT CE SYNDIC — ce que l'écran montre AVANT de valider. PUR.
 * Tous les lots des immeubles saisis ; et, pour chaque immeuble déjà géré par un AUTRE syndic, ce changement.
 */
export function apercuPropagation(immeubles: readonly ImmeubleSaisi[], connus: readonly ImmeubleConnu[], syndicId: number | null): {
  lots: Array<LotDeCopropriete & { immeuble: string }>;
  changements: Array<{ immeuble: string; ancien: string }>;
  sansLot: string[];
} {
  const parCle = new Map(connus.map((i) => [i.cle, i]));
  const lots: Array<LotDeCopropriete & { immeuble: string }> = [];
  const changements: Array<{ immeuble: string; ancien: string }> = [];
  const sansLot: string[] = [];
  for (const im of immeubles) {
    const i = parCle.get(cleImmeuble(im.libelle));
    if (i === undefined || i.lots.length === 0) sansLot.push(im.libelle);
    if (i === undefined) continue;
    for (const l of i.lots) lots.push({ ...l, immeuble: i.libelle });
    if (i.syndic !== null && i.syndic.id !== syndicId) changements.push({ immeuble: i.libelle, ancien: nomAvecVille(i.syndic.nom, i.syndic.ville) });
  }
  return { lots, changements, sansLot };
}

/** Le seuil de l'auto-complétion : « dès 2-3 caractères ». */
export const MINIMUM_AUTOCOMPLETION = 2;

/** Les immeubles du PORTEFEUILLE qui répondent à une saisie (auto-complétion). PUR. */
export function immeublesQuiRepondent(q: string, connus: readonly ImmeubleConnu[], max = 8): ImmeubleConnu[] {
  const n = normaliserTexte(q);
  if (n.length < MINIMUM_AUTOCOMPLETION) return [];
  const mots = n.split(' ');
  return connus
    .filter((i) => i.lots.length > 0)
    .filter((i) => {
      const cible = normaliserTexte(`${i.libelle} ${i.codePostal ?? ''} ${i.commune ?? ''}`);
      return mots.every((m) => cible.includes(m));
    })
    .slice(0, max);
}

/** « 1 bien en gestion à cette adresse », « 3 biens… », « aucun bien… ». PUR. */
export function motBiensEnGestion(n: number): string {
  if (n === 0) return 'aucun bien en gestion à cette adresse';
  return n === 1 ? '1 bien en gestion à cette adresse' : `${n} biens en gestion à cette adresse`;
}

/** Les syndics qui répondent à une recherche (nom, e-mail, domaine). PUR. */
export function syndicsQuiRepondent(q: string, syndics: readonly SyndicResume[]): SyndicResume[] {
  const n = normaliserTexte(q);
  if (n === '') return [...syndics];
  return syndics.filter((s) => s.cherchable.includes(n));
}

// ══ LOT SYNDIC-CONTACT-CIVILITE ═══════════════════════════════════════════════════════════════════════════════════
// ARNO : « une CIVILITÉ facultative sur les contacts de syndic, pour la future rédaction automatique des mails ».
// Deux valeurs, ou rien. Elle s'affiche devant « Prénom NOM » dans les tuiles ; l'anti-doublon l'IGNORE (`cleNom`
// ne lit que le prénom et le nom : « M. Mathis BERCIER » et « Mathis BERCIER » sont le même contact).

export const CIVILITES = ['M.', 'Mme'] as const;
export type Civilite = (typeof CIVILITES)[number];

/** Une civilité reçue : l'une des deux, sinon `null` (vide ou absente). Une autre valeur ⇒ `undefined` (refusée). PUR. */
export function civiliteLue(v: unknown): Civilite | null | undefined {
  if (v === null || v === undefined) return null;
  const t = typeof v === 'string' ? v.trim() : String(v);
  if (t === '') return null;
  return (CIVILITES as readonly string[]).includes(t) ? (t as Civilite) : undefined;
}

/** « M. Prénom NOM » quand la civilité est renseignée ET qu'il y a un nom ; sinon « Prénom NOM » (ou vide). PUR. */
export function prenomNomCivil(civilite: Civilite | null | undefined, prenom: string | null | undefined, nom: string | null | undefined): string {
  const n = prenomNom(prenom, nom);
  return n !== '' && civilite ? `${civilite} ${n}` : n;
}

/**
 * LA FORMULE D'APPEL d'un mail — préparée pour la rédaction automatique, branchée nulle part pour l'instant. PUR.
 *   M. ⇒ « Monsieur NOM » ; Mme ⇒ « Madame NOM » ; pas de civilité ⇒ « Madame, Monsieur ».
 * Le NOM s'écrit en capitales, comme partout dans la fiche. Civilité connue mais nom vide ⇒ « Monsieur » / « Madame ».
 */
export function formuleAppel(civilite: Civilite | null | undefined, nom: string | null | undefined): string {
  if (civilite !== 'M.' && civilite !== 'Mme') return 'Madame, Monsieur';
  const appel = civilite === 'M.' ? 'Monsieur' : 'Madame';
  const n = (nom ?? '').trim().toUpperCase();
  return n === '' ? appel : `${appel} ${n}`;
}

/** « Prénom Nom », ou le titre quand il n'y a pas de nom. PUR. */
export function nomDuContact(c: { titre?: string | null; prenom?: string | null; nom?: string | null }): string {
  const nom = [c.prenom, c.nom].map((x) => (x ?? '').trim()).filter((x) => x !== '').join(' ');
  return nom !== '' ? nom : (c.titre ?? '').trim();
}

/**
 * LA LIGNE D'UN CONTACT REPLIÉ : « titre · prénom nom · e-mails · téléphones ». PUR.
 * Chaque morceau absent est omis — jamais de « · · ».
 */
export function ligneContact(c: { titre: string; prenom: string; nom: string; emails: string[]; telephones: string[] }): string {
  const nom = [c.prenom, c.nom].map((x) => x.trim()).filter((x) => x !== '').join(' ');
  return [c.titre.trim(), nom, c.emails.join(', '), c.telephones.map(formaterTelephone).join(', ')]
    .filter((x) => x !== '').join(' · ');
}

// ══ LE FORMULAIRE DE LA FICHE — ses états, et le passage fiche ⇄ formulaire ⇄ saisie. PUR. ══════════════════════

/** Le choix « Personnalisé » d'une liste (titre ou libellé) : il ouvre un champ libre. */
export const PERSONNALISE = 'Personnalisé';

export interface CoordonneeForm { cle: string; id: number | null; sorte: SorteCoordonnee; choix: string; libre: string; valeur: string }
export interface ContactForm {
  cle: string; id: number | null; titreChoix: string; titreLibre: string; prenom: string; nom: string;
  /** LOT SYNDIC-CONTACT-CIVILITE — « M. », « Mme », ou `null` (aucun bouton actif). */
  civilite: Civilite | null;
  coordonnees: CoordonneeForm[];
  /** Les clés des copropriétés suivies ; `tousImmeubles` reste faux (LOT SYNDIC-FIN-TOUS-LES-IMMEUBLES). */
  tousImmeubles: boolean; immeubles: string[];
  /** LOT SYNDIC-CONTACT-PARTI — un ancien contact « réintégré au catalogue » dans cette saisie (pas encore enregistré). */
  reintegre?: boolean;
  /** LOT COPRO-CONTACTS-IMMEUBLE — la note d'un contact d'IMMEUBLE (les contacts de syndic n'en ont pas). */
  note?: string;
  /** LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — « Valider quand même » malgré un e-mail / téléphone déjà utilisé. */
  doublonsConfirmes?: boolean;
}
export interface SyndicForm {
  nom: string; adresse: string; codePostal: string; ville: string;
  /** Un ou deux standards ; le « + » en ajoute un second, deux au plus. */
  telephones: string[];
  email: string; note: string;
  contacts: ContactForm[]; immeubles: ImmeubleSaisi[];
  /** LOT SYNDIC-NOTE-PAR-BIEN — le bien depuis lequel la fiche est ouverte (`null` sans bien), et SA note. */
  lotNote: number | null; noteBien: string;
  /** LOT SYNDIC-CONTACT-PARTI — les contacts marqués « ne travaille plus ici » dans cette saisie (partent au Valider). */
  partis?: ContactForm[];
  /** LOT SYNDIC-CONTACT-PARTI — les anciens contacts déjà partis (lecture seule, « Réintégrer au catalogue »). */
  anciens?: AncienContact[];
  /** LOT COPRO-CONTACTS-IMMEUBLE — les contacts de l'immeuble du bien, une fois lus (`null`/absent : pas lus, rien
   *  n'est envoyé). La catégorie vit dans `titreChoix` (« Gardien », « Conseil syndical », « Personnalisé » + libre). */
  immeubleContacts?: { libelle: string; contacts: ContactForm[] } | null;
}

let compteur = 0;
/** Une clé locale pour les listes de l'écran (jamais envoyée au serveur). */
export function cleLocale(): string { compteur += 1; return `n${compteur}`; }

/** Un texte prédéfini se range dans son choix ; un autre devient « Personnalisé » + champ libre. PUR. */
export function choixDe(valeur: string | null, predefinis: readonly string[]): { choix: string; libre: string } {
  const v = (valeur ?? '').trim();
  if (v === '') return { choix: '', libre: '' };
  return predefinis.includes(v) ? { choix: v, libre: '' } : { choix: PERSONNALISE, libre: v };
}

/** La valeur retenue d'un choix : le prédéfini, ou le champ libre si « Personnalisé ». PUR. */
export function valeurDuChoix(choix: string, libre: string): string {
  return choix === PERSONNALISE ? libre.trim() : choix.trim();
}

export function formulaireVide(immeubleDepart?: ImmeubleSaisi | null, lotNote: number | null = null): SyndicForm {
  const i = immeubleDepart && immeubleDepart.libelle.trim() !== '' ? [immeubleDepart] : [];
  return { nom: '', adresse: '', codePostal: '', ville: '', telephones: [''], email: '', note: '', contacts: [], immeubles: i, lotNote, noteBien: '' };
}

/** Un contact NOUVEAU (il s'ouvre EN MODIFICATION). */
export function contactVide(suivi?: { tousImmeubles: boolean; immeubles: string[] }): ContactForm {
  return {
    cle: cleLocale(), id: null, titreChoix: '', titreLibre: '', prenom: '', nom: '', civilite: null, coordonnees: [],
    tousImmeubles: false, immeubles: suivi?.immeubles ?? [],
  };
}

/**
 * LOT SYNDIC-CONTACTS-PAR-COPROPRIETE — CE QUE SUIT UN CONTACT NOUVEAU. PUR.
 * Créé depuis un BIEN dont l'immeuble est une copropriété de la fiche ⇒ cette copropriété seule (case modifiable) ;
 * créé sans bien (écran « Syndics ») ⇒ aucune (LOT SYNDIC-FIN-TOUS-LES-IMMEUBLES).
 */
export function suiviParDefaut(cleDepart: string | null, immeubles: readonly ImmeubleSaisi[]): { tousImmeubles: boolean; immeubles: string[] } {
  if (cleDepart !== null && cleDepart !== '' && immeubles.some((i) => cleImmeuble(i.libelle) === cleDepart)) {
    return { tousImmeubles: false, immeubles: [cleDepart] };
  }
  // LOT SYNDIC-FIN-TOUS-LES-IMMEUBLES — sans bien (écran « Syndics ») : AUCUNE copropriété par défaut (on peut cocher).
  return { tousImmeubles: false, immeubles: [] };
}

/** Ce contact suit-il cet immeuble ? PUR. */
export function suitImmeuble(c: { tousImmeubles: boolean; immeubles: readonly string[] }, cle: string): boolean {
  // LOT SYNDIC-FIN-TOUS-LES-IMMEUBLES — un contact ne suit QUE les copropriétés de ses affectations, nulle part ailleurs.
  return c.immeubles.includes(cle);
}

export function coordonneeVide(sorte: SorteCoordonnee): CoordonneeForm {
  return { cle: cleLocale(), id: null, sorte, choix: '', libre: '', valeur: '' };
}

/** La fiche lue → le formulaire, pré-rempli ; les contacts existants arrivent REPLIÉS. PUR. */
export function versFormulaire(f: FicheSyndic, lotNote: number | null = null): SyndicForm {
  const tels = [f.telephone, f.telephone2].filter((t): t is string => (t ?? '').trim() !== '').map(formaterTelephone);
  return {
    nom: f.nom, adresse: f.adresse ?? '', codePostal: f.codePostal ?? '', ville: f.ville ?? '',
    telephones: tels.length === 0 ? [''] : tels,
    email: f.email ?? '', note: f.note ?? '',
    contacts: f.contacts.map((c) => {
      const t = choixDe(c.titre, TITRES_CONTACT);
      return {
        cle: cleLocale(), id: c.id, titreChoix: t.choix, titreLibre: t.libre, prenom: c.prenom ?? '', nom: c.nom ?? '',
        civilite: civiliteLue(c.civilite) ?? null,
        // LOT SYNDIC-FIN-TOUS-LES-IMMEUBLES — un ancien « tous » (non encore converti) se lit comme les copropriétés
        // ACTUELLES, explicitement : c'est exactement ce que fait la migration 329.
        tousImmeubles: false,
        immeubles: c.tousImmeubles === true ? f.coproprietes.map((x) => x.cle) : [...(c.immeubles ?? [])],
        coordonnees: c.coordonnees.map((k) => {
          const l = choixDe(k.libelle, libellesDe(k.sorte));
          return {
            cle: cleLocale(), id: k.id, sorte: k.sorte, choix: l.choix, libre: l.libre,
            valeur: k.sorte === 'telephone' ? formaterTelephone(k.valeur) : k.valeur,
          };
        }),
      };
    }),
    immeubles: f.coproprietes.map((c) => ({ libelle: c.libelle, codePostal: c.codePostal ?? '', commune: c.commune ?? '',
      // LOT COPRO-PLUSIEURS-ADRESSES — ses adresses secondaires, telles qu'enregistrées.
      adresses: (c.adresses ?? []).map((a) => ({ libelle: a.libelle, codePostal: a.codePostal ?? '', commune: a.commune ?? '' })) })),
    lotNote, noteBien: lotNote !== null ? (f.noteBien ?? '') : '',
    partis: [], anciens: [...(f.anciens ?? [])],
  };
}

/** Le formulaire → la saisie envoyée au serveur (qui la re-valide et ne garde que les chiffres). PUR. */
export function versSaisie(f: SyndicForm): SyndicSaisi {
  return {
    nom: f.nom, adresse: f.adresse, codePostal: f.codePostal, ville: f.ville,
    telephone: chiffresTelephone(f.telephones[0]), telephone2: chiffresTelephone(f.telephones[1]),
    email: f.email, note: f.note,
    contacts: [
      ...f.contacts.map((c) => ({
        id: c.id, titre: valeurDuChoix(c.titreChoix, c.titreLibre), prenom: c.prenom, nom: c.nom, civilite: c.civilite ?? null,
        tousImmeubles: false, immeubles: [...c.immeubles],
        coordonnees: c.coordonnees.map((k) => ({
          id: k.id, sorte: k.sorte, libelle: valeurDuChoix(k.choix, k.libre),
          valeur: k.sorte === 'telephone' ? chiffresTelephone(k.valeur) : k.valeur,
        })),
        ...(c.reintegre === true ? { reintegre: true } : {}),
      })),
      // LOT SYNDIC-CONTACT-PARTI — les départs voyagent avec la saisie, sans coordonnées ni affectations.
      ...(f.partis ?? []).map((c) => ({
        id: c.id, titre: valeurDuChoix(c.titreChoix, c.titreLibre), prenom: c.prenom, nom: c.nom, civilite: c.civilite ?? null,
        tousImmeubles: false, immeubles: [], coordonnees: [], parti: true,
      })),
    ],
    immeubles: f.immeubles,
    noteBien: f.lotNote !== null ? { lotId: f.lotNote, texte: f.noteBien } : null,
    ...([...f.contacts, ...(f.immeubleContacts?.contacts ?? [])].some((c) => c.doublonsConfirmes === true) ? { confirmeDoublons: true } : {}),
    ...(f.immeubleContacts ? { contactsImmeuble: {
      immeuble: f.immeubleContacts.libelle,
      contacts: f.immeubleContacts.contacts.map((c) => ({
        id: c.id, categorie: categorieDe(c.titreChoix), libelle: c.titreChoix === PERSONNALISE ? c.titreLibre.trim() : '',
        civilite: c.civilite ?? null, prenom: c.prenom, nom: c.nom, note: c.note ?? '',
        coordonnees: c.coordonnees.map((k) => ({
          id: k.id, sorte: k.sorte, libelle: valeurDuChoix(k.choix, k.libre),
          valeur: k.sorte === 'telephone' ? chiffresTelephone(k.valeur) : k.valeur,
        })),
      })) as ContactImmeubleSaisi[],
    } } : {}),
  };
}

// ══ LOT FICHE-SYNDIC-CONTACTS-TROIS-ETATS — UN CONTACT : REPLIÉ, OUVERT EN LECTURE, EN MODIFICATION ══════════════
//
// L'état d'un contact (replié / ouvert / en modification) est un état d'ÉCRAN : il ne voyage pas avec les données.
// En modification, l'écran travaille sur un BROUILLON du contact ; « Valider » le reporte dans la fiche, et c'est le
// « Valider » du pied de la fenêtre qui enregistre en base — comme pour tout le reste de la fiche.

/** Le contact en cours de modification : lequel, son brouillon, et s'il est nouveau. */
export interface EditionContact {
  cle: string; brouillon: ContactForm; nouveau: boolean;
  /** Le point de départ d'un NOUVEAU contact (déjà affecté à l'immeuble du bien) : « rien n'a changé » se mesure
   *  depuis lui, et non depuis un contact vide. */
  depart?: ContactForm;
  /** LOT COPRO-CONTACTS-IMMEUBLE — le brouillon est un contact de l'IMMEUBLE (et non du syndic). */
  immeuble?: boolean;
}

/** Ce qu'un contact dit de lui, sans sa clé d'écran ni l'ordre de ses champs vides. PUR. */
function signatureContact(c: ContactForm): string {
  return JSON.stringify({
    titre: valeurDuChoix(c.titreChoix, c.titreLibre), prenom: c.prenom.trim(), nom: c.nom.trim(), civilite: c.civilite ?? null,
    note: (c.note ?? '').trim(),
    suivi: [...c.immeubles].sort(),
    coordonnees: c.coordonnees.map((k) => ({
      sorte: k.sorte, libelle: valeurDuChoix(k.choix, k.libre),
      valeur: k.sorte === 'telephone' ? chiffresTelephone(k.valeur) : k.valeur.trim(),
    })),
  });
}

/** Le brouillon diffère-t-il du contact d'origine ? Un NOUVEAU contact est « modifié » dès qu'un champ est rempli. PUR. */
export function contactModifie(origine: ContactForm | null, brouillon: ContactForm): boolean {
  return signatureContact(origine ?? contactVide()) !== signatureContact(brouillon);
}

/** Le nom à afficher : « Prénom NOM », sinon le titre, sinon « ce contact ». PUR. */
export function nomAffiche(c: ContactForm): string {
  return prenomNom(c.prenom, c.nom) || valeurDuChoix(c.titreChoix, c.titreLibre) || 'ce contact';
}

// ══ LOT SYNDIC-CONTACT-PARTI-ET-BOUTON-CREER-EN-HAUT — « NE TRAVAILLE PLUS ICI » ════════════════════════════════════

/** Le contact quitte le catalogue de la saisie : il passe dans `partis` (enregistré au Valider). Un contact jamais
 *  enregistré (sans identifiant) n'a rien à quitter : il n'est pas concerné. PUR. */
export function marquerParti(f: SyndicForm, cle: string): SyndicForm {
  const c = f.contacts.find((x) => x.cle === cle);
  if (c === undefined || c.id === null) return f;
  return { ...f, contacts: f.contacts.filter((x) => x.cle !== cle), partis: [...(f.partis ?? []), c] };
}

/** « Réintégrer au catalogue » : l'ancien contact revient dans la saisie, SANS copropriété, avec ses coordonnées
 *  d'alors (recréées à l'enregistrement — l'anti-doublon s'y applique comme à une saisie). PUR. */
export function reintegrer(f: SyndicForm, id: number): SyndicForm {
  const a = (f.anciens ?? []).find((x) => x.id === id);
  if (a === undefined) return f;
  const t = choixDe(a.titre, TITRES_CONTACT);
  const c: ContactForm = {
    cle: cleLocale(), id: a.id, titreChoix: t.choix, titreLibre: t.libre, prenom: a.prenom ?? '', nom: a.nom ?? '',
    civilite: civiliteLue(a.civilite) ?? null, tousImmeubles: false, immeubles: [], reintegre: true,
    coordonnees: a.coordonnees.map((k) => {
      const l = choixDe(k.libelle, libellesDe(k.sorte));
      return { cle: cleLocale(), id: null, sorte: k.sorte, choix: l.choix, libre: l.libre,
        valeur: k.sorte === 'telephone' ? formaterTelephone(k.valeur) : k.valeur };
    }),
  };
  return { ...f, anciens: (f.anciens ?? []).filter((x) => x.id !== id), contacts: [...f.contacts, c] };
}

/**
 * La confirmation du départ, EN LIGNES (LOT SYNDIC-CONFIRMATION-DEPART-UNE-COPRO-PAR-LIGNE) :
 *   question    « M. Mathis BERCIER ne travaille plus chez SYNDIC / Ville ? »
 *   annonce     « Il sera retiré du catalogue et de ses 2 copropriétés : » / « … de sa copropriété : » /
 *               « Il sera retiré du catalogue. » (aucune)
 *   copropriétés une par ligne, par nom de voie.
 * Le pronom suit la CIVILITÉ saisie (M. ⇒ Il, Mme ⇒ Elle) ; sans civilité, on ne devine pas : « Ce contact ». PUR.
 */
export function departEnLignes(c: ContactForm, syndic: string, adresses: readonly { cle: string; adresse: string }[]):
{ question: string; annonce: string; coproprietes: string[] } {
  const nom = prenomNomCivil(c.civilite, c.prenom, c.nom) || valeurDuChoix(c.titreChoix, c.titreLibre) || 'Ce contact';
  const sujet = c.civilite === 'M.' ? 'Il' : c.civilite === 'Mme' ? 'Elle' : 'Ce contact';
  const l = trierParVoie(adresses.filter((a) => c.immeubles.includes(a.cle))).map((a) => a.adresse);
  const base = `${sujet} sera retiré${c.civilite === 'Mme' ? 'e' : ''} du catalogue`;
  const annonce = l.length === 0 ? `${base}.` : l.length === 1 ? `${base} et de sa copropriété :` : `${base} et de ses ${l.length} copropriétés :`;
  return { question: `${nom} ne travaille plus chez ${syndic} ?`, annonce, coproprietes: l };
}

/** La même confirmation, d'un seul tenant (copropriétés séparées par « · »). PUR. */
export function phraseDepart(c: ContactForm, syndic: string, adresses: readonly { cle: string; adresse: string }[]): string {
  const d = departEnLignes(c, syndic, adresses);
  return `${d.question} ${d.annonce}${d.coproprietes.length === 0 ? '' : ` ${d.coproprietes.join(' · ')}.`}`;
}

/** Le bouton de confirmation : « Oui, il ne travaille plus ici » / « Oui, elle … » / « Oui, ne travaille plus ici ». PUR. */
export function boutonDepart(c: ContactForm): string {
  return c.civilite === 'M.' ? 'Oui, il ne travaille plus ici' : c.civilite === 'Mme' ? 'Oui, elle ne travaille plus ici' : 'Oui, ne travaille plus ici';
}

// ══ LOT COPRO-CONTACTS-IMMEUBLE — LE CARNET DE L'IMMEUBLE ═══════════════════════════════════════════════════════════

/** Les catégories, telles que l'écran les montre (pilules) ; « Personnalisé » ouvre un champ libre. */
export const CATEGORIES_IMMEUBLE = ['Gardien', 'Conseil syndical', 'Personnalisé'] as const;

/** Le choix de l'écran → la catégorie en base (`''` : aucune choisie — refusé par la validation). PUR. */
export function categorieDe(choix: string): CategorieImmeuble | '' {
  return choix === 'Gardien' ? 'gardien' : choix === 'Conseil syndical' ? 'conseil_syndical' : choix === PERSONNALISE ? 'personnalise' : '';
}

/** Les contacts de l'immeuble relus → leurs tuiles (la catégorie dans `titreChoix`, le libellé libre dans `titreLibre`). PUR. */
export function versFormulaireImmeuble(lus: readonly ContactImmeubleLu[]): ContactForm[] {
  return lus.map((c) => ({
    cle: cleLocale(), id: c.id,
    titreChoix: c.categorie === 'gardien' ? 'Gardien' : c.categorie === 'conseil_syndical' ? 'Conseil syndical' : PERSONNALISE,
    titreLibre: c.categorie === 'personnalise' ? (c.libelle ?? '') : '',
    prenom: c.prenom ?? '', nom: c.nom ?? '', civilite: civiliteLue(c.civilite) ?? null, note: c.note ?? '',
    tousImmeubles: false, immeubles: [],
    coordonnees: c.coordonnees.map((k) => {
      const l = choixDe(k.libelle, libellesDe(k.sorte));
      return { cle: cleLocale(), id: k.id, sorte: k.sorte, choix: l.choix, libre: l.libre,
        valeur: k.sorte === 'telephone' ? formaterTelephone(k.valeur) : k.valeur };
    }),
  }));
}

/** Ce qui manque pour VALIDER un contact d'immeuble (`null` : rien) : une catégorie, et un libellé si « Personnalisé ». PUR. */
export function refusContactImmeuble(c: ContactForm): string | null {
  if (categorieDe(c.titreChoix) === '') return 'Choisissez une catégorie : Gardien, Conseil syndical ou Personnalisé.';
  if (c.titreChoix === PERSONNALISE && c.titreLibre.trim() === '') return 'Précisez le libellé personnalisé (Habitant, Femme de ménage…).';
  return null;
}

// ══ LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — UNE COORDONNÉE DÉJÀ UTILISÉE ════════════════════════════════════

/** Un téléphone réduit à ses chiffres, l'indicatif français ramené au 0 : « 07 60 20 10 10 » = « +33 7 60 20 10 10 ». PUR. */
export function cleTelephone(v: string | null | undefined): string {
  let d = chiffresTelephone(v);
  if (d.startsWith('+33')) d = `0${d.slice(3)}`;
  return d.replace('+', '');
}

/** La clé de comparaison d'une coordonnée : e-mail en minuscules sans espaces ; téléphone par ses chiffres. PUR. */
export function cleCoordonnee(sorte: SorteCoordonnee, valeur: string | null | undefined): string {
  return sorte === 'email' ? cleEmail(valeur ?? '') : cleTelephone(valeur);
}

/** Qui porte déjà une coordonnée : un contact de SYNDIC, ou un contact d'IMMEUBLE. */
export type ProprietaireCoordonnee =
  | { genre: 'syndic'; contactId: number | null; civilite: Civilite | null; prenom: string | null; nom: string | null; titre: string | null;
      syndicId: number | null; syndicNom: string; syndicVille: string | null; coproprietes: string[] }
  | { genre: 'immeuble'; contactId: number | null; civilite: Civilite | null; prenom: string | null; nom: string | null; categorie: string;
      immeubleCle: string; immeubleAdresse: string };
/** Une coordonnée connue : sa sorte, sa clé de comparaison, son propriétaire (et, côté formulaire, la clé d'écran). */
export interface CoordonneeConnue { sorte: SorteCoordonnee; cle: string; proprietaire: ProprietaireCoordonnee; cleForm?: string }

/** « M. Arnaud JOREL · Responsable de copropriété · SYNDIC / Ville (déjà rattaché à cette copropriété) » ou, pour un
 *  contact d'immeuble, « M. Paul LOGE · Gardien · 12 rue X, 92400 Courbevoie ». PUR. */
export function quiPorte(p: ProprietaireCoordonnee, cleDepart: string | null = null): string {
  const nom = prenomNomCivil(p.civilite, p.prenom, p.nom);
  if (p.genre === 'immeuble') return [nom, p.categorie, p.immeubleAdresse].filter((x) => x.trim() !== '').join(' · ');
  const base = [nom, (p.titre ?? '').trim(), nomAvecVille(p.syndicNom, p.syndicVille)].filter((x) => x.trim() !== '').join(' · ');
  return cleDepart !== null && p.coproprietes.includes(cleDepart) ? `${base} (déjà rattaché à cette copropriété)` : base;
}

/** Les lignes d'un avertissement : une phrase pour un seul propriétaire, sinon l'annonce puis un propriétaire par ligne. PUR. */
export function lignesDoublonCoordonnee(sorte: SorteCoordonnee, valeur: string, proprietaires: readonly string[]): string[] {
  const debut = sorte === 'email' ? `L’adresse e-mail ${valeur.trim()} est déjà utilisée par` : `Le numéro ${formaterTelephone(valeur)} est déjà utilisé par`;
  return proprietaires.length === 1 ? [`${debut} ${proprietaires[0]}.`] : [`${debut} :`, ...proprietaires];
}

/** Les coordonnées connues d'une liste de contacts du FORMULAIRE (qui fait foi pour ce syndic et cet immeuble). PUR. */
export function coordonneesDuFormulaire(contacts: readonly ContactForm[],
  cadre: { genre: 'syndic'; syndicId: number | null; syndicNom: string; syndicVille: string | null }
    | { genre: 'immeuble'; immeubleCle: string; immeubleAdresse: string }): CoordonneeConnue[] {
  return contacts.flatMap((c) => c.coordonnees.filter((k) => cleCoordonnee(k.sorte, k.valeur) !== '').map((k): CoordonneeConnue => {
    const commun = { contactId: c.id, civilite: c.civilite ?? null, prenom: c.prenom, nom: c.nom };
    const proprietaire: ProprietaireCoordonnee = cadre.genre === 'syndic'
      ? { genre: 'syndic', ...commun, titre: valeurDuChoix(c.titreChoix, c.titreLibre), syndicId: cadre.syndicId, syndicNom: cadre.syndicNom,
          syndicVille: cadre.syndicVille, coproprietes: [...c.immeubles] }
      : { genre: 'immeuble', ...commun, categorie: valeurDuChoix(c.titreChoix, c.titreLibre), immeubleCle: cadre.immeubleCle, immeubleAdresse: cadre.immeubleAdresse };
    return { sorte: k.sorte, cle: cleCoordonnee(k.sorte, k.valeur), proprietaire, cleForm: c.cle };
  }));
}

/** Pour chaque coordonnée REMPLIE du contact, ses autres porteurs : les lignes de l'avertissement. PUR. */
export function avertissementsCoordonnees(c: ContactForm, connues: readonly CoordonneeConnue[], cleDepart: string | null = null):
Array<{ cleCoord: string; lignes: string[] }> {
  const out: Array<{ cleCoord: string; lignes: string[] }> = [];
  for (const k of c.coordonnees) {
    const cle = cleCoordonnee(k.sorte, k.valeur);
    if (cle === '') continue;
    const vus = new Set<string>();
    const qui = connues.filter((x) => x.sorte === k.sorte && x.cle === cle && x.cleForm !== c.cle).map((x) => quiPorte(x.proprietaire, cleDepart))
      .filter((q) => (vus.has(q) ? false : (vus.add(q), true)));
    if (qui.length > 0) out.push({ cleCoord: k.cle, lignes: lignesDoublonCoordonnee(k.sorte, k.valeur, qui) });
  }
  return out;
}

// ══ LOT SYNDIC-CONTACT-ALERTE-COORDONNEES-MANQUANTES ════════════════════════════════════════════════════════════════

/** Ce qui MANQUE réellement à un contact : une ligne ouverte mais laissée vide compte comme absente. PUR. */
export function coordonneesManquantes(c: ContactForm): { telephone: boolean; email: boolean } {
  const rempli = (sorte: SorteCoordonnee): boolean => c.coordonnees.some((k) => k.sorte === sorte
    && (sorte === 'telephone' ? chiffresTelephone(k.valeur).replace('+', '') !== '' : k.valeur.trim() !== ''));
  return { telephone: !rempli('telephone'), email: !rempli('email') };
}

/**
 * L'avertissement (jamais bloquant) : « Aucun numéro de téléphone pour Prénom NOM. Valider quand même ? »,
 * « Aucune adresse e-mail pour … », « Ni téléphone ni e-mail pour … » ; « pour ce contact » sans nom. `null` : rien ne
 * manque. PUR.
 */
export function alerteCoordonnees(c: ContactForm): string | null {
  const m = coordonneesManquantes(c);
  if (!m.telephone && !m.email) return null;
  const qui = prenomNom(c.prenom, c.nom) || 'ce contact';
  const debut = m.telephone && m.email ? 'Ni téléphone ni e-mail' : m.telephone ? 'Aucun numéro de téléphone' : 'Aucune adresse e-mail';
  return `${debut} pour ${qui}. Valider quand même ?`;
}

/** Le manque seul, sans la question (pour le regrouper avec un doublon) : « Aucune adresse e-mail pour … ». PUR. */
export function phraseManque(c: ContactForm): string | null {
  const a = alerteCoordonnees(c);
  return a === null ? null : a.replace(/ Valider quand même \?$/, '');
}

/** Un numéro complet (10 chiffres au moins) — seul celui-là reçoit « Appeler ». PUR. */
export function telephoneComplet(v: string): boolean {
  return chiffresTelephone(v).replace('+', '').length >= 10;
}

/** Le contact en modification, VALIDÉ dans la fiche (remplacé, ou ajouté s'il est nouveau). PUR. */
export function appliquerBrouillon(f: SyndicForm, e: EditionContact): SyndicForm {
  if (e.immeuble === true) {
    if (!f.immeubleContacts) return f;
    const l = f.immeubleContacts.contacts;
    return { ...f, immeubleContacts: { ...f.immeubleContacts,
      contacts: e.nouveau ? [...l, e.brouillon] : l.map((c) => (c.cle === e.cle ? e.brouillon : c)) } };
  }
  return e.nouveau
    ? { ...f, contacts: [...f.contacts, e.brouillon] }
    : { ...f, contacts: f.contacts.map((c) => (c.cle === e.cle ? e.brouillon : c)) };
}

/** Une copie indépendante d'un contact, pour en faire un brouillon. PUR. */
export function copieContact(c: ContactForm): ContactForm {
  return { ...c, coordonnees: c.coordonnees.map((k) => ({ ...k })), immeubles: [...c.immeubles] };
}

/** Une affectation retirée/ajoutée depuis une copropriété : le contact suit (ou ne suit plus) cet immeuble. PUR. */
export function affecter(c: ContactForm, cle: string, suivre: boolean): ContactForm {
  const sans = c.immeubles.filter((x) => x !== cle);
  return { ...c, immeubles: suivre ? [...sans, cle] : sans };
}

/** Le formulaire a-t-il bougé depuis son ouverture ? PUR. */
export function formulaireModifie(avant: SyndicForm, apres: SyndicForm): boolean {
  return JSON.stringify(versSaisie(avant)) !== JSON.stringify(versSaisie(apres));
}

/** Les copropriétés qui seront RETIRÉES par cet enregistrement (en cours avant, absentes après). PUR. */
export function coproprietesRetirees(avant: readonly ImmeubleSaisi[], apres: readonly ImmeubleSaisi[]): string[] {
  const garde = new Set(apres.map((i) => cleImmeuble(i.libelle)));
  return avant.filter((i) => !garde.has(cleImmeuble(i.libelle))).map((i) => i.libelle);
}

// ══ LOT SYNDIC-ADRESSE-AUTOCOMPLETE-ET-CASSE-NOMS ══════════════════════════════════════════════════════════════════

/**
 * L'ADRESSE DU SYNDIC ET LES COPROPRIÉTÉS HORS PORTEFEUILLE passent par la MÊME source que la saisie d'adresse des
 * fiches : l'API Adresse (api-adresse.data.gouv.fr), déjà utilisée par `ChampAdresseBan`. Pas de nouveau service.
 * La BAN LOCALE (`/api/admin/gestion/syndics/adresses`) reste le REPLI quand l'API ne répond pas.
 */
export const URL_API_ADRESSE = 'https://api-adresse.data.gouv.fr/search/';
/** « Dès 3 caractères ». */
export const MINIMUM_ADRESSE = 3;

/** L'adresse de recherche (7 résultats, auto-complétion). PUR. */
export function urlApiAdresse(q: string): string {
  return `${URL_API_ADRESSE}?q=${encodeURIComponent(q.trim())}&limit=7&autocomplete=1`;
}

/**
 * Une réponse de l'API Adresse → des adresses « rue / code postal / ville ». PUR.
 * `name` = numéro + voie (« 8 Rue Denfert-Rochereau »), `postcode`, `city` (« Boulogne-Billancourt »). Une
 * proposition sans voie ni commune est écartée ; les doublons (même clé ET même commune) aussi.
 */
export function adressesDepuisApi(reponse: unknown): AdresseBan[] {
  const features = (reponse as { features?: Array<{ properties?: Record<string, unknown> }> } | null)?.features ?? [];
  const vus = new Set<string>();
  const out: AdresseBan[] = [];
  for (const f of features) {
    const p = f.properties ?? {};
    const libelle = typeof p.name === 'string' ? p.name.trim() : '';
    const commune = typeof p.city === 'string' ? p.city.trim() : '';
    const cp = typeof p.postcode === 'string' && /^\d{5}$/.test(p.postcode.trim()) ? p.postcode.trim() : null;
    if (libelle === '' || commune === '') continue;
    const cle = cleImmeuble(libelle);
    const marque = `${cle}|${normaliserTexte(commune)}`;
    if (vus.has(marque)) continue;
    vus.add(marque);
    out.push({ cle, libelle, codePostal: cp, commune });
  }
  return out;
}

/**
 * PRÉNOM : la première lettre de chaque partie en majuscule, le reste en minuscules, accents conservés.
 * « jean-pierre » → « Jean-Pierre », « MARIE CLAIRE » → « Marie Claire », « éLODIE » → « Élodie ». PUR.
 * Les séparateurs gardés : espace, trait d'union, apostrophe.
 */
export function casserPrenom(brut: string): string {
  return brut.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr-FR')
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, sep: string, l: string) => sep + l.toLocaleUpperCase('fr-FR'));
}

/** NOM : tout en MAJUSCULES, accents conservés (« lefèvre » → « LEFÈVRE », « dupont-martin » → « DUPONT-MARTIN »). PUR. */
export function casserNom(brut: string): string {
  return brut.trim().replace(/\s+/g, ' ').toLocaleUpperCase('fr-FR');
}

/** « aucun contact », « 1 contact », « 2 contacts ». PUR. */
export function motContacts(n: number): string {
  return n === 0 ? 'aucun contact' : n === 1 ? '1 contact' : `${n} contacts`;
}

/** « aucun bien en gestion », « 1 bien en gestion », « 3 biens en gestion ». PUR. */
export function motBiens(n: number): string {
  return n === 0 ? 'aucun bien en gestion' : n === 1 ? '1 bien en gestion' : `${n} biens en gestion`;
}

// ══ LOT SYNDIC-CATALOGUE-DANS-NOUVEAU-CONTACT ══════════════════════════════════════════════════════════════════════

/** Le catalogue trié par NOM (puis prénom ; un contact sans nom se range à son titre). PUR. */
export function trierParNom(contacts: readonly ContactForm[]): ContactForm[] {
  const cle = (c: ContactForm): string =>
    normaliserTexte(`${c.nom.trim() || valeurDuChoix(c.titreChoix, c.titreLibre)} ${c.prenom}`);
  return [...contacts].sort((a, b) => cle(a).localeCompare(cle(b), 'fr'));
}

/**
 * Le filtre du catalogue, à chaque lettre : prénom, nom, titre, téléphone, e-mail — sans accents ni casse. PUR.
 * Un numéro se cherche aussi par ses chiffres seuls (« 0613 » trouve « 06 13 86 18 77 »).
 */
export function filtrerCatalogue(contacts: readonly ContactForm[], q: string): ContactForm[] {
  const n = normaliserTexte(q);
  if (n === '') return [...contacts];
  const chiffres = q.replace(/\D/g, '');
  return contacts.filter((c) => {
    const texte = normaliserTexte([c.prenom, c.nom, valeurDuChoix(c.titreChoix, c.titreLibre),
      ...c.coordonnees.map((k) => k.valeur)].join(' '));
    if (n.split(' ').every((m) => texte.includes(m))) return true;
    return chiffres.length >= 2 && c.coordonnees.some((k) => k.sorte === 'telephone' && k.valeur.replace(/\D/g, '').includes(chiffres));
  });
}

// ══ LOT SYNDIC-NOM-VILLE-ET-NOTE-VIDE ═════════════════════════════════════════════════════════════════════════════

/**
 * LE NOM AFFICHÉ D'UN SYNDIC : « NOM / Ville ». PUR — un affichage CALCULÉ : le champ « Nom du cabinet » n'est jamais
 * réécrit en base, et la saisie garde le nom seul.
 *
 * ARNO : « Les gros cabinets (Foncia, Citya…) portent le même nom dans des communes différentes : un syndic s'identifie
 * par son NOM + la VILLE de son adresse postale. » La ville est prise telle qu'elle est enregistrée. Sans ville : le
 * nom seul, sans « / ». Si le nom finit déjà par la ville (accents, casse et ponctuation ignorés) : pas de doublon.
 */
export function nomAvecVille(nom: string, ville: string | null | undefined): string {
  const n = nom.trim();
  const v = (ville ?? '').trim();
  if (v === '') return n;
  const fin = normaliserTexte(v);
  if (fin !== '' && (normaliserTexte(n) === fin || normaliserTexte(n).endsWith(` ${fin}`))) return n;
  return `${n} / ${v}`;
}

/**
 * ══ LOT SYNDIC-DETACHER-DE-LA-COPROPRIETE — DÉTACHER UN CONTACT DE CETTE COPROPRIÉTÉ. PUR. ══════════════════════════
 * Seule l'affectation à CET immeuble est retirée : le contact reste au catalogue et garde ses autres copropriétés.
 * Un contact « Tous les immeubles » devient rattaché EXPLICITEMENT à toutes les AUTRES copropriétés du syndic, sauf
 * celle-ci : il ne suit donc plus automatiquement les copropriétés futures (c'est la demande d'Arno).
 */
export function detacher(c: ContactForm, cle: string, _toutesLesCles: readonly string[] = []): ContactForm {
  // LOT SYNDIC-FIN-TOUS-LES-IMMEUBLES — plus de contact « commun » : détacher = retirer CETTE affectation, et rien d'autre.
  return affecter(c, cle, false);
}

// ══ LOT SYNDIC-CONTACTS-ANTI-DOUBLON ════════════════════════════════════════════════════════════════════════════════
//
// RÈGLES (Arno) — comparaison sans accents, sans casse, espaces et tirets ignorés :
//   a. une adresse e-mail n'appartient qu'à UN contact de syndic, tous syndics confondus (bloquant) ;
//   b. dans un même syndic, deux contacts n'ont pas le même Prénom + NOM (bloquant) ;
//   c. même Prénom + NOM dans un AUTRE syndic : simple avertissement (le contact a pu changer de cabinet).

/** La clé d'un nom : « Jean-Pierre DUPONT » = « jean pierre dupont » = « JEANPIERRE Dupont ». '' si aucun nom. PUR. */
export function cleNom(prenom: string | null | undefined, nom: string | null | undefined): string {
  return normaliserTexte(`${prenom ?? ''} ${nom ?? ''}`).replace(/ /g, '');
}

/** La clé d'un e-mail : en minuscules, sans espaces. PUR. */
export function cleEmail(v: string | null | undefined): string {
  return (v ?? '').toLowerCase().replace(/\s+/g, '');
}

/** Les e-mails (clés) d'un contact du formulaire. PUR. */
export function emailsDe(c: ContactForm): string[] {
  return c.coordonnees.filter((k) => k.sorte === 'email' && k.valeur.trim() !== '').map((k) => cleEmail(k.valeur));
}

/** Les doublons d'un contact parmi les AUTRES contacts du même syndic (le formulaire fait foi). PUR. */
export function doublonsLocaux(c: ContactForm, autres: readonly ContactForm[]): { email: ContactForm | null; nom: ContactForm | null } {
  const mesEmails = new Set(emailsDe(c));
  const n = cleNom(c.prenom, c.nom);
  return {
    email: mesEmails.size === 0 ? null : (autres.find((a) => emailsDe(a).some((e) => mesEmails.has(e))) ?? null),
    nom: n === '' ? null : (autres.find((a) => cleNom(a.prenom, a.nom) === n) ?? null),
  };
}

/** Un contact trouvé AILLEURS (un autre syndic), tel que le serveur le décrit. */
export interface ContactAilleurs {
  prenom: string | null; nom: string | null; titre: string | null; syndicId: number; syndicNom: string; syndicVille: string | null;
}

/** « Ce contact existe déjà : Prénom NOM · titre · NOM / Ville » — sans morceau vide. PUR. */
export function motDoublon(c: { prenom?: string | null; nom?: string | null; titre?: string | null }, syndic: string): string {
  return `Ce contact existe déjà : ${[prenomNom(c.prenom, c.nom), (c.titre ?? '').trim(), syndic].filter((x) => x !== '').join(' · ')}`;
}

// ══ LOT SYNDIC-BLOC-PORTEFEUILLE — « LOTS DU PORTEFEUILLE LIÉS À CE SYNDIC » ══════════════════════════════════════════

export interface LotDuPortefeuille extends LotDeCopropriete {
  /** Vrai si ce lot ne recevra ce syndic qu'au « Valider » (sa copropriété n'est pas encore enregistrée chez lui). */
  aValider: boolean;
}
export interface GroupeDeLots { cle: string; adresse: string; lots: LotDuPortefeuille[] }

/**
 * LOT COPRO-PLUSIEURS-ADRESSES — UNE ADRESSE N'APPARTIENT QU'À UNE COPROPRIÉTÉ. `null` : on peut l'ajouter à la
 * copropriété `cleCopro` ; sinon, ce qui l'en empêche, en clair. PUR.
 *   · déjà une copropriété (autre) rattachée à un syndic  ⇒ « … est déjà la copropriété rattachée à SYNDIC / Ville. »
 *   · déjà l'adresse secondaire d'une autre copropriété   ⇒ « … est déjà une adresse de la copropriété … »
 *   · déjà une copropriété (ou une adresse) de CETTE saisie ⇒ « … figure déjà dans les copropriétés de ce syndic. »
 */
export function conflitAdresse(a: AdresseSaisie, cleCopro: string, immeubles: readonly ImmeubleSaisi[], connus: readonly ImmeubleConnu[]): string | null {
  const k = cleImmeuble(a.libelle);
  const affichee = adresseImmeuble(a.libelle, a.codePostal, a.commune);
  if (k === '') return 'Adresse illisible.';
  for (const im of immeubles) {
    const cim = cleImmeuble(im.libelle);
    if (cim === cleCopro) {
      if (k === cim || (im.adresses ?? []).some((x) => cleImmeuble(x.libelle) === k)) return `${affichee} est déjà une adresse de cette copropriété.`;
      continue;
    }
    if (k === cim || (im.adresses ?? []).some((x) => cleImmeuble(x.libelle) === k)) return `${affichee} figure déjà dans les copropriétés de ce syndic.`;
  }
  const c = connus.find((x) => x.cle === k);
  if (c?.principale && c.principale.cle !== cleCopro) {
    const p = adresseImmeuble(c.principale.libelle, c.principale.codePostal, c.principale.commune);
    return `${affichee} est déjà une adresse de la copropriété ${p}${c.syndic ? ` (rattachée à ${nomAvecVille(c.syndic.nom, c.syndic.ville)})` : ''}.`;
  }
  if (c && !c.principale && c.syndic) return `${affichee} est déjà la copropriété rattachée à ${nomAvecVille(c.syndic.nom, c.syndic.ville)}.`;
  return null;
}

/** La voie d'un immeuble sans son numéro (« 12 bis rue des Pavillons » → « rue des pavillons »), pour le tri. PUR. */
function voieSansNumero(libelle: string): string {
  return normaliserTexte(libelle).replace(/^\d+\s*(bis|ter|quater|[a-z](?=\s))?\s*/, '');
}
function numeroDe(libelle: string): number {
  const m = /^\s*(\d+)/.exec(libelle);
  return m === null ? Number.MAX_SAFE_INTEGER : Number(m[1]);
}

/**
 * LOT SYNDIC-CONTACT-ARRIVEE-ROSE-ET-COPROS-REPLIEES — des copropriétés (adresse complète) par NOM DE VOIE (sans le
 * numéro, sans accents), puis par numéro croissant : l'ordre des sous-cadres du portefeuille. PUR.
 */
export function trierParVoie<T extends { adresse: string }>(l: readonly T[]): T[] {
  return [...l].sort((a, b) => voieSansNumero(a.adresse).localeCompare(voieSansNumero(b.adresse), 'fr') || numeroDe(a.adresse) - numeroDe(b.adresse));
}

/**
 * TOUS LES LOTS DU PORTEFEUILLE RATTACHÉS À CE SYNDIC, regroupés par adresse d'immeuble. PUR.
 * Ordre des groupes : la copropriété du bien ouvert d'abord (`cleDepart`), puis les autres par nom de voie (sans le
 * numéro, sans accents), puis par numéro croissant. Dans un groupe : par premier propriétaire, puis par numéro de lot.
 * `dejaRattachees` = les copropriétés déjà enregistrées chez ce syndic : les autres ne le recevront qu'au « Valider ».
 * Une copropriété sans lot en gestion ne fait pas de groupe.
 */
export function lotsDuPortefeuille(immeubles: readonly ImmeubleSaisi[], connus: readonly ImmeubleConnu[], cleDepart: string | null,
  dejaRattachees: ReadonlySet<string>): GroupeDeLots[] {
  const parCle = new Map(connus.map((i) => [i.cle, i]));
  const vus = new Set<string>();
  const groupes: Array<GroupeDeLots & { libelle: string }> = [];
  for (const im of immeubles) {
    const cle = cleImmeuble(im.libelle);
    if (vus.has(cle)) continue;
    vus.add(cle);
    const i = parCle.get(cle);
    // LOT COPRO-PLUSIEURS-ADRESSES — les lots de la copropriété sont ceux de TOUTES ses adresses ; ceux d'une adresse
    // pas encore enregistrée ne recevront ce syndic qu'au « Valider ».
    const secondaires = (im.adresses ?? []).map((a) => ({ a, cle: cleImmeuble(a.libelle) }));
    const brut = [
      ...(i?.lots ?? []).map((l) => ({ ...l, aValider: !dejaRattachees.has(cle) })),
      ...secondaires.flatMap((x) => (parCle.get(x.cle)?.lots ?? []).map((l) => ({ ...l, aValider: !dejaRattachees.has(x.cle) }))),
    ];
    if (brut.length === 0) continue;
    const lots = brut.sort((a, b) =>
      (a.triProprietaire ?? '\uffff').localeCompare(b.triProprietaire ?? '\uffff', 'fr')
      || a.numero.localeCompare(b.numero, 'fr', { numeric: true }));
    const principale = adresseImmeuble(i?.libelle ?? im.libelle, i?.codePostal ?? im.codePostal, i?.commune ?? im.commune);
    const autres = secondaires.map((x) => adresseImmeuble(x.a.libelle, parCle.get(x.cle)?.codePostal ?? x.a.codePostal, parCle.get(x.cle)?.commune ?? x.a.commune));
    groupes.push({ cle, libelle: i?.libelle ?? im.libelle, adresse: [principale, ...autres].join(' · '), lots });
  }
  groupes.sort((a, b) => {
    if (a.cle === cleDepart) return -1;
    if (b.cle === cleDepart) return 1;
    return voieSansNumero(a.libelle).localeCompare(voieSansNumero(b.libelle), 'fr') || numeroDe(a.libelle) - numeroDe(b.libelle);
  });
  return groupes.map(({ libelle: _l, ...g }) => g);
}
