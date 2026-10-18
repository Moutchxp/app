import { titreAnnexe } from './bienComplet';

/**
 * ══ 🔴🔴 TUILE LOCATION — LA CARTE D'UNE ANNEXE : ANNOTATION, FERMER, DÉTACHER (Arno, 18/10/2026). PUR. ════════════════
 *
 * « “Fermer” replie la carte en une ligne résumée (type · intérieur/extérieur · place/box · lot · porte/place), un clic la
 * rouvre. » « “Détacher” : louable séparément, elle sort de l'ensemble loué avec le logement, mais garde À VIE son lien de
 * parenté (étiquette “Détachée”) ; “Rattacher” la remet dans l'ensemble. » (Arno)
 */

const LIBELLE: Record<string, string> = { cave: 'Cave', parking: 'Parking', box: 'Box', autre: 'Autre annexe', logement: 'Logement', local: 'Local' };
const SITUATION: Record<string, string> = { interieur: 'Intérieur', exterieur: 'Extérieur' };
const TYPE_PARKING: Record<string, string> = { place_simple: 'Place simple', place_double: 'Place double', box_simple: 'Box simple', box_double: 'Box double' };

/** La ligne résumée d'une annexe repliée. Chaque morceau absent est omis — jamais de « · · ». PUR. */
export function resumeAnnexe(a: {
  categorie: string; nomAnnexe?: string | null; parkingSituation?: string | null; parkingType?: string | null;
  numLotCopro?: string | null; porte?: string | null;
}): string {
  const parking = a.categorie === 'parking' || a.categorie === 'box';
  const lot = (a.numLotCopro ?? '').trim();
  const porte = (a.porte ?? '').trim();
  return [
    titreAnnexe(a, LIBELLE[a.categorie] ?? 'Annexe'),
    parking && a.parkingSituation ? SITUATION[a.parkingSituation] ?? null : null,
    parking && a.parkingType ? TYPE_PARKING[a.parkingType] ?? null : null,
    lot === '' ? null : `lot ${lot}`,
    porte === '' ? null : `${parking ? 'place' : 'porte'} ${porte}`,
  ].filter((x): x is string => x !== null && x !== '').join(' · ');
}

/** L'annotation saisie : texte libre (2 000 caractères), `null` si vide. PUR. */
export function annotationPropre(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, 2000) : null;
}
