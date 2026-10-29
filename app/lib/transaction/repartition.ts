import { eur, pctFr } from './format';
import { commissionNetteHt, ht, partsHt, LIBELLE_PARTIE, LIBELLE_SOCIETE, SOCIETES, TVA, type Partie, type Societe } from './modele';

/**
 * ══ 🔴 TUILE « TRANSACTION », LOT D (Arno, 27/10/2026) — LA RÉPARTITION DE LA COMMISSION : LES RÈGLES (PURES) ══════════════════
 *
 *   · commission nette = commission − rétrocession de l'apporteur (l'apporteur est déduit AVANT toute répartition) ;
 *   · la commission nette se répartit entre des PARTIES : « Entrée du mandat », « Sortie du mandat » (un négociateur chacune, donc sa
 *     société), et en option une partie EXTÉRIEURE (nom libre, coordonnées facultatives) dont la part sort de nos chiffres ;
 *   · par défaut : deux négociateurs différents ⇒ 50 / 50 ; le même des deux côtés ⇒ 100 % ;
 *   · chaque part se saisit en % OU en € HT (l'autre se calcule) ; la somme doit faire EXACTEMENT 100 % (au centime de la commission
 *     nette), sinon l'enregistrement est refusé avec un message clair — la saisie n'est jamais perdue (rien n'est écrit) ;
 *   · chaque part interne va au CA de la société de son négociateur AU MOMENT DE LA VENTE (`modele.caHt`).
 * Aucun arrondi dans les calculs ; seul l'affichage arrondit au centime.
 */

export interface NegociateurChoisi { id: number; nom: string; societe: Societe | null }

/** Une partie interne d'un négociateur. */
const interne = (sorte: Partie['sorte'], n: NegociateurChoisi, pourcentage: number): Partie =>
  ({ sorte, compteId: n.id, negociateur: n.nom, societe: n.societe, nom: null, coordonnees: null, pourcentage, montantHt: null });

/** Les parties par défaut : entrée ≠ sortie ⇒ 50 / 50 ; le même négociateur (ou un seul connu) ⇒ 100 %. PUR. */
export function partiesParDefaut(entree: NegociateurChoisi | null, sortie: NegociateurChoisi | null): Partie[] {
  if (entree === null && sortie === null) return [];
  if (entree === null || sortie === null || entree.id === sortie.id) {
    const n = (entree ?? sortie) as NegociateurChoisi;
    return [interne(entree !== null && sortie !== null ? 'entree_sortie' : entree !== null ? 'entree' : 'sortie', n, 100)];
  }
  return [interne('entree', entree, 50), interne('sortie', sortie, 50)];
}

/** Une partie extérieure, vide (à nommer). */
export const partieExterieure = (): Partie => ({ sorte: 'exterieure', compteId: null, negociateur: null, societe: null, nom: '', coordonnees: null, pourcentage: 0, montantHt: null });

/** « Revenir au 50/50 » : les parties par défaut des négociateurs d'entrée et de sortie (la partie extérieure est retirée de la saisie). */
export const revenirAuDefaut = partiesParDefaut;

/** Le pourcentage que représente un montant HT de la commission nette (0 si elle est nulle). PUR. */
export const pourcentageDe = (montantHt: number, netHt: number): number => (netHt === 0 ? 0 : (montantHt / netHt) * 100);

/** Le total de la répartition : en % de la commission nette, et en € HT. PUR. */
export function totalRepartition(parties: readonly Partie[], netHt: number): { pourcentage: number; montantHt: number } {
  const montantHt = partsHt(parties, netHt).reduce((t, x) => t + x, 0);
  const tousEnPct = parties.every((p) => p.pourcentage !== null);
  return { montantHt, pourcentage: tousEnPct ? parties.reduce((t, p) => t + (p.pourcentage ?? 0), 0) : pourcentageDe(montantHt, netHt) };
}

const centimes = (x: number): number => Math.round(x * 100);
// 🔴 LOT AM — le format unique des nombres de la tuile (`format.ts`).
const pct = (x: number): string => pctFr(x);

/**
 * 🔴 LA VÉRIFICATION AVANT TOUT ENREGISTREMENT : rend `null` si la répartition est juste, sinon le motif (montré tel quel). La somme
 * doit faire 100 % : exactement quand toutes les parts sont en %, au centime de la commission nette dès qu'une part est en €. PUR.
 */
