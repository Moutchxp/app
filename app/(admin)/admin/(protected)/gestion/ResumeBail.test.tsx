// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { ResumeBailFiche } from './ResumeBail';
import type { ResumeBail } from '../../../../lib/location/resumeBailRepo';
import { choisirOccupation } from '../../../../lib/location/resumeBailRepo';

/**
 * 🔴 Arno (20/10/2026) — FICHE LOCATAIRE : l'encart du bail, même modèle que la fiche bien. Résumé (« Le bail » / « Ce qu'il
 * paie »), détail replié, chaque information de « Nouveau locataire » UNE fois ; l'ancien encart « Conditions d'entrée » et le
 * bloc « Garants et contacts » y ont fusionné ; le bail en cours, sinon le dernier (« bail terminé le … »).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;

const SAISI: ResumeBail = {
  bail: { bailId: 8, enCours: true, termineLe: null, entree: '2026-11-01', bien: { id: 7, adresse: '15 rue Carle Hebert, COURBEVOIE' },
    lots: [{ id: 7, libelle: '15 rue Carle Hebert, COURBEVOIE' }, { id: 70, libelle: '15 rue Carle Hebert, COURBEVOIE — cave n° 4' }],
    proprietaires: [{ id: 146, nom: 'JULLIEN - GARRIDO Cédric' }], colocataires: [{ id: 523, nom: 'ESSAI RATTACHEMENT Locataire Deux' }],
    occupationIds: [549, 550], occupationId: 549 },
  loyer: { principal: 120000, provisions: 13000 },
  conditions: {
    bailCle: 'b8', occupationIds: [549, 550], saisiLe: '2026-10-20 10:00:00+02', saisiPar: 'Arno', modifiees: false, lignes: [], bailId: 8, surfaceActuelle: null,
    loyer: { principal: 120000, provisions: 13000 },
    conditions: { depot: 'agence', prelevement: true, jour: 5, garant: true, assurance: 'gli', assurancePrecision: 'Assureur ESSAI', honorairesLocataire: 'agence',
      honorairesProprietaire: 'gestion', sommes: { prorataLoyer: 120000, prorataCharges: 13000, depotGarantie: 120000, honorairesAgence: 45000 },
      reglement: 'virement', reglementPrecision: null, commentaire: 'Première ligne.\nDeuxième ligne.' },
    honoraires: { etat: 'ok', surface: '61.8', zone: 'tres_tendue', date: '2026-11-01', dateSupposee: false, baremeId: 1, baremeDepuis: '2026-01-01', source: 'barème',
      tarifZone: '12.10', tarifEdl: '3.03', visiteBail: '747.78', etatDesLieux: '187.254', total: '935.034' },
  },
  garants: [{ carteId: 1480, nom: 'ESSAI Garant', qualite: 'Garant', garant: true, locataires: [{ id: 522, nom: 'Un' }, { id: 523, nom: 'Deux' }], bailIds: [8], mot: 'garantit Un, Deux' }],
  contacts: [{ carteId: 1481, nom: 'ESSAI Conjoint', qualite: 'Conjoint', garant: false, locataires: [{ id: 522, nom: 'Un' }], bailIds: [], mot: 'contact de Un' }],
  entretiens: { aPrevoir: true, liste: [{ sorte: 'chaudiere', nom: null, dateAnniversaire: '2027-01-15' }] },
};
/** Le locataire 502 : un import WIPPIMMO (aucun champ Location saisi), seule la date d'entrée et le bien. */
const WIPPIMMO: ResumeBail = {
  bail: { bailId: 285, enCours: true, termineLe: null, entree: '2024-10-26', bien: { id: 176, adresse: '25 rue Edith Cavell, COURBEVOIE' },
    lots: [{ id: 176, libelle: '25 rue Edith Cavell, COURBEVOIE' }], proprietaires: [{ id: 146, nom: 'JULLIEN - GARRIDO Cédric' }], colocataires: [], occupationIds: [527], occupationId: 527 },
  loyer: null, conditions: null, garants: [], contacts: [], entretiens: { aPrevoir: null, liste: [] },
};

