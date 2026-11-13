import 'server-only';
import type { Auteur } from '../gestion/gestes';
import { joindreDepuisOrdinateur, metaPieces } from './piecesSortieRepo';
import { LEGENDE_MAX, PHOTOS_MAX, type PhotoCompteRendu } from './photosCompteRendu';
import { preparerPhoto } from './photosCompteRenduServeur';

/**
 * 🔴 Arno (13/11/2026, lot B) — DÉPOSER UNE PHOTO DU COMPTE RENDU : préparée (`preparerPhoto` : format lu dans les octets, réduite, ré-encodée
 * en JPEG, métadonnées et localisation GPS retirées), puis déposée et inscrite EXACTEMENT comme les pièces de « Valider la sortie »
 * (`joindreDepuisOrdinateur` : stockage objet, plafond par fichier et total, ajout seul) — jamais dans le Drive (ni « Documents clients
 * scannés », ni ailleurs). Le total compte les photos déjà déposées pour ce compte rendu (`dejaIds`, bornées à ces occupations).
 */
export async function deposerPhotoCompteRendu(d: { occupationIds: readonly number[]; donnees: string; dejaIds: readonly number[] }, auteur: Auteur):
  Promise<{ etat: 'ok'; data: { id: number; nom: string; taille: number } } | { etat: 'refus'; motif: string }> {
  if (d.occupationIds.length === 0) return { etat: 'refus', motif: 'Demande incomplète.' };
  if (d.dejaIds.length >= PHOTOS_MAX) return { etat: 'refus', motif: `Au plus ${PHOTOS_MAX} photos par compte rendu.` };
  const base64 = d.donnees.replace(/^data:[^,]*,/, '');
  if (base64 === '' || !/^[A-Za-z0-9+/=\s]+$/.test(base64)) return { etat: 'refus', motif: 'La photo est illisible.' };
  const p = await preparerPhoto(Buffer.from(base64, 'base64'));
  if (!p.ok) return { etat: 'refus', motif: p.motif };
  const deja = await metaPieces(d.dejaIds, d.occupationIds);
  const r = await joindreDepuisOrdinateur(d.occupationIds[0], [{ nom: 'photo-previsite.jpg', typeMime: 'image/jpeg', octets: p.octets }], deja.map((x) => ({ taille: x.taille })), auteur);
  if (r.etat !== 'ok') return r;
  const piece = r.data.pieces[0];
  if (piece === undefined) return { etat: 'refus', motif: r.data.refus[0] ?? 'La photo n’a pas pu être déposée.' };
  return { etat: 'ok', data: { id: piece.id, nom: piece.nom, taille: piece.taille } };
}

/** Les photos reçues de l'écran (identifiant de pièce, légende), au plus 20 ; une entrée mal formée est ignorée. PUR. */
export function photosDuCorps(brut: unknown): PhotoCompteRendu[] {
  return (Array.isArray(brut) ? brut : []).slice(0, PHOTOS_MAX + 1).map((x) => {
    const o = (x ?? {}) as { id?: unknown; legende?: unknown };
    const id = typeof o.id === 'number' ? o.id : Number(o.id);
    return Number.isSafeInteger(id) && id > 0 ? { id, legende: typeof o.legende === 'string' ? o.legende.slice(0, LEGENDE_MAX + 1) : '' } : null;
  }).filter((x): x is PhotoCompteRendu => x !== null);
}
