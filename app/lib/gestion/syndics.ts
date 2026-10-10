import { normaliserTexte } from './annuaire';

/**
 * ══ 🔴🔴 LOT ANNUAIRE-SYNDICS-ET-ENTETE-BIEN, COMMIT 2 — L'ANNUAIRE DES SYNDICS : LES RÈGLES PURES ═══════════════
 *
 * Module PUR et client-safe : la fiche syndic (écran) et le dépôt (base) lisent les mêmes types et la même
 * validation. Aucune E/S ici.
 *
 * LE MODÈLE (migration 324) : un SYNDIC → plusieurs COPROPRIÉTÉS → plusieurs LOTS. Une copropriété est désignée par
 * la clé de son immeuble : la colonne « Immeuble » de l'export WIPPIMMO, normalisée par `normaliserTexte`. Un lot
 * appartient à une copropriété quand son immeuble normalisé vaut cette clé — il n'y a pas de table de liens lot ↔
 * copropriété, et c'est voulu : un lot ajouté par un ré-import futur reçoit son syndic sans qu'on le lui pose.
 */

export type SorteCoordonnee = 'email' | 'telephone';

/** Les titres proposés ; « Personnalisé » ouvre un champ libre. */
export const TITRES_CONTACT = ['Responsable de copropriété', 'Service comptabilité'] as const;
/** Les libellés proposés pour une coordonnée ; « Personnalisé » ouvre un champ libre. */
export const LIBELLES_COORDONNEE = ['Ligne directe', 'Portable', 'Standard'] as const;

export interface CoordonneeSaisie { id?: number | null; sorte: SorteCoordonnee; libelle: string; valeur: string }
export interface ContactSaisi {
  id?: number | null; titre: string; prenom: string; nom: string; coordonnees: CoordonneeSaisie[];
}
export interface SyndicSaisi {
  nom: string; adresse: string; telephone: string; email: string; note: string;
  contacts: ContactSaisi[];
  /** Les immeubles rattachés, par leur libellé (l'« Immeuble » de l'export, tel qu'affiché). */
  immeubles: string[];
}

/** Un lot d'une copropriété, tel que l'écran le montre avant de confirmer. */
export interface LotDeCopropriete { id: number; numero: string; adresse: string | null; commune: string | null }

/** Un immeuble connu : de l'annuaire (ses lots) et/ou déjà déclaré comme copropriété ; avec son syndic en cours. */
export interface ImmeubleConnu {
  cle: string; libelle: string; lots: LotDeCopropriete[];
  syndic: { id: number; nom: string } | null;
}

export interface SyndicResume {
  id: number; nom: string; email: string | null; telephone: string | null;
  nbCoproprietes: number; nbBiens: number;
  /** Tout ce qu'on peut chercher : nom, e-mails (génériques et des contacts), domaines. Déjà normalisé. */
  cherchable: string;
}

export interface FicheSyndic {
  id: number; nom: string; adresse: string | null; telephone: string | null; email: string | null; note: string | null;
  creeLe: string; creeParLibelle: string; majLe: string | null; majParLibelle: string | null;
  contacts: Array<{
    id: number; titre: string | null; prenom: string | null; nom: string | null;
    coordonnees: Array<{ id: number; sorte: SorteCoordonnee; libelle: string | null; valeur: string }>;
  }>;
  /** Les copropriétés EN COURS, chacune avec ses lots. */
  coproprietes: Array<{ id: number; cle: string; libelle: string; debut: string; lots: LotDeCopropriete[] }>;
  /** Les liens FERMÉS : l'historique, jamais effacé. */
  historique: Array<{ libelle: string; debut: string; fin: string; motif: string | null }>;
}

