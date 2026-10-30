import { typeDuLot } from '../../gestion/annexesBien';
import type { FicheLot } from './tableauBord';

/**
 * ══ 🔴 LOT LS3 (Arno, 30/10/2026) — « UNE MÊME TRANSACTION AVEC UN MÊME LOCATAIRE NE PEUT PAS AVOIR DEUX FICHES DE BIEN » ═════════════════════
 * La cause : un bail de la tuile Location sur un bien qui a des ANNEXES crée une occupation par lot (logement + parking…) sur le même bail ;
 * l'annexe hérite de l'adresse de son logement — d'où deux boutons « Fiche du bien — [adresse] » au même libellé. Affichage seulement (aucune
 * donnée n'est touchée) : un bouton par bien PRINCIPAL ; chaque annexe d'un bien principal de la même ligne passe dessous, en petit lien
 * « + annexe : Parking n° 12 ». Une ligne à un seul bien sans annexe garde « Fiche du bien », comme avant. PUR, client-safe.
 */
export interface GroupeFicheBien { principal: FicheLot; libelle: string; annexes: { lot: FicheLot; titre: string }[] }

/** Le nom d'une annexe : son type (catégorie, sinon la nature WIPPIMMO ; « Annexe » à défaut), et son numéro affiché s'il est saisi. PUR. */
export function titreAnnexeLigne(l: FicheLot): string {
  const type = typeDuLot({ categorie: l.categorie ?? null, nature: l.nature ?? null, typeBien: l.typeBien ?? null });
  const porte = (l.porte ?? '').trim();
  return porte === '' ? type : `${type} n° ${porte}`;
}

/** Les boutons « Fiche du bien » d'une ligne : les biens principaux, chacun avec ses annexes de la même ligne. PUR. */
export function groupesFicheBien(lots: readonly FicheLot[]): GroupeFicheBien[] {
  const ids = new Set(lots.map((l) => l.id));
  const estAnnexeIci = (l: FicheLot): boolean => l.annexeDe != null && l.annexeDe !== l.id && ids.has(l.annexeDe);
  const principaux = lots.filter((l) => !estAnnexeIci(l));
  const annexes = lots.filter(estAnnexeIci);
  const plusieurs = lots.length > 1;
  return principaux.map((p) => ({
    principal: p,
    libelle: plusieurs ? `Fiche du bien — ${p.libelle}` : 'Fiche du bien',
    annexes: annexes.filter((a) => a.annexeDe === p.id).map((a) => ({ lot: a, titre: titreAnnexeLigne(a) })),
  }));
}
