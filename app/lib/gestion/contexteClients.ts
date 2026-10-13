import type { FamilleAdresse, FamillesConnues } from './familleAdresse';
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

/**
 * LE LIEN D'UNE ADRESSE AVEC UN BIEN (lot PUCE-COHERENTE-AVEC-RATTACHEMENT-TOUTES-FAMILLES : toutes les familles, plus
 * seulement les clients) :
 *   · `proprietaire`, `locataire`, `ancien_locataire` — l'e-mail propre d'une partie du bien ;
 *   · `rattache` — un e-mail rattaché à une partie du bien (carte de contact) ;
 *   · `syndic_contact` — un contact du syndic qui suit la copropriété du bien ;
 *   · `syndic` — l'e-mail général du syndic de la copropriété du bien ;
 *   · `immeuble` — le carnet de la copropriété du bien (gardien, conseil syndical, habitants).
 */
export type LienBien = 'proprietaire' | 'locataire' | 'ancien_locataire' | 'rattache' | 'syndic_contact' | 'syndic' | 'immeuble';

/** Un bien du portefeuille lié à une adresse (un client, ou un contact du bien ou de son immeuble). */
export interface BienClient {
  lotId: number;
  /** La clé WIPPIMMO : la cible de rattachement. */
  cle: string;
  /** « 25 rue Edith Cavell, 92400 COURBEVOIE — lot 219 ». */
  libelle: string;
  categorie: 'logement' | 'parking' | 'cave';
  /** Le lien de l'adresse avec CE bien. */
  role: LienBien;
  /** Le nom de la personne (ou du syndic) tel que l'annuaire le porte. */
  nom: string | null;
}

/** Un lien de CLIENT (l'e-mail propre d'une partie du bien) : c'est lui qui donne sa couleur à la puce. PUR. */
export const estLienClient = (r: LienBien): r is 'proprietaire' | 'locataire' | 'ancien_locataire' =>
  r === 'proprietaire' || r === 'locataire' || r === 'ancien_locataire';

/** Le motif d'une proposition « en attente » dans la modale : pourquoi ce bien est proposé. PUR. */
export function motifDuLien(b: Pick<BienClient, 'role' | 'nom'>): string {
  const qui = (b.nom ?? '').trim() === '' ? '' : ` — ${prenomNom(b.nom as string)}`;
  switch (b.role) {
    case 'proprietaire': return `propriétaire de ce bien${qui}`;
    case 'locataire': return `locataire de ce bien${qui}`;
    case 'ancien_locataire': return `ancien locataire de ce bien${qui}`;
    case 'rattache': return 'e-mail rattaché à une partie de ce bien';
    case 'syndic_contact': return `contact du syndic, suit la copropriété de ce bien${qui}`;
    case 'syndic': return `e-mail général du syndic de la copropriété de ce bien${qui}`;
    case 'immeuble': return `contact de l’immeuble de ce bien${qui}`;
    default: return '';
  }
}

/**
 * Combien d'adresses la route `/api/admin/gestion/adresses/biens` lit par appel (sa borne, `slice(0, 20)`). Le composeur
 * découpe ses lectures à cette taille (lot DEUX-ECARTS-SUGGESTIONS).
 */
