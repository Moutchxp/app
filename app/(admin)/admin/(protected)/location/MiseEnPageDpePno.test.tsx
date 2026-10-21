// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CreationBien } from './CreationBien';
import { CreationProprietaireBien } from './CreationProprietaireBien';
import { CSS_DPE_PNO } from './BlocDpe';

/**
 * 🔴 Arno (18/10/2026) — bloc « Caractéristiques complémentaires » : DPE (gauche) et assurance PNO (droite), deux blocs de
 * même hauteur aux rangées PARTAGÉES (titre · choix · date · alertes) ; les lettres du DPE sur une ligne, « Non soumis » à la suite ou à la ligne ; les
 * deux dates sur la même ligne, grisées à leur place quand elles sont sans objet ; les alertes sous les dates. L'ancienne page
 * « Nouveau propriétaire + bien » applique les mêmes règles obligatoires. Les VRAIS composants ; la géométrie réelle (hauteurs,
 * alignements au pixel) est mesurée dans Chrome par le banc de captures — ici, la structure et les règles CSS qui la portent.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = [];
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return ok({ logementId: 9, proprietaireId: 5 }); }
    if (String(url).includes('cartesProprietaires=')) return ok([{ id: 1, nom: 'DUPONT Paul', telephone: null, email: null, biens: [] }]);
    return ok([]);
  }) as unknown as typeof fetch;
  Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true });
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const dpe = (mot: string) => [...container.querySelectorAll('[aria-label="Classe DPE"] button')].find((b) => b.textContent?.replace('✓ ', '') === mot)!;
const rangees = (bloc: Element) => [...bloc.children].map((c) => (c.tagName === 'H4' ? 'titre' : c.className.replace('loc-dpe-pno-', '')));

describe('🔴 DPE et assurance PNO : deux blocs, rangées partagées', () => {
  const ouvrir = async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [1] })); });
    await calmer();
    await clic(container.querySelector('[data-famille="logement"]')!);
  };

  it('deux blocs côte à côte (DPE puis PNO), chacun en 4 rangées dans le même ordre : titre · choix · date · alertes', async () => {
    await ouvrir();
    const ligne = container.querySelector('[data-ligne-dpe-pno]') as HTMLElement;
    expect(ligne.className).toBe('loc-dpe-pno');
    const blocs = [...ligne.children];
    expect(blocs.map((b) => (b as HTMLElement).dataset.dpe !== undefined ? 'dpe' : (b as HTMLElement).dataset.pno !== undefined ? 'pno' : '?')).toEqual(['dpe', 'pno']);
    for (const b of blocs) expect(rangees(b)).toEqual(['titre', 'choix', 'date', 'notes']);
    // « Entretien à prévoir » reste EN DESSOUS, sur toute la largeur (hors de la paire).
    expect(ligne.querySelector('[data-entretien-bloc]')).toBeNull();
    expect(ligne.nextElementSibling?.matches('[data-entretien-bloc]')).toBe(true);
    // Époque / Chauffage / Dernière AG : inchangés, alignés en haut.
    expect([...container.querySelectorAll('[data-ligne-epoque] > label')].map((l) => l.firstChild?.textContent)).toEqual(['Époque de construction', 'Chauffage', 'Date de la dernière AG']);
  });

  it('🔴 Arno (21/10/2026, débordement constaté en production) : lettres A à G compactes de même largeur ; « Non soumis » à la suite ou à la ligne, jamais hors de l’encadré', async () => {
    await ouvrir();
    const groupe = container.querySelector('[data-dpe] .loc-dpe-pno-choix [aria-label="Classe DPE"]') as HTMLElement;
    const boutons = [...groupe.querySelectorAll('button')];
    expect(boutons.map((b) => b.textContent)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'Non soumis']);
    expect(groupe.classList.contains('loc-pilules--dpe')).toBe(true);
    // Les lettres : une classe commune (même largeur, lettre seule centrée, coche hors du flux) ; « Non soumis » : la pastille ordinaire.
    expect(boutons.slice(0, 7).every((b) => b.classList.contains('loc-dpe-lettre'))).toBe(true);
    expect(boutons[7].classList.contains('loc-dpe-lettre')).toBe(false);
    expect(CSS_DPE_PNO).toContain('.loc-pilules--dpe button.loc-dpe-lettre{position:relative;width:3.25rem;min-width:44px;padding:0;text-align:center}');
    expect(CSS_DPE_PNO).toContain('.loc-pilules--dpe button.loc-dpe-lettre::before{position:absolute;');
    expect(CSS_DPE_PNO).toContain('.loc-pilules--dpe button.loc-dpe-lettre::after{content:none}');
    // Le retour à la ligne est TOUJOURS permis (la cause du débordement : `nowrap` au bureau) ; aucune pastille plus large que l'encadré.
    expect(CSS_DPE_PNO).toContain('.loc-pilules--dpe{gap:8px;flex-wrap:wrap}');
    expect(CSS_DPE_PNO).not.toMatch(/flex-wrap:\s*nowrap/);
    expect(CSS_DPE_PNO).toContain('.loc-pilules--dpe button{flex:0 0 auto;white-space:nowrap;max-width:100%}');
    // La géométrie réelle (aucun bouton hors de son encadré, 390 à 1440 px, clair et sombre) est mesurée dans Chrome par le banc.
  });

  it('les deux dates sur la MÊME rangée (la 3e) ; même hauteur des blocs par la grille partagée (subgrid, 4 rangées)', async () => {
    await ouvrir();
    const ligne = container.querySelector('[data-ligne-dpe-pno]') as HTMLElement;
    const [blocDpe, blocPno] = [...ligne.children];
    expect(blocDpe.children[2].querySelector('[data-dpe-date] input[type="date"]')).not.toBeNull();
    expect(blocPno.children[2].querySelector('[data-pno-date] input[type="date"]')).not.toBeNull();
    expect(blocPno.children[2].querySelector('[data-pno-date] span')?.textContent).toBe('Date anniversaire');
    const bureau = CSS_DPE_PNO.slice(CSS_DPE_PNO.indexOf('@media (min-width:900px)'));
    expect(bureau).toContain('grid-template-rows:auto auto auto auto');
    expect(bureau).toContain('.loc-dpe-pno-bloc{grid-row:span 4;grid-template-rows:subgrid');
  });

  it('dates sans objet : grisées À LEUR PLACE (PNO pas « Oui », DPE « Non soumis »)', async () => {
    await ouvrir();
    const datePno = () => container.querySelector('[data-pno-date] input') as HTMLInputElement;
    const dateDpe = () => container.querySelector('[data-dpe-date] input') as HTMLInputElement;
    expect(datePno().disabled).toBe(true);
    await clic([...container.querySelectorAll('[aria-label="Assurance PNO"] button')].find((b) => b.textContent === 'Oui')!);
    expect(datePno().disabled).toBe(false);
    await clic([...container.querySelectorAll('[aria-label="Assurance PNO"] button')].find((b) => b.textContent?.replace('✓ ', '') === 'Non')!);
    expect(datePno().disabled).toBe(true);
    await clic(dpe('Non soumis'));
    expect(dateDpe().disabled).toBe(true);
    expect(container.querySelector('[data-dpe] .loc-dpe-pno-date [data-dpe-date]')).toBe(dateDpe().closest('[data-dpe-date]'));
  });

  it('alertes (G, plus de 10 ans) dans la 4e rangée, SOUS les dates : la rangée des dates reste la même des deux côtés', async () => {
    await ouvrir();
    await clic(dpe('G'));
    await saisir(container.querySelector('[data-dpe-date] input') as HTMLInputElement, '2012-02-01');
    const notes = container.querySelector('[data-dpe] .loc-dpe-pno-notes') as HTMLElement;
    expect([...notes.querySelectorAll('[data-alerte-dpe]')].map((x) => x.textContent))
      .toEqual(['⚠ Location interdite depuis le 01/01/2025 pour un nouveau bail', '⚠ DPE de plus de 10 ans : il n’est plus valable']);
    expect(container.querySelector('[data-dpe] .loc-dpe-pno-date [data-alerte-dpe]')).toBeNull();
    expect(container.querySelector('[data-dpe] .loc-dpe-pno-choix [data-alerte-dpe]')).toBeNull();
  });
});

describe('🔴 ancienne page « Nouveau propriétaire + bien » (/admin/location/nouveau) : mêmes règles obligatoires', () => {
  const ouvrir = async () => {
    await act(async () => { root.render(createElement(CreationProprietaireBien, { proprietaireInitial: { id: 5, nom: 'EXEMPLE Claire' } })); });
    await calmer();
    await saisir([...container.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Adresse *'))!.querySelector('input')!, '3 rue du Port');
  };
  const enregistrer = async () => { await act(async () => { (container.querySelector('button[type="submit"]') as HTMLButtonElement).click(); }); await calmer(); };

  it('sans DPE ni entretien : rien n’est envoyé, mêmes messages sous les champs ; libellés « * »', async () => {
    await ouvrir();
    expect(container.querySelector('[data-bloc-dpe-entretien] [data-dpe] h4')?.textContent).toBe('DPE *');
    expect(container.querySelector('[data-bloc-dpe-entretien] [data-entretien-bloc] h4')?.textContent).toBe('Entretien à prévoir *');
    expect([...container.querySelectorAll('[aria-label="Classe DPE"] button')].map((b) => b.textContent)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'Non soumis']);
    await enregistrer();
    expect(posts).toEqual([]);
    expect([...container.querySelectorAll('.loc-manque')].map((x) => x.textContent)).toEqual([
      'Choisissez la classe DPE (A à G) ou « Non soumis ».', 'La date du DPE est obligatoire (sauf « Non soumis »).', 'Entretien à prévoir : répondez Oui ou Non.']);
    expect(container.querySelector('.cp-refus')?.textContent).toContain('Reste à renseigner');
  });

  it('Oui sans entretien bloqué ; classe + date + Non envoyés ; « Non soumis » sans date accepté', async () => {
    await ouvrir();
    await clic(dpe('C'));
    await saisir(container.querySelector('[data-dpe-date] input') as HTMLInputElement, '2023-05-10');
    await clic(container.querySelector('[data-entretien-reponse="oui"]')!);
    await enregistrer();
    expect(posts).toEqual([]);
    expect(container.querySelector('[data-entretien-bloc] .loc-manque')?.textContent).toContain('cochez ou ajoutez au moins un entretien');
    await clic(container.querySelector('[data-entretien-reponse="non"]')!);
    await enregistrer();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ action: 'creer', proprietaireId: 5,
      logement: { adresse: '3 rue du Port', categorie: 'logement', dpeClasse: 'C', dpeDate: '2023-05-10', entretienAPrevoir: false, entretiens: [] } });
    await clic(dpe('Non soumis'));
    await enregistrer();
    expect(posts).toHaveLength(2);
    expect(posts[1].logement).toMatchObject({ dpeClasse: 'non_soumis', dpeDate: '' });
  });
});
