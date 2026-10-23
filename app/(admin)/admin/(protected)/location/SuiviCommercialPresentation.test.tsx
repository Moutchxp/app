// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { BlocSuiviCommercial, SUIVI_VIDE, type ParametresSuivi, type SaisieSuivi } from './SuiviCommercial';

/**
 * 🔴 Arno (24/10/2026) — « Nouveau locataire », bloc 4 « Suivi commercial » : présentation homogène et ordre des lignes, cases
 * EXCLUSIVES, pré-remplissage selon la situation du bien, une seule prime par bien, origine « Personnalisé », annuaire des apporteurs
 * en modale (le MÊME composant que la roue). Le vrai bloc, routes simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;

const APPORTEUR = { id: 3, nom: 'Kin Immo', type: 'agence', archive: false, baremes: [{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0 }],
  collegues: [{ depuis: '2026-01-01', collegueId: 5, collegueLibelle: 'Jean-Baptiste PONS' }] };
const LU = (plus: Partial<ParametresSuivi> = {}): ParametresSuivi => ({
  disponible: true, moi: 5, negociateurs: [{ id: 5, libelle: 'Jean-Baptiste PONS' }], apporteurs: [APPORTEUR as never],
  collegues: [{ id: 5, libelle: 'Jean-Baptiste PONS' }], regles: [{ depuis: '2026-01-01', tauxNegociateur: 0.1, primeLogement: 150, primeParking: 50 }],
  annuaire: true, personnalisable: true, ...plus,
});
let container: HTMLDivElement;
let root: Root;
let proposition: Record<string, unknown>;
let rafraichi: number;
let dernier: SaisieSuivi;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  rafraichi = 0;
  proposition = { avecGestion: true, categoriePrime: 'logement', origineProprietaire: null, origineLocataire: null, enGestionAvant: false, cas: 'nouveau_mandat', primeDejaVersee: null };
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = decodeURIComponent(String(url));
    if (u.includes('vue=proposition')) return ok(proposition);
    if (u.includes('vue=totaux-apporteurs')) return ok({});
    if (u.includes('/suivi')) return ok(LU());
    return ok([]);
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); document.body.innerHTML = ''; vi.restoreAllMocks(); });

function Banc({ lu, lotId }: { lu: ParametresSuivi; lotId: number | null }) {
  const [v, setV] = useState<SaisieSuivi>({ ...SUIVI_VIDE(), dateSignature: '2026-10-24' });
  dernier = v;
  return createElement(BlocSuiviCommercial, {
    valeur: v, onChange: setV, parametres: { lu, erreur: null, rafraichir: () => { rafraichi += 1; } }, lotId, locataireIds: [],
    ttcProprietaire: '', ttcLocataire: '', onTtcProprietaire: () => {}, onTtcLocataire: () => {}, manque: null,
  });
}
const calmer = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
const monter = async (lotId: number | null = 7, lu = LU()) => { await act(async () => { root.render(createElement(Banc, { lu, lotId })); }); await calmer(); };
const q = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T | null;
const coche = (s: string) => (q<HTMLInputElement>(s))!.checked;
const clic = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); await calmer(); };
const choisir = async (s: string, v: string) => {
  const el = q<HTMLSelectElement>(s)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await calmer();
};
const libelles = (n: number) => [...container.querySelectorAll(`[data-suivi-ligne="${n}"] > .loc-champ > .loc-suivi-libelle`)].map((l) => l.textContent?.replace(/\s+/g, ' ').trim());

describe('🔴 ordre des lignes et présentation homogène', () => {
  it('ligne 1 date · nature · négociateur ; ligne 2 les deux cases + les deux primes ; ligne 3 honoraires ; ligne 4 origine du contact propriétaire', async () => {
    await monter(null);
    expect(libelles(1)).toEqual(['Date de signature du bail *', 'Nature', 'Négociateur']);
    expect(libelles(2)).toEqual(['Portefeuille de gestion', 'Nouvelle gestion', 'Prime de gestion', 'Prime de nouvelle gestion']);
    expect(libelles(3)).toEqual(['Honoraires propriétaire HT (€)', 'Honoraires locataire HT (€)']);
    expect(libelles(4)).toEqual(['Origine du contact propriétaire *']);
    const ordre = [...container.querySelectorAll('[data-suivi-ligne]')].map((l) => l.getAttribute('data-suivi-ligne'));
    expect(ordre).toEqual(['1', '2', '3', '4']);
    // Arno (24/10/2026, accord explicite) — le bloc « Origine client » est RETIRÉ du formulaire.
    expect(container.querySelector('fieldset')).toBeNull();
    expect(container.textContent).not.toContain('Origine client');
    expect(container.textContent).not.toContain('Déduit à l’enregistrement');
  });
  it('dès l’ouverture : les deux cases ont la présentation des cases (bordure grise), les deux primes sont visibles, inactives', async () => {
    await monter(null);
    expect(q('[data-avec-gestion]')!.closest('label')!.className).toBe('loc-suivi-case');
    expect(q('[data-mandat-gestion]')!.closest('label')!.className).toBe('loc-suivi-case');
    expect(q<HTMLSelectElement>('[data-prime-mode]')!.disabled).toBe(true);
    expect(q<HTMLSelectElement>('[data-prime-mode]')!.value).toBe('aucune');
    expect(q<HTMLSelectElement>('[data-categorie-prime]')!.disabled).toBe(true);
  });
});

describe('🔴 cases exclusives et pré-remplissage selon le bien', () => {
  it('première location d’un nouveau mandat : « Nouveau mandat » coché, prime 150 €, catégorie selon le bien', async () => {
    await monter();
    expect(coche('[data-mandat-gestion]')).toBe(true);
    expect(coche('[data-avec-gestion]')).toBe(false);
    expect(q<HTMLSelectElement>('[data-prime-mode]')!.value).toBe('regle');
    expect(q<HTMLSelectElement>('[data-prime-mode]')!.selectedOptions[0].textContent).toBe('150 €');
    expect(q<HTMLSelectElement>('[data-categorie-prime]')!.disabled).toBe(false);
    expect(q('[data-mandat-gestion]')!.closest('label')!.className).toBe('loc-suivi-case loc-suivi-case--cochee');
  });
  it('relocation : « Relocation » (portefeuille de gestion), aucune prime, origine « Relocation (portefeuille de gestion) »', async () => {
    proposition = { ...proposition, cas: 'relocation' };
    await monter();
    expect(coche('[data-avec-gestion]')).toBe(true);
    expect(coche('[data-mandat-gestion]')).toBe(false);
    expect(dernier.primeMode).toBe('aucune');
    expect(q<HTMLSelectElement>('[data-origine-contact]')!.value).toBe('relocation');
  });
  it('hors gestion : aucune case, aucune prime', async () => {
    proposition = { ...proposition, avecGestion: false, cas: 'hors_gestion' };
    await monter();
    expect(coche('[data-avec-gestion]')).toBe(false);
    expect(coche('[data-mandat-gestion]')).toBe(false);
    expect(dernier.primeMode).toBe('aucune');
    expect(q<HTMLSelectElement>('[data-origine-contact]')!.value).toBe('');
  });
  it('exclusives : cocher l’une décoche l’autre (et la prime suit)', async () => {
    await monter();
    await clic(q('[data-avec-gestion]'));
    expect(coche('[data-avec-gestion]')).toBe(true);
    expect(coche('[data-mandat-gestion]')).toBe(false);
    expect(dernier.primeMode).toBe('aucune');
    await clic(q('[data-mandat-gestion]'));
    expect(coche('[data-mandat-gestion]')).toBe(true);
    expect(coche('[data-avec-gestion]')).toBe(false);
    expect(dernier.primeMode).toBe('regle');
  });
  it('une seule prime par bien : « Nouveau mandat » désactivé, avec « Prime déjà versée le … (bail …) »', async () => {
    proposition = { ...proposition, cas: 'deja_prime', primeDejaVersee: { date: '2025-03-12', bail: 'DUPONT' } };
    await monter();
    expect(q<HTMLInputElement>('[data-mandat-gestion]')!.disabled).toBe(true);
    expect(coche('[data-mandat-gestion]')).toBe(false);
    expect(coche('[data-avec-gestion]')).toBe(true);
    expect(q('[data-prime-deja-versee]')?.textContent).toBe('Prime déjà versée le 12/03/2025 (bail DUPONT) : une seule prime de nouvelle gestion par bien.');
  });
});

describe('🔴 origine « Personnalisé »', () => {
  it('en fin de liste ; choisi, un texte obligatoire de 80 caractères au plus', async () => {
    await monter(null);
    const options = [...q<HTMLSelectElement>('[data-origine-contact]')!.options].map((o) => o.textContent);
    expect(options.at(-1)).toBe('Personnalisé');
    await choisir('[data-origine-contact]', 'personnalise');
    const champ = q<HTMLInputElement>('[data-origine-precision]')!;
    expect(champ.required).toBe(true);
    expect(champ.maxLength).toBe(80);
  });
  it('sans la migration 411 : pas proposé', async () => {
    await monter(null, LU({ personnalisable: undefined }));
    expect([...q<HTMLSelectElement>('[data-origine-contact]')!.options].map((o) => o.value)).not.toContain('personnalise');
  });
});

describe('🔴 l’annuaire des apporteurs en modale', () => {
  it('« Ouvrir l’annuaire » sur la ligne du libellé → la modale montre L’annuaire (le même composant) ; « Choisir cet apporteur » le pose et ferme', async () => {
    await monter(null);
    await choisir('[data-origine-contact]', 'apporteur');
    const bouton = q('[data-ouvrir-annuaire]')!;
    expect(bouton.closest('.loc-suivi-libelle')?.textContent).toContain('Apporteur d’affaires');
    await clic(bouton);
    await calmer();
    const modale = q('[data-modale-annuaire-apporteurs]')!;
    expect(modale).not.toBeNull();
    expect(modale.querySelector('[data-onglet-apporteurs]')).not.toBeNull();     // OngletApporteurs, celui de la roue
    expect(modale.querySelector('[data-ajout-apporteur]')).not.toBeNull();        // création comprise
    await clic(modale.querySelector('[data-choisir-apporteur="3"]'));
    expect(q('[data-modale-annuaire-apporteurs]')).toBeNull();
    expect(q<HTMLSelectElement>('[data-apporteur]')!.value).toBe('3');
    expect(dernier.origineContact).toBe('apporteur');
    expect(rafraichi).toBeGreaterThan(0);                                          // la liste du champ est relue
  });
  it('fermer la modale relit la liste du champ (un apporteur créé y est aussitôt)', async () => {
    await monter(null);
    await choisir('[data-origine-contact]', 'apporteur');
    await clic(q('[data-ouvrir-annuaire]'));
    await clic(q('[data-fermer-annuaire]'));
    expect(q('[data-modale-annuaire-apporteurs]')).toBeNull();
    expect(rafraichi).toBe(1);
  });
});

describe('🔴 Arno (24/10/2026, 00:34) — libellés, ligne Origine / Apporteur, trames grises, « Origine client » retiré', () => {
  it('libellés : « Portefeuille de gestion » / case « Relocation » ; « Nouvelle gestion » / case « Nouveau mandat de gestion signé (prime) »', async () => {
    await monter(null);
    expect(q('[data-avec-gestion]')!.closest('label')!.textContent).toBe('Relocation');
    expect(q('[data-mandat-gestion]')!.closest('label')!.textContent).toBe('Nouveau mandat de gestion signé (prime)');
  });
  it('ligne 4 : deux colonnes fixes ; l’origine en 1re, l’apporteur (bouton sur sa ligne de libellé) ou le texte « Personnalisé » en 2e', async () => {
    await monter(null);
    const ligne = q('[data-suivi-ligne="4"]')!;
    expect(ligne.className).toBe('loc-grille loc-suivi-ligne loc-suivi-ligne--deux');
    expect(ligne.children).toHaveLength(1);                                   // sans apporteur : l'origine seule, en demi-ligne
    await choisir('[data-origine-contact]', 'apporteur');
    const champs = [...ligne.children];
    expect(champs.map((c) => c.querySelector('.loc-suivi-libelle')?.firstChild?.textContent?.trim())).toEqual(['Origine du contact propriétaire', 'Apporteur d’affaires *']);
    const lib = champs[1].querySelector('.loc-suivi-libelle')!;
    expect(lib.querySelector('[data-ouvrir-annuaire]')).not.toBeNull();     // le bouton est DANS la ligne du libellé
    expect(champs[1].querySelector('select + small, select ~ small')).toBeNull();   // aucune aide tant qu'aucun apporteur n'est « à rattacher »
    await choisir('[data-origine-contact]', 'personnalise');
    expect([...ligne.children].map((c) => c.querySelector('.loc-suivi-libelle')?.textContent?.replace(/\s+/g, ' ').trim()))
      .toEqual(['Origine du contact propriétaire *', 'Origine personnalisée *']);
  });
  it('le style : deux colonnes (une au téléphone), libellés de même hauteur que le bouton, pas d’encre épaisse au repos, trames grises', () => {
    const css = readFileSync('app/(admin)/admin/(protected)/location/SuiviCommercial.tsx', 'utf8');
    // mesuré dans Chrome : `.loc-ample .loc-grille` (auto-fit, alignement par le bas) est plus spécifique — d'où le double sélecteur
    expect(css).toContain('.loc-suivi-ligne--deux,.loc-ample .loc-grille.loc-suivi-ligne--deux{grid-template-columns:repeat(2,minmax(0,1fr))}');
    expect(css).toContain('@media (max-width:640px){.loc-suivi-ligne--deux,.loc-ample .loc-grille.loc-suivi-ligne--deux{grid-template-columns:minmax(0,1fr)}}');
    expect(css).toContain('.loc-suivi-ligne,.loc-ample .loc-grille.loc-suivi-ligne{align-items:start}');
    expect(css).toContain(':where(.loc-suivi) select,:where(.loc-suivi) input:not([type=checkbox]){min-height:44px}');
    expect(css).toContain('.loc-suivi-libelle{display:flex;align-items:center;gap:8px;min-height:32px;line-height:1.3}');
    expect(css).toContain('.loc-suivi-annuaire{appearance:none;border:1px solid var(--color-svv-line-strong);border-radius:999px;background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:.8rem;font-weight:700;min-height:32px;');
    expect(css).toContain('.loc-ample .loc-suivi .loc-champ input:focus:not(:focus-visible),.loc-ample .loc-suivi .loc-champ select:focus:not(:focus-visible){border-color:var(--color-svv-line)}');
    expect(css).toContain('.loc-suivi-ligne{background:var(--color-svv-field);border-radius:16px;padding:12px 14px}');
    // la trame : le jeton « field », plus clair que le fond en sombre (globals.css)
    const g = readFileSync('app/globals.css', 'utf8');
    expect(g).toContain('--color-svv-field: #f3f4f6;');
    expect(g).toContain('--color-svv-field: #242e3c;');
    expect(g).toContain('--color-svv-bg: #10151c;');
  });
  it('l’origine client reste DÉDUITE à l’enregistrement, et lue (affichée, filtrable) par le Suivi', () => {
    const repo = readFileSync('app/lib/location/suivi/suiviRepo.ts', 'utf8');
    expect(repo).toContain('const origines = await deduireOrigines(q as typeof query, { bailId: id, lotId, proprietaireId, locataireIds: locs.rows.map((r) => num(r.id)), date: v.valeurs.dateSignature });');
    const tb = readFileSync('app/lib/location/suivi/tableauBordRepo.ts', 'utf8').replace(/\s+/g, ' ');
    expect(tb).toContain('coalesce(a.origine_proprietaire_saisie, a.origine_proprietaire_deduite) AS origine_proprietaire');
    expect(dernier === undefined || dernier.origineProprietaire === null).toBe(true);
  });
});
