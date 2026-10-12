// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { FicheSyndic } from './FicheSyndic';
import { BandeauSyndicConnuDuBien, type SyndicConnuVu } from './PropositionsSyndic';

/**
 * ══ 🔴🔴 LOT SYNDIC-ANTI-DOUBLON-ET-PROPOSITION-PAR-ADRESSE — LES TROIS PARTIES À L'ÉCRAN ════════════════════════════
 * 🔒 Données de banc (`fetch` simulé, cabinets fictifs) : rien n'est lu ni écrit en base.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ANNUAIRE = [{ id: 4, nom: 'Cabinet FONCIA', adresse: '12 bis av. des Champs-Élysées', codePostal: '75008', ville: 'Paris',
  emails: ['contact@foncia.invalid'], telephones: ['0142000001'] }];
const CONNU: SyndicConnuVu = { syndic: { id: 2, nom: '_BANC Syndic', ville: 'Asnieres' }, copro: { cle: '25 rue edith cavell', libelle: '25 rue Edith Cavell' },
  via: ['copropriete', 'bien'], biens: [{ id: 176, numero: '219', adresse: '25 rue Edith Cavell' }] };
const AUTRE: SyndicConnuVu = { syndic: { id: 3, nom: '_BANC Autre', ville: 'Paris' }, copro: { cle: '27 rue edith cavell', libelle: '27 rue Edith Cavell' },
  via: ['parcelle'], biens: [] };

let appels: Array<{ url: string; methode: string; corps: Record<string, unknown> | null }> = [];
let connus: SyndicConnuVu[] = [];
let proposition: unknown = null;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  appels = []; connus = []; proposition = null;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const methode = init?.method ?? 'GET';
    const corps = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
    appels.push({ url, methode, corps });
    const rep = (j: unknown, ok = true) => ({ ok, json: async () => j });
    if (url.startsWith('/api/admin/gestion/syndics/immeubles')) return rep({ etat: 'ok', disponible: true, immeubles: [] });
    if (url.startsWith('/api/admin/gestion/syndics/connus')) return rep({ etat: 'ok', syndics: connus });
    if (url.startsWith('/api/admin/gestion/syndics/comparables')) return rep({ etat: 'ok', syndics: ANNUAIRE });
    if (/\/syndics\/\d+\/rattacher-bien$/.test(url)) return rep({ ok: true, id: 4 });
    if (url === '/api/admin/gestion/syndics' && methode === 'POST') {
      return Array.isArray(corps?.doublonsSyndicIgnores) ? rep({ ok: true, id: 13 })
        : rep({ erreur: 'Ce syndic existe peut-être déjà.', doublonsSyndic: [] }, false);
    }
    if (url.startsWith('/api/admin/gestion/coproprietes/contacts')) return rep({ etat: 'ok', contacts: [] });
    if (url.startsWith('/api/admin/gestion/biens/500/syndic-connu')) {
      if (methode === 'POST') { proposition = null; return rep({ ok: true }); }
      return rep({ etat: 'ok', proposition });
    }
    if (url.startsWith('/api/admin/gestion/syndics')) return rep({ etat: 'ok', disponible: true, syndics: [], communes: [], adresses: [] });
    return rep({});
  }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async (): Promise<void> => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
const attendre = async (ms: number): Promise<void> => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); await calmer(); };
const bouton = (texte: string): HTMLButtonElement => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === texte);
  if (!b) throw new Error(`bouton introuvable : ${texte}`);
  return b as HTMLButtonElement;
};
const cliquer = async (texte: string): Promise<void> => { await act(async () => { bouton(texte).click(); }); await calmer(); };
const taper = async (el: HTMLInputElement, v: string): Promise<void> => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => { setter?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await calmer();
};
const champ = (libelle: string): HTMLInputElement => {
  const l = [...document.querySelectorAll('label.fsy-champ')].find((x) => x.querySelector('span')?.textContent?.trim() === libelle);
  const i = l?.querySelector('input');
  if (!i) throw new Error(`champ introuvable : ${libelle}`);
  return i as HTMLInputElement;
};
const bandeau = (): string => document.querySelector('.psy-bandeau--doublon')?.textContent ?? '';
const IMMEUBLE = { libelle: '25 rue Edith Cavell', codePostal: '92400', commune: 'Courbevoie' };
let ferme = 0;
const monterFiche = async (): Promise<void> => {
  ferme = 0;
  await act(async () => {
    root.render(createElement(FicheSyndic, { syndicId: null, immeubleDepart: IMMEUBLE, lotDepart: 176, onFerme: () => { ferme += 1; } }));
  });
  await attendre(10);
};
const nouveau = async (): Promise<void> => { await monterFiche(); await cliquer('Créer un nouveau syndic'); await attendre(10); };

describe('🔴🔴 PARTIE 1 — le doublon possible, pendant la saisie, sur chacun des quatre critères', () => {
  it('① le nom (sans casse, accents, mots creux)', async () => {
    await nouveau();
    expect(bandeau()).toBe('');
    await taper(champ('Nom du cabinet *'), 'SARL Foncia');
    expect(bandeau()).toContain('Ce syndic existe peut-être déjà :');
    expect(bandeau()).toContain('Cabinet FONCIA / Paris — 12 bis av. des Champs-Élysées, 75008 Paris — même nom');
  });
  it('② l’adresse (« avenue » / « av. », bis, accents)', async () => {
    await nouveau();
    await taper(champ('Nom du cabinet *'), 'Autre cabinet');
    await taper(champ('Adresse (rue) *'), '12 bis avenue des Champs Elysees');
    await taper(champ('Code postal *'), '75008');
    await taper(champ('Ville *'), 'Paris');
    expect(bandeau()).toContain('— même adresse');
  });
  it('③ l’e-mail générique (sans casse)', async () => {
    await nouveau();
    const email = document.querySelector('input[aria-labelledby="fsy-email-generique"]') as HTMLInputElement;
    await taper(email, 'CONTACT@foncia.invalid');
    expect(bandeau()).toContain('même e-mail (contact@foncia.invalid)');
  });
  it('④ le téléphone standard (+33, espaces, points)', async () => {
    await nouveau();
    await taper(document.querySelector('input[aria-label="Téléphone standard"]') as HTMLInputElement, '+33 1.42.00.00.01');
    expect(bandeau()).toContain('même téléphone (0142000001)');
  });
  it('« Sélectionner ce syndic pour ce bien » : rattache le syndic EXISTANT à la copropriété du bien, ne crée rien, ferme', async () => {
    await nouveau();
    await taper(champ('Nom du cabinet *'), 'Foncia');
    expect(bouton('Voir la fiche')).toBeTruthy();
    await cliquer('Sélectionner ce syndic pour ce bien');
    await attendre(10);
    const r = appels.find((a) => a.methode === 'POST' && a.url.endsWith('/rattacher-bien'));
    expect(r?.url).toBe('/api/admin/gestion/syndics/4/rattacher-bien');
    expect(r?.corps).toEqual({ immeuble: IMMEUBLE });
    expect(appels.some((a) => a.url === '/api/admin/gestion/syndics' && a.methode === 'POST')).toBe(false);
    expect(ferme).toBe(1);
  });
  it('au « Valider » : le pied demande ; « Créer quand même » envoie les critères ignorés (que le serveur trace)', async () => {
    await nouveau();
    await taper(champ('Nom du cabinet *'), 'Foncia');
    await taper(champ('Adresse (rue) *'), '1 rue _BANC');
    await taper(champ('Code postal *'), '75001');
    await taper(champ('Ville *'), 'Paris');
    await cliquer('Valider');
    expect(document.querySelector('.psy-pied')?.textContent).toContain('Créer quand même ?');
    expect(appels.some((a) => a.url === '/api/admin/gestion/syndics' && a.methode === 'POST')).toBe(false);
    await cliquer('Créer quand même');
    await attendre(10);
    const post = appels.find((a) => a.url === '/api/admin/gestion/syndics' && a.methode === 'POST');
    expect(post?.corps?.doublonsSyndicIgnores).toEqual([{ id: 4, criteres: ['nom'] }]);
    expect(ferme).toBe(1);
  });
});

describe('🔴🔴 PARTIE 2 — un syndic déjà connu pour cette adresse, AVANT le formulaire', () => {
  it('l’encadré d’abord ; « Le rattacher à ce bien » rattache (comme adresse de sa copropriété) et ferme', async () => {
    connus = [CONNU];
    await monterFiche();
    const e = document.querySelector('.psy-bandeau--connu')?.textContent ?? '';
    expect(e).toContain('Un syndic est déjà connu pour cette adresse :');
    expect(e).toContain('_BANC Syndic / Asnieres (rattaché au bien lot 219 — 25 rue Edith Cavell)');
    /* AVANT le formulaire : la recherche n'est pas encore là. */
    expect(document.querySelector('input[type="search"]')).toBeNull();
    expect(appels.find((a) => a.url.startsWith('/api/admin/gestion/syndics/connus'))?.url)
      .toBe('/api/admin/gestion/syndics/connus?libelle=25+rue+Edith+Cavell&cp=92400&commune=Courbevoie&lot=176');
    await cliquer('Le rattacher à ce bien');
    await attendre(10);
    const r = appels.find((a) => a.methode === 'POST' && a.url.endsWith('/rattacher-bien'));
    expect(r?.url).toBe('/api/admin/gestion/syndics/2/rattacher-bien');
    expect(r?.corps).toEqual({ immeuble: IMMEUBLE, coproCle: '25 rue edith cavell' });
    expect(ferme).toBe(1);
  });
  it('« Non, créer un autre syndic » : la recherche et la création existantes reviennent, inchangées', async () => {
    connus = [CONNU];
    await monterFiche();
    await cliquer('Non, créer un autre syndic');
    expect(document.querySelector('input[type="search"]')).not.toBeNull();
    expect(bouton('Créer un nouveau syndic')).toBeTruthy();
  });
  it('plusieurs syndics : tous listés, avec l’alerte de conflit', async () => {
    connus = [AUTRE, CONNU];
    await monterFiche();
    const e = document.querySelector('.psy-bandeau--connu')?.textContent ?? '';
    expect(e).toContain('Plusieurs syndics sont déjà connus pour cette adresse :');
    expect(e).toContain('⚠ Conflit possible : 2 syndics pour une même adresse — à vérifier.');
    expect(e).toContain('_BANC Autre / Paris (même parcelle cadastrale que 27 rue Edith Cavell)');
  });
});

