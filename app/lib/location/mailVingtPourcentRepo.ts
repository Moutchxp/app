import { query } from '../db/client';
import { conditionCoordonneeVivante } from '../gestion/coordonneeVivante';
import { refusUnLocataireParMail } from './mailVingtPourcent';

/**
 * ══ 🔴🔴 « UN MAIL PAR LOCATAIRE » — LE CONTRÔLE DU SERVEUR (Arno, 25/11/2026, décision 2A). IMPUR (base), LECTURE SEULE. ═════════════════════════════
 * Pour un mail parti de l'écran « 20 % à restituer » (marque `vingtPourcent: { sortieId }`), le serveur relit LUI-MÊME les adresses encore valables de
 * chaque locataire de la sortie (jamais une liste venue du navigateur) et applique `refusUnLocataireParMail`. Les autres mails ne passent pas ici.
 */
export async function adressesDesLocatairesDeLaSortie(sortieId: number): Promise<string[][]> {
  const vivante = await conditionCoordonneeVivante('c');
  const { rows } = await query<{ locataire: string; adresse: string | null }>(
    `SELECT o.locataire_id::text AS locataire, nullif(btrim(coalesce(c.valeur_brute, c.valeur)), '') AS adresse
       FROM gestion_location_sortie_validee s
       JOIN gestion_annuaire_occupation o ON o.id = ANY(s.occupation_ids)
       LEFT JOIN gestion_annuaire_contact c ON c.sujet = 'locataire' AND c.sujet_id = o.locataire_id AND c.sorte = 'email' AND c.absent_le IS NULL${vivante}
      WHERE s.id = $1`, [sortieId]);
  const par = new Map<string, string[]>();
  for (const r of rows) {
    const l = par.get(r.locataire) ?? [];
    if (r.adresse !== null) l.push(r.adresse);
    par.set(r.locataire, l);
  }
  return [...par.values()];
}

/** Le refus (motif) d'un mail parti de l'écran « 20 % à restituer », ou `null`. */
export async function refusMailVingtPourcent(sortieId: number, destinataires: readonly string[]): Promise<string | null> {
  return refusUnLocataireParMail(await adressesDesLocatairesDeLaSortie(sortieId), destinataires);
}
