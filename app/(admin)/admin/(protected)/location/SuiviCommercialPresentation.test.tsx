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
  rafraichi = 0; loyerBanc = undefined;
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

let loyerBanc: { principal: string; provisions: string } | undefined;
function Banc({ lu, lotId, depart }: { lu: ParametresSuivi; lotId: number | null; depart?: Partial<SaisieSuivi> }) {
  const [v, setV] = useState<SaisieSuivi>({ ...SUIVI_VIDE(), dateSignature: '2026-10-24', ...depart });
  dernier = v;
  return createElement(BlocSuiviCommercial, {
    valeur: v, onChange: setV, parametres: { lu, erreur: null, rafraichir: () => { rafraichi += 1; } }, lotId, locataireIds: [],
    ttcProprietaire: '', ttcLocataire: '', onTtcProprietaire: () => {}, onTtcLocataire: () => {}, manque: null, loyer: loyerBanc,
  });
}
const calmer = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
const monter = async (lotId: number | null = 7, lu = LU(), depart?: Partial<SaisieSuivi>) => { await act(async () => { root.render(createElement(Banc, { lu, lotId, depart })); }); await calmer(); };
const q = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T | null;
const coche = (s: string) => (q<HTMLInputElement>(s))!.checked;
const clic = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); await calmer(); };
// Arno (24/10/2026) — les menus du bloc sont la liste maison (ListeChoix) : on l'ouvre, on clique le choix ; sa valeur se lit sur `data-valeur`.
const choisir = async (s: string, v: string) => {
  await clic(q(s));
  await clic(q(s)!.closest('.lch')!.querySelector(`li[data-option="${v}"]`));
};
const valeur = (s: string) => q(s)!.getAttribute('data-valeur');
const inactif = (s: string) => q<HTMLButtonElement>(s)!.disabled;
const optionsDe = async (s: string) => {
  await clic(q(s));
  const lis = [...q(s)!.closest('.lch')!.querySelectorAll('li[role="option"]')];
  const r = lis.map((l) => ({ id: l.getAttribute('data-option'), texte: l.lastElementChild?.textContent ?? '', bloque: l.hasAttribute('data-bloque') }));
  await clic(q(s));
  return r;
};
const libelles = (n: number) => [...container.querySelectorAll(`[data-suivi-ligne="${n}"] > .loc-champ > .loc-suivi-libelle`)].map((l) => l.textContent?.replace(/\s+/g, ' ').trim());

describe('🔴 ordre des lignes et présentation homogène', () => {
  it('ligne 1 date · nature · négociateur ; ligne 2 les deux cases + les deux primes ; ligne 3 honoraires ; ligne 4 origine du contact propriétaire', async () => {
    await monter(null);
    expect(libelles(1)).toEqual(['Date de signature du bail *', 'Nature', 'Négociateur']);
    expect(libelles(2)).toEqual(['Portefeuille de gestion', 'Nouvelle gestion', 'Prime de gestion', 'Type de bien']);   // Arno (24/10/2026) : « Type de bien »
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
    expect(inactif('[data-prime-mode]')).toBe(true);
    expect(valeur('[data-prime-mode]')).toBe('aucune');
    expect(inactif('[data-categorie-prime]')).toBe(true);
  });
});

