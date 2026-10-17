/**
 * ══ 🔴🔴 TUILE LOCATION — RATTACHER LES PERSONNES UNE À UNE AU NOUVEAU BIEN (Arno, 18/10/2026). PUR. ════════════════════
 *
 * « Une fiche propriétaire peut regrouper plusieurs personnes (ex. mari et femme) et des contacts, mais un bien peut
 * appartenir en propre à une seule d'entre elles. » Choisir un résultat de la recherche ouvre « Qui rattacher à ce bien ? » :
 *   · « Personnes propriétaires » : la personne choisie ET les personnes propriétaires liées à elle dans la Gestion
 *     (co-propriétaires de ses biens du portefeuille : conjoint, indivisaires, SCI…) ;
 *   · « Contacts du propriétaire » : les cartes « contact du propriétaire » déjà posées sur leurs biens (même table, même rôle).
 * Par défaut SEULE la personne cherchée est cochée ; au moins une personne propriétaire pour valider ; jamais de doublon.
 * Module PUR, lu par l'écran comme par le serveur.
 */

export interface PersonneProprietaire {
  id: number; nom: string; telephone: string | null; email: string | null;
  /** Les adresses des biens du portefeuille qu'elle possède déjà (propriétaire principal ou co-propriétaire en cours). */
  biens: string[];
}

export interface ContactProprietaire {
  /** L'identifiant de la carte de contact (Gestion) d'où il vient. */
  id: number;
  /** Le bien de la Gestion qui porte cette carte (lien « Modifier dans la fiche »). */
  lotId: number;
  /** L'adresse e-mail : l'IDENTITÉ d'une carte de contact dans la Gestion (deux cartes, un même contact). */
  email: string;
  nom: string; qualite: string | null; telephone: string | null;
  biens: string[];
}

export interface PersonnesARattacher {
  /** La personne choisie dans la recherche. */
  choisie: number;
  proprietaires: PersonneProprietaire[];
  contacts: ContactProprietaire[];
}

export interface Selection { proprietaires: number[]; contacts: number[] }

/** Par défaut, SEULE la personne cherchée est cochée (Arno). PUR. */
export function selectionParDefaut(p: PersonnesARattacher): Selection {
  return { proprietaires: p.proprietaires.some((x) => x.id === p.choisie) ? [p.choisie] : [], contacts: [] };
}

/** « Au moins une personne propriétaire cochée pour valider. » `null` = valide. PUR. */
export function refusSelection(s: Selection): string | null {
  return s.proprietaires.length === 0 ? 'Cochez au moins une personne propriétaire.' : null;
}

const cleEmail = (e: string): string => e.trim().toLowerCase();

/** Ajoute des propriétaires sans jamais de doublon (même fiche). PUR. */
export function ajouterProprietaires(deja: readonly PersonneProprietaire[], ajout: readonly PersonneProprietaire[]): PersonneProprietaire[] {
  const r = [...deja];
  for (const p of ajout) if (!r.some((x) => x.id === p.id)) r.push(p);
  return r;
}

/** Ajoute des contacts sans jamais de doublon (même carte, ou même adresse e-mail = même contact). PUR. */
export function ajouterContacts(deja: readonly ContactProprietaire[], ajout: readonly ContactProprietaire[]): ContactProprietaire[] {
  const r = [...deja];
  for (const c of ajout) if (!r.some((x) => x.id === c.id || cleEmail(x.email) === cleEmail(c.email))) r.push(c);
  return r;
}

/** Une liste de contacts réduite à un par adresse e-mail (la première carte rencontrée l'emporte). PUR. */
export function contactsUniques(l: readonly ContactProprietaire[]): ContactProprietaire[] {
  return ajouterContacts([], l);
}
