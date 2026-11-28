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
// la fiche copropriété (fenêtre) : un simple double, « Fermer » appelle onFerme
vi.mock('../gestion/FicheCopropriete', async () => {
  const { createElement } = await import('react');
  return { FicheCopropriete: ({ immeuble, onFerme }: { immeuble: string; onFerme: () => void }) =>
    createElement('div', { 'data-fiche-copro-double': immeuble }, createElement('button', { type: 'button', onClick: onFerme, 'data-fermer-double': '' }, 'Fermer')) };
});
// 🔴 (Arno, 28/11/2026, 14h00, points 2 à 4) LA fenêtre de la fiche syndic de la Gestion : un double qui dit ce qu'on lui a demandé
vi.mock('../gestion/FicheSyndic', async () => {
  const { createElement } = await import('react');
  return { FicheSyndic: ({ syndicId, departContacts, epuree, onFerme }: { syndicId: number; departContacts?: boolean; epuree?: boolean; onFerme: () => void }) =>
    createElement('div', { 'data-fiche-syndic-double': String(syndicId), 'data-depart-contacts': String(departContacts === true), 'data-epuree': String(epuree === true) },
      createElement('button', { type: 'button', onClick: onFerme, 'data-fermer-fiche-syndic': '' }, 'Fermer')) };
});
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
const rendre = async (peutModifier?: boolean) => { await act(async () => { root.render(createElement(FicheSyndicLocationVue, { id: 4, ...(peutModifier !== undefined ? { peutModifier } : {}) })); }); await calmer(); };