describe('🔴 cases exclusives et pré-remplissage selon le bien', () => {
  it('première location d’un nouveau mandat : « Nouveau mandat » coché, prime 150 €, catégorie selon le bien', async () => {
    await monter();
    expect(coche('[data-mandat-gestion]')).toBe(true);
    expect(coche('[data-avec-gestion]')).toBe(false);
    expect(valeur('[data-prime-mode]')).toBe('regle');
    expect(q('[data-prime-mode]')!.textContent).toBe('150 €');
    expect(inactif('[data-categorie-prime]')).toBe(false);
    expect(q('[data-mandat-gestion]')!.closest('label')!.className).toBe('loc-suivi-case loc-suivi-case--cochee');
  });
  it('relocation : « Relocation » (portefeuille de gestion), aucune prime, origine « Relocation (portefeuille de gestion) »', async () => {
    proposition = { ...proposition, cas: 'relocation' };
    await monter();
    expect(coche('[data-avec-gestion]')).toBe(true);
    expect(coche('[data-mandat-gestion]')).toBe(false);
    expect(dernier.primeMode).toBe('aucune');
    expect(valeur('[data-origine-contact]')).toBe('relocation');
  });
  it('hors gestion : aucune case, aucune prime', async () => {
    proposition = { ...proposition, avecGestion: false, cas: 'hors_gestion' };
    await monter();
    expect(coche('[data-avec-gestion]')).toBe(false);
    expect(coche('[data-mandat-gestion]')).toBe(false);
    expect(dernier.primeMode).toBe('aucune');
    expect(valeur('[data-origine-contact]')).toBe('');
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
    const options = (await optionsDe('[data-origine-contact]')).map((o) => o.texte);
    expect(options.at(-1)).toBe('Personnalisé');
    await choisir('[data-origine-contact]', 'personnalise');
    const champ = q<HTMLInputElement>('[data-origine-precision]')!;
    expect(champ.required).toBe(true);
    expect(champ.maxLength).toBe(80);
  });
  it('sans la migration 411 : pas proposé', async () => {
    await monter(null, LU({ personnalisable: undefined }));
    expect((await optionsDe('[data-origine-contact]')).map((o) => o.id)).not.toContain('personnalise');
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
    expect(valeur('[data-apporteur]')).toBe('3');
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
    expect(champs[1].querySelector('small')).toBeNull();   // aucune aide sous le champ
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

describe('🔴 Arno (24/10/2026, après e60149af) — date, aide « à rattacher », prime « Local », menus maison rouges', () => {
  it('la prime de nouvelle gestion : Logement · Local · Parking ; pré-remplie selon le bien (local → Local) ; le montant de la règle', async () => {
    proposition = { ...proposition, categoriePrime: 'local' };
    await monter(7, LU({ regles: [{ depuis: '2026-01-01', tauxNegociateur: 0.1, primeLogement: 150, primeParking: 50, primeLocal: 160 }] }));
    expect((await optionsDe('[data-categorie-prime]')).map((o) => o.texte)).toEqual(['Logement', 'Local', 'Parking']);
    expect(valeur('[data-categorie-prime]')).toBe('local');
    expect(q('[data-categorie-prime]')!.textContent).toBe('Local');
    expect(q('[data-prime-mode]')!.textContent).toBe('160 €');          // le montant « local » de la règle
    await choisir('[data-categorie-prime]', 'parking');
    expect(dernier.categoriePrime).toBe('parking');
    expect(q('[data-prime-mode]')!.textContent).toBe('50 €');
  });
  it('une règle sans montant local : le local vaut le logement (150 €)', async () => {
    proposition = { ...proposition, categoriePrime: 'local' };
    await monter();
    expect(q('[data-prime-mode]')!.textContent).toBe('150 €');
  });
  it('l’aide « Un apporteur “à rattacher” … » est retirée ; la mention « à rattacher » reste dans la liste, non choisissable', async () => {
    await monter(null, LU({ apporteurs: [APPORTEUR as never, { id: 4, nom: 'Leboncoin', type: 'partenaire', archive: false, baremes: [], collegues: [] } as never] }));
    await choisir('[data-origine-contact]', 'apporteur');
    expect(container.textContent).not.toContain('se rattache à un collègue dans l’annuaire avant d’être choisi');
    const opts = await optionsDe('[data-apporteur]');
    expect(opts.find((o) => o.id === '4')).toEqual({ id: '4', texte: 'Leboncoin (Partenaire externe) — à rattacher', bloque: true });
    expect(opts.at(-1)?.texte).toBe('+ Nouvel apporteur…');
    await choisir('[data-apporteur]', '4');
    expect(valeur('[data-apporteur]')).toBe('');                        // pas choisissable
    await choisir('[data-apporteur]', '+');
    expect(q('[data-nouvel-apporteur]')).not.toBeNull();
  });
  it('tous les menus du bloc sont la liste maison, VERTE (Arno, 24/10/2026, après le rouge) ; aucun menu natif', async () => {
    await monter();
    await choisir('[data-origine-contact]', 'apporteur');
    await choisir('[data-apporteur]', '+');
    expect(container.querySelector('select')).toBeNull();
    for (const s of ['[data-type-activite]', '[data-negociateur]', '[data-prime-mode]', '[data-categorie-prime]', '[data-origine-contact]', '[data-apporteur]', '[data-nouvel-apporteur-type]', '[data-nouvel-apporteur-collegue]']) {
      expect(q(s)?.getAttribute('role'), s).toBe('combobox');
      expect(q(s)!.closest('.lch')!.className, s).toBe('lch');                    // la teinte verte (par défaut)
    }
    await choisir('[data-type-activite]', 'avenant');
    expect(dernier.type).toBe('avenant');
    // Échap ferme la liste seule
    await clic(q('[data-type-activite]'));
    expect(q('[data-type-activite]')!.getAttribute('aria-expanded')).toBe('true');
    await act(async () => { q('[data-type-activite]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(q('[data-type-activite]')!.getAttribute('aria-expanded')).toBe('false');
  });
  it('la date de signature a l’allure de la liste maison (hauteur, bordure, rayon, police, marge ; icône à droite)', () => {
    const css = readFileSync('app/(admin)/admin/(protected)/location/SuiviCommercial.tsx', 'utf8');
    expect(css).toContain('.loc-ample .loc-suivi .lch-champ{min-height:58px;font-size:1.1rem;border:2px solid var(--color-svv-line);border-radius:16px;padding:0 16px}');
    expect(css).toContain('.loc-ample .loc-suivi .loc-champ input[type=date]{height:58px;min-height:58px;border:2px solid var(--color-svv-line);border-radius:16px;padding:0 16px;font-size:1.1rem;font-weight:400}');
    expect(css).toContain('.loc-suivi input[type=date]::-webkit-calendar-picker-indicator{position:absolute;top:50%;right:10px;transform:translateY(-50%);margin:0;padding:0;width:16px;height:16px;');
    expect(css).toContain('.loc-ample .loc-suivi input[type=date]::-webkit-calendar-picker-indicator{right:16px}');   // la marge du chevron
  });
});

describe('🔴 Arno (24/10/2026) — les listes de collègues : tous les comptes, administrateurs compris', () => {
  const COMPTES = [{ id: 2, libelle: 'Arnaud Jorel', actif: true }, { id: 9, libelle: 'Cédric Jullien', actif: true }, { id: 3, libelle: 'Ancien Compte', actif: false },
    { id: 5, libelle: 'Jean-Baptiste PONS', actif: true }];
  it('« Négociateur » et « Collègue » : l’administrateur proposé, le compte désactivé écarté', async () => {
    await monter(null, LU({ negociateurs: COMPTES, collegues: COMPTES }));
    expect((await optionsDe('[data-negociateur]')).map((o) => o.texte)).toEqual(['— aucun —', 'Arnaud Jorel', 'Cédric Jullien', 'Jean-Baptiste PONS']);
    await choisir('[data-origine-contact]', 'collegue');
    expect((await optionsDe('[data-collegue]')).map((o) => o.texte)).toEqual(['— choisir —', 'Arnaud Jorel', 'Cédric Jullien', 'Jean-Baptiste PONS']);
    await choisir('[data-collegue]', '9');
    expect(dernier.collegueId).toBe(9);
  });
  it('un compte désactivé DÉJÀ choisi reste affiché, marqué « désactivé »', async () => {
    await monter(null, LU({ negociateurs: COMPTES, collegues: COMPTES }), { negociateurId: 3 });
    expect(q('[data-negociateur]')!.textContent).toBe('Ancien Compte (désactivé)');
    expect((await optionsDe('[data-negociateur]')).find((o) => o.id === '3')?.texte).toBe('Ancien Compte (désactivé)');
  });
});

describe('🔴 Arno (24/10/2026, 413) — la commission de l’apporteur, en direct', () => {
  const AVEC_REGLE = (mode: 'one_shot' | 'recurrent', tauxGestion: number) => LU({ apporteurs: [{ ...APPORTEUR,
    baremes: [{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0, mode, tauxGestion }] } as never] });
  const saisirTexte = async (sel: string, v: string) => {
    const el = q<HTMLInputElement>(sel)!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
    await calmer();
  };
  const encart = () => q('[data-commission-apporteur-direct]');
  const texte = () => q('[data-commission-texte]')?.textContent?.replace(/\s+/g, ' ');
  const preparer = async (mode: 'one_shot' | 'recurrent', tauxGestion: number) => {
    proposition = { ...proposition, tauxGestionBien: 4.5 };
    loyerBanc = { principal: '900', provisions: '100' };
    await monter(7, AVEC_REGLE(mode, tauxGestion));
    await choisir('[data-origine-contact]', 'apporteur');
    await choisir('[data-apporteur]', '3');
    await saisirTexte('[data-hono-proprietaire-ht]', '600');
    await saisirTexte('[data-hono-locataire-ht]', '400');
  };
  it('pas d’encart sans apporteur', async () => {
    await monter();
    expect(encart()).toBeNull();
  });
  it('One shot : part location · part gestion (1re année) · prime apporteur — 1 000 × 12 × 4,5 % × 20 % = 108,00 €', async () => {
    await preparer('one_shot', 0.2);
    expect(encart()?.getAttribute('data-commission-apporteur-direct')).toBe('one_shot');
    expect(encart()?.className).toContain('loc-suivi-ligne');                       // la trame grise des lignes du bloc
    expect(texte()).toBe('Part location : 100,00 € · Part gestion (1re année) : 108,00 € · Prime apporteur : 208,00 €');
    // le détail du calcul en info-bulle (montants et taux utilisés)
    await clic(q('[data-commission-apporteur-direct] button'));
    const detail = q('[data-detail-calcul="commission-apporteur"]')?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(detail).toContain('Honoraires de gestion mensuels HT : (900,00 € + 100,00 €) × 4,5 % = 45,00 €');
    expect(detail).toContain('45,00 € × 12 × 20 % = 108,00 €');
    // à chaque frappe : un nouveau taux sur la gestion pour ce bail
    await saisirTexte('[data-apporteur-taux-gestion]', '10');
    expect(texte()).toBe('Part location : 100,00 € · Part gestion (1re année) : 54,00 € · Prime apporteur : 154,00 €');
    expect(dernier.apporteurTauxGestion).toBe('10');
  });
  it('Récurrent : part location (une fois) · part gestion par mois tant que le bien est en gestion — 4,50 €/mois', async () => {
    await preparer('recurrent', 0.1);
    expect(valeur('[data-apporteur-mode]')).toBe('recurrent');                     // proposé par la règle
    expect(texte()).toBe('Part location (une fois) : 100,00 € · Part gestion : 4,50 € / mois tant que le bien est en gestion');
    await choisir('[data-apporteur-mode]', 'one_shot');                              // modifiable pour ce bail
    expect(dernier.apporteurMode).toBe('one_shot');
    expect(texte()).toBe('Part location : 100,00 € · Part gestion (1re année) : 54,00 € · Prime apporteur : 154,00 €');
  });
  it('loyer ou taux de gestion manquant : part gestion 0, et l’écran le dit', async () => {
    await preparer('one_shot', 0.2);
    act(() => { root.unmount(); }); root = createRoot(container);
    loyerBanc = { principal: '', provisions: '' };
    await monter(7, AVEC_REGLE('one_shot', 0.2));
    await choisir('[data-origine-contact]', 'apporteur');
    await choisir('[data-apporteur]', '3');
    expect(q('[data-commission-manque]')?.textContent).toBe('Part gestion : 0 € — loyer ou taux de gestion manquant.');
  });
});

describe('🔴 Arno (24/10/2026) — les listes de la page en VERT, contour compris ; « Type de bien »', () => {
  it('le contour du champ ouvert est vert sur cette page (jetons du thème, clair et sombre) ; aucun rouge dans les listes', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/SuiviCommercial.tsx', 'utf8');
    expect(src).toContain('.loc-suivi .lch-champ:focus-visible,.loc-suivi .lch-champ[aria-expanded="true"]{outline-color:var(--color-svv-green-ink)}');
    expect(src).not.toContain('teinte="rouge"');
  });
  it('sans lots fournis par l’hôte (typeBien absent) : toutes les valeurs', async () => {
    await monter(7);                                    // première location d'un nouveau mandat : « Nouveau mandat » coché d'office
    expect((await optionsDe('[data-categorie-prime]')).map((o) => o.id)).toEqual(['logement', 'local', 'parking']);
  });
});
