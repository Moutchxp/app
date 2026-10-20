import { familleDeCategorie, LIBELLE_FAMILLE, type Famille } from './bienComplet';
import { categorieDuBien } from './locationBien';
import { piecesDeType } from '../gestion/pastillesBien';

/**
 * ══ 🔴🔴 FICHE BIEN — LES LIGNES DU RÉSUMÉ, UNE SEULE PAR INFORMATION (Arno, 20/10/2026). PUR. ══════════════════════════════
 *
 * « Chaque ligne prend sa valeur dans les champs de Location ; s'ils sont vides, dans les données importées (WIPPIMMO), comme
 * la ligne ancienne le faisait. Jamais deux valeurs contradictoires. » Une SOURCE par ligne : la Location d'abord, l'import à
 * défaut — jamais les deux côte à côte.
 *   · Type : « Logement · Appartement » (famille + type de Location) ; à défaut, la famille DÉDUITE de l'import (règle commune
 *     `categorieDuBien`) + sa nature (« meublé » retiré : il a sa ligne) + son type s'il n'est pas un « Type N » (les pièces) ;
 *   · Meublé : la Location ; à défaut, « meublé » dans la nature importée ⇒ oui (rien d'autre n'est deviné) ;
 *   · Pièces : la Location ; à défaut, le « Type N » importé ⇒ N ;
 *   · sur un parking, ni « Meublé » ni « Pièces » ; sur un logement ou un local, rien de propre au parking.
 */
export interface DonneesImport { nature: string | null; typeBien: string | null; surfaceM2?: number | null }
export interface DonneesLocation {
  famille: string | null; familleCle?: Famille | null; type: string | null; meuble: boolean | null; nombrePieces: number | null;
  surfaceHabitableM2: number | null; surfaceCarrezM2: number | null; surfaceExterieureM2: number | null; surfaceM2: number | null;
}
export interface LignesResume {
  famille: Famille | null;
  type: string | null;
  /** `undefined` : la ligne n'existe pas pour cette famille (parking). */
  meuble?: boolean | null;
  pieces?: number | null;
  surfaces: { cle: string; mot: string; m2: number | null }[];
  /** Époque de construction et chauffage : logement et local seulement. */
  avecComplements: boolean;
}

// (`\b` de JavaScript ignore les lettres accentuées : la fin du mot se teste par « pas de lettre après ».)
const sansMeuble = (nature: string): string => nature.replace(/\s*(?<!\p{L})meubl[ée]e?s?(?!\p{L})/iu, '').trim();

export function lignesResume(imp: DonneesImport, loc: DonneesLocation | undefined): LignesResume {
  const nature = (imp.nature ?? '').trim();
  const typeImport = (imp.typeBien ?? '').trim();
  const piecesImport = piecesDeType(typeImport);
  const famille: Famille | null = loc?.familleCle ?? familleDeCategorie(categorieDuBien({ categorie: null, nature: imp.nature, typeBien: imp.typeBien }));
  // Le type : la Location si elle le dit ; sinon l'import (famille déduite + nature + type non « Type N »).
  const typeLocation = loc !== undefined && loc.type !== null ? [loc.famille, loc.type].filter((x) => x).join(' · ') : null;
  const typeImportLu = [famille === null ? null : LIBELLE_FAMILLE[famille], sansMeuble(nature) || null, piecesImport === null && typeImport !== '' ? typeImport : null]
    .filter((x) => x && x !== '').join(' · ');
  const type = typeLocation ?? (typeImportLu !== '' ? typeImportLu : (loc?.famille ?? null));
  const habite = famille === 'logement' || famille === 'local';
  const surfaces = famille === 'parking'
    ? [{ cle: 'surface-parking', mot: 'Surface', m2: loc?.surfaceM2 ?? imp.surfaceM2 ?? null }]
    : habite
      ? [
        { cle: 'surface-habitable', mot: famille === 'local' ? 'Surface' : 'Surface habitable', m2: loc?.surfaceHabitableM2 ?? imp.surfaceM2 ?? null },
        { cle: 'surface-carrez', mot: 'Surface Carrez/Boutin', m2: loc?.surfaceCarrezM2 ?? null },
        { cle: 'surface-exterieure', mot: 'Surface extérieure', m2: loc?.surfaceExterieureM2 ?? null },
      ]
      : [{ cle: 'surface', mot: 'Surface', m2: loc?.surfaceM2 ?? loc?.surfaceHabitableM2 ?? imp.surfaceM2 ?? null }];
  return {
    famille, type,
    ...(famille === 'parking' || famille === null ? {} : {
      meuble: loc?.meuble ?? (/meubl/i.test(nature) ? true : null),
      pieces: loc?.nombrePieces ?? piecesImport,
    }),
    surfaces, avecComplements: habite,
  };
}