let container: HTMLDivElement;
let root: Root;
let ouverts: [string, number][];
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); ouverts = []; });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });
const rendre = async (r: ResumeBail) => {
  global.fetch = vi.fn(async () => ok(r)) as unknown as typeof fetch;
  await act(async () => { root.render(createElement(ResumeBailFiche, { f: { id: 522, modifiable: true } as never, ouvrir: (s: string, id: number) => { ouverts.push([s, id]); } })); });
  await act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
};
const dd = (k: string) => container.querySelector(`[data-rb="${k}"]`)?.textContent?.replace(/\s/g, ' ');
const colonne = (c: string) => [...container.querySelectorAll(`[data-colonne="${c}"] dt`)].map((d) => d.textContent);
const groupes = () => [...container.querySelectorAll('[data-groupe]')].map((g) => (g as HTMLElement).dataset.groupe);

describe('🔴 fiche locataire — encart du bail', () => {
  it('RÉSUMÉ : « Le bail » à gauche (sans bien loué ni propriétaire : ils sont dans « Son logement »), « Ce qu’il paie » à droite', async () => {
    await rendre(SAISI);
    expect(colonne('bail')).toEqual(['Date d’entrée', 'Colocataire', 'Garant', 'Garanties', 'Entretiens']);
    expect(container.querySelector('[data-rb="bien"]')).toBeNull();
    expect(container.querySelector('[data-rb="proprietaires"]')).toBeNull();
    expect(colonne('paie')).toEqual(['Loyer principal', 'Provision pour charges', 'Total charges comprises', 'Dépôt de garantie', 'Prélèvement']);
    expect([dd('entree'), dd('colocataires'), dd('garants')])
      .toEqual(['01/11/2026', 'ESSAI RATTACHEMENT Locataire Deux', 'ESSAI Garant — garantit Un, Deux']);
    expect([dd('loyer-principal'), dd('provisions'), dd('total-cc'), dd('depot'), dd('prelevement')])
      .toEqual(['1 200,00 €', '130,00 €', '1 330,00 € / mois', '1 200,00 € — conservé par l’agence', 'oui, au 5']);
    for (const b of [...container.querySelectorAll('[data-rb="colocataires"] button')] as HTMLButtonElement[]) {
      await act(async () => { b.click(); });
    }
    expect(ouverts).toEqual([['locataire', 523]]);
  });

  it('DÉTAIL replié par défaut, dépliable (bouton ou clic sur l’encart) ; groupes et champs ; bulle ⓘ des proratas', async () => {
    await rendre(SAISI);
    const enc = container.querySelector('[data-resume-bail]') as HTMLElement;
    const bouton = container.querySelector('[data-bascule-detail]') as HTMLButtonElement;
    expect([enc.dataset.deplie, bouton.textContent, container.querySelector('[data-detail-bail]')?.hasAttribute('inert')]).toEqual(['non', 'Voir le détail du bail ⌄', true]);
    await act(async () => { (container.querySelector('[data-rb="entree"]') as HTMLElement).click(); });
    expect([enc.dataset.deplie, bouton.textContent]).toEqual(['oui', 'Masquer le détail ⌃']);
    expect(groupes()).toEqual(['bail', 'sommes', 'honoraires', 'bail-detail']);
    // « Garanties » et « Entretiens » sont des lignes de la colonne « Le bail » (hors du détail dépliable).
    const detail = container.querySelector('[data-detail-bail]')!;
    expect(detail.querySelector('[data-rb="garanties"], [data-rb="entretiens"]')).toBeNull();
    expect([dd('prorata-loyer'), dd('prorata-charges'), dd('honoraires-agence'), dd('total-du')].map((x) => x?.replace(/ i$/, '').trim()))
      .toEqual(['1 200,00 €', '130,00 €', '450,00 €', '2 980,00 €']);
    expect(container.querySelectorAll('[data-rb="prorata-loyer"] [aria-label="Détail du calcul"], [data-rb="prorata-loyer"] button').length).toBeGreaterThan(0);
    expect([dd('compte-locataire'), dd('compte-proprietaire'), dd('total-honoraires')]).toEqual(['Compte bancaire agence', 'Compte bancaire gestion', '1 385,03 €']);
    expect(dd('honoraires-proprietaire')).toContain('61,8 m² × 12,10 €/m² (zone très tendue)');
    expect(dd('honoraires-proprietaire')).toContain('barème du 01/01/2026, à la date du 01/11/2026');
    expect([dd('garant-physique'), dd('assurance')]).toEqual(['Garant personne physique : oui', 'Assurance loyers impayés : GLI — Assureur ESSAI']);
    // Arno (21/10/2026) : la couleur du bandeau du mail — GLI, Visale, Autre en vert ; Aucune en rouge.
    expect(container.querySelector('[data-rb="assurance"]')?.getAttribute('data-rb-garantie')).toBe('vert');
    expect(container.querySelector('[data-rb="assurance"]')?.className).toContain('rb-garantie--vert');
  });
  it('🔴 Arno (21/10/2026) — la garantie « Aucune » en rouge, Visale et Autre en vert (même règle que le bandeau du mail)', async () => {
    for (const [assurance, couleur] of [['aucune', 'rouge'], ['visale', 'vert'], ['autre', 'vert']] as const) {
      act(() => root.unmount()); root = createRoot(container);
      await rendre({ ...SAISI, conditions: { ...SAISI.conditions!, conditions: { ...SAISI.conditions!.conditions, assurance, assurancePrecision: assurance === 'autre' ? 'caution bancaire' : null } } });
      expect(container.querySelector('[data-rb="assurance"]')?.getAttribute('data-rb-garantie')).toBe(couleur);
      expect(container.querySelector('[data-rb="assurance"]')?.className).toContain(`rb-garantie--${couleur}`);
    }
    // Le mode de règlement n'est plus affiché sur la fiche locataire (ni résumé ni détail) — décision d'Arno du 20/10/2026.
    expect(container.querySelector('[data-rb="reglement"]')).toBeNull();
    expect(container.querySelector('[data-encart-bail]')?.textContent).not.toMatch(/Mode de règlement|Virement/);
    expect(dd('lots')).toBe('15 rue Carle Hebert, COURBEVOIE15 rue Carle Hebert, COURBEVOIE — cave n° 4');
    expect(dd('contacts')).toBe('ESSAI Conjoint (Conjoint) — contact de Un');
    expect(container.querySelector('[data-rb="commentaire"]')?.textContent).toBe('Première ligne.\nDeuxième ligne.');
    expect([...container.querySelectorAll('[data-rb="entretiens"] [data-rb-entretien]')].map((e) => e.textContent)).toEqual(['Chaudière (15/01/2027)']);
    expect(container.querySelector('[data-modifier-conditions]')).not.toBeNull();
  });

  it('chaque information une seule fois : aucun intitulé répété dans l’encart', async () => {
    await rendre(SAISI);
    const t = [...container.querySelectorAll('[data-encart-bail] dt')].map((d) => d.textContent);
    expect(new Set(t).size).toBe(t.length);
  });

  it('IMPORT WIPPIMMO (502) : le bien, le propriétaire et la date d’entrée importés ; le reste « non renseigné » — jamais inventé', async () => {
    await rendre(WIPPIMMO);
    expect([dd('entree'), dd('colocataires'), dd('garants'), dd('loyer-principal'), dd('depot'), dd('prelevement')])
      .toEqual(['26/10/2024', 'aucun', 'aucun', 'non renseigné', 'non renseigné', 'non renseigné']);
    for (const g of ['sommes', 'honoraires']) expect(container.querySelector(`[data-rb-vide="${g}"]`)?.textContent, g).toBe('non renseigné');
    expect([dd('garanties'), dd('entretiens')]).toEqual(['non renseigné', 'non renseigné']);
    expect(dd('saisie')).toBe('aucune condition d’entrée enregistrée');
  });

  it('BAIL TERMINÉ : « bail terminé le … » au titre', async () => {
    await rendre({ ...WIPPIMMO, bail: { ...WIPPIMMO.bail!, enCours: false, termineLe: '2026-09-12' } });
    expect(container.querySelector('[data-bail-termine]')?.textContent).toBe('· bail terminé le 12/09/2026');
  });

  it('sans bail du tout : pas d’encart', async () => {
    await rendre({ ...WIPPIMMO, bail: null });
    expect(container.querySelector('[data-encart-bail]')).toBeNull();
  });

  it('le BAIL CHOISI : en cours d’abord, sinon le dernier', () => {
    const o = (id: string, entree: string | null, sortie: string | null) => ({ id, entree, sortie });
    expect(choisirOccupation([o('1', '2020-01-01', '2022-12-31'), o('2', '2019-01-01', null), o('3', '2023-01-01', '2024-06-30')])?.id).toBe('2');
    expect(choisirOccupation([o('1', '2020-01-01', '2022-12-31'), o('3', '2023-01-01', '2024-06-30')])?.id).toBe('3');
    expect(choisirOccupation([])).toBeUndefined();
  });

  it('FUSION : la section Location ne rend plus « Conditions d’entrée » ni « Garants et contacts » ; l’encart est sous le titre, au-dessus de « Coordonnées »', () => {
    const sections = readFileSync('app/(admin)/admin/(protected)/gestion/SectionsLocationFiche.tsx', 'utf8');
    expect(sections).not.toContain('<EncartConditionsEntree');
    expect(sections).not.toContain('<GarantsEtContacts');
    const annuaire = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
    const i = annuaire.indexOf('<ResumeBailFiche f={f} ouvrir={ouvrir} />');
    expect(i).toBeGreaterThan(annuaire.indexOf('function VueLocataire('));
    expect(i).toBeLessThan(annuaire.indexOf('<BlocCartes titre="Coordonnées" id="ann-coord-loc"'));
    const repo = readFileSync('app/lib/location/resumeBailRepo.ts', 'utf8');
    expect(repo).not.toMatch(/INSERT INTO|UPDATE gestion|DELETE FROM/);
  });
});

