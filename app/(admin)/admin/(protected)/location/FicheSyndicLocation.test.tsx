// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/** 🔴🔴 Arno (28/11/2026, 12h17) — la fiche d'un syndic dans la Location. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ouvertes = vi.hoisted(() => ({ brouillons: [] as { a: string[]; objet: string }[] }));
vi.mock('../gestion/FenetresRedaction', () => ({
  useFenetresRedaction: () => ({
    fenetres: [], brouillons: new Map(), fermetures: new Map(),
    ouvrirFenetre: (_cle: string, b: { a: string[]; objet: string }) => { ouvertes.brouillons.push(b); return null; },
    majBrouillon: vi.fn(), fermerLa: vi.fn(), demanderFermeture: vi.fn(), changerLEtat: vi.fn(),
  }),
  FenetresRedaction: () => null,
}));
import { FicheSyndicLocationVue } from './EcransLocation';

const CONTEXTE = { schemaPret: true, peutEnvoyer: true, jetonPresent: true, signature: '— Gestion', signatureHtml: '', nomExpediteur: 'CRITERIMMO',
  adresseGestion: 'gestion@criterimmo.fr', delaiAnnulationS: 10, piecesDisponibles: false, htmlDisponible: false, classementDisponible: false,
  interneDisponible: false, corbeilleBrouillon: false };
const LOT = (id: number, adresse: string, numero = String(id)) => ({ id, numero, adresse, commune: 'COURBEVOIE', statut: 'en_gestion' as const });
let syndic: Record<string, unknown>;
const BASE = { id: 4, nom: 'CABINET _TEST', adresse: null, codePostal: null, ville: null, telephone: null, telephone2: null, email: 'syndic@exemple.test', note: null,
  contacts: [], coproprietes: [{ id: 157, cle: '43 avenue marceau', libelle: '43 Avenue Marceau', codePostal: '92400', commune: 'COURBEVOIE', debut: '2020-01-01',
    lots: [LOT(1, '43 Avenue Marceau'), LOT(2, '43 avenue Marceau'), LOT(3, '43 avenue Marceau'), LOT(4, '80 rue de Normandie'), LOT(5, '80 rue de Normandie')] }] };

const reponse = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
let container: HTMLDivElement; let root: Root; let droit = true;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  ouvertes.brouillons.length = 0; syndic = BASE; droit = true;
  global.fetch = vi.fn(async (entree: RequestInfo | URL) => {
    const url = String(entree);
    if (url.startsWith('/api/admin/gestion/redaction')) return reponse({ ...CONTEXTE, peutEnvoyer: droit });
    if (url.includes('syndic=4')) return reponse({ etat: 'ok', data: syndic });
    return reponse({ etat: 'inconnu' });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const calmer = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); }); };
const rendre = async () => { await act(async () => { root.render(createElement(FicheSyndicLocationVue, { id: 4 })); }); await calmer(); };

