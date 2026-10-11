import type { FamilleAdresse } from './familleAdresse';
import type { GroupeSuggestions, SuggestionAdresse, TonSuggestion } from './suggestionsBien';

/**
 * ══ 🔴🔴 LOT NOUVEAU-MESSAGE-CONTEXTE-BIEN-PAR-CLIENT — LE BIEN D'UN MAIL, RETROUVÉ PAR SES CLIENTS. PUR. ═══════════
 *
 * ARNO : un composeur ouvert sans fiche bien (Nouveau message, Répondre depuis la Réception…) retrouve le contexte d'un
 * bien grâce aux adresses des CLIENTS qu'on y tape (propriétaire ou locataire, actuel ou ancien) :
 *   a. client lié à UN SEUL bien : ce bien devient automatiquement le contexte du mail (puce à trame pleine) ;
 *   b. client lié à PLUSIEURS biens : puce à fond blanc et CONTOUR PLEIN de sa couleur, et une ligne « Rattacher ce
 *      mail à : » sous les champs, avec ses biens à cocher ; dès qu'un bien est coché, la puce passe en trame pleine.
 * Les biens du contexte sont les CIBLES du brouillon (le mécanisme « biens cochés avant l'envoi », existant) : le mail
 * envoyé leur est rattaché. Les adresses du ou des biens du contexte sont proposées dans À / Cc / Cci.
 *
 * Ce module ne lit rien : il reçoit les biens de chaque client (`/adresses/biens`, lecture seule) et les cibles.
 */

/** Un bien du portefeuille où l'adresse est l'e-mail d'un client. */
export interface BienClient {
  lotId: number;
  /** La clé WIPPIMMO : la cible de rattachement. */
  cle: string;
  /** « 25 rue Edith Cavell, 92400 COURBEVOIE — lot 219 ». */
  libelle: string;
  categorie: 'logement' | 'parking' | 'cave';
  /** Le rôle du client DANS CE BIEN. */
  role: 'proprietaire' | 'locataire' | 'ancien_locataire';
  /** Le nom du client tel que l'annuaire le porte. */
  nom: string | null;
}

/** adresse (minuscules) → ses biens. `[]` = pas un client. Absente = pas encore lue. */
export type BiensDesClients = Record<string, BienClient[]>;

const cle = (a: string): string => a.trim().toLowerCase();

/** Les clés des biens déjà dans le contexte (les cibles « lot » du brouillon). PUR. */
export function clesDuContexte(cibles: ReadonlyArray<{ sorte: string; cle: string | null }>): Set<string> {
  return new Set(cibles.filter((c) => c.sorte === 'lot' && (c.cle ?? '') !== '').map((c) => c.cle as string));
}

/**
 * CAS a — les biens à AJOUTER d'office : celui de chaque client à bien unique, pas encore dans le contexte, et dont
 * l'ajout n'a pas été défait à la main (`refuses`). Rend `{ bien, adresse }` (l'adresse qui l'amène). PUR.
 */
export function biensAutomatiques(
  adresses: readonly string[], biens: BiensDesClients, contexte: ReadonlySet<string>, refuses: ReadonlySet<string>,
): Array<{ bien: BienClient; adresse: string }> {
  const out: Array<{ bien: BienClient; adresse: string }> = [];
  const vus = new Set(contexte);
  for (const brut of adresses) {
    const a = cle(brut);
    const liste = biens[a] ?? [];
    if (liste.length !== 1) continue;
    const b = liste[0];
    if (vus.has(b.cle) || refuses.has(`${a}|${b.cle}`)) continue;
    vus.add(b.cle);
    out.push({ bien: b, adresse: a });
  }
  return out;
}

/** CAS b — les clients à PLUSIEURS biens présents dans les champs, dans l'ordre des champs, sans doublon. PUR. */
export function clientsAChoisir(adresses: readonly string[], biens: BiensDesClients): Array<{ adresse: string; biens: BienClient[] }> {
  const vus = new Set<string>();
  const out: Array<{ adresse: string; biens: BienClient[] }> = [];
  for (const brut of adresses) {
    const a = cle(brut);
    if (vus.has(a)) continue;
    vus.add(a);
    const liste = biens[a] ?? [];
    if (liste.length > 1) out.push({ adresse: a, biens: liste });
  }
  return out;
}

/**
 * L'ASPECT D'UNE PUCE DE CLIENT. `null` = ce n'est pas un client (la famille ordinaire décide, inchangée). PUR.
 *   · un de ses biens est dans le contexte ⇒ TRAME PLEINE, de la couleur de son rôle dans CE bien (propriétaire
 *     d'abord s'il est coché dans plusieurs rôles) ;
 *   · plusieurs biens, aucun dans le contexte ⇒ CONTOUR PLEIN (« à choisir »), couleur propriétaire s'il l'est
 *     quelque part, sinon celle de son premier rôle ;
 *   · un seul bien (pas encore ajouté : l'instant d'avant l'ajout automatique, ou ajout défait) ⇒ trame pleine.
 */
export function familleDuClient(
  adresse: string, biens: BiensDesClients, contexte: ReadonlySet<string>,
): (FamilleAdresse & { aChoisir: boolean; nbBiens: number }) | null {
  const liste = biens[cle(adresse)] ?? [];
  if (liste.length === 0) return null;
  const ordre: Record<BienClient['role'], number> = { proprietaire: 0, locataire: 1, ancien_locataire: 2 };
  const parRole = (l: readonly BienClient[]) => [...l].sort((x, y) => ordre[x.role] - ordre[y.role]);
  const coches = parRole(liste.filter((b) => contexte.has(b.cle)));
  const retenu = coches[0] ?? parRole(liste)[0];
  const aChoisir = coches.length === 0 && liste.length > 1;
  const role = retenu.role === 'proprietaire' ? 'Propriétaire' : retenu.role === 'locataire' ? 'Locataire' : 'Ancien locataire';
  return { ton: retenu.role as TonSuggestion, propre: true, nom: retenu.nom, role, aChoisir, nbBiens: liste.length };
}

/**
 * LES SUGGESTIONS DE PLUSIEURS BIENS, REGROUPÉES. Les groupes ① ② ③ restent, dans leur ordre ; chaque ligne garde le
 * libellé de son bien (`bien`) pour l'intertitre gris quand il y a plus d'un bien. Une adresse proposée par deux
 * biens ne l'est qu'une fois (le premier bien du contexte). Un seul bien ⇒ ses groupes tels quels. PUR.
 */
export function fusionnerSuggestions(
  parBien: ReadonlyArray<{ libelle: string; groupes: readonly GroupeSuggestions[] }>,
): GroupeSuggestions[] | null {
  if (parBien.length === 0) return null;
  if (parBien.length === 1) return parBien[0].groupes.map((g) => ({ ...g, lignes: [...g.lignes] }));
  const vues = new Set<string>();
  const cles = parBien[0].groupes.map((g) => g.cle);
  return cles.map((cleGroupe) => {
    const titre = parBien.map((b) => b.groupes.find((g) => g.cle === cleGroupe)?.titre).find((t) => t !== undefined) ?? '';
    const lignes: SuggestionAdresse[] = [];
    for (const b of parBien) {
      for (const l of b.groupes.find((g) => g.cle === cleGroupe)?.lignes ?? []) {
        const a = cle(l.adresse);
        if (vues.has(a)) continue;
        vues.add(a);
        lignes.push({ ...l, bien: b.libelle });
      }
    }
    return { cle: cleGroupe, titre, lignes } as GroupeSuggestions;
  });
}