describe('🔴🔴 points 3 et 4 — « Copropriétés suivies » : un encadré par copropriété, ses adresses jamais répétées, « N lots », le total', () => {
  const RESUME = { detail: { total: 4, parType: [{ type: 'logement', n: 3 }, { type: 'parking', n: 1 }] }, copros: [{ id: 157, cle: '43 avenue marceau', nom: 'Résidence Marceau',
    adresses: [{ libelle: '43 Avenue Marceau', principale: true, biens: 2, teteIds: [1, 2] }, { libelle: '80 rue de Normandie', principale: false, biens: 2, teteIds: [4, 5] }],
    detail: { total: 4, parType: [{ type: 'logement', n: 3 }, { type: 'parking', n: 1 }] } }] };
  it('le compteur, puis l’encadré : nom, adresses (une fois chacune) avec « N lots », total ; chaque bien garde son lien', async () => {
    syndic = { ...BASE, resumeCopros: RESUME };
    await rendre();
    // 🔴 (Arno, 28/11/2026, 13h06) le titre à gauche, le décompte à droite, sans « · », dans la police de « N lots » (même classe)
    expect([...container.querySelector('[data-copros-suivies] h3')!.children].map((x) => x.textContent)).toEqual(['Copropriétés suivies : 1', '4 lots en gestion dont 3 logements et 1 parking']);
    expect(container.querySelector('[data-copros-compte]')?.className).toBe('loc-copros-compte loc-copro-n');
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n').replace(/\s+/g, ' ');
    // le bord droit : la marge intérieure des encadrés (bordure 1 px + 14 px) ; au téléphone, sous le titre, à droite, coupé entre les mots
    expect(css).toContain('.loc-copros-tete{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:2px 12px;padding-right:15px}');
    expect(css).toContain('.loc-copros-tete > .loc-copros-compte{margin-left:auto;text-align:right;white-space:normal;min-width:0;max-width:100%}');
    expect(css).toContain('.loc-copro{display:flex;flex-direction:column;gap:6px;padding:12px 14px;border:1px solid');
    const e = container.querySelector('[data-copro="43 avenue marceau"]')!;
    expect(e.querySelector('[data-copro-nom]')?.textContent).toBe('Résidence Marceau');
    expect([...e.querySelectorAll('[data-adresse-copro]')].map((x) => [x.getAttribute('data-adresse-copro'), x.querySelector('[data-lots-adresse]')?.textContent]))
      .toEqual([['43 Avenue Marceau', '2 lots'], ['80 rue de Normandie', '2 lots']]);
    expect(e.querySelector('[data-copro-total]')?.textContent).toBe('Total : 4 lots en gestion dont 3 logements et 1 parking'); // sans détail des biens : pas de flèche
    expect([...e.querySelectorAll('[data-biens-copro] a')].map((a) => a.getAttribute('href'))).toEqual([1, 2, 3, 4, 5].map((i) => `/admin/location/bien/${i}`));
  });
  it('🔴 13h18 point 3 — un clic sur l’encadré ouvre la fiche copropriété EN FENÊTRE, ici même ; « Fermer » rend la fiche syndic (relue), sans changer de page', async () => {
    syndic = { ...BASE, resumeCopros: RESUME };
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    await rendre();
    const lectures = () => (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([u]) => String(u).includes('syndic=4')).length;
    const avant = lectures();
    await act(async () => { (container.querySelector('[data-copro="43 avenue marceau"] [data-adresse-copro]') as HTMLElement).click(); });
    expect(container.querySelector('[data-fiche-copro-double]')?.getAttribute('data-fiche-copro-double')).toBe('43 Avenue Marceau');
    await act(async () => { (container.querySelector('[data-fermer-double]') as HTMLButtonElement).click(); }); await calmer();
    expect(container.querySelector('[data-fiche-copro-double]')).toBeNull();
    expect(container.querySelector('[data-copros-suivies]')).not.toBeNull(); // toujours la fiche syndic
    expect(assign).not.toHaveBeenCalled(); // aucune navigation : la page (et son défilement) n'a pas changé
    expect(lectures()).toBeGreaterThan(avant); // relue après la fenêtre (ce qui a été modifié s'y voit)
    // un clic sur le lien d'un bien ouvre le bien, pas la fiche copropriété
    await act(async () => { const a = container.querySelector('[data-biens-copro] a') as HTMLAnchorElement; a.addEventListener('click', (ev) => ev.preventDefault()); a.click(); });
    expect(container.querySelector('[data-fiche-copro-double]')).toBeNull();
    vi.unstubAllGlobals();
  });
  it('sans résumé (lecture des lots impossible) : les adresses de la copropriété, sans compte ; rien de cassé', async () => {
    await rendre();
    expect([...container.querySelectorAll('[data-adresse-copro]')].map((x) => x.getAttribute('data-adresse-copro'))).toEqual(['43 Avenue Marceau']);
    expect(container.querySelector('[data-lots-adresse]')).toBeNull();
    expect(container.querySelector('[data-copros-suivies] h3')?.textContent).toBe('Copropriétés suivies : 1');
    expect(container.querySelector('[data-copros-compte]')).toBeNull();
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
      ['adresse', 'Adresse'], ['telephones', 'Téléphone standard'], ['emails', 'E-mail contact'], ['note', 'Note']]); // 🔴 (Arno, 28/11/2026, 14h00)
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

/* ══ 🔴🔴 Arno (28/11/2026, 12h54, point 2) — « justifier à droite la case à cocher et le bouton "Écrire depuis gestion@" » ══ */
describe('🔴🔴 12h54 point 2 — les actions de chaque ligne, regroupées sur le bord droit', () => {
  it('valeur à gauche ; « Copier », la case, « Écrire » dans cet ordre, au bord droit ; un téléphone : « Copier » seul ; au téléphone, sous la valeur, à droite', async () => {
    syndic = { ...BASE, telephone: '0140000000', contacts: [{ id: 1, civilite: null, prenom: 'Léa', nom: 'MARTIN', titre: null, tousImmeubles: false, immeubles: [],
      coordonnees: [{ id: 9, sorte: 'telephone', libelle: null, valeur: '0611223344' }, { id: 10, sorte: 'email', libelle: null, valeur: 'lea@exemple.test' }] }] };
    await rendre();
    const mail = container.querySelector('[data-ligne-mail="lea@exemple.test"] .loc-coord-actions')!;
    expect([...mail.children].map((x) => (x.matches('.bcp') ? 'Copier' : x.matches('.slm-case') ? 'case' : x.textContent?.trim()))).toEqual(['Copier', 'case', 'Écrire depuis gestion@']);
    // 🔴 (13h18) un téléphone : « Copier » seul de visible, suivi de la place vide de la case et d'« Écrire »
    expect([...container.querySelector('[data-ligne-tel="06 11 22 33 44"] .loc-coord-actions')!.children].map((x) => (x.hasAttribute('data-place-vide') ? 'place vide' : x.textContent))).toEqual(['Copier', 'place vide']);
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n').replace(/\s+/g, ' ');
    expect(css).toContain('.loc-coord-lignes{list-style:none;margin:2px 0 0;padding:0;display:grid;grid-template-columns:minmax(0,1fr) auto;');
    expect(css).toContain('.loc-coord-actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;justify-self:end;');
    expect(css).toContain('@media (max-width:560px){.loc-coord-lignes{grid-template-columns:minmax(0,1fr)}.loc-coord-actions{margin-bottom:4px;justify-self:stretch}}');
    // le bouton groupé reste à sa place : entre les coordonnées et les contacts
    await act(async () => { (container.querySelector('[data-case-mail="lea@exemple.test"]') as HTMLInputElement).click(); });
    const b = container.querySelector('[data-ecrire-selection]')!.closest('.slm-barre')!;
    expect(b.previousElementSibling?.hasAttribute('data-coordonnees-syndic')).toBe(true);
  });
});

/* ══ 🔴🔴 Arno (28/11/2026, 13h18, point 1) — « ramener le bouton "Copier" du numéro de téléphone sur la même colonne » ══ */
describe('🔴🔴 13h18 point 1 — « Copier » des téléphones dans la colonne de celui des e-mails', () => {
  const S = { ...BASE, telephone: '0140000000', contacts: [{ id: 1, civilite: null, prenom: 'Léa', nom: 'MARTIN', titre: null, tousImmeubles: false, immeubles: [],
    coordonnees: [{ id: 9, sorte: 'telephone', libelle: null, valeur: '0611223344' }, { id: 10, sorte: 'email', libelle: null, valeur: 'lea@exemple.test' }] }] };
  it('avec le droit d’envoi : une ligne de téléphone porte « Copier » puis la place, vide et invisible, de la case et d’« Écrire » (même largeur que sur un e-mail)', async () => {
    syndic = S;
    await rendre();
    for (const t of ['01 40 00 00 00', '06 11 22 33 44']) {
      const a = container.querySelector(`[data-ligne-tel="${t}"] .loc-coord-actions`)!;
      expect(a.children[0].matches('.bcp')).toBe(true);
      const vide = a.querySelector('[data-place-vide]')!;
      expect([vide.getAttribute('aria-hidden'), vide.querySelector('.slm-case') !== null, vide.textContent]).toEqual(['true', true, 'Écrire depuis gestion@']);
      expect(vide.querySelectorAll('button, input, a')).toHaveLength(0); // rien à cliquer ni à lire
    }
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n').replace(/\s+/g, ' ');
    expect(css).toContain('.loc-place-vide{display:inline-flex;align-items:center;gap:4px 6px;visibility:hidden;pointer-events:none}');
  });
  it('sans le droit d’envoi (aucune case, aucun « Écrire » sur les e-mails) : aucune place réservée', async () => {
    syndic = S; droit = false;
    await rendre();
    expect(container.querySelectorAll('[data-place-vide]')).toHaveLength(0);
  });
});

/* ══ 🔴🔴 Arno (28/11/2026, 13h18, point 2) — « sous le total des lots gérés, ajouter les collaborateurs du syndic affectés à cette copropriété » ══ */
describe('🔴🔴 13h18 point 2 — les collaborateurs affectés, dans chaque encadré', () => {
  const RESUME = { detail: { total: 2, parType: [{ type: 'logement', n: 2 }] }, copros: [{ id: 157, cle: '43 avenue marceau', nom: null,
    adresses: [{ libelle: '43 Avenue Marceau', principale: true, biens: 2, teteIds: [1, 2] }], detail: { total: 2, parType: [{ type: 'logement', n: 2 }] } }] };
  const CONTACTS = [
    { id: 1, civilite: 'M.', prenom: 'Olivier', nom: 'FABRE', titre: 'Principal de copropriété', tousImmeubles: false, immeubles: ['43 avenue marceau'], coordonnees: [
      { id: 9, sorte: 'telephone', libelle: null, valeur: '0611223344' }, { id: 10, sorte: 'email', libelle: null, valeur: 'o.fabre@exemple.test' }] },
    { id: 2, civilite: 'Mme', prenom: 'Léa', nom: 'MARTIN', titre: null, tousImmeubles: false, immeubles: ['43 avenue marceau'], coordonnees: [] },
    { id: 3, civilite: null, prenom: 'Paul', nom: 'AUTRE', titre: 'Comptable', tousImmeubles: false, immeubles: ['1 rue ailleurs'], coordonnees: [] }];
  it('« Fonction : Civilité Prénom NOM », son téléphone par paires et son e-mail ; seulement les contacts affectés à CETTE copropriété', async () => {
    syndic = { ...BASE, contacts: CONTACTS, resumeCopros: RESUME };
    await rendre();
    const bloc = container.querySelector('[data-collaborateurs-copro="43 avenue marceau"]')!;
    expect([...bloc.querySelectorAll('[data-collaborateur]')].map((x) => [...x.children].map((y) => y.textContent)))
      .toEqual([['Principal de copropriété : M. Olivier FABRE', '06 11 22 33 44', 'o.fabre@exemple.test'], ['Mme Léa MARTIN']]);
    expect(bloc.querySelector('a[href^="tel:"]')?.getAttribute('href')).toBe('tel:+33611223344');
    // sous le total
    expect(bloc.previousElementSibling?.hasAttribute('data-copro-total')).toBe(true);
  });
  it('aucun contact affecté : « Aucun collaborateur du syndic affecté à cette copropriété »', async () => {
    syndic = { ...BASE, contacts: [CONTACTS[2]], resumeCopros: RESUME };
    await rendre();
    expect(container.querySelector('[data-aucun-collaborateur]')?.textContent).toBe('Aucun collaborateur du syndic affecté à cette copropriété');
  });
  it('un clic sur l’e-mail ouvre l’écriture (droit d’envoi), pas la fiche copropriété ; sur le téléphone non plus', async () => {
    syndic = { ...BASE, contacts: CONTACTS, resumeCopros: RESUME };
    await rendre();
    await act(async () => { (container.querySelector('[data-ecrire-collaborateur="o.fabre@exemple.test"]') as HTMLButtonElement).click(); }); await calmer();
    expect(ouvertes.brouillons.map((b) => b.a)).toEqual([['o.fabre@exemple.test']]);
    await act(async () => { const a = container.querySelector('[data-collaborateur="1"] a[href^="tel:"]') as HTMLAnchorElement; a.addEventListener('click', (e) => e.preventDefault()); a.click(); });
    expect(document.querySelector('[data-fiche-copro-double]')).toBeNull();
  });
});

/* ══ 🔴🔴 Arno (28/11/2026, 13h36) — le total à droite, calé sur « 1 lot » ; un lien qui déplie les biens en gestion : propriétaires | locataires | Historique ══ */
describe('🔴🔴 13h36 — le total à droite, et la liste des biens en gestion qu’il déplie', () => {
  const RESUME = { detail: { total: 3, parType: [{ type: 'logement', n: 3 }] }, copros: [{ id: 157, cle: '43 avenue marceau', nom: null,
    adresses: [{ libelle: '43 Avenue Marceau', principale: true, biens: 3, teteIds: [1, 2, 4] }], detail: { total: 3, parType: [{ type: 'logement', n: 3 }] },
    biens: [{ teteId: 1, lotIds: [1, 3] }, { teteId: 2, lotIds: [2] }, { teteId: 4, lotIds: [4] }] }],
    detailBiens: {
      1: { lotId: 1, lot: '12', batiment: 'B', etage: '3', proprietaires: [{ id: 70, nom: 'DURANT Stéphane' }, { id: 71, nom: 'DURANT Claire' }], locataires: [{ id: 80, nom: 'MARTIN Léa' }, { id: 81, nom: 'BERCIER Paul' }] },
      2: { lotId: 2, lot: null, batiment: null, etage: null, proprietaires: [{ id: 72, nom: 'SCI Les Tilleuls' }], locataires: [] },
      4: { lotId: 4, lot: null, batiment: null, etage: '1', proprietaires: [{ id: 73, nom: 'JOREL Arnaud' }], locataires: [{ id: 82, nom: 'ESSAI Paul' }] } } };
  it('le total : à droite, dans la police de « N lots » (même classe), replié par défaut ; un clic déplie et replie, sans ouvrir la fiche copropriété', async () => {
    syndic = { ...BASE, resumeCopros: RESUME };
    await rendre();
    const b = container.querySelector('[data-deplier-biens="157"]') as HTMLButtonElement;
    expect([b.className, b.getAttribute('aria-expanded'), b.textContent]).toEqual(['loc-copro-deplier loc-copro-n', 'false', '▸Total : 3 logements en gestion']);
    expect(container.querySelector('[data-biens-gestion]')).toBeNull();
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n').replace(/\s+/g, ' ');
    expect(css).toContain('.loc-copro-total{margin:2px 0 0;padding-top:6px;border-top:1px solid var(--color-svv-line);display:flex;justify-content:flex-end;text-align:right}');
    await act(async () => { b.click(); });
    expect(b.getAttribute('aria-expanded')).toBe('true');
    expect(b.textContent).toBe('▾Total : 3 logements en gestion');
    expect(container.querySelector('[data-fiche-copro-double]')).toBeNull(); // ce clic n'ouvre pas la fiche copropriété
    await act(async () => { b.click(); });
    expect(container.querySelector('[data-biens-gestion]')).toBeNull();
  });
  it('déplié : une ligne par bien en gestion — propriétaires « / », locataires « / » (colocataires) ou « Vacant », « Historique » ; repères du lot ; liens', async () => {
    syndic = { ...BASE, resumeCopros: RESUME };
    await rendre();
    await act(async () => { (container.querySelector('[data-deplier-biens="157"]') as HTMLButtonElement).click(); });
    const lignes = [...container.querySelectorAll('[data-bien-gestion]')];
    // 🔴 (13h50) le libellé « Propriétaires : » / « Locataires : » est en tête de chaque groupe (visible au téléphone seulement)
    const sansMot = (e: Element | null) => [...(e?.childNodes ?? [])].filter((n) => !(n instanceof Element && n.classList.contains('loc-copro-gestion-mot'))).map((n) => n.textContent).join('');
    expect(lignes.map((l) => [sansMot(l.querySelector('[data-noms-proprietaires]')), l.querySelector('.loc-copro-gestion-reperes')?.textContent ?? null, sansMot(l.querySelector('[data-noms-locataires]'))])).toEqual([
      ['DURANT Stéphane / DURANT Claire', 'lot 12 · bât. B · étage 3', 'MARTIN Léa / BERCIER Paul'],
      ['SCI Les Tilleuls', null, 'Vacant'],
      ['JOREL Arnaud', 'étage 1', 'ESSAI Paul']]);
    // les liens, écrits comme le texte : propriétaire → sa fiche ; locataire → sa fiche (bail et colocataires) ; « Historique » → l'historique de CE bien
    expect([...lignes[0].querySelectorAll('a.loc-lien-discret')].map((a) => a.getAttribute('href'))).toEqual([
      '/admin/location/proprietaire/70', '/admin/location/proprietaire/71', '/admin/location/locataire/80', '/admin/location/locataire/81']);
    const h = lignes[1].querySelector('[data-historique-bien]')!;
    expect([h.textContent, h.getAttribute('href'), h.className]).toEqual(['Historique', '/admin/gestion?ecran=annuaire&fiche=lot-2&bloc=vie', 'svv-btn svv-btn-primary gst-btn loc-copro-historique']);
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n').replace(/\s+/g, ' ');
    expect(css).toContain('.loc-lien-discret{color:inherit;text-decoration:none;cursor:pointer}');
    expect(css).toContain('.loc-copro-gestion{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;');
    expect(css).toContain('@media (max-width:560px){.loc-copro-gestion{grid-template-columns:minmax(0,1fr)}');
    // « Fiches des biens » reste
    expect(container.querySelector('[data-biens-copro]')).not.toBeNull();
  });
});

/* ══ 🔴 Arno (28/11/2026, 13h50) — « il faut une colonne intitulée Propriétaires et une colonne Locataires » ══ */
describe('🔴 13h50 — les intitulés des colonnes de la liste dépliée', () => {
  const RESUME = { detail: { total: 1, parType: [{ type: 'logement', n: 1 }] }, copros: [{ id: 157, cle: '43 avenue marceau', nom: null,
    adresses: [{ libelle: '43 Avenue Marceau', principale: true, biens: 1, teteIds: [1] }], detail: { total: 1, parType: [{ type: 'logement', n: 1 }] },
    biens: [{ teteId: 1, lotIds: [1] }] }],
    detailBiens: { 1: { lotId: 1, lot: null, batiment: null, etage: null, proprietaires: [{ id: 70, nom: 'DURANT Stéphane' }, { id: 71, nom: 'DURANT Claire' }], locataires: [] } } };
  it('une ligne d’intitulés au pluriel, en tête, sur la grille (au-dessus de la gauche et du milieu, rien au-dessus de « Historique ») ; au téléphone, un libellé devant chaque groupe', async () => {
    syndic = { ...BASE, resumeCopros: RESUME };
    await rendre();
    await act(async () => { (container.querySelector('[data-deplier-biens="157"]') as HTMLButtonElement).click(); });
    const liste = container.querySelector('[data-biens-gestion]')!;
    const tete = liste.firstElementChild!;
    expect(tete.hasAttribute('data-entete-biens')).toBe(true);
    expect([...tete.children].map((x) => [x.className, x.textContent])).toEqual([['svv-label', 'PROPRIÉTAIRES'], ['svv-label', 'LOCATAIRES'], ['', '']]);
    // deux propriétaires sur UNE ligne, séparés par « / »
    expect(liste.querySelector('[data-noms-proprietaires]')?.textContent).toBe('Propriétaires : DURANT Stéphane / DURANT Claire');
    expect(liste.querySelector('[data-noms-locataires]')?.textContent).toBe('Locataires : Vacant');
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n').replace(/\s+/g, ' ');
    expect(css).toContain('.loc-copro-gestion-mot{display:none}');
    expect(css).toContain('.loc-copro-gestion > li.loc-copro-gestion-entete{display:none} .loc-copro-gestion-mot{display:inline}}'); // au téléphone
  });
});

/* ══ 🔴 Arno (28/11/2026, 14h00, point 1) — les libellés ══ */
describe('🔴 14h00 point 1 — « Coordonnées du syndic », « Téléphone standard », « E-mail contact », « Contacts du syndic »', () => {
  it('les titres des deux blocs et les libellés du bloc des coordonnées', async () => {
    syndic = { ...BASE, telephone: '0140000000' };
    await rendre();
    expect(container.querySelector('[data-coordonnees-syndic] h3')?.textContent).toBe('Coordonnées du syndic');
    expect([...container.querySelectorAll('[data-coordonnees-syndic] dt')].map((x) => x.textContent)).toEqual(['Adresse', 'Téléphone standard', 'E-mail contact', 'Note']);
    expect([...container.querySelectorAll('h3')].map((h) => h.childNodes[0]?.textContent)).toContain('Contacts du syndic ');
  });
});

describe('🔴🔴 14h00 point 2 (décisions « 1A » et « 2A ») — « Modifier » des coordonnées : LA fenêtre de la Gestion ; la liste du cabinet affichée', () => {
  it('avec le droit Gestion : « Modifier » en haut à droite du bloc ouvre la fiche syndic de la Gestion (aucune copie) ; la fermer recharge la fiche', async () => {
    await rendre(true);
    const b = container.querySelector('[data-coordonnees-syndic] [data-modifier-syndic="coordonnees"]') as HTMLButtonElement;
    expect(b?.textContent).toBe('Modifier');
    expect(b.closest('.loc-bloc-tete')?.querySelector('h3')?.textContent).toBe('Coordonnées du syndic');
    const avant = (global.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    await act(async () => { b.click(); }); await calmer();
    const f = document.querySelector('[data-fiche-syndic-double]');
    expect(f?.getAttribute('data-fiche-syndic-double')).toBe('4');
    expect(f?.getAttribute('data-depart-contacts')).toBe('false');
    // 🔴 (Arno, 28/11/2026, 15h03) la fenêtre ouverte d'ici est « épurée » : ni « Copier » ni « Écrire » — la fiche Location les garde, elle
    expect(f?.getAttribute('data-epuree')).toBe('true');
    const ligne = container.querySelector('[data-ligne-mail="syndic@exemple.test"]') as HTMLElement;
    expect(ligne.querySelector('[data-case-mail]')).not.toBeNull();
    expect([...ligne.querySelectorAll('button')].some((b) => b.textContent?.startsWith('Copier'))).toBe(true);
    await act(async () => { (document.querySelector('[data-fermer-fiche-syndic]') as HTMLElement).click(); }); await calmer();
    expect(document.querySelector('[data-fiche-syndic-double]')).toBeNull();
    expect((global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.slice(avant).some((c) => String(c[0]).includes('syndic=4'))).toBe(true);
  });
  it('sans le droit Gestion : AUCUN bouton « Modifier », une mention claire à sa place', async () => {
    await rendre(false);
    expect(container.querySelector('[data-modifier-syndic]')).toBeNull();
    expect(container.querySelector('[data-coordonnees-syndic] [data-mention-droit]')?.textContent).toBe('Modification réservée aux comptes qui ont le droit « Gestion ».');
  });
  it('les téléphones et e-mails du cabinet (524) : tous, chacun sur sa ligne, le libellé dit devant s’il n’est pas « Standard » / « Contact »', async () => {
    syndic = { ...BASE, telephone: '0140000000', coordonneesCabinet: [
      { id: 1, sorte: 'telephone', libelle: 'Standard', valeur: '0140000000' },
      { id: 2, sorte: 'telephone', libelle: 'Standard', valeur: '0140000001' },
      { id: 3, sorte: 'telephone', libelle: 'Portable', valeur: '0611223344' },
      { id: 4, sorte: 'email', libelle: 'Contact', valeur: 'syndic@exemple.test' },
      { id: 5, sorte: 'email', libelle: 'Email service', valeur: 'service@exemple.test' }] };
    await rendre(true);
    expect([...container.querySelectorAll('[data-ligne-tel]')].map((x) => x.getAttribute('data-ligne-tel'))).toEqual(['01 40 00 00 00', '01 40 00 00 01', '06 11 22 33 44']);
    expect([...container.querySelectorAll('[data-ligne-mail]')].map((x) => x.getAttribute('data-ligne-mail'))).toEqual(['syndic@exemple.test', 'service@exemple.test']);
    expect(container.querySelector('[data-ligne-tel="06 11 22 33 44"]')?.textContent).toContain('Portable : ');
    expect(container.querySelector('[data-ligne-tel="01 40 00 00 00"]')?.textContent).not.toContain('Standard');
    expect(container.querySelector('[data-ligne-mail="service@exemple.test"]')?.textContent).toContain('Email service : ');
  });
});

describe('🔴🔴 14h00 point 3 — « Modifier » des contacts : LA fenêtre de la Gestion, ouverte directement sur les contacts', () => {
  it('avec le droit Gestion : « Modifier » en haut à droite de « Contacts du syndic » ouvre la fiche de la Gestion sur ses contacts', async () => {
    await rendre(true);
    const b = container.querySelector('[data-modifier-syndic="contacts"]') as HTMLButtonElement;
    expect(b?.textContent).toBe('Modifier');
    expect(b.closest('.loc-bloc-tete')?.querySelector('h3')?.textContent).toContain('Contacts du syndic');
    await act(async () => { b.click(); }); await calmer();
    const f = document.querySelector('[data-fiche-syndic-double]');
    expect(f?.getAttribute('data-fiche-syndic-double')).toBe('4');
    expect(f?.getAttribute('data-depart-contacts')).toBe('true');
    expect(f?.getAttribute('data-epuree')).toBe('true');
  });
  it('sans le droit Gestion : ni l’un ni l’autre bouton, la mention dans chacun des deux blocs', async () => {
    await rendre(false);
    expect(container.querySelectorAll('[data-modifier-syndic]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-mention-droit]')).toHaveLength(2);
  });
});