export function verifierRepartition(parties: readonly Partie[], honorairesTtc: number, retroApporteurTtc: number): string | null {
  if (retroApporteurTtc < 0) return 'La rétrocession de l’apporteur ne peut pas être négative.';
  if (retroApporteurTtc > honorairesTtc) return 'La rétrocession de l’apporteur dépasse la commission : la commission nette serait négative.';
  if (parties.length === 0) return 'Choisissez au moins le négociateur d’entrée ou de sortie du mandat.';
  for (const p of parties) {
    const quoi = p.sorte === 'exterieure' ? `la partie extérieure${p.nom ? ` « ${p.nom} »` : ''}` : `« ${LIBELLE_PARTIE[p.sorte]} »`;
    if ((p.pourcentage === null) === (p.montantHt === null)) return `Part de ${quoi} : saisissez un pourcentage ou un montant.`;
    if (p.pourcentage !== null && (!Number.isFinite(p.pourcentage) || p.pourcentage < 0 || p.pourcentage > 100)) return `Part de ${quoi} : le pourcentage doit être entre 0 et 100 %.`;
    if (p.montantHt !== null && (!Number.isFinite(p.montantHt) || p.montantHt < 0)) return `Part de ${quoi} : le montant doit être positif ou nul.`;
    if (p.sorte === 'exterieure') {
      if ((p.nom ?? '').trim() === '') return 'La partie extérieure doit avoir un nom (autre agence, confrère…).';
    } else {
      if (p.compteId === null) return `${LIBELLE_PARTIE[p.sorte]} : choisissez le négociateur.`;
      if (p.societe === null) return `${p.negociateur ?? 'Ce négociateur'} n’a pas de société (CRITERIMMO ou MACJ) : renseignez-la dans Comptes avant d’enregistrer.`;
    }
  }
  const m = motifSomme(parties, commissionNetteHt(honorairesTtc, retroApporteurTtc));
  return m === null ? null : `${m} Rien n’a été enregistré ; corrigez les parts ou « Revenir au 50/50 ».`;
}

/**
 * LOT E — la SEULE vérification de la somme (100 % exactement quand toutes les parts sont en %, au centime de la commission nette dès
 * qu'une part est en €) : null si juste, sinon la phrase. L'écran s'en sert pour désactiver « Enregistrer », le serveur pour refuser. PUR.
 */
export function motifSomme(parties: readonly Partie[], netHt: number): string | null {
  const t = totalRepartition(parties, netHt);
  const juste = parties.every((p) => p.pourcentage !== null) ? Math.abs(t.pourcentage - 100) < 1e-9 : centimes(t.montantHt) === centimes(netHt);
  return juste ? null : `La répartition fait ${pct(t.pourcentage)} (${eur(t.montantHt)} HT sur ${eur(netHt)} HT de commission nette) : elle doit faire exactement 100 %.`;
}

/** Ce que chaque société reçoit, et la part extérieure (HT). PUR. */
export function partsParSociete(parties: readonly Partie[], honorairesTtc: number, retroApporteurTtc: number): { societe: Record<Societe, number>; exterieurHt: number; netHt: number } {
  const netHt = commissionNetteHt(honorairesTtc, retroApporteurTtc);
  const parts = partsHt(parties, netHt);
  const societe: Record<Societe, number> = { criterimmo: 0, macj: 0 };
  let exterieurHt = 0;
  parties.forEach((p, i) => { if (p.societe !== null) societe[p.societe] += parts[i]; else exterieurHt += parts[i]; });
  return { societe, exterieurHt, netHt };
}

/**
 * 🔴 LOT N (Arno, 28/10/2026) — LA PART DE CHAQUE SOCIÉTÉ, ET LA PART EXTÉRIEURE, EN % DE LA COMMISSION NETTE (lignes « Part CRITERIMMO »,
 * « Part MACJ », « Part extérieure » du tableau). Toutes les parts en % : la SOMME des pourcentages saisis (exacte : 60 + 40, jamais
 * une division) ; une part en € : ramenée en % de la commission nette. Parts internes + extérieure = 100 % d'une répartition juste. PUR.
 */
export function pourcentagesParSociete(parties: readonly Partie[], netHt: number): { societe: Record<Societe, number>; exterieur: number } {
  const enPct = parties.map((p, i) => (p.pourcentage !== null ? p.pourcentage : pourcentageDe(partsHt(parties, netHt)[i], netHt)));
  const societe: Record<Societe, number> = { criterimmo: 0, macj: 0 };
  let exterieur = 0;
  parties.forEach((p, i) => { if (p.societe !== null) societe[p.societe] += enPct[i]; else exterieur += enPct[i]; });
  return { societe, exterieur };
}

/** Le libellé d'une partie (« Entrée du mandat — Jean-Baptiste PONS (CRITERIMMO) », « Part extérieure — Agence X »). PUR. */
export const libellePartie = (p: Partie): string => (p.sorte === 'exterieure' ? `Part extérieure — ${p.nom ?? ''}`
  : `${LIBELLE_PARTIE[p.sorte]} — ${p.negociateur ?? ''}${p.societe !== null ? ` (${LIBELLE_SOCIETE[p.societe]})` : ''}`);

