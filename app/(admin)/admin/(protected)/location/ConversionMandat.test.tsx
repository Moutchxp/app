// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ConversionMandat } from './ConversionMandat';

/**
 * 🔴 LOT LS2 — le bouton « Convertir » est retiré (accord d'Arno) ; reste, pour une ligne DÉJÀ convertie, sa mention et « Annuler la conversion ».
 * Avant : 🔴 Arno (26/10/2026, décision C, 431) — « Convertir en « Mandat de gestion seul » » dans le panneau d'une ligne du Suivi du mois :
 * date du mandat proposée (celle du mandat du propriétaire), confirmation avant d'écrire ; une ligne convertie dit d'où elle vient et
 * propose « Annuler la conversion » (confirmée) ; sans la 431 : « disponible après la mise à jour », rien n'est envoyé. Serveur simulé.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
let posts: Record<string, unknown>[]; let disponible: boolean;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; disponible = true;
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
    const corps = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    posts.push(corps);
    if (corps.action === 'proposer-conversion') return new Response(JSON.stringify({ etat: 'ok', data: { disponible, dateProposee: '2026-10-20' } }));
    return new Response(JSON.stringify({ etat: 'ok', data: { phrase: 'fait' } }));
  }));
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const calmer = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
const clic = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
const monter = async (a: Parameters<typeof ConversionMandat>[0]['a'], onFini = vi.fn()) => {
  await act(async () => { root.render(createElement(ConversionMandat, { a, onFini })); });
  return onFini;
};

describe('🔴 LOT LS2 (retrait autorisé par Arno) — plus de « Convertir en « Mandat de gestion seul » »', () => {
  it('une ligne « Bail » non convertie : aucun bouton, rien de rendu, aucun appel', async () => {
    await monter({ id: 837, type: 'bail', conversion: null });
    expect([container.querySelector('[data-convertir-mandat]'), container.querySelector('[data-conversion]'), container.textContent]).toEqual([null, null, '']);
    expect(posts).toEqual([]);
  });
  it('rien non plus sur un avenant, ni sur une ligne reprise sans identifiant', async () => {
    await monter({ id: 12, type: 'avenant', conversion: null });
    expect(container.querySelector('[data-conversion]')).toBeNull();
    await monter({ id: '2026-09#3', type: 'bail', conversion: null });
    expect(container.querySelector('[data-conversion]')).toBeNull();
  });
  it('le code d’appel est retiré de l’écran et de la route (« proposer-conversion », « convertir-mandat-seul ») ; « annuler-conversion » reste', async () => {
    const { readFileSync } = await import('node:fs');
    const ecran = readFileSync('app/(admin)/admin/(protected)/location/ConversionMandat.tsx', 'utf8');
    const route = readFileSync('app/(admin)/api/admin/location/suivi/route.ts', 'utf8');
    for (const x of ["'proposer-conversion'", "'convertir-mandat-seul'", 'data-convertir-mandat']) expect([x, ecran.includes(x) || route.includes(`case ${x}`)]).toEqual([x, false]);
    expect(route).toContain("case 'annuler-conversion': {");
  });
});

describe('une ligne convertie : d’où elle vient, et « Annuler la conversion »', () => {
  it('la mention d’origine ; l’annulation est confirmée avant d’écrire', async () => {
    const relu = await monter({ id: 837, type: 'gestion_seule', conversion: { le: '2026-10-27T09:00:00Z', par: 'a.jorel@sansvisavis.com', typeOrigine: 'bail', dateOrigine: '2014-12-26' } });
    expect(container.querySelector('[data-conversion-origine]')?.textContent).toBe('Converti en « Mandat de gestion seul » le 27/10/2026 par a.jorel@sansvisavis.com — à l’origine « Bail » du 26/12/2014.');
    await clic('[data-annuler-conversion="837"]');
    expect(posts).toEqual([]);
    expect(container.textContent).toContain('elle comptera de nouveau dans « Baux signés »');
    await clic('[data-confirmer-annulation="837"]');
    expect(posts).toEqual([{ action: 'annuler-conversion', id: 837 }]);
    expect(relu).toHaveBeenCalled();
  });
});

describe('🔴 LOT LS2 — le reste de la ligne dépliée ne change pas', () => {
  it('« Dossier de location », « Modifier », « Fiche locataire », « Fiche du bien », la mention d’une ligne convertie, « Supprimer » ; l’étiquette « Gestion seule »', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/(admin)/admin/(protected)/location/FeuilleDuMois.tsx', 'utf8');
    const reperes = ['data-dossier-location={id}>Dossier de location', "{edition === a.id ? 'Fermer' : 'Modifier'}", "'Fiche locataire'", "'Fiche du bien'",
      '<ConversionMandat a={a} onFini={onRelire} />', '<SupprimerLocation id={a.id} onFini={onRelire} />'];
    const pos = reperes.map((r) => src.indexOf(r));
    expect(pos.every((p) => p > 0)).toBe(true);
    expect([...pos].sort((x, y) => x - y)).toEqual(pos);
    expect(src).toContain("{a.type !== 'bail' && <span className=\"loc-pastille\">{a.type === 'avenant' ? 'Avenant' : 'Gestion seule'}</span>}");
  });
});
