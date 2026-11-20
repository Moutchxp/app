import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * La page « fiche locataire » de la Location (Arno, 18-19/10/2026) :
 *   · SANS `?sortie=` : LA fiche commune (🔴 le bloc « Sortie du logement » est retiré, accord d'Arno du 20/11/2026, option B), AVEC son
 *     bloc « Fiche commune avec la Gestion… » et sa barre « Annuaire » (aucune option qui les retire) ;
 *   · AVEC `?sortie=` : l'écran de sortie aligné sur « Supprimer un des biens », et lui seul (retrait autorisé pour cet écran).
 */
const ficheCommune = vi.fn();
vi.mock('../../acces', () => ({
  accesLocation: async () => ({ autorise: true, administrateur: false, gestion: true }),
  identifiantPage: (b: string | undefined) => (b !== undefined && /^[1-9]\d*$/.test(b) ? Number(b) : null),
  REFUS_FICHE_COMMUNE: 'refus fiche', REFUS_LOCATION: 'refus location',
}));
vi.mock('../../../gestion/FicheCommune', () => ({
  FicheCommuneLocation: (p: Record<string, unknown>) => { ficheCommune(p); return <div data-stub="fiche-commune" />; },
}));
vi.mock('../../SortieLocataires', () => ({
  EcranSortieLocataire: (p: { occupationInitiale: number }) => <div data-stub="ecran-sortie" data-occupation={p.occupationInitiale} />,
}));

import Page from './page';

const rendre = async (sortie?: string): Promise<string> => renderToStaticMarkup(await Page({
  params: Promise.resolve({ id: '101' }), searchParams: Promise.resolve(sortie === undefined ? {} : { sortie }),
}));

beforeEach(() => ficheCommune.mockClear());

describe('la fiche locataire de la Location', () => {
  it('SANS ?sortie= : LA fiche commune avec son bloc « Annuaire » ; 🔴 plus de bloc « Sortie du logement » (Arno, 20/11/2026)', async () => {
    const html = await rendre();
    expect(html).not.toContain('data-sortie-logement');
    expect(html).not.toContain('Sortie du logement');
    expect(html).toContain('data-stub="fiche-commune"');
    expect(html).not.toContain('data-stub="ecran-sortie"');
    // 🔴 Arno (26/10/2026) — et le bloc 4 « Suivi commercial » (ajout seul).
    expect(html).toContain('data-bloc-suivi-locataire');
    expect(ficheCommune).toHaveBeenCalledTimes(1);
    const props = ficheCommune.mock.calls[0][0] as Record<string, unknown>;
    expect(props.fiche).toEqual({ sorte: 'locataire', id: 101 });
    // Aucune des options qui retirent le bloc « Fiche commune… » / « Retour » / la barre « Annuaire ».
    expect(props.sansBarreAnnuaire).toBeUndefined();
    expect(props.sansRetour).toBeUndefined();
  });

  it('AVEC ?sortie= : l’écran de sortie seul — ni bloc « Fiche commune », ni fiche complète', async () => {
    const html = await rendre('11');
    expect(html).toContain('data-stub="ecran-sortie"');
    expect(html).toContain('data-occupation="11"');
    expect(html).not.toContain('data-stub="fiche-commune"');
    expect(html).not.toContain('data-bloc-suivi-locataire');
    expect(ficheCommune).not.toHaveBeenCalled();
  });
});
