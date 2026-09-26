/**
 * MODULE « GESTION » — LOT DRIVE-2-bis : LA PROPOSITION DE TRI. Module PUR (aucune base, aucun réseau).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE MODULE NE RANGE RIEN, ET C'EST LE POINT DU LOT. Décision d'Arno du 26/09 : toutes les pièces partent dans
 * un dossier d'arrivée unique, et le tri devient une PROPOSITION mémorisée, qu'un geste séparé appliquera plus
 * tard. On peut donc se tromper sans conséquence — et c'est précisément ce qui permet d'éprouver le tri.
 *
 * 🔴 LA PROPOSITION S'APPUIE SUR LES ADRESSES DE TOUT L'ÉCHANGE, pas seulement du mail qui porte la pièce. C'est
 * le changement de fond par rapport au moteur du lot DRIVE-1 : une quittance envoyée par le syndic dans un fil où
 * le locataire a écrit trois fois se rattache au bien de ce locataire, alors que le mail du syndic, pris seul, ne
 * dit rien. Les adresses du mail lui-même PÈSENT PLUS que celles de ses voisins — c'est lui qu'on range.
 *
 * 🔴 ON NE TRANCHE JAMAIS AU JUGÉ. Des adresses qui désignent des logements différents ne donnent pas « le
 * premier » : elles donnent le propriétaire commun s'il existe, et « aucune » sinon. « Aucune » est une
 * proposition à part entière : elle dit qu'on ne sait pas, ce qui est une information.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import type { Reconnaissance } from './adressesMessage';
import type { Confiance, Regle } from './triPieces';

/** Une adresse de l'échange, déjà reconnue (ou non) par l'annuaire. */
export interface AdresseEchange {
  adresse: string;
  /** L'identifiant du message d'où elle vient — pour savoir si c'est celui de la pièce. */
  messageId: number;
  interne: boolean;
  reconnaissance: Reconnaissance;
}

export type DestinationProposee =
  | { sorte: 'bien'; cle: string }
  | { sorte: 'proprietaire'; cle: string }
  | { sorte: 'aucune' };

export interface Proposition {
  destination: DestinationProposee;
  regle: Regle;
  confiance: Confiance;
  motif: string;
  /** Les adresses qui ont fondé la proposition. Sans elles, on ne pourrait pas juger si le moteur a eu raison. */
  adressesFondatrices: string[];
}

/** Aucune proposition : on ne sait pas, et on le dit. */
export const AUCUNE: Proposition = {
  destination: { sorte: 'aucune' }, regle: 'd', confiance: 'basse',
  motif: 'aucune adresse connue dans l’échange, et aucun renfort',
  adressesFondatrices: [],
};

/** Les renforts, quand les adresses n'ont rien donné. Calculés ailleurs (ils n'ont pas changé depuis DRIVE-1). */
export interface Renforts {
  destination: DestinationProposee | null;
  motif: string;
  confiance: Confiance;
}

/** Deux destinations désignent-elles la même chose ? PUR. */
export function memeDestination(a: DestinationProposee, b: DestinationProposee): boolean {
  if (a.sorte !== b.sorte) return false;
  if (a.sorte === 'aucune' || b.sorte === 'aucune') return true;
  return a.cle === (b as { cle: string }).cle;
}

/** Le propriétaire commun de plusieurs rattachements, s'il existe. `null` dès qu'ils divergent. PUR. */
export function proprietaireCommun(cles: readonly (string | null)[]): string | null {
  const vus = new Set(cles.filter((x): x is string => x !== null && x !== ''));
  return vus.size === 1 ? [...vus][0] : null;
}

/**
 * CE QU'UN GROUPE D'ADRESSES RECONNUES PROPOSE. `null` si aucune n'apporte rien.
 *
 * ⚠️ UN LOT L'EMPORTE SUR UN PROPRIÉTAIRE quand tous les lots vus sont le même : c'est plus précis, et c'est ce
 * qu'on cherche. Dès que deux lots diffèrent, on remonte au propriétaire commun — puis à rien.
 */