export const ADRESSES_PAR_LECTURE_BIENS = 20;

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
 * L'ASPECT D'UNE PUCE LIÉE À DES BIENS. `null` = adresse liée à aucun bien (la famille ordinaire décide, inchangée).
 * PUR.
 *
 * ══ 🔴🔴 LOT PUCE-COHERENTE-AVEC-RATTACHEMENT-TOUTES-FAMILLES — UNE RÈGLE UNIQUE, POUR TOUTES LES FAMILLES ══════════
 * INCOHÉRENCE D'ARNO (11/10/2026) : « Arnaud JOREL » (arnaud.jorel@gmail.com, contact et e-mail général du syndic
 * TEST ARNAUD) s'affichait à TRAME PLEINE rose alors qu'aucun bien n'était rattaché. CAUSE : seuls les CLIENTS
 * (propriétaire, locataire) avaient des biens ; toute autre famille prenait la trame pleine d'office, et un client à
 * bien unique la prenait aussi avant même d'être rattaché.
 * RÈGLE : TRAME PLEINE ⇔ au moins un bien lié à l'adresse est dans le contexte (rattaché) ; sinon CONTOUR plein de la
 * couleur de la famille (« à choisir »).
 *   · client (e-mail propre d'une partie) : la couleur de son rôle dans le bien coché (propriétaire d'abord), sinon
 *     propriétaire s'il l'est quelque part, sinon son premier rôle ;
 *   · autre famille (contact du syndic, e-mail général, carnet de l'immeuble, e-mail rattaché) : la famille LUE
 *     (`base`) garde sa couleur et son rôle ; sans elle (pas encore lue), `null`.
 */
export function familleDuClient(
  adresse: string, biens: BiensDesClients, contexte: ReadonlySet<string>, base?: FamilleAdresse | null,
): (FamilleAdresse & { aChoisir: boolean; nbBiens: number }) | null {
  const liste = biens[cle(adresse)] ?? [];
  if (liste.length === 0) return null;
  const aChoisir = !liste.some((b) => contexte.has(b.cle));
  const clients = liste.filter((b) => estLienClient(b.role));
  if (clients.length === 0) {
    if (base === undefined || base === null) return null;
    return { ...base, aChoisir, nbBiens: liste.length };
  }
  const ordre: Record<string, number> = { proprietaire: 0, locataire: 1, ancien_locataire: 2 };
  const parRole = (l: readonly BienClient[]) => [...l].sort((x, y) => ordre[x.role] - ordre[y.role]);
  const retenu = parRole(clients.filter((b) => contexte.has(b.cle)))[0] ?? parRole(clients)[0];
  const role = retenu.role === 'proprietaire' ? 'Propriétaire' : retenu.role === 'locataire' ? 'Locataire' : 'Ancien locataire';
  return { ton: retenu.role as TonSuggestion, propre: true, nom: retenu.nom, role, aChoisir, nbBiens: liste.length };
}

/**
 * LES ADRESSES QUI ATTENDENT UN CHOIX (le bouton « Rattacher » pulse pour elles) : liées à au moins un bien, aucun dans
 * le contexte, dans l'ordre des champs, sans doublon. Une adresse dont le bien unique va entrer d'office (`auto`, non
 * refusé) n'attend pas : c'est l'instant d'avant l'ajout automatique. PUR.
 */
export function adressesEnAttente(
  adresses: readonly string[], biens: BiensDesClients, contexte: ReadonlySet<string>,
  auto: { actif: boolean; refuses: ReadonlySet<string> },
): Array<{ adresse: string; biens: BienClient[] }> {
  const vus = new Set<string>();
  const out: Array<{ adresse: string; biens: BienClient[] }> = [];
  for (const brut of adresses) {
    const a = cle(brut);
    if (vus.has(a)) continue;
    vus.add(a);
    const liste = biens[a] ?? [];
    if (liste.length === 0 || liste.some((b) => contexte.has(b.cle))) continue;
    if (auto.actif && liste.length === 1 && !auto.refuses.has(`${a}|${liste[0].cle}`)) continue;
    out.push({ adresse: a, biens: liste });
  }
  return out;
}

/**
 * LES FAMILLES AFFICHÉES PAR LES PUCES. PUR.
 *   · une adresse que propose la liste d'un bien DU CONTEXTE (`duContexte` : le bien de la fiche, les biens rattachés)
 *     est liée à un bien rattaché : sa famille de cette liste, d'emblée, sans attendre de lecture ;
 *   · sinon, l'aspect décidé par ses biens (`familleDuClient`) ; liée à aucun bien : sa famille lue, inchangée ;
 *   · ⚠️ tant que les biens d'une adresse connue ne sont pas lus, sa puce reste NEUTRE (absente) : jamais une trame
 *     pleine sur la foi d'une famille dont on ne sait pas encore si un de ses biens est rattaché.
 */
export function famillesDesPuces(
  familles: FamillesConnues, adresses: readonly string[], biens: BiensDesClients, contexte: ReadonlySet<string>,
  duContexte: Readonly<Record<string, FamilleAdresse>> = {},
): FamillesConnues {
  const out: FamillesConnues = { ...familles };
  for (const brut of adresses) {
    const a = cle(brut);
    if (duContexte[a] !== undefined) { out[a] = duContexte[a]; continue; }
    if (biens[a] === undefined) {
      if (out[a] !== undefined && out[a] !== null) delete out[a];
      continue;
    }
    const f = familleDuClient(a, biens, contexte, familles[a]);
    if (f !== null) out[a] = f;
  }
  return out;
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

/**
 * LOT RATTACHER-LIGNE-SUPPRIMEE-BOUTON-PULSE — « LATHAM Lionel » (l'annuaire écrit NOM Prénom) → « Lionel LATHAM ».
 * Les mots tout en capitales du début forment le NOM ; le reste, le prénom. Rien à retourner (société, nom seul) :
 * tel quel. PUR.
 */
export function prenomNom(nomComplet: string): string {
  const mots = nomComplet.trim().split(/\s+/).filter((m) => m !== '');
  const estNom = (m: string): boolean => m === '-' || (/\p{L}/u.test(m) && m === m.toLocaleUpperCase('fr-FR'));
  let i = 0;
  while (i < mots.length && estNom(mots[i])) i += 1;
  if (i === 0 || i === mots.length) return mots.join(' ');
  return [...mots.slice(i), ...mots.slice(0, i)].join(' ');
}

/**
 * ══ LOT BOUTON-RATTACHER-TAILLE-ORIGINE — CE QUE PORTE LE BOUTON QUI PULSE ══ (remplace la mention à trois lignes du lot
 * RATTACHER-LIGNE-SUPPRIMEE-BOUTON-PULSE, qui agrandissait le bouton)
 *   · `detail` — le sous-titre, sur une ligne : « 6 propositions en attente », « 1 proposition en attente » (le total
 *     des biens proposés en attente, chacun compté une fois) ;
 *   · `infobulle` — qui attend : « Biens à choisir pour Cédric JULLIEN - GARRIDO (6) », plusieurs clients séparés
 *     par « ; ». Rien en attente ⇒ `null`. PUR.
 */
export function attenteDuBouton(
  enAttente: ReadonlyArray<{ adresse: string; biens: readonly BienClient[] }>,
): { detail: string; infobulle: string } | null {
  if (enAttente.length === 0) return null;
  const n = new Set(enAttente.flatMap((c) => c.biens.map((b) => b.cle))).size;
  const qui = enAttente.map((c) => {
    const nom = c.biens.find((b) => (b.nom ?? '').trim() !== '')?.nom ?? null;
    return `${nom === null ? c.adresse : prenomNom(nom)} (${c.biens.length})`;
  });
  return {
    detail: `${n} proposition${n > 1 ? 's' : ''} en attente`,
    infobulle: `Biens à choisir pour ${qui.join(' ; ')} — cliquer pour choisir`,
  };
}
