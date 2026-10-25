import { changementsCarte, saisieDesChangements, type CarteApres, type ChangementChamp } from '../gestion/traceFiche';
import { carteEstComplete, ligneDeManques, manquesDeCompletude, titreSansCarteComplete, verdictFamille } from '../gestion/carteComplete';
import { manquesClientLocation } from './cartesLocation';

/**
 * ══ 🔴 Arno (25/10/2026) — « FICHE LOCATAIRE » DU SUIVI DU MOIS = LES CARTES DU BLOC 1 DE « NOUVEAU LOCATAIRE », EN MODIFICATION (PUR) ══
 * Une carte par locataire du bail et par contact du locataire (garant, conjoint…), préremplie ; « + Ajouter… » un colocataire ou un
 * contact. Ici : la lecture telle que l'écran la montre, l'avertissement « Aucune carte complète », le récapitulatif (ancienne →
 * nouvelle, carte par carte), la vérification d'une saisie (mêmes contrôles que Nouveau locataire). L'écriture : `ficheLocataireCartesRepo`.
 */
export const ECRAN_FICHE_LOCATAIRE = 'Fiche locataire (Suivi du mois)' as const;

export type SorteCarteFiche = 'client' | 'contact';
/** Une carte lue : un locataire (`client`, fiche de l'annuaire) ou un contact du locataire (`contact`, carte de contact du bien). */
export interface CarteFicheLue {
  id: number; sorte: SorteCarteFiche; civilite: string | null; prenom: string | null; nom: string; qualite: string | null;
  adresse: string | null; codePostal: string | null; commune: string | null; note: string | null;
  contacts: { id: number; sorte: 'telephone' | 'email'; affichage: string; libelle: string | null }[];
}
export interface LectureFicheLocataire {
  locataireId: number; bailId: number | null; titre: string;
  /** L'empreinte de ce qui est lu : différente à l'enregistrement = modifié par ailleurs (conflit, rien n'est écrasé). */
  version: string;
  cartes: CarteFicheLue[];
}
export interface ChampsCarte extends CarteApres { coordonnees?: { sorte: 'telephone' | 'email'; valeur: string; libelle?: string | null }[] }
export interface SaisieFicheLocataire {
  version: string;
  /** Les cartes EXISTANTES modifiées : les seuls champs modifiés. */
  modifiees: { id: number; sorte: SorteCarteFiche; champs: ChampsCarte }[];
  /** Les cartes AJOUTÉES (« + Ajouter… ») : un colocataire (`client`) ou un contact du locataire. */
  nouvelles: { sorte: SorteCarteFiche; champs: ChampsCarte }[];
}
export interface ChangementFiche { carte: string; champ: string; avant: string; apres: string }

export const nomCarte = (c: { civilite?: string | null; nom?: string | null; prenom?: string | null }): string =>
  [c.civilite, (c.nom ?? '').toUpperCase(), c.prenom].filter((x) => x).join(' ');
const coordonneesDe = (c: CarteFicheLue): { sorte: 'telephone' | 'email'; valeur: string }[] => c.contacts.map((k) => ({ sorte: k.sorte, valeur: k.affichage }));

/** L'avertissement de l'ancienne vue, gardé en tête : aucune carte de locataire complète → une ligne par carte et ce qui lui manque. PUR. */
export function avertissementCartes(cartes: readonly CarteFicheLue[]): { titre: string; lignes: string[] } | null {
  const clients = cartes.filter((c) => c.sorte === 'client');
  if (clients.length === 0 || clients.some((c) => carteEstComplete({ nom: c.nom, coordonnees: coordonneesDe(c) }))) return null;
  return { titre: titreSansCarteComplete('locataire'), lignes: clients.map((c) => ligneDeManques(nomCarte(c), manquesDeCompletude({ nom: c.nom, coordonnees: coordonneesDe(c) }))) };
}

