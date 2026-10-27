import { commissionNetteHt, partsHt, LIBELLE_PARTIE, LIBELLE_SOCIETE, type Partie, type Societe } from './modele';

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
const eur = (x: number): string => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const pct = (x: number): string => `${x.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} %`;

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
  const net = commissionNetteHt(honorairesTtc, retroApporteurTtc);
  const t = totalRepartition(parties, net);
  const juste = parties.every((p) => p.pourcentage !== null) ? Math.abs(t.pourcentage - 100) < 1e-9 : centimes(t.montantHt) === centimes(net);
  if (!juste) {
    return `La répartition fait ${pct(t.pourcentage)} (${eur(t.montantHt)} HT sur ${eur(net)} HT de commission nette) : elle doit faire exactement 100 %. `
      + 'Rien n’a été enregistré ; corrigez les parts ou « Revenir au 50/50 ».';
  }
  return null;
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

/** Le libellé d'une partie (« Entrée du mandat — Jean-Baptiste PONS (CRITERIMMO) », « Part extérieure — Agence X »). PUR. */
export const libellePartie = (p: Partie): string => (p.sorte === 'exterieure' ? `Part extérieure — ${p.nom ?? ''}`
  : `${LIBELLE_PARTIE[p.sorte]} — ${p.negociateur ?? ''}${p.societe !== null ? ` (${LIBELLE_SOCIETE[p.societe]})` : ''}`);