describe('🔴 résumé : garanties et entretiens dans la colonne du bail, montants « à l’entrée dans les lieux »', () => {
  it('la colonne « Ce qu’il paie » dit « à l’entrée dans les lieux le … » (sans date : sans « le »)', async () => {
    await rendre(SAISI);
    expect(container.querySelector('[data-legende-paie]')?.textContent).toBe('Ce qu’il paie · à l’entrée dans les lieux le 01/11/2026');
    act(() => root.unmount()); root = createRoot(container);
    await rendre({ ...SAISI, bail: { ...SAISI.bail!, entree: null } });
    expect(container.querySelector('[data-legende-paie]')?.textContent).toBe('Ce qu’il paie · à l’entrée dans les lieux');
  });
  it('garanties et entretiens : deux lignes ordinaires de la colonne « Le bail », après « Garant » ; plus rien en pleine largeur sous les colonnes', async () => {
    await rendre(SAISI);
    const resume = container.querySelector('[data-groupe="bail"]')!;
    expect([...resume.children].map((e) => e.className)).toEqual(['rb-tete-bail', 'rb-colonnes', 'rb-bascule']);
    // Le titre et le bouton du dossier Drive du bail (394) partagent la tête.
    expect(resume.querySelector('.rb-tete-bail > .rb-titre')?.textContent).toBe('Le bail');
    const dts = [...container.querySelectorAll('[data-colonne="bail"] dt')];
    // Les mêmes intitulés que « Date d'entrée » : un <dt> de la même liste, sans titre gras à part.
    expect(dts.map((d) => d.tagName + ':' + d.textContent)).toEqual(['DT:Date d’entrée', 'DT:Colocataire', 'DT:Garant', 'DT:Garanties', 'DT:Entretiens']);
    expect(resume.querySelectorAll('h4')).toHaveLength(1);
    // Un élément par ligne sous la valeur.
    expect(container.querySelector('[data-rb="garanties"]')?.className).toBe('rb-liste');
    expect(container.querySelectorAll('[data-rb="garanties"] > span')).toHaveLength(2);
  });
  it('entretiens : « aucun à prévoir » quand la réponse est non', async () => {
    await rendre({ ...SAISI, entretiens: { aPrevoir: false, liste: [] } });
    expect(dd('entretiens')).toBe('aucun à prévoir');
  });
  it('rien à déplier : pas de bouton, pas de détail', async () => {
    await rendre({ ...WIPPIMMO, bail: { ...WIPPIMMO.bail!, lots: [] } });
    expect(container.querySelector('[data-bascule-detail]')).toBeNull();
    expect(container.querySelector('[data-detail-bail]')).toBeNull();
  });
});

