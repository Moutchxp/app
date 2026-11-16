import { query, type RequeteTx } from '../db/client';
import type { Auteur } from './gestes';
import { adressesDeLaParcelle } from './parcelleRepo';
import { cleImmeuble, type AdresseSaisie } from './syndics';
import type { ConflitAConfirmer, PropositionParcelle } from './conflitParcelle';

export { conflitsNonConfirmes, motifConflitParcelle, questionConflitParcelle, type ConflitAConfirmer, type ConflitConfirme, type PropositionParcelle } from './conflitParcelle';

/**
 * ══ 🔴🔴 LE CONFLIT DE PARCELLE — UNE SEULE RÈGLE, QUEL QUE SOIT LE CÔTÉ D'OÙ L'ON RATTACHE (Arno, 16/11/2026, après le lot 6) ══════════════
 *
 * Une copropriété reçoit un syndic (depuis la fiche copropriété, « Rattacher un syndic » / « Changer de syndic » ; ou depuis la fiche syndic,
 * une copropriété ajoutée à ce syndic, « Rattacher » d'un bien compris) et une adresse de la MÊME PARCELLE est la copropriété d'un AUTRE syndic :
 * la question « Confirmez-vous un autre syndic pour cette copropriété ? » est posée, et le choix est NOTÉ (`gestion_copropriete_conflit`, la
 * pastille « conflit de parcelle » de la carte du bien). Sans la confirmation, le serveur REFUSE avec un message clair, AVANT TOUTE ÉCRITURE.
 * Les deux portes (`enregistrerCopropriete`, `enregistrerSyndic`) appellent ces mêmes fonctions : la règle n'existe qu'ici.
 */

/** Les adresses des mêmes parcelles que celles de la copropriété (hors les siennes). LECTURE SEULE. */
export async function propositionsParcelle(adresses: readonly AdresseSaisie[], cleCopro: string): Promise<PropositionParcelle[]> {
  const { adresses: autour } = await adressesDeLaParcelle(adresses);
  const siennes = new Set(adresses.map((a) => cleImmeuble(a.libelle)));
  const out: PropositionParcelle[] = [];
  for (const a of autour) {
    if (siennes.has(a.cle)) continue;
    const { rows } = await query<{ cle: string; libelle: string; syndic_id: string | null; syndic_nom: string | null; syndic_ville: string | null }>(
      `SELECT c.cle_immeuble AS cle, c.libelle, s.id::text AS syndic_id, s.nom AS syndic_nom, s.ville AS syndic_ville
         FROM gestion_copropriete c
         LEFT JOIN gestion_copropriete_syndic cs ON cs.copropriete_id = c.id AND cs.fin IS NULL
         LEFT JOIN gestion_syndic s ON s.id = cs.syndic_id AND s.supprime_le IS NULL
        WHERE c.cle_immeuble = $1 OR c.id = (SELECT x.copropriete_id FROM gestion_copropriete_adresse x WHERE x.cle_immeuble = $1 AND x.retire_le IS NULL ORDER BY x.id LIMIT 1)
        ORDER BY (c.cle_immeuble <> $1) DESC LIMIT 1`, [a.cle]);
    const c = rows[0];
    const prise = c !== undefined && c.cle !== cleCopro;
    out.push({ libelle: a.libelle, codePostal: a.codePostal, commune: a.commune, parcelle: a.parcelle, etat: prise ? 'prise' : 'libre',
      copropriete: prise ? c.libelle : null, syndic: prise && c.syndic_id !== null ? { id: Number(c.syndic_id), nom: c.syndic_nom ?? '', ville: c.syndic_ville } : null });
  }
  return out;
}

/** Les conflits d'un rattachement : les adresses de la parcelle qui sont la copropriété d'un AUTRE syndic que `syndicId` (`null` : un syndic
 *  en cours de création, donc tout syndic existant est un autre). LECTURE SEULE. */
export async function conflitsDuRattachement(immeuble: string, adresses: readonly AdresseSaisie[], syndicId: number | null): Promise<ConflitAConfirmer[]> {
  const cle = cleImmeuble(immeuble);
  return (await propositionsParcelle(adresses, cle))
    .filter((p) => p.etat === 'prise' && p.syndic !== null && p.syndic.id !== syndicId)
    .map((p) => ({ ...p, immeuble }));
}

/** Un conflit CONFIRMÉ est noté (les deux copropriétés et leurs syndics à cet instant), une seule fois tant qu'il n'est pas vérifié. */
export async function noterConflitParcelle(q: RequeteTx, coproId: string, syndicId: number, k: ConflitAConfirmer, auteur: Auteur): Promise<void> {
  const cle = cleImmeuble(k.libelle);
  const { rows: b } = await q<{ id: string; syndic: string }>(
    `SELECT c.id::text, cs.syndic_id::text AS syndic FROM gestion_copropriete c
       JOIN gestion_copropriete_syndic cs ON cs.copropriete_id = c.id AND cs.fin IS NULL
      WHERE c.cle_immeuble = $1 OR c.id = (SELECT x.copropriete_id FROM gestion_copropriete_adresse x WHERE x.cle_immeuble = $1 AND x.retire_le IS NULL ORDER BY x.id LIMIT 1)
      ORDER BY (c.cle_immeuble <> $1) DESC, c.id LIMIT 1`, [cle]);
  const autre = b[0];
  if (autre === undefined || autre.id === coproId || Number(autre.syndic) === syndicId) return;
  await q(
    `INSERT INTO gestion_copropriete_conflit (copropriete_a, syndic_a, copropriete_b, syndic_b, parcelle, cree_par, cree_par_libelle)
     SELECT $1, $2, $3, $4, $5, $6, $7
      WHERE NOT EXISTS (SELECT 1 FROM gestion_copropriete_conflit WHERE verifie_le IS NULL
                         AND ((copropriete_a = $1 AND copropriete_b = $3) OR (copropriete_a = $3 AND copropriete_b = $1)))`,
    [coproId, syndicId, autre.id, autre.syndic, k.parcelle || null, auteur.id, auteur.libelle]);
}