/** Une carte ouverte (lue) et ses champs saisis → les seuls champs modifiés (rien : la carte n'a pas changé). PUR. */
export function champsModifies(lue: CarteFicheLue, saisis: ChampsCarte): { changements: ChangementChamp[]; champs: ChampsCarte } {
  const changements = changementsCarte(lue, saisis);
  return { changements, champs: saisieDesChangements(saisis, changements) };
}

/** Le récapitulatif : carte par carte, « Champ : ancienne → nouvelle » ; une carte ajoutée en une ligne. PUR. */
export function changementsFiche(lu: LectureFicheLocataire, s: SaisieFicheLocataire): ChangementFiche[] {
  const sortie: ChangementFiche[] = [];
  for (const m of s.modifiees) {
    const c = lu.cartes.find((x) => x.id === m.id && x.sorte === m.sorte);
    if (c === undefined) continue;
    for (const x of changementsCarte(c, m.champs)) sortie.push({ carte: `${c.sorte === 'client' ? 'Locataire' : 'Contact'} ${nomCarte(c)}`, champ: x.champ, avant: x.avant, apres: x.apres });
  }
  for (const n of s.nouvelles) {
    sortie.push({ carte: n.sorte === 'client' ? 'Nouveau colocataire' : 'Nouveau contact du locataire', champ: 'Carte', avant: '(aucune)',
      apres: [nomCarte(n.champs), n.champs.qualite, (n.champs.coordonnees ?? []).map((k) => k.valeur).filter((v) => v.trim() !== '').join(' · ')].filter((x) => x).join(' — ') });
  }
  return sortie;
}

/**
 * Le refus d'une saisie (le serveur la refait avant toute écriture) : le nom d'une carte jamais vide ; la famille des locataires
 * garde une carte complète si elle en avait une (la règle de la Gestion) ; sans aucune carte complète, la première carte client
 * modifiée ou ajoutée doit l'être (nom, téléphone ET e-mail) ; un contact a un nom et un e-mail. PUR.
 */
export function refusFiche(lu: LectureFicheLocataire, s: SaisieFicheLocataire): string | null {
  const apres = lu.cartes.map((c) => {
    const m = s.modifiees.find((x) => x.id === c.id && x.sorte === c.sorte);
    return { c, nom: m?.champs.nom ?? c.nom, coordonnees: m?.champs.coordonnees ?? coordonneesDe(c), modifiee: m !== undefined };
  });
  for (const a of apres) if (a.modifiee && (a.nom ?? '').trim() === '') return `${nomCarte(a.c) || 'Une carte'} : le nom ne peut pas être vide.`;
  const clients = apres.filter((a) => a.c.sorte === 'client');
  const membres = clients.map((a) => ({ id: a.c.id, complete: carteEstComplete({ nom: a.c.nom, coordonnees: coordonneesDe(a.c) }) }));
  for (const a of clients.filter((x) => x.modifiee)) {
    const v = verdictFamille(membres, a.c.id, carteEstComplete({ nom: a.nom, coordonnees: a.coordonnees }), 'modification');
    if (v !== null) return v;
  }
  const uneComplete = clients.some((a) => carteEstComplete({ nom: a.nom, coordonnees: a.coordonnees }))
    || s.nouvelles.some((n) => n.sorte === 'client' && carteEstComplete({ nom: n.champs.nom, coordonnees: n.champs.coordonnees ?? [] }));
  for (const n of s.nouvelles) {
    if (n.sorte === 'client') {
      const m = Object.values(manquesClientLocation({ nom: n.champs.nom, coordonnees: n.champs.coordonnees ?? [] } as never, !uneComplete));
      if (m.length > 0) return `Nouveau colocataire : ${m.join(' ')}`;
    } else {
      if ((n.champs.nom ?? '').trim() === '') return 'Nouveau contact : le nom.';
      if (!(n.champs.coordonnees ?? []).some((k) => k.sorte === 'email' && k.valeur.trim() !== '')) return 'Nouveau contact : un e-mail.';
    }
  }
  return null;
}
