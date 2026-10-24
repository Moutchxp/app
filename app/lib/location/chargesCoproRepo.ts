import type { RequeteTx } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { colonneExisteMemo } from './sondeLocation';
import { PAYEES_PAR, type ChargesCopro } from './bienComplet';

/**
 * ══ 🔴 Arno (25/10/2026) — « PAIEMENT DES CHARGES » SAISI DEPUIS LE BAIL (IMPUR : base) ═══════════════════════════════════════════════
 * La donnée est CELLE DU BIEN (`gestion_annuaire_lot.charges_copro`, migration 400 : `agence` / `proprietaire`) — la même que la fiche du
 * bien et la ligne « Charges copro » du mail. « Nouveau locataire » et le Dossier de location l'écrivent ici, sur le bien loué, et la
 * modification entre à l'Historique du bien (« Champ : ancienne → nouvelle »). Une valeur inchangée n'écrit rien.
 */
export function chargesCoproDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_annuaire_lot', 'charges_copro');
}

const mot = (v: string | null): string => (v === 'agence' || v === 'proprietaire' ? PAYEES_PAR[v] : '(vide)');

/** Écrit le paiement des charges du bien, dans la transaction de l'appelant ; `false` si le bien n'existe plus. */
export async function ecrireChargesCoproDans(q: RequeteTx, lotId: number, valeur: ChargesCopro, auteur: Auteur, ecran: string): Promise<boolean> {
  const { rows } = await q<{ v: string | null }>('SELECT charges_copro AS v FROM gestion_annuaire_lot WHERE id = $1 FOR UPDATE', [lotId]);
  if (rows[0] === undefined) return false;
  const avant = rows[0].v;
  if (avant === valeur) return true;
  await q('UPDATE gestion_annuaire_lot SET charges_copro = $2 WHERE id = $1', [lotId, valeur]);
  await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
           VALUES ('annuaire_lot', $1, 'location_encart_modifie', $2, $3, $4, $5, $6)`,
    [lotId, `Paiement des charges : ${mot(avant)}`, `Paiement des charges : ${mot(valeur)}`,
      `Copropriété — Paiement des charges : ${mot(avant)} → ${mot(valeur)} (${ecran})`, auteur.id, auteur.libelle]);
  return true;
}