describe('🔴🔴 PARTIE 3 — le bandeau de la fiche d’un bien', () => {
  const monterBandeau = async () => {
    await act(async () => { root.render(createElement(BandeauSyndicConnuDuBien, { lotId: 500 })); });
    await attendre(10);
  };
  it('rien à proposer : rien d’affiché', async () => {
    await monterBandeau();
    expect(container.textContent).toBe('');
  });
  it('« Rattacher » : le syndic connu reçoit l’immeuble du bien, comme adresse de sa copropriété', async () => {
    proposition = { lot: { immeuble: '25, r. Edith-Cavell', codePostal: '92400', commune: 'COURBEVOIE' }, syndics: [CONNU] };
    await monterBandeau();
    expect(container.textContent).toContain('Syndic connu pour cette adresse : _BANC Syndic / Asnieres');
    await cliquer('Rattacher');
    const r = appels.find((a) => a.methode === 'POST' && a.url.endsWith('/rattacher-bien'));
    expect(r?.corps).toEqual({ immeuble: { libelle: '25, r. Edith-Cavell', codePostal: '92400', commune: 'COURBEVOIE' }, coproCle: '25 rue edith cavell' });
  });
  it('« Ignorer » : mémorisé pour ce bien (le serveur ne le repropose plus), le bandeau disparaît', async () => {
    proposition = { lot: { immeuble: '25, r. Edith-Cavell', codePostal: '92400', commune: 'COURBEVOIE' }, syndics: [CONNU] };
    await monterBandeau();
    await cliquer('Ignorer');
    await attendre(10);
    expect(appels.find((a) => a.methode === 'POST')?.corps).toEqual({ syndicId: 2 });
    expect(container.querySelector('.psy-bandeau')).toBeNull();
  });
});

describe('🔒 ce lot complète l’existant, il ne retire rien', () => {
  const G = 'app/(admin)/admin/(protected)/gestion/';
  it('la fiche du bien porte le bandeau, sous le bouton du syndic et la pastille de conflit, toujours là', () => {
    const a = readFileSync(`${G}Annuaire.tsx`, 'utf8');
    expect(a).toContain('<PastilleConflitParcelle immeuble={f.immeuble} />\n      <BoutonSyndic immeuble={f.immeuble} dansLaFiche lotId={f.id} />');
    expect(a).toContain('<BandeauSyndicConnuDuBien lotId={f.id} />');
  });
  it('la fenêtre garde sa recherche, son « Rattacher cet immeuble à ce syndic », ses étapes de parcelle et de coordonnées', () => {
    const f = readFileSync(`${G}FicheSyndic.tsx`, 'utf8');
    for (const t of ['Rattacher cet immeuble à ce syndic', 'Créer un nouveau syndic', 'Continuer avec un autre syndic',
      'Enregistrer quand même', 'Valider quand même']) expect(f, t).toContain(t);
  });
});