/** La clé d'un immeuble. PUR. */
export function cleImmeuble(libelle: string | null | undefined): string {
  return normaliserTexte(libelle);
}

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
 * LA SAISIE REÇUE, VÉRIFIÉE ET MISE EN FORME. PUR.
 *
 * Règles : le NOM du cabinet est obligatoire ; un contact a au moins un nom, un prénom ou un titre ; une coordonnée
 * vide est ignorée (une ligne ajoutée puis laissée vide n'est pas une erreur) ; un e-mail doit ressembler à un
 * e-mail. Les immeubles sont dédoublonnés par leur CLÉ.
 */
export function validerSyndic(brut: unknown): { ok: true; syndic: SyndicSaisi } | { ok: false; motif: string } {
  if (typeof brut !== 'object' || brut === null) return { ok: false, motif: 'Saisie illisible.' };
  const b = brut as Record<string, unknown>;
  const nom = texte(b.nom);
  if (nom === '') return { ok: false, motif: 'Le nom du cabinet est obligatoire.' };
  const email = texte(b.email);
  if (email !== '' && !emailPlausible(email)) return { ok: false, motif: `E-mail du cabinet illisible : « ${email} ».` };

  const contactsBruts = Array.isArray(b.contacts) ? b.contacts.slice(0, 100) : [];
  const contacts: ContactSaisi[] = [];
  for (const cb of contactsBruts) {
    if (typeof cb !== 'object' || cb === null) continue;
    const c = cb as Record<string, unknown>;
    const coordonnees: CoordonneeSaisie[] = [];
    for (const kb of (Array.isArray(c.coordonnees) ? c.coordonnees.slice(0, 50) : [])) {
      if (typeof kb !== 'object' || kb === null) continue;
      const k = kb as Record<string, unknown>;
      const valeur = texte(k.valeur);
      if (valeur === '') continue;
      const sorte: SorteCoordonnee = k.sorte === 'email' ? 'email' : 'telephone';
      if (sorte === 'email' && !emailPlausible(valeur)) return { ok: false, motif: `E-mail illisible : « ${valeur} ».` };
      coordonnees.push({ id: entierOuNull(k.id), sorte, libelle: texte(k.libelle), valeur });
    }
    const contact: ContactSaisi = {
      id: entierOuNull(c.id), titre: texte(c.titre), prenom: texte(c.prenom), nom: texte(c.nom), coordonnees,
    };
    const vide = contact.titre === '' && contact.prenom === '' && contact.nom === '';
    if (vide && coordonnees.length === 0) continue; // un contact ajouté puis laissé vide : ignoré
    if (vide) return { ok: false, motif: 'Chaque contact doit avoir au moins un nom ou un titre.' };
    contacts.push(contact);
  }

  const vus = new Set<string>();
  const immeubles: string[] = [];
  for (const ib of (Array.isArray(b.immeubles) ? b.immeubles.slice(0, 300) : [])) {
    const libelle = texte(ib);
    const cle = cleImmeuble(libelle);
    if (cle === '' || vus.has(cle)) continue;
    vus.add(cle);
    immeubles.push(libelle);
  }

  return {
    ok: true,
    syndic: {
      nom, adresse: texte(b.adresse), telephone: texte(b.telephone), email, note: texte(b.note, BORNE_NOTE),
      contacts, immeubles,
    },
  };
}

function entierOuNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * LES BIENS QUI RECEVRONT CE SYNDIC — ce que l'écran montre AVANT de confirmer. PUR.
 * Tous les lots des immeubles saisis ; et, pour chaque immeuble déjà géré par un AUTRE syndic, ce changement.
 */
export function apercuPropagation(immeubles: readonly string[], connus: readonly ImmeubleConnu[], syndicId: number | null): {
  lots: Array<LotDeCopropriete & { immeuble: string }>;
  changements: Array<{ immeuble: string; ancien: string }>;
  sansLot: string[];
} {
  const parCle = new Map(connus.map((i) => [i.cle, i]));
  const lots: Array<LotDeCopropriete & { immeuble: string }> = [];
  const changements: Array<{ immeuble: string; ancien: string }> = [];
  const sansLot: string[] = [];
  for (const libelle of immeubles) {
    const i = parCle.get(cleImmeuble(libelle));
    if (i === undefined || i.lots.length === 0) sansLot.push(libelle);
    if (i === undefined) continue;
    for (const l of i.lots) lots.push({ ...l, immeuble: i.libelle });
    if (i.syndic !== null && i.syndic.id !== syndicId) changements.push({ immeuble: i.libelle, ancien: i.syndic.nom });
  }
  return { lots, changements, sansLot };
}

/** Les immeubles qui répondent à une saisie (auto-complétion). PUR. */
export function immeublesQuiRepondent(q: string, connus: readonly ImmeubleConnu[], max = 12): ImmeubleConnu[] {
  const n = normaliserTexte(q);
  if (n === '') return [];
  return connus.filter((i) => i.cle.includes(n)).slice(0, max);
}

/** Les syndics qui répondent à une recherche (nom, e-mail, domaine). PUR. */
export function syndicsQuiRepondent(q: string, syndics: readonly SyndicResume[]): SyndicResume[] {
  const n = normaliserTexte(q);
  if (n === '') return [...syndics];
  return syndics.filter((s) => s.cherchable.includes(n));
}

/** « Prénom Nom », ou le titre quand il n'y a pas de nom. PUR. */
export function nomDuContact(c: { titre?: string | null; prenom?: string | null; nom?: string | null }): string {
  const nom = [c.prenom, c.nom].map((x) => (x ?? '').trim()).filter((x) => x !== '').join(' ');
  return nom !== '' ? nom : (c.titre ?? '').trim();
}

// ══ LE FORMULAIRE DE LA FICHE — ses états, et le passage fiche ⇄ formulaire ⇄ saisie. PUR. ══════════════════════

/** Le choix « Personnalisé » d'une liste (titre ou libellé) : il ouvre un champ libre. */
export const PERSONNALISE = 'Personnalisé';

export interface CoordonneeForm { cle: string; id: number | null; sorte: SorteCoordonnee; choix: string; libre: string; valeur: string }
export interface ContactForm { cle: string; id: number | null; titreChoix: string; titreLibre: string; prenom: string; nom: string; coordonnees: CoordonneeForm[] }
export interface SyndicForm {
  nom: string; adresse: string; telephone: string; email: string; note: string;
  contacts: ContactForm[]; immeubles: string[];
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

export function formulaireVide(immeubleDepart?: string | null): SyndicForm {
  const i = (immeubleDepart ?? '').trim();
  return { nom: '', adresse: '', telephone: '', email: '', note: '', contacts: [], immeubles: i === '' ? [] : [i] };
}

export function contactVide(): ContactForm {
  return { cle: cleLocale(), id: null, titreChoix: '', titreLibre: '', prenom: '', nom: '', coordonnees: [] };
}

export function coordonneeVide(sorte: SorteCoordonnee): CoordonneeForm {
  return { cle: cleLocale(), id: null, sorte, choix: '', libre: '', valeur: '' };
}

/** La fiche lue → le formulaire de modification, pré-rempli. PUR. */
export function versFormulaire(f: FicheSyndic): SyndicForm {
  return {
    nom: f.nom, adresse: f.adresse ?? '', telephone: f.telephone ?? '', email: f.email ?? '', note: f.note ?? '',
    contacts: f.contacts.map((c) => {
      const t = choixDe(c.titre, TITRES_CONTACT);
      return {
        cle: cleLocale(), id: c.id, titreChoix: t.choix, titreLibre: t.libre, prenom: c.prenom ?? '', nom: c.nom ?? '',
        coordonnees: c.coordonnees.map((k) => {
          const l = choixDe(k.libelle, LIBELLES_COORDONNEE);
          return { cle: cleLocale(), id: k.id, sorte: k.sorte, choix: l.choix, libre: l.libre, valeur: k.valeur };
        }),
      };
    }),
    immeubles: f.coproprietes.map((c) => c.libelle),
  };
}

/** Le formulaire → la saisie envoyée au serveur (qui la re-valide). PUR. */
export function versSaisie(f: SyndicForm): SyndicSaisi {
  return {
    nom: f.nom, adresse: f.adresse, telephone: f.telephone, email: f.email, note: f.note,
    contacts: f.contacts.map((c) => ({
      id: c.id, titre: valeurDuChoix(c.titreChoix, c.titreLibre), prenom: c.prenom, nom: c.nom,
      coordonnees: c.coordonnees.map((k) => ({ id: k.id, sorte: k.sorte, libelle: valeurDuChoix(k.choix, k.libre), valeur: k.valeur })),
    })),
    immeubles: f.immeubles,
  };
}

/** Les copropriétés qui seront RETIRÉES par cet enregistrement (en cours avant, absentes après). PUR. */
export function coproprietesRetirees(avant: readonly string[], apres: readonly string[]): string[] {
  const garde = new Set(apres.map(cleImmeuble));
  return avant.filter((l) => !garde.has(cleImmeuble(l)));
}
