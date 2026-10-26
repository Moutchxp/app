/**
 * ══ 🔴 LES FICHES MODIFIÉES DEPUIS « SUIVI DU MOIS » — LES RÈGLES PURES (Arno, 24/10/2026, migration 417) ═══════════════════════
 *   · le récapitulatif ne montre QUE les champs modifiés : « Champ : ancienne valeur → nouvelle valeur » ;
 *   · une fiche modifiée par quelqu'un d'autre depuis l'ouverture n'est pas écrasée : « modifiée par X le … à HH:MM, rechargez » ;
 *   · « Dernière modification : <nom>, le <date> à <heure> ».
 * PUR : aucune base, aucun réseau.
 */
export const ECRANS_TRACES = ['Suivi du mois', 'Dossier de location (Suivi du mois)', 'Annuaire des apporteurs', 'Fiche locataire (Suivi du mois)', 'Nouveau locataire',
  'Fiche du bien (Suivi du mois)', 'Fiche du propriétaire', 'Paramètres Location', 'Fiche locataire (Location)'] as const;
export type EcranTrace = typeof ECRANS_TRACES[number];
export type SujetTrace = 'locataire' | 'proprietaire' | 'lot' | 'bail' | 'activite' | 'apporteur' | 'parametre';

const PARIS = 'Europe/Paris';
/** « 24/10/2026 » et « 14:05 », à l'heure de Paris. PUR. */
export function dateHeureParis(iso: string | Date): { date: string; heure: string } {
  const d = typeof iso === 'string' ? new Date(iso.includes('T') || /[+-]\d\d(:?\d\d)?$/.test(iso) ? iso : iso.replace(' ', 'T')) : iso;
  if (Number.isNaN(d.getTime())) return { date: '—', heure: '—' };
  const date = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  const heure = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return { date, heure };
}

export interface Modification { par: string; quand: string }

/** « Dernière modification : Léa Martin, le 24/10/2026 à 14:05 » ; aucune : « Aucune modification enregistrée ». PUR. */
export function mentionDerniereModification(m: Modification | null): string {
  if (m === null) return 'Aucune modification enregistrée.';
  const { date, heure } = dateHeureParis(m.quand);
  return `Dernière modification : ${m.par}, le ${date} à ${heure}.`;
}

/** Le refus d'un enregistrement qui écraserait la modification d'un autre. PUR. */
export function motifConflitFiche(m: Modification | null): string {
  if (m === null) return 'Cette fiche a été modifiée depuis son ouverture : rechargez-la avant d’enregistrer. Rien n’a été enregistré.';
  const { date, heure } = dateHeureParis(m.quand);
  return `Cette fiche a été modifiée par ${m.par} le ${date} à ${heure} depuis son ouverture : rechargez-la avant d’enregistrer. Rien n’a été enregistré.`;
}

export interface ChangementChamp { champ: string; avant: string; apres: string; /** La clé de la saisie (seuls ces champs partent). */ cle?: keyof CarteApres }

/** La carte d'une personne telle qu'ouverte (ses valeurs en base) et telle qu'enregistrée (ce qui partira). */
export interface CarteAvant {
  civilite: string | null; prenom: string | null; nom: string; qualite: string | null; adresse: string | null; codePostal: string | null;
  commune: string | null; note: string | null; contacts: readonly { sorte: 'telephone' | 'email'; affichage: string }[];
}
export interface CarteApres {
  civilite?: string | null; prenom?: string | null; nom?: string; qualite?: string | null; adresse?: string | null; codePostal?: string | null;
  commune?: string | null; note?: string | null; coordonnees?: readonly { sorte: 'telephone' | 'email'; valeur: string }[];
}

const propre = (x: string | null | undefined): string => (x ?? '').replace(/\s+/g, ' ').trim();
const affiche = (x: string): string => (x === '' ? '(vide)' : x);
const MOT_SORTE = { telephone: 'Téléphone', email: 'E-mail' } as const;
const listeCoordonnees = (l: readonly { sorte: 'telephone' | 'email'; v: string }[]): string =>
  l.filter((c) => c.v !== '').map((c) => `${MOT_SORTE[c.sorte]} ${c.v}`).sort((a, b) => a.localeCompare(b, 'fr')).join(' · ');

/**
 * Les SEULS champs qui changent entre la carte ouverte et la saisie (un champ absent de la saisie ne change pas). Les espaces ne
 * comptent pas ; la note garde ses retours à la ligne. PUR.
 */
export function changementsCarte(avant: CarteAvant, apres: CarteApres): ChangementChamp[] {
  const sortie: ChangementChamp[] = [];
  const champ = (mot: string, cle: keyof CarteApres, a: string | null | undefined, b: string | null | undefined, garderLignes = false): void => {
    if (b === undefined) return;
    const x = garderLignes ? (a ?? '').trim() : propre(a);
    const y = garderLignes ? (b ?? '').trim() : propre(b);
    if (x !== y) sortie.push({ champ: mot, avant: affiche(x), apres: affiche(y), cle });
  };
  champ('Civilité', 'civilite', avant.civilite, apres.civilite);
  champ('Prénom', 'prenom', avant.prenom, apres.prenom);
  champ('Nom', 'nom', avant.nom, apres.nom);
  champ('Qualité', 'qualite', avant.qualite, apres.qualite);
  champ('Adresse', 'adresse', avant.adresse, apres.adresse);
  champ('Code postal', 'codePostal', avant.codePostal, apres.codePostal);
  champ('Commune', 'commune', avant.commune, apres.commune);
  champ('Note', 'note', avant.note, apres.note, true);
  if (apres.coordonnees !== undefined) {
    const x = listeCoordonnees(avant.contacts.map((c) => ({ sorte: c.sorte, v: propre(c.affichage) })));
    const y = listeCoordonnees(apres.coordonnees.map((c) => ({ sorte: c.sorte, v: propre(c.valeur) })));
    if (x !== y) sortie.push({ champ: 'Coordonnées', avant: affiche(x), apres: affiche(y), cle: 'coordonnees' });
  }
  return sortie;
}

/**
 * Ce qui PART : les seuls champs modifiés de la saisie (le serveur n'écrit que les champs reçus) — le récapitulatif dit donc
 * exactement ce qui sera écrit. PUR.
 */
export function saisieDesChangements<T extends CarteApres>(saisie: T, changements: readonly ChangementChamp[]): Partial<T> {
  const sortie: Partial<T> = {};
  for (const c of changements) if (c.cle !== undefined) (sortie as Record<string, unknown>)[c.cle] = saisie[c.cle];
  return sortie;
}

/** Le mot d'un champ de la base, pour le journal (une ligne par champ). */
export const MOT_COLONNE_PERSONNE: Record<string, string> = {
  civilite: 'Civilité', nom: 'Nom', prenom: 'Prénom', qualite: 'Qualité', adresse: 'Adresse', code_postal: 'Code postal', commune: 'Commune', note: 'Note',
};
