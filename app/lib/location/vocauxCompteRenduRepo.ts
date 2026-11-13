import 'server-only';
import { query } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { deposerPieceSortie, recuperer } from '../stockage';
import { lireBail } from './sortieLocatairesRepo';
import { MOTIF_SANS_468, piecesSortieDisponibles } from './piecesSortieRepo';
import { nomVocal, refusVocal, typeAudio, VOCAL_MAX_OCTETS, VOCAUX_MAX } from './vocauxCompteRendu';
import { transcrireVocal, type IssueTranscription } from './transcriptionVocal';

/**
 * 🔴 Arno (13/11/2026, lot C) — LES VOCAUX DU COMPTE RENDU : déposés sur le MÊME stockage que les photos et les pièces de « Valider la sortie »
 * (stockage objet, ajout seul, jamais le Drive — ni « Documents clients scannés », ni ailleurs), bornés aux occupations du préavis ; transcrits
 * par Mistral. 🔴 INTERNES : aucune de ces fonctions ne les joint à un mail.
 */
export async function deposerVocal(d: { occupationIds: readonly number[]; donnees: string; typeMime: string; dureeS: number | null; dejaIds: readonly number[] }, auteur: Auteur):
  Promise<{ etat: 'ok'; data: { id: number; nom: string; taille: number } } | { etat: 'refus'; motif: string }> {
  if (!(await piecesSortieDisponibles())) return { etat: 'refus', motif: MOTIF_SANS_468 };
  if (d.occupationIds.length === 0) return { etat: 'refus', motif: 'Demande incomplète.' };
  if (d.dejaIds.length >= VOCAUX_MAX) return { etat: 'refus', motif: `Au plus ${VOCAUX_MAX} vocaux par compte rendu.` };
  const base64 = d.donnees.replace(/^data:[^,]*,/, '');
  if (base64 === '' || !/^[A-Za-z0-9+/=\s]+$/.test(base64)) return { etat: 'refus', motif: 'L’enregistrement est illisible.' };
  const octets = Buffer.from(base64, 'base64');
  const refus = refusVocal({ typeMime: d.typeMime, taille: octets.byteLength, dureeS: d.dureeS });
  if (refus !== null) return { etat: 'refus', motif: refus };
  const occ = d.occupationIds[0];
  if ((await lireBail(occ)) === null) return { etat: 'refus', motif: 'Ce bail n’existe plus : rechargez la page.' };
  const type = typeAudio(d.typeMime) as string;
  const depot = await deposerPieceSortie(octets, type, { occupationId: occ, tailleMaxOctets: VOCAL_MAX_OCTETS });
  if (!depot.depose) return { etat: 'refus', motif: `L’enregistrement n’a pas pu être déposé : ${depot.motif}` };
  const nom = nomVocal(d.dejaIds.length, type);
  const { rows } = await query<{ id: string }>(
    `INSERT INTO gestion_location_sortie_piece (occupation_id, provenance, nom, type_mime, taille_octets, cle_stockage, empreinte_sha256, drive_file_id, ajoute_par_id, ajoute_par_libelle)
     VALUES ($1, 'ordinateur', $2, $3, $4, $5, $6, NULL, $7, $8) RETURNING id::text`,
    [occ, nom, type, octets.byteLength, depot.cle, depot.empreinte, auteur.id, auteur.libelle]);
  return { etat: 'ok', data: { id: Number(rows[0].id), nom, taille: octets.byteLength } };
}

/** Les vocaux (pièces AUDIO de CES occupations) ; un identifiant forgé ou d'un autre bail n'est jamais rendu. */
export async function vocauxDesOccupations(ids: readonly number[], occupationIds: readonly number[]): Promise<{ id: number; nom: string; typeMime: string; taille: number; cle: string }[]> {
  if (ids.length === 0 || !(await piecesSortieDisponibles())) return [];
  const { rows } = await query<{ id: string; nom: string; type_mime: string; taille_octets: string; cle_stockage: string }>(
    `SELECT id::text, nom, type_mime, taille_octets::text, cle_stockage FROM gestion_location_sortie_piece
      WHERE id = ANY($1::bigint[]) AND occupation_id = ANY($2::bigint[]) AND type_mime LIKE 'audio/%' ORDER BY array_position($1::bigint[], id)`, [[...ids], [...occupationIds]]);
  return rows.map((r) => ({ id: Number(r.id), nom: r.nom, typeMime: r.type_mime, taille: Number(r.taille_octets), cle: r.cle_stockage }));
}

/** TRANSCRIRE un vocal déjà déposé (relu du stockage). Un échec : le motif, le vocal reste. */
export async function transcrirePieceVocale(d: { occupationIds: readonly number[]; pieceId: number },
  deps: { lireOctets?: (cle: string) => Promise<Buffer>; transcrire?: typeof transcrireVocal } = {}): Promise<{ etat: 'ok'; data: IssueTranscription } | { etat: 'refus'; motif: string }> {
  const [v] = await vocauxDesOccupations([d.pieceId], d.occupationIds);
  if (v === undefined) return { etat: 'refus', motif: 'Ce vocal est introuvable pour ce préavis.' };
  let octets: Buffer;
  try { octets = await (deps.lireOctets ?? recuperer)(v.cle); } catch { return { etat: 'ok', data: { ok: false, motif: 'Le vocal est illisible sur le stockage : il reste joint, réessayez.' } }; }
  return { etat: 'ok', data: await (deps.transcrire ?? transcrireVocal)(new Uint8Array(octets), v.typeMime, v.nom) };
}
