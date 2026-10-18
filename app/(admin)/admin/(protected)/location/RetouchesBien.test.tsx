// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CreationBien } from './CreationBien';
import { CreationProprietaires } from './CreationProprietaires';

/**
 * 🔴 Retouches d'Arno (18/10/2026) sur « Ajouter un nouveau bien » : nom d'une annexe « Autre », flèches ▲ ▼ (étage, pièces),
 * assurance PNO, et « Créer un nouveau propriétaire » → le bien dans la continuité. Les VRAIS composants, routes simulées.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
const refus = (motif: string) => ({ ok: true, status: 200, json: async () => ({ etat: 'refus', motif }) }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
let bienRefuse: boolean;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; bienRefuse = false;
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push(corps);
      if (corps.action === 'creer-proprietaires') return ok({ ids: [41, 42] });
      if (corps.action === 'creer-bien' && bienRefuse) return refus('Ce syndic n’est pas (ou plus) un syndic connu de la Gestion.');
      return ok({ logementId: 9 });
    }
    if (u.includes('cartesProprietaires=')) return ok([{ id: 1, nom: 'DUPONT Paul', telephone: null, email: null, biens: [] }]);
    if (u.includes('agPourAdresse=')) return ok(null);
    return ok([]);
  }) as unknown as typeof fetch;
  Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true });
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const bouton = (t: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === t) as HTMLButtonElement;
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const famille = async (f: string) => { await act(async () => { (container.querySelector(`[data-famille="${f}"]`) as HTMLButtonElement).click(); }); };
const remplirMinimum = async () => {
  await famille('logement');
  await act(async () => { [...container.querySelectorAll('[aria-label="Type de logement"] button')][0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await saisir(container.querySelector('.cab-enveloppe input') as HTMLInputElement, '3 rue du Port');
};
const soumettre = async () => { await act(async () => { (container.querySelector('[data-collant] button[type="submit"]') as HTMLButtonElement).click(); }); await calmer(); };

describe('🔴 annexe « Autre » : son nom, obligatoire, en tête de la carte et en titre', () => {
  it('sans nom : refusé, rien n’est envoyé ; avec nom : titre de l’annexe et envoyé', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [1] })); });
    await calmer();
    await remplirMinimum();
    await act(async () => { bouton('+ Autre').click(); });
    const carte = container.querySelector('[data-annexe="autre"]') as HTMLElement;
    // Le champ est le PREMIER de la carte (juste sous son titre).
    expect(carte.querySelector('input')?.closest('[data-nom-annexe]')).not.toBeNull();
    expect((carte.querySelector('[data-nom-annexe] input') as HTMLInputElement).placeholder).toBe('ex. Cellier, Grenier, Local vélo');
    await soumettre();
    expect(container.textContent).toContain('Annexe 1 : le nom de l’annexe « Autre » est obligatoire');
    expect(posts).toEqual([]);
    await saisir(carte.querySelector('[data-nom-annexe] input') as HTMLInputElement, 'Cellier');
    expect(carte.querySelector('.loc-annexe-tete')?.firstChild?.textContent).toBe('Cellier');
    await soumettre();
    expect((posts[0].annexes as Record<string, unknown>[])[0]).toMatchObject({ categorie: 'autre', nomAnnexe: 'Cellier' });
  });
});

describe('🔴 flèches ▲ ▼ : étage de −5 à 60 (0 = RDC), pièces à partir de 1', () => {
  it('étage du bien et d’une annexe ; texte libre conservé ; pièces jamais sous 1', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [] })); });
    await famille('logement');
    const etage = () => container.querySelector('[data-ligne-situation] [data-champ-fleches="etage"]') as HTMLElement;
    const val = () => (etage().querySelector('input') as HTMLInputElement).value;
    const fleche = (racine: HTMLElement, sens: 'haut' | 'bas') => racine.querySelector(`[data-fleche="${sens}"]`) as HTMLButtonElement;
    expect(fleche(etage(), 'haut').getAttribute('aria-label')).toBe('Monter d’un étage');
    expect(fleche(etage(), 'haut').type).toBe('button');
    await act(async () => { fleche(etage(), 'haut').click(); });
    expect(val()).toBe('1');
    await act(async () => { fleche(etage(), 'bas').click(); });
    expect(val()).toBe('RDC');
    await act(async () => { fleche(etage(), 'bas').click(); });
    expect(val()).toBe('-1');
    await saisir(etage().querySelector('input') as HTMLInputElement, '-5');
    expect(fleche(etage(), 'bas').disabled).toBe(true);
    await saisir(etage().querySelector('input') as HTMLInputElement, '60');
    expect(fleche(etage(), 'haut').disabled).toBe(true);
    await saisir(etage().querySelector('input') as HTMLInputElement, 'mezzanine');
    expect(val()).toBe('mezzanine');
    // « 0 » tapé à la main devient « RDC » en quittant le champ.
    await saisir(etage().querySelector('input') as HTMLInputElement, '0');
    await act(async () => { (etage().querySelector('input') as HTMLInputElement).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    expect(val()).toBe('RDC');
    // Pièces : ▼ désactivée à 1.
    const pieces = container.querySelector('[data-champ-fleches="pieces"]') as HTMLElement;
    await act(async () => { fleche(pieces, 'haut').click(); });
    expect((pieces.querySelector('input') as HTMLInputElement).value).toBe('1');
    expect(fleche(pieces, 'bas').disabled).toBe(true);
    // Annexe : ses propres flèches d'étage.
    await act(async () => { bouton('+ Cave').click(); });
    const etageCave = container.querySelector('[data-annexe="cave"] [data-champ-fleches="etage"]') as HTMLElement;
    await act(async () => { fleche(etageCave, 'bas').click(); });
    expect((etageCave.querySelector('input') as HTMLInputElement).value).toBe('-1');
  });
});

describe('🔴 assurance PNO (bloc 6) : Oui ⇒ date anniversaire ; Non la vide', () => {
  it('à droite du DPE ; Oui + date envoyés ; Non vide la date', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [1] })); });
    await calmer();
    await remplirMinimum();
    const ligne = container.querySelector('[data-ligne-dpe-pno]') as HTMLElement;
    expect([...ligne.children].map((c) => c.querySelector('h4')?.textContent)).toEqual(['DPE', 'Assurance PNO']);
    const pno = (mot: string) => [...ligne.querySelectorAll('[aria-label="Assurance PNO"] button')].find((x) => x.textContent?.replace('✓ ', '') === mot) as HTMLButtonElement;
    const date = () => ligne.querySelector('[data-pno] input[type="date"]') as HTMLInputElement | null;
    expect(date()).toBeNull();
    await act(async () => { pno('Oui').click(); });
    await saisir(date()!, '2026-11-15');
    await act(async () => { pno('Non').click(); });
    expect(date()).toBeNull();
    await act(async () => { pno('Oui').click(); });
    expect(date()!.value).toBe('');
    await saisir(date()!, '2026-11-15');
    await soumettre();
    expect(posts[0].logement).toMatchObject({ assurancePno: true, pnoDateAnniversaire: '2026-11-15' });
  });
});

describe('🔴 « Créer un nouveau propriétaire » → le bien sur la même page', () => {
  const carteClient = async () => {
    const form = container.querySelector('.cp-form') as HTMLElement;
    const nom = [...form.querySelectorAll('label.cp-champ')].find((l) => l.querySelector('.cp-champ-mot')?.textContent === 'Nom')?.querySelector('input') as HTMLInputElement;
    await saisir(nom, 'Martin');
    await saisir(form.querySelectorAll('.cp-saisie--valeur')[0] as HTMLInputElement, '06 12 34 56 78');
    // Première carte client : un téléphone ET un e-mail (Arno, 18/10/2026).
    await saisir(form.querySelectorAll('.cp-saisie--valeur')[1] as HTMLInputElement, 'martin@exemple.test');
    await act(async () => { (form.querySelector('button[type="submit"]') as HTMLButtonElement).click(); });
    await act(async () => { bouton('Non').click(); });
    await saisir(container.querySelector('[data-mandat-transaction] input') as HTMLInputElement, 'MT 2026-041');
  };

  it('le formulaire s’ouvre dessous, sans bloc « Propriétaire(s) », numéroté depuis « Le bien » ; un seul enregistrement crée les fiches puis le bien', async () => {
    await act(async () => { root.render(createElement(CreationProprietaires)); });
    await carteClient();
    expect(container.querySelector('[data-formulaire-bien]')).toBeNull();
    await act(async () => { (container.querySelector('[data-continuer]') as HTMLButtonElement).click(); });
    expect(posts).toEqual([]);
    const f = container.querySelector('[data-formulaire-bien]') as HTMLElement;
    expect(f).not.toBeNull();
    expect(f.textContent).not.toContain('Chercher un propriétaire');
    expect([...f.querySelectorAll('.loc-section > h3')].map((h) => h.textContent?.replace('*', '').trim()))
      .toEqual(['Le bien de ce nouveau propriétaire', '1Le bien', '2Adresse et situation', '3Copropriété', '4Annexes', '5Caractéristiques complémentaires', '6Commentaires']);
    expect(f.querySelector('[data-rappel-proprietaires]')?.textContent).toContain('MARTIN');
    expect(f.querySelector('[data-rappel-proprietaires] input')).toBeNull();
    await remplirMinimum();
    await soumettre();
    expect(posts.map((p) => p.action)).toEqual(['creer-proprietaires', 'creer-bien']);
    expect(posts[0]).toMatchObject({ enGestion: false, numeroMandatTransaction: 'MT 2026-041', numeroMandat: '' });
    expect(posts[1]).toMatchObject({ proprietaireIds: [41, 42] });
    expect(window.location.href).toBe('/admin/location/bien/9');
  });

  it('si le bien est refusé, les fiches restent créées, le message le dit, et le nouvel essai ne les recrée pas', async () => {
    await act(async () => { root.render(createElement(CreationProprietaires)); });
    await carteClient();
    await act(async () => { (container.querySelector('[data-continuer]') as HTMLButtonElement).click(); });
    await remplirMinimum();
    bienRefuse = true;
    await soumettre();
    expect(container.textContent).toContain('Les fiches des propriétaires sont créées, mais le bien n’est pas encore enregistré : Ce syndic n’est pas (ou plus) un syndic connu de la Gestion.');
    bienRefuse = false;
    await soumettre();
    expect(posts.map((p) => p.action)).toEqual(['creer-proprietaires', 'creer-bien', 'creer-bien']);
    expect(posts[2]).toMatchObject({ proprietaireIds: [41, 42] });
  });
});
