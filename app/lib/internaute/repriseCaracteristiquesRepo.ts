import 'server-only';
import { query } from '../db/client';
import { choisirReprise, clesAdresse, type ClesAdresse, type Reprise } from '../tunnel/repriseCaracteristiques';

/**
 * 🔴 LOT REPRISE-CARACTERISTIQUES — la reprise pour un internaute CONNECTÉ : ses propres demandes de certificat
 * (`internaute_projet`, une ligne par demande), la plus récente à la même adresse. Les clés d'une demande : l'identifiant
 * BAN qu'elle a porté (`payload.cleAdresseBan`, depuis ce lot) et son adresse normalisée (`adresse_normalisee`, pour les
 * demandes d'avant). La règle de choix et la validation champ par champ sont celles du module pur. LECTURE SEULE.
 */
const LIMITE_DEMANDES = 100;

export async function lireRepriseCompte(internauteId: string, cles: ClesAdresse): Promise<Reprise | null> {
  const { rows } = await query<{ payload: Record<string, unknown> | null; adresse_normalisee: string | null; cree_a: Date }>(
    `SELECT payload, adresse_normalisee, cree_a FROM internaute_projet
      WHERE internaute_id = $1 ORDER BY cree_a DESC, id DESC LIMIT ${LIMITE_DEMANDES}`,
    [internauteId],
  );
  return choisirReprise(rows.map((r) => ({
    cles: clesAdresse(typeof r.payload?.cleAdresseBan === 'string' ? r.payload.cleAdresseBan : null, r.adresse_normalisee),
    caracteristiques: r.payload ?? {},
    le: new Date(r.cree_a).toISOString(),
  })), cles);
}
