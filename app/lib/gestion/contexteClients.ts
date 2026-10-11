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

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT RATTACHEMENT-BIENS-SUIT-LES-ADRESSES — UN BIEN RATTACHÉ PAR UN CLIENT SUIT SES ADRESSES
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   BUG D'ARNO (11/10/2026) : un multipropriétaire tapé, un de ses biens choisi, son adresse retirée, puis un propriétaire
   à bien unique tapé ⇒ « Rattaché — 2 logements » : le bien du premier (1bis rue Manessier, lot 432) était RESTÉ,
   alors que plus aucune de ses adresses n'était dans le mail. CAUSE : la liste des biens rattachés était ACCUMULÉE —
   seul l'ajout d'office savait d'où il venait ; un bien coché à la main (ligne « Rattacher ce mail à : » ou modale)
   n'avait aucune origine, et rien ne le retirait.
   RÈGLE : chaque bien du brouillon garde son ORIGINE, et l'ensemble est RECALCULÉ à partir des adresses présentes :
     · `client`  — amené par une adresse client : il reste TANT QU'au moins une adresse de propriétaire ou de locataire
                   de ce bien est dans À, Cc ou Cci ; la dernière retirée, il part ;
     · `manuel`  — ajouté par le moteur de recherche sans client de ce bien dans les destinataires : il reste, mais il
                   est SIGNALÉ (modale, avertissement à l'envoi) et ne part que confirmé (`manuelConfirme`) ;
     · `a_determiner` — ajouté avant que les biens des adresses soient lus : tranché dès qu'ils le sont ;
     · absente — le bien de BASE (fiche ouverte, réponse héritée, « Écrire depuis gestion@ ») : il ne dépend pas des
                   adresses.
   ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export type OrigineCible = 'client' | 'manuel' | 'a_determiner';

/** Ce que ces règles lisent d'une cible du brouillon (une `CibleBrouillon`, avec ses champs d'origine). */
export interface CibleAvecOrigine {
  sorte: string;
  cle: string | null;
  origine?: OrigineCible;
  /** Bien ajouté à la main, sans client destinataire, que l'on a CONFIRMÉ à l'envoi (« Envoyer quand même »). */
  manuelConfirme?: boolean;
}

/** Les adresses présentes qui sont celles d'un propriétaire ou d'un locataire de CE bien. PUR. */
export function clientsDuBien(cleBien: string, adresses: readonly string[], biens: BiensDesClients): string[] {
  return [...new Set(adresses.map(cle))].filter((a) => (biens[a] ?? []).some((b) => b.cle === cleBien));
}

/** Les clés de tous les biens dont un client est destinataire ; `null` tant qu'une adresse présente n'est pas lue. PUR. */
export function clesDesClientsPresents(adresses: readonly string[], biens: BiensDesClients): Set<string> | null {
  const out = new Set<string>();
  for (const a of new Set(adresses.map(cle))) {
    const l = biens[a];
    if (l === undefined) return null;
    for (const b of l) out.add(b.cle);
  }
  return out;
}

/**
 * L'ORIGINE DES CIBLES APRÈS UN CHANGEMENT (modale, « Classer ce mail ») : une cible déjà connue garde la sienne ; une
 * cible NOUVELLE est `client` si un client de ce bien est destinataire, `manuel` sinon, `a_determiner` tant que les
 * biens des adresses ne sont pas lus. Les cibles « événement » passent telles quelles. PUR.
 */
export function marquerOrigines<T extends CibleAvecOrigine>(
  avant: readonly CibleAvecOrigine[], apres: readonly T[], adresses: readonly string[], biens: BiensDesClients,
): T[] {
  const connues = new Map(avant.filter((c) => c.sorte === 'lot').map((c) => [c.cle ?? '', c]));
  const clients = clesDesClientsPresents(adresses, biens);
  return apres.map((c) => {
    if (c.sorte !== 'lot') return c;
    const vieille = connues.get(c.cle ?? '');
    if (vieille !== undefined) {
      return { ...c, ...(vieille.origine !== undefined ? { origine: vieille.origine } : {}),
        ...(vieille.manuelConfirme === true ? { manuelConfirme: true } : {}) };
    }
    const origine: OrigineCible = clients === null ? 'a_determiner' : clients.has(c.cle ?? '') ? 'client' : 'manuel';
    return { ...c, origine };
  });
}

/**
 * LE RECALCUL, À PARTIR DES ADRESSES PRÉSENTES. PUR.
 *   · `a_determiner` devient `client` ou `manuel` dès que les biens des adresses sont lus ;
 *   · une cible `client` SANS AUCUN client présent est RETIRÉE (tant qu'une adresse présente n'est pas lue : on attend) ;
 *   · une cible `manuel` sans client présent reste, et figure dans `manuelsSansClient` (à signaler, à confirmer).
 * Rend `change` = la liste a bougé (à réécrire dans le brouillon).
 */
export function recalculerCibles<T extends CibleAvecOrigine>(
  cibles: readonly T[], adresses: readonly string[], biens: BiensDesClients,
): { cibles: T[]; retirees: T[]; manuelsSansClient: T[]; change: boolean } {
  const tousLus = clesDesClientsPresents(adresses, biens) !== null;
  const out: T[] = [];
  const retirees: T[] = [];
  const manuelsSansClient: T[] = [];
  let change = false;
  for (const c of cibles) {
    if (c.sorte !== 'lot' || c.origine === undefined) { out.push(c); continue; }
    const presents = clientsDuBien(c.cle ?? '', adresses, biens);
    let origine = c.origine;
    if (origine === 'a_determiner' && (presents.length > 0 || tousLus)) {
      origine = presents.length > 0 ? 'client' : 'manuel';
      change = true;
    }
    const v = (origine === c.origine ? c : { ...c, origine }) as T;
    if (origine === 'client' && presents.length === 0 && tousLus) { retirees.push(v); change = true; continue; }
    if (origine === 'manuel' && presents.length === 0) manuelsSansClient.push(v);
    out.push(v);
  }
  return { cibles: out, retirees, manuelsSansClient, change };
}

/**
 * ══ LE FILET DE L'ENVOI (serveur) ══ Ce qui sera VRAIMENT rattaché : les biens de base ; un bien `client` ou
 * `a_determiner` seulement si un client de ce bien est destinataire ; un bien `manuel` s'il a un client destinataire
 * OU s'il a été confirmé. Jamais un bien sans adresse correspondante, sauf ajout manuel confirmé. PUR.
 */
export function ciblesAPoserALEnvoi<T extends CibleAvecOrigine>(
  cibles: readonly T[], destinataires: readonly string[], biens: BiensDesClients,
): { gardees: T[]; ecartees: T[] } {
  const gardees: T[] = [];
  const ecartees: T[] = [];
  for (const c of cibles) {
    if (c.sorte !== 'lot' || c.origine === undefined) { gardees.push(c); continue; }
    const presents = clientsDuBien(c.cle ?? '', destinataires, biens);
    if (presents.length > 0 || (c.origine === 'manuel' && c.manuelConfirme === true)) gardees.push(c);
    else ecartees.push(c);
  }
  return { gardees, ecartees };
}