// ── 🔴 LOT AH (Arno, 29/10/2026) : un même montant identique au centime PARTOUT ─────────────────────────────────────────────────

/** Arrondi au centime (affichage). PUR. */
export const auCentime = (x: number): number => Math.round((x + Math.sign(x) * Number.EPSILON) * 100) / 100;

/** Les montants d'une répartition, au centime, cohérents entre eux (HT). */
export interface CentimesRepartition {
  porteuse: Societe;
  /** La commission de la vente et l'apporteur, chacun au centime ; la base = leur différence. */
  commissionHt: number; apporteurHt: number; baseHt: number;
  /** Chaque partie (même ordre). */
  parts: number[];
  /** La part de chaque société (somme de ses parties). */
  parSociete: Record<Societe, number>;
  /** Reversé par la porteuse : à chacune de nos autres sociétés, et à chaque partie extérieure (même ordre que les parties ; 0 ailleurs). */
  reverse: Record<Societe, number>;
  exterieurs: { index: number; nom: string; ht: number }[];
  /** Ce qui reste à la porteuse : commission − apporteur − reversements (= sa part). */
  resteHt: number;
}

/**
 * 🔴 LOT AH — LA RÈGLE UNIQUE DES CENTIMES : la commission et l'apporteur au centime, la base = leur différence ; chaque partie au centime ;
 * la part de chaque AUTRE société = l'arrondi de sa part exacte (celle que lisent les tuiles et sa ligne miroir : le même nombre partout),
 * l'écart reporté sur sa dernière partie ; les parties extérieures, chacune au centime ; la PORTEUSE (le reste) absorbe l'écart d'arrondi,
 * reporté une seule fois sur sa dernière partie. Ainsi reste + reversements + apporteur = commission de la vente, au centime. Les calculs
 * ne changent pas (aucun arrondi n'y entre) : c'est la présentation. null : la répartition ne fait pas 100 %. PUR.
 */
export function centimesRepartition(parties: readonly Partie[], honorairesTtc: number, retroApporteurTtc: number, porteuse: Societe,
  /** « ttc » : la même règle sur les montants TTC exacts (sans repasser par le HT arrondi : jamais 3 250,01 pour 2 708,34 € HT). */
  unite: 'ht' | 'ttc' = 'ht'): CentimesRepartition | null {
  const net = commissionNetteHt(honorairesTtc, retroApporteurTtc);
  const brutHt = partsHt(parties, net);
  if (brutHt.some((x) => !Number.isFinite(x)) || Math.abs(brutHt.reduce((t, x) => t + x, 0) - net) > 1e-6) return null;
  const brut = unite === 'ht' ? brutHt : brutHt.map((x) => x * TVA);
  const commissionHt = auCentime(unite === 'ht' ? ht(honorairesTtc) : honorairesTtc);
  const apporteurHt = auCentime(unite === 'ht' ? ht(retroApporteurTtc) : retroApporteurTtc);
  const baseHt = auCentime(commissionHt - apporteurHt);
  const parts = brut.map(auCentime);
  const indices = (f: (p: Partie) => boolean): number[] => parties.map((p, i) => (f(p) ? i : -1)).filter((i) => i >= 0);
  const interne = (p: Partie): boolean => p.sorte !== 'exterieure';
  for (const s of SOCIETES) {
    if (s === porteuse) continue;
    const ix = indices((p) => interne(p) && p.societe === s);
    if (ix.length === 0) continue;
    const cible = auCentime(ix.reduce((t, i) => t + brut[i], 0));
    const dernier = ix[ix.length - 1];
    parts[dernier] = auCentime(cible - ix.slice(0, -1).reduce((t, i) => t + parts[i], 0));
  }
  const ixPorteuse = indices((p) => interne(p) && p.societe === porteuse);
  if (ixPorteuse.length > 0) {
    const dernier = ixPorteuse[ixPorteuse.length - 1];
    parts[dernier] = auCentime(baseHt - parts.reduce((t, x, i) => t + (i === dernier ? 0 : x), 0));
  }
  const parSociete = Object.fromEntries(SOCIETES.map((s) => [s, auCentime(indices((p) => interne(p) && p.societe === s).reduce((t, i) => t + parts[i], 0))])) as Record<Societe, number>;
  const reverse = Object.fromEntries(SOCIETES.map((s) => [s, s === porteuse ? 0 : parSociete[s]])) as Record<Societe, number>;
  const exterieurs = indices((p) => !interne(p)).map((i) => ({ index: i, nom: parties[i].nom ?? 'partie extérieure', ht: parts[i] }));
  const resteHt = auCentime(baseHt - SOCIETES.reduce((t, s) => t + reverse[s], 0) - exterieurs.reduce((t, e) => t + e.ht, 0));
  return { porteuse, commissionHt, apporteurHt, baseHt, parts, parSociete, reverse, exterieurs, resteHt };
}