/** 🔴 Arno (20/10/2026) — le dossier Drive du bail (branche « BAIL » créée au nouveau locataire). */
describe('fiche locataire — dossier Drive du bail', () => {
  it('créé : le bouton de l’encart ouvre le dossier N7', async () => {
    await rendre({ ...SAISI, drive: { etat: 'cree', driveId: 'N7abc' } });
    const a = container.querySelector('[data-dossier-bail]') as HTMLAnchorElement;
    expect(a.textContent).toBe('Dossier Drive du bail ↗');
    expect(a.getAttribute('href')).toBe('https://drive.google.com/drive/folders/N7abc');
    expect(container.querySelector('[data-dossier-bail-a-creer]')).toBeNull();
  });

  it('à créer (le Drive a échoué) : « Dossier Drive du bail à créer » + « Créer le dossier » relance la création pour CE bail, puis relit', async () => {
    let lectures = 0;
    const posts: unknown[] = [];
    global.fetch = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return ok({ driveId: 'N7neuf', nom: 'BAIL MARTIN' }); }
      lectures += 1;
      return ok(lectures === 1 ? { ...SAISI, drive: { etat: 'a_creer' } } : { ...SAISI, drive: { etat: 'cree', driveId: 'N7neuf' } });
    }) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(ResumeBailFiche, { f: { id: 522, modifiable: true } as never, ouvrir: () => {} })); });
    await act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
    expect(container.querySelector('[data-dossier-bail-a-creer]')?.textContent).toContain('Dossier Drive du bail à créer');
    await act(async () => { (container.querySelector('[data-creer-dossier-bail]') as HTMLButtonElement).click(); });
    await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
    expect(posts).toEqual([{ action: 'creer-dossier-bail', bailId: 8 }]);
    expect(container.querySelector('[data-dossier-bail]')?.getAttribute('href')).toBe('https://drive.google.com/drive/folders/N7neuf');
  });

  it('refus du serveur : le motif s’affiche, le bouton reste', async () => {
    global.fetch = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => init?.method === 'POST'
      ? ({ ok: false, status: 409, json: async () => ({ etat: 'refus', motif: 'Drive indisponible (403).' }) }) as unknown as Response
      : ok({ ...SAISI, drive: { etat: 'a_creer' } })) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(ResumeBailFiche, { f: { id: 522, modifiable: true } as never, ouvrir: () => {} })); });
    await act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
    await act(async () => { (container.querySelector('[data-creer-dossier-bail]') as HTMLButtonElement).click(); });
    await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
    expect(container.querySelector('[data-dossier-bail-a-creer] [role="alert"]')?.textContent).toBe('Drive indisponible (403).');
    expect(container.querySelector('[data-creer-dossier-bail]')).not.toBeNull();
  });

  it('base sans la migration 394 (drive absent) : rien ne s’affiche', async () => {
    await rendre(SAISI);
    expect(container.querySelector('[data-dossier-bail], [data-dossier-bail-a-creer]')).toBeNull();
  });
});
