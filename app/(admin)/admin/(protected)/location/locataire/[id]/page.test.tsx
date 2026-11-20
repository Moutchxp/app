import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * La page « fiche locataire » de la Location (Arno, 18-19/10/2026) :
 *   · SANS `?sortie=` : LA fiche commune (🔴 le bloc « Sortie du logement » est retiré, accord d'Arno du 20/11/2026, option B), AVEC son
 *     bloc « Fiche commune avec la Gestion… » et sa barre « Annuaire » (aucune option qui les retire) ;
 *   · AVEC `?sortie=` : l'écran de sortie aligné sur « Supprimer un des biens », et lui seul (retrait autorisé pour cet écran).
 */
const ficheCommune = vi.fn();
let droitGestion = true;
vi.mock('../../acces', () => ({
  accesLocation: async () => ({ autorise: true, administrateur: false, gestion: droitGestion }),
  identifiantPage: (b: string | undefined) => (b !== undefined && /^[1-9]\d*$/.test(b) ? Number(b) : null),
  REFUS_FICHE_COMMUNE: 'refus fiche', REFUS_LOCATION: 'refus location',
}));
vi.mock('../../../gestion/FicheCommune', () => ({
  FicheCommuneLocation: (p: Record<string, unknown>) => { ficheCommune(p); return <div data-stub="fiche-commune" />; },
}));
vi.mock('../../ConditionsSuiviFicheLocataire', () => ({
  ConditionsSuiviFicheLocataire: (p: { locataireId: number }) => <div data-stub="conditions-suivi" data-locataire={p.locataireId} />,
}));
vi.mock('../../SortieLocataires', () => ({
  EcranSortieLocataire: (p: { occupationInitiale: number }) => <div data-stub="ecran-sortie" data-occupation={p.occupationInitiale} />,
}));

import Page from './page';

const rendre = async (sortie?: string): Promise<string> => renderToStaticMarkup(await Page({
  params: Promise.resolve({ id: '101' }), searchParams: Promise.resolve(sortie === undefined ? {} : { sortie }),
}));

beforeEach(() => { ficheCommune.mockClear(); droitGestion = true; });

describe('la fiche locataire de la Location', () => {
  it('SANS ?sortie= : LA fiche commune avec son bloc « Annuaire » ; 🔴 plus de bloc « Sortie du logement » (Arno, 20/11/2026)', async () => {
    const html = await rendre();
    expect(html).not.toContain('data-sortie-logement');
    expect(html).not.toContain('Sortie du logement');
    expect(html).toContain('data-stub="fiche-commune"');
    expect(html).not.toContain('data-stub="ecran-sortie"');
    // 🔴 Arno (20/11/2026) — « Conditions d'entrée et suivi commercial » n'est plus en haut de la page : la fiche commune la pose SOUS
    // l'en-tête du locataire (au-dessus de « LE BAIL ») — elle lui est passée, elle n'est pas rendue avant elle.
    expect(html).not.toContain('data-stub="conditions-suivi"');
    expect(html).not.toContain('data-envoi-fiche-locataire');
    expect(ficheCommune).toHaveBeenCalledTimes(1);
    const props = ficheCommune.mock.calls[0][0] as Record<string, unknown>;
    expect(props.fiche).toEqual({ sorte: 'locataire', id: 101 });
    // Aucune des options qui retirent le bloc « Fiche commune… » / « Retour » / la barre « Annuaire ».
    expect(props.sansBarreAnnuaire).toBeUndefined();
    expect(props.sansRetour).toBeUndefined();
    const bloc = props.sousEnteteLocataire as { props: { locataireId: number } } | undefined;
    expect(bloc?.props.locataireId).toBe(101);
  });

  it('🔴 Arno (20/11/2026) — sans le droit « Gestion » (pas de fiche commune) : la ligne reste sur la page, rien n’est retiré', async () => {
    droitGestion = false;
    const html = await rendre();
    expect(html).toContain('data-stub="conditions-suivi" data-locataire="101"');
    expect(ficheCommune).not.toHaveBeenCalled();
  });

  it('AVEC ?sortie= : l’écran de sortie seul — ni bloc « Fiche commune », ni fiche complète', async () => {
    const html = await rendre('11');
    expect(html).toContain('data-stub="ecran-sortie"');
    expect(html).toContain('data-occupation="11"');
    expect(html).not.toContain('data-stub="fiche-commune"');
    expect(html).not.toContain('data-stub="conditions-suivi"');
    expect(ficheCommune).not.toHaveBeenCalled();
  });
});