export function depuisAdresses(
  adresses: readonly AdresseEchange[],
  quoi: string,
  confianceSiLot: Confiance,
): Proposition | null {
  const utiles = adresses.filter((a) => !a.interne && a.reconnaissance.partie !== null);
  if (utiles.length === 0) return null;

  const lots = utiles.map((a) => a.reconnaissance.lotCle).filter((x): x is string => x !== null);
  const lotsDistincts = new Set(lots);
  if (lotsDistincts.size === 1) {
    return {
      destination: { sorte: 'bien', cle: [...lotsDistincts][0] },
      regle: 'a', confiance: confianceSiLot,
      motif: `${quoi} : un seul bien désigné`,
      adressesFondatrices: utiles.filter((a) => a.reconnaissance.lotCle !== null).map((a) => a.adresse),
    };
  }

  const proprios = utiles.map((a) => a.reconnaissance.proprietaireCle);
  const commun = proprietaireCommun(proprios);
  if (commun !== null) {
    return {
      destination: { sorte: 'proprietaire', cle: commun },
      regle: 'a', confiance: lotsDistincts.size > 1 ? 'moyenne' : confianceSiLot,
      motif: lotsDistincts.size > 1
        ? `${quoi} : ${lotsDistincts.size} biens désignés, mais un seul propriétaire`
        : `${quoi} : un seul propriétaire désigné`,
      adressesFondatrices: utiles.map((a) => a.adresse),
    };
  }

  // Des parties qui désignent des dossiers différents : on ne choisit pas.
  return {
    destination: { sorte: 'aucune' }, regle: 'a', confiance: 'basse',
    motif: `${quoi} : ${lotsDistincts.size} biens de propriétaires différents — non tranché`,
    adressesFondatrices: utiles.map((a) => a.adresse),
  };
}

/**
 * LA PROPOSITION POUR UNE PIÈCE. PUR.
 *
 * L'ORDRE, et il n'est pas indifférent :
 *   ① les adresses DU MAIL qui porte la pièce — les plus proches, donc les plus sûres ;
 *   ② les adresses de TOUT L'ÉCHANGE — ce que le lot DRIVE-1 ne savait pas faire ;
 *   ③ les renforts (carte d'événement, adresse citée, nom dans l'objet) ;
 *   ④ « aucune ».
 *
 * ⚠️ UNE PROPOSITION « AUCUNE » ISSUE DES ADRESSES N'ARRÊTE PAS LA RECHERCHE : si le mail lui-même est
 * contradictoire, l'échange entier peut être clair, et les renforts aussi. On ne s'arrête que sur une proposition
 * qui DÉSIGNE quelque chose.
 */
export function proposerPourPiece(o: {
  messageId: number;
  adressesEchange: readonly AdresseEchange[];
  renforts?: Renforts | null;
}): Proposition {
  const duMail = o.adressesEchange.filter((a) => a.messageId === o.messageId);

  const parMail = depuisAdresses(duMail, 'adresses du mail', 'haute');
  if (parMail !== null && parMail.destination.sorte !== 'aucune') return parMail;

  const parEchange = depuisAdresses(o.adressesEchange, 'adresses de l’échange', 'moyenne');
  if (parEchange !== null && parEchange.destination.sorte !== 'aucune') {
    return { ...parEchange, regle: 'b' };
  }

  const r = o.renforts ?? null;
  if (r !== null && r.destination !== null && r.destination.sorte !== 'aucune') {
    return {
      destination: r.destination, regle: 'c', confiance: r.confiance, motif: r.motif, adressesFondatrices: [],
    };
  }

  // Rien n'a désigné de dossier. On rend la contradiction si elle existe — elle est plus instructive que le vide.
  if (parMail !== null) return parMail;
  if (parEchange !== null) return { ...parEchange, regle: 'b' };
  return AUCUNE;
}

/** La proposition, écrite en une ligne pour les `appProperties` du fichier Drive : « bien:315 », « aucune ». PUR. */
export function propositionCourte(p: Proposition): string {
  if (p.destination.sorte === 'aucune') return 'aucune';
  return `${p.destination.sorte === 'bien' ? 'bien' : 'proprio'}:${p.destination.cle}`;
}

/**
 * DEUX PROPOSITIONS SONT-ELLES LA MÊME ? Sert à n'historiser que ce qui CHANGE — une ligne par recalcul, même
 * identique, remplirait la table sans rien apprendre. PUR.
 */
export function memeProposition(a: Proposition, b: Proposition): boolean {
  return memeDestination(a.destination, b.destination) && a.regle === b.regle && a.confiance === b.confiance;
}
