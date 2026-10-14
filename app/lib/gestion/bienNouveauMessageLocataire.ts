/**
 * ══ 🔴🔴 LOT HISTORIQUE-ECHANGES-FICHE-LOCATAIRE (Arno, 14/10/2026) — LE BIEN DU « NOUVEAU MESSAGE » D'UN LOCATAIRE ═══════
 *
 * DEMANDE D'ARNO : « Nouveau message sur la fiche locataire : le message est rattaché d'office au bien loué actuellement.
 * Pour un ANCIEN locataire, c'est le dernier bien qu'il a loué. Si le locataire a loué plusieurs biens, le composeur
 * propose le choix, avec ce bien présélectionné. »
 *
 * 🔴 CE MODULE NE DIT QUE LE BIEN PRÉSÉLECTIONNÉ. Le CHOIX, lui, est déjà celui du composeur : son adresse en « À », la
 * fenêtre « Rattacher » propose tous les biens où elle est l'e-mail d'un locataire, actuel ou passé (`biensDesClients`),
 * le bien d'ici coché. Le réécrire ici aurait fait deux listes des biens d'un locataire.
 *
 * Les règles, dans l'ordre :
 *   · seuls comptent les biens qu'on peut viser : en gestion, et connus de l'annuaire (un `lotId`) ;
 *   · le bien loué ACTUELLEMENT (occupation sans date de sortie, la règle unique `estLocataireEnPlace`) — le premier
 *     dans l'ordre de la fiche, qui est celui que le bloc de mails montre (« le plus récent s'il en occupe plusieurs ») ;
 *   · sinon le DERNIER loué : la sortie la plus récente, puis l'entrée la plus récente à sortie égale ;
 *   · sinon rien — le message part sans bien, comme celui de la fiche propriétaire.
 *
 * PUR : aucune I/O, aucun import qui tire `pg`.
 */
import { titreLogement } from './annuaireRecherche';
import { estLocataireEnPlace } from './historiqueBien';

/** Ce que le module lit d'un logement de la fiche (forme de `LogementDuLocataire`). */
export interface LogementPourNouveauMessage {
  lotId: number | null;
  numero: string;
  adresse: string | null;
  commune: string | null;
  entree: string | null;
  sortie: string | null;
  horsGestion: boolean;
}

export interface BienNouveauMessage { lotId: number; cle: string; libelle: string }

/** Le libellé du bien dans le composeur : « adresse, commune — lot N », la forme des biens de la recherche. PUR. */
export function libelleBienNouveauMessage(o: LogementPourNouveauMessage): string {
  return `${titreLogement(o.adresse, o.commune)} — lot ${o.numero}`;
}

/** Le bien présélectionné du « Nouveau message » d'une fiche locataire, ou `null`. PUR. */
export function bienDuNouveauMessageLocataire(logements: readonly LogementPourNouveauMessage[]): BienNouveauMessage | null {
  const visables = logements.filter((o): o is LogementPourNouveauMessage & { lotId: number } =>
    o.lotId !== null && !o.horsGestion && o.numero.trim() !== '');
  const enCours = visables.find(estLocataireEnPlace);
  const choisi = enCours ?? [...visables].sort((x, y) =>
    (y.sortie ?? '').localeCompare(x.sortie ?? '') || (y.entree ?? '').localeCompare(x.entree ?? ''))[0];
  return choisi === undefined ? null : { lotId: choisi.lotId, cle: choisi.numero, libelle: libelleBienNouveauMessage(choisi) };
}