describe('🔴🔴 points 3 et 4 — « Copropriétés suivies » : un encadré par copropriété, ses adresses jamais répétées, « N lots », le total', () => {
  const RESUME = { detail: { total: 4, parType: [{ type: 'logement', n: 3 }, { type: 'parking', n: 1 }] }, copros: [{ id: 157, cle: '43 avenue marceau', nom: 'Résidence Marceau',
    adresses: [{ libelle: '43 Avenue Marceau', principale: true, biens: 2, teteIds: [1, 2] }, { libelle: '80 rue de Normandie', principale: false, biens: 2, teteIds: [4, 5] }],
    detail: { total: 4, parType: [{ type: 'logement', n: 3 }, { type: 'parking', n: 1 }] } }] };
  it('le compteur, puis l’encadré : nom, adresses (une fois chacune) avec « N lots », total ; chaque bien garde son lien', async () => {
    syndic = { ...BASE, resumeCopros: RESUME };
    await rendre();
    expect(container.querySelector('[data-copros-suivies] h3')?.textContent).toBe('Copropriétés suivies : 1 · 4 lots en gestion dont 3 logements et 1 parking');
    const e = container.querySelector('[data-copro="43 avenue marceau"]')!;
    expect(e.querySelector('[data-copro-nom]')?.textContent).toBe('Résidence Marceau');
    expect([...e.querySelectorAll('[data-adresse-copro]')].map((x) => [x.getAttribute('data-adresse-copro'), x.querySelector('[data-lots-adresse]')?.textContent]))
      .toEqual([['43 Avenue Marceau', '2 lots'], ['80 rue de Normandie', '2 lots']]);
    expect(e.querySelector('[data-copro-total]')?.textContent).toBe('Total : 4 lots en gestion dont 3 logements et 1 parking');
    expect([...e.querySelectorAll('[data-biens-copro] a')].map((a) => a.getAttribute('href'))).toEqual([1, 2, 3, 4, 5].map((i) => `/admin/location/bien/${i}`));
  });
  it('un clic sur l’encadré ouvre la fiche copropriété ; un clic sur le lien d’un bien ouvre le bien', async () => {
    syndic = { ...BASE, resumeCopros: RESUME };
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    await rendre();
    await act(async () => { (container.querySelector('[data-copro-nom]') as HTMLElement).click(); });
    expect(assign).toHaveBeenCalledWith('/admin/location/coproprietes?ouvrir=43%20avenue%20marceau');
    assign.mockClear();
    await act(async () => { const a = container.querySelector('[data-biens-copro] a') as HTMLAnchorElement; a.addEventListener('click', (ev) => ev.preventDefault()); a.click(); });
    expect(assign).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it('sans résumé (lecture des lots impossible) : les adresses de la copropriété, sans compte ; rien de cassé', async () => {
    await rendre();
    expect([...container.querySelectorAll('[data-adresse-copro]')].map((x) => x.getAttribute('data-adresse-copro'))).toEqual(['43 Avenue Marceau']);
    expect(container.querySelector('[data-lots-adresse]')).toBeNull();
    expect(container.querySelector('[data-copros-suivies] h3')?.textContent).toBe('Copropriétés suivies : 1');
  });
});

/* ══ 🔴🔴 Arno (28/11/2026, 12h17, point 2) — « le numéro de téléphone et le mail sur des lignes séparées, pas en enfilade […] dans le prolongement de chaque
   ligne un bouton copier ; un bouton "Écrire depuis gestion@" en face de chaque adresse mail ; pouvoir sélectionner plusieurs adresses mail » ══ */
describe('🔴🔴 point 2 — coordonnées : une ligne chacune, « Copier », cases et écriture groupée', () => {
  const AVEC_CONTACTS = { ...BASE, telephone: '0140000000', telephone2: '+33140000001', email: 'syndic@exemple.test',
    contacts: [
      { id: 1, civilite: 'Mme', prenom: 'Léa', nom: 'MARTIN', titre: 'Gestionnaire', tousImmeubles: false, immeubles: [], coordonnees: [
        { id: 9, sorte: 'telephone', libelle: null, valeur: '0611223344' }, { id: 10, sorte: 'telephone', libelle: null, valeur: '0144556677' },
        { id: 11, sorte: 'email', libelle: null, valeur: 'lea@exemple.test' }, { id: 12, sorte: 'email', libelle: null, valeur: 'lea.martin@exemple.test' }] },
      { id: 2, civilite: null, prenom: 'Paul', nom: 'DURAND', titre: null, tousImmeubles: false, immeubles: [], coordonnees: [
        { id: 13, sorte: 'email', libelle: null, valeur: 'paul@exemple.test' }] }] };
  it('une ligne par téléphone et par e-mail (plus d’enfilade « · »), chacune avec « Copier » ; les numéros par la règle commune', async () => {
    syndic = AVEC_CONTACTS;
    await rendre();
    expect([...container.querySelectorAll('[data-ligne-tel]')].map((x) => x.getAttribute('data-ligne-tel')))
      .toEqual(['01 40 00 00 00', '+33 1 40 00 00 01', '06 11 22 33 44', '01 44 55 66 77']);
    expect([...container.querySelectorAll('[data-ligne-mail]')].map((x) => x.getAttribute('data-ligne-mail')))
      .toEqual(['syndic@exemple.test', 'lea@exemple.test', 'lea.martin@exemple.test', 'paul@exemple.test']);
    for (const l of container.querySelectorAll('[data-ligne-tel], [data-ligne-mail]')) expect(l.querySelector('button.bcp')?.textContent).toBe('Copier');
    expect(container.querySelector('[data-ligne-tel="01 40 00 00 00"] a')?.getAttribute('href')).toBe('tel:+33140000000'); // le lien : les chiffres
    // « Écrire depuis gestion@ » en face de chaque adresse, et sa case
    expect([...container.querySelectorAll('[data-ecrire-syndic]')]).toHaveLength(4);
    expect([...container.querySelectorAll('[data-case-mail]')].map((x) => x.getAttribute('data-case-mail')))
      .toEqual(['syndic@exemple.test', 'lea@exemple.test', 'lea.martin@exemple.test', 'paul@exemple.test']);
  });
  it('rien coché : pas de bouton groupé ; trois cases cochées → « Écrire aux adresses sélectionnées (3) » ouvre UN mail, les trois en « À »', async () => {
    syndic = AVEC_CONTACTS;
    await rendre();
    expect(container.querySelector('[data-ecrire-selection]')).toBeNull();
    for (const e of ['lea@exemple.test', 'paul@exemple.test', 'syndic@exemple.test']) {
      await act(async () => { (container.querySelector(`[data-case-mail="${e}"]`) as HTMLInputElement).click(); });
    }
    const b = container.querySelector('[data-ecrire-selection]') as HTMLButtonElement;
    expect(b.textContent).toBe('Écrire aux adresses sélectionnées (3)');
    await act(async () => { b.click(); }); await calmer();
    expect(ouvertes.brouillons.map((x) => x.a)).toEqual([['lea@exemple.test', 'paul@exemple.test', 'syndic@exemple.test']]);
    expect(container.querySelector('[data-ecrire-selection]')).toBeNull(); // la sélection est vidée après l'ouverture
  });
  it('décocher retire l’adresse ; « Tout décocher » vide la sélection', async () => {
    syndic = AVEC_CONTACTS;
    await rendre();
    const caseDe = (e: string) => container.querySelector(`[data-case-mail="${e}"]`) as HTMLInputElement;
    await act(async () => { caseDe('lea@exemple.test').click(); caseDe('paul@exemple.test').click(); });
    await act(async () => { caseDe('lea@exemple.test').click(); });
    expect(container.querySelector('[data-ecrire-selection]')?.textContent).toBe('Écrire aux adresses sélectionnées (1)');
    await act(async () => { (container.querySelector('.slm-vider') as HTMLButtonElement).click(); });
    expect(container.querySelector('[data-ecrire-selection]')).toBeNull();
  });
  it('sans le droit d’envoi : ni case, ni « Écrire » ; les lignes et « Copier » restent (rien n’est retiré)', async () => {
    syndic = AVEC_CONTACTS; droit = false;
    await rendre();
    expect(container.querySelectorAll('[data-case-mail], [data-ecrire-syndic], [data-ecrire-selection]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-ligne-mail] button.bcp')).toHaveLength(4);
  });
});

/* ══ 🔴🔴 Arno (28/11/2026, 12h54, point 1) — « réorganiser ce premier bloc […] l'adresse postale du syndic doit être présente » ══ */
describe('🔴🔴 12h54 point 1 — le bloc Coordonnées : deux colonnes, adresse complète, incomplète signalée', () => {
  it('l’ordre (adresse, téléphones, e-mails, note), l’adresse sur deux lignes, « Téléphones » au pluriel ; les deux colonnes à l’ordinateur, empilé au téléphone', async () => {
    syndic = { ...BASE, adresse: '8 Rue Denfert Rochereau', codePostal: '92600', ville: 'Asnieres Sur Seine', telephone: '0140000000', telephone2: '0140000001', note: 'Joignable le matin.' };
    await rendre();
    const zones = [...container.querySelectorAll('[data-coordonnees-syndic] [data-zone]')];
    expect(zones.map((z) => [z.getAttribute('data-zone'), z.querySelector('dt')?.textContent])).toEqual([
      ['adresse', 'Adresse'], ['telephones', 'Téléphones'], ['emails', 'E-mail'], ['note', 'Note']]);
    expect([...zones[0].querySelectorAll('.loc-coord-adresse-ligne')].map((x) => x.textContent)).toEqual(['8 Rue Denfert Rochereau', '92600 Asnieres Sur Seine']);
    expect(container.querySelector('[data-adresse-incomplete]')).toBeNull();
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n').replace(/\s+/g, ' ');
    expect(css).toContain('.loc-coord-bloc{margin:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);');
    expect(css).toContain('.loc-coord-zone--note{grid-column:1;grid-row:2}');
    expect(css).toContain('.loc-coord-zone--tels{grid-column:2;grid-row:1}');
    expect(css).toContain('@media (max-width:760px){.loc-coord-bloc{grid-template-columns:minmax(0,1fr)}');
  });
  it('rue absente (syndic 56) : « 92800 Puteaux », puis « Adresse incomplète — à compléter » avec le lien vers la modification du syndic', async () => {
    syndic = { ...BASE, id: 4, adresse: null, codePostal: '92800', ville: 'Puteaux' };
    await rendre();
    expect([...container.querySelectorAll('.loc-coord-adresse-ligne')].map((x) => x.textContent)).toEqual(['92800 Puteaux']);
    const i = container.querySelector('[data-adresse-incomplete]')!;
    expect(i.textContent).toBe('Adresse incomplète — à compléter');
    expect(i.querySelector('a')?.getAttribute('href')).toBe('/admin/gestion?ecran=syndics&syndic=4');
  });
});
