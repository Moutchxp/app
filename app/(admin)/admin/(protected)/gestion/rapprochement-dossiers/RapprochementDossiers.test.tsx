// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { compteurSection, CSS_RAPPROCHEMENT, libelleDecision, libelleDecisionBien, RapprochementDossiers, VueRapprochement, type Donnees } from './RapprochementDossiers';
import type { LigneBien } from '../../../../../lib/gestion/racinesProprietaires';
import { planDuLotSuivant, TAILLE_CONTROLE, type LigneRapprochement } from '../../../../../lib/gestion/rapprochementDossiers';

/**
 * ÉCRAN « Rapprochement des dossiers clients » (Arno, 19/10/2026). Données fictives ; `fetch` simulé, rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let n = 0;
function ligne(p: Partial<LigneRapprochement> = {}): LigneRapprochement {
  n += 1;
  return {
    id: n, sorte: 'dossier', copieDossierId: `copie-${n}`, nomDossier: `DOSSIER ${n}`, branche: '1 actifs', nbFichiers: 2, niveau: 'SUR',
    raison: 'même nom + locataire DUPONT connu', fiche: { id: 500 + n, nom: `FICHE ${n}`, dossierActuelId: null }, candidats: [], controleOeil: false,
    venduEnGestion: false, groupePlusieurs: null, principal: false, dernierFichierLe: null, decision: null, nbDecisions: 0, ...p,
  };
}
const valider = (l: LigneRapprochement): LigneRapprochement => ({ ...l, nbDecisions: 1,
  decision: { id: 1, geste: 'valider', fiche: l.fiche, enMasse: false, decideLe: '2026-10-19T08:30:00Z', decidePar: 'Arno' } });
function donnees(validesControle: number): Extract<Donnees, { etat: 'ok' }> {
  const lignes = [
    ...Array.from({ length: TAILLE_CONTROLE }, (_, i) => { const l = ligne({ controleOeil: true }); return i < validesControle ? valider(l) : l; }),
    ligne(), ligne({ venduEnGestion: true, branche: '3 perdus' }), ligne({ niveau: 'AUCUN', fiche: null, raison: 'aucune fiche de ce nom dans l’annuaire' }),
    ligne({ sorte: 'client_sans_dossier', niveau: 'SANS_DOSSIER', copieDossierId: null, nomDossier: null }),
  ];
  return { etat: 'ok', calcul: '2026-10-19', lignes, plan: planDuLotSuivant(lignes) };
}

let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const bouton = (txt: RegExp) => [...container.querySelectorAll('button')].find((b) => txt.test(b.textContent ?? '')) as HTMLButtonElement;

function monter(d: Donnees, onDecider = vi.fn(), onValiderSurs = vi.fn()) {
  act(() => { root.render(createElement(VueRapprochement, { donnees: d, occupe: false, message: null, onDecider, onValiderSurs, chercher: async () => [] })); });
  return { onDecider, onValiderSurs };
}

describe('les sections et leurs compteurs', () => {
  it('chaque section porte un compteur ; le contrôle dit « n/20 validés »', () => {
    monter(donnees(3));
    const compteur = (cle: string) => container.querySelector(`[data-compteur="${cle}"]`)?.textContent;
    expect(compteur('controle')).toBe('3/20 validés');
    expect(compteur('vendus')).toBe('1');
    expect(compteur('sans_correspondant')).toBe('1');
    expect(compteur('clients_sans_dossier')).toBe('1');
    expect(compteur('surs')).toBe('1');
    // 8 sections de dossiers + la section « Biens » (migration 388), qui dit ici que la migration manque.
    expect(container.querySelectorAll('[data-section]').length).toBe(9);
    expect(container.querySelector('[data-section="biens"]')?.textContent).toMatch(/migration 388 n’est pas encore appliquée/);
  });
  it('une ligne : le dossier copié s’ouvre dans le Drive, la fiche proposée dans l’application, la raison en clair', () => {
    monter(donnees(0));
    const l = container.querySelector('[data-section="controle"] [data-proposition]')!;
    const liens = [...l.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(liens[0]).toMatch(/^https:\/\/drive\.google\.com\/drive\/folders\/copie-/);
    expect(liens[1]).toMatch(/^\/admin\/location\/proprietaire\/\d+$/);
    expect(l.textContent).toMatch(/même nom \+ locataire DUPONT connu/);
    expect([...l.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Valider', 'Corriger', 'Aucun rattachement']);
  });
  it('« Valider » est grisé quand aucune fiche n’est proposée', () => {
    monter(donnees(0));
    const l = container.querySelector('[data-section="sans_correspondant"] [data-proposition]')!;
    expect((l.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('« Valider tous les SÛRS » : actif seulement quand les 20 du contrôle sont validés', () => {
  it('19 validés : grisé, et le motif est dit', () => {
    monter(donnees(19));
    expect(bouton(/Valider tous les SÛRS/).disabled).toBe(true);
    expect(container.querySelector('[data-motif-masse]')?.textContent).toMatch(/19 validé\(s\) sur 20/);
  });
  it('20 validés : actif, avec le nombre de SÛRS restants (le « vendu / perdu mais en gestion » n’en est pas)', () => {
    const { onValiderSurs } = monter(donnees(20));
    const b = bouton(/Valider tous les SÛRS/);
    expect(b.disabled).toBe(false);
    expect(b.textContent).toBe('Valider tous les SÛRS (1)');
    act(() => { b.click(); });
    expect(onValiderSurs).toHaveBeenCalledTimes(1);
  });
});

describe('les gestes envoient la décision, et l’écran la relit', () => {
  it('Valider puis la relecture : la décision s’affiche, datée et attribuée', async () => {
    const corps: unknown[] = [];
    let base = donnees(0);
    global.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const c = JSON.parse(String(init.body)) as { propositionId: number };
        corps.push(c);
        base = { ...base, lignes: base.lignes.map((l) => (l.id === c.propositionId ? valider(l) : l)) };
        return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
      }
      return { ok: true, json: async () => ({ etat: 'ok', data: { calcul: base.calcul, lignes: base.lignes, plan: base.plan } }) } as unknown as Response;
    }) as unknown as typeof fetch;
    act(() => { root.render(createElement(RapprochementDossiers)); });
    await calmer();
    const premiere = container.querySelector('[data-section="controle"] [data-proposition]')!;
    const id = Number(premiere.getAttribute('data-proposition'));
    act(() => { (premiere.querySelector('button') as HTMLButtonElement).click(); });
    await calmer();
    expect(corps).toEqual([{ action: 'decider', propositionId: id, geste: 'valider', proprietaireId: null }]);
    const apres = container.querySelector(`[data-proposition="${id}"] .rpd-decision`)!;
    expect(apres.textContent).toMatch(/^Validé — Arno, 19\/10\/2026/);
    expect(container.querySelector('[data-compteur="controle"]')?.textContent).toBe('1/20 validés');
  });
});

function bien(p: Partial<LigneBien> = {}): LigneBien {
  n += 1;
  return {
    id: n, lotId: 900 + n, wippimmo: String(300 + n), adresse: `${n} rue Exemple, VILLE`, proprietaire: { id: 77, nom: 'FICHE A' },
    niveau: 'PROBABLE', dossierId: `dos-${n}`, dossierNom: `Dossier ${n}`, raison: 'locataire actuel DUPONT · autre piste : « Dossier B » (voie « exemple »)',
    candidats: [{ id: `dos-${n}`, nom: `Dossier ${n}` }, { id: 'dos-b', nom: 'Dossier B' }], decision: null, nbDecisions: 0, ...p,
  };
}

describe('la section « Biens » (Arno, 19/10/2026) : les PROBABLES et les AMBIGUS, mêmes gestes ; les SÛRS ne sont pas montrés', () => {
  it('montre 2 biens sur 3 (le SÛR est compté dans l’aide), avec Valider / Corriger / Aucun rattachement', () => {
    const d = { ...donnees(0), biens: { etat: 'ok' as const, calcul: '2026-10-19-biens', lignes: [bien(), bien({ niveau: 'SUR' }), bien({ niveau: 'AMBIGU', dossierId: null, dossierNom: null })] } };
    const onDeciderBien = vi.fn();
    act(() => { root.render(createElement(VueRapprochement, { donnees: d, occupe: false, message: null, onDecider: vi.fn(), onValiderSurs: vi.fn(), chercher: async () => [], onDeciderBien })); });
    const s = container.querySelector('[data-section="biens"]')!;
    expect(s.querySelector('[data-compteur="biens"]')?.textContent).toBe('2');
    expect(s.textContent).toMatch(/1 SÛR valent validés/);
    const lignes = [...s.querySelectorAll('[data-bien]')];
    expect(lignes).toHaveLength(2);
    const [probable, ambigu] = lignes;
    expect([...probable.querySelectorAll('.rpd-gestes button')].map((b) => b.textContent)).toEqual(['Valider', 'Corriger', 'Aucun rattachement']);
    expect(probable.querySelector('a[target="_blank"]')?.getAttribute('href')).toMatch(/^https:\/\/drive\.google\.com\/drive\/folders\/dos-/);
    expect((ambigu.querySelector('.rpd-gestes button') as HTMLButtonElement).disabled).toBe(true);
    act(() => { (probable.querySelectorAll('.rpd-gestes button')[1] as HTMLButtonElement).click(); });
    const choix = [...probable.querySelectorAll('.rpd-recherche button')];
    expect(choix.map((b) => b.textContent)).toEqual(['Dossier B']);
    act(() => { (choix[0] as HTMLButtonElement).click(); });
    expect(onDeciderBien).toHaveBeenCalledWith(expect.objectContaining({ id: Number(probable.getAttribute('data-bien')) }), 'corriger', 'dos-b');
    act(() => { (ambigu.querySelectorAll('.rpd-gestes button')[2] as HTMLButtonElement).click(); });
    expect(onDeciderBien).toHaveBeenLastCalledWith(expect.objectContaining({ niveau: 'AMBIGU' }), 'aucun', null);
  });
  it('libellé de décision d’un bien : sans réponse, il dit le repli ; corrigé, il nomme le dossier', () => {
    expect(libelleDecisionBien(null)).toMatch(/ouvrira le dossier du propriétaire/);
    expect(libelleDecisionBien({ geste: 'corriger', dossierId: 'dos-b', dossierNom: 'Dossier B', decideLe: '2026-10-19T08:30:00Z', decidePar: 'Arno' }))
      .toMatch(/^Corrigé → Dossier B — Arno, 19\/10\/2026/);
  });
});

describe('pur', () => {
  it('libellés de décision et compteurs', () => {
    expect(libelleDecision(null)).toBe('À décider');
    const l = valider(ligne());
    expect(libelleDecision({ ...l.decision!, geste: 'aucun', fiche: null }, 2)).toMatch(/^Aucun rattachement — Arno, .* · 2 décisions, la dernière fait foi$/);
    expect(compteurSection('probables', [l, ligne()])).toBe('2 · 1 décidé');
  });
  it('cibles tactiles de 44 px ; uniquement des jetons de couleur (aucune couleur en dur)', () => {
    const css = CSS_RAPPROCHEMENT;
    expect(css).toMatch(/\.rpd-btn\{min-height:44px;min-width:44px/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(/);
  });
});
