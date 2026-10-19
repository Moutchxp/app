import { describe, expect, it } from 'vitest';
import {
  etatControle, fichesDiscordantes, peutValiderTousLesSurs, planDuLotSuivant, sectionDe, sectionsDuRapprochement, sursAValider, verifierGeste,
  TAILLE_CONTROLE, type Decision, type LigneRapprochement,
} from './rapprochementDossiers';

/**
 * RAPPROCHEMENT DES DOSSIERS CLIENTS (Arno, 18 et 19/10/2026) — les règles pures : sections, contrôle à l'œil, « Valider tous
 * les SÛRS » bloqué tant que les 20 ne sont pas validés, plan du lot suivant. Données fictives.
 */
let n = 0;
function ligne(p: Partial<LigneRapprochement> = {}): LigneRapprochement {
  n += 1;
  return {
    id: n, sorte: 'dossier', copieDossierId: `copie-${n}`, nomDossier: `DOSSIER ${String(n).padStart(3, '0')}`, branche: '1 actifs', nbFichiers: 3,
    niveau: 'SUR', raison: 'même nom + locataire DUPONT connu', fiche: { id: 1000 + n, nom: `FICHE ${n}`, dossierActuelId: `ancien-${n}` },
    candidats: [], controleOeil: false, venduEnGestion: false, groupePlusieurs: null, principal: false, dernierFichierLe: '2026-01-01T00:00:00Z',
    decision: null, nbDecisions: 0, ...p,
  };
}
const valide = (l: LigneRapprochement): Decision => ({ id: 1, geste: 'valider', fiche: l.fiche, enMasse: false, decideLe: '2026-10-19T10:00:00Z', decidePar: 'Arno' });
const controle = (valides: number) => Array.from({ length: TAILLE_CONTROLE }, (_, i) => {
  const l = ligne({ controleOeil: true });
  return i < valides ? { ...l, decision: valide(l), nbDecisions: 1 } : l;
});

describe('sections : chaque ligne dans UNE section, dans l’ordre de l’écran', () => {
  it('contrôle, vendus, plusieurs, probables, ambigus, sans correspondant, clients sans dossier, autres SÛRS', () => {
    expect(sectionDe(ligne({ controleOeil: true }))).toBe('controle');
    expect(sectionDe(ligne({ venduEnGestion: true, branche: '3 perdus' }))).toBe('vendus');
    expect(sectionDe(ligne({ groupePlusieurs: '7' }))).toBe('plusieurs');
    expect(sectionDe(ligne({ niveau: 'PROBABLE' }))).toBe('probables');
    expect(sectionDe(ligne({ niveau: 'AMBIGU', fiche: null }))).toBe('ambigus');
    expect(sectionDe(ligne({ niveau: 'AUCUN', fiche: null }))).toBe('sans_correspondant');
    expect(sectionDe(ligne({ sorte: 'client_sans_dossier', niveau: 'SANS_DOSSIER', copieDossierId: null }))).toBe('clients_sans_dossier');
    expect(sectionDe(ligne())).toBe('surs');
  });
  it('« plusieurs » : un groupe se suit, le dossier principal en tête', () => {
    const a = ligne({ groupePlusieurs: '7', fiche: { id: 7, nom: 'B', dossierActuelId: null } });
    const b = ligne({ groupePlusieurs: '7', principal: true, fiche: { id: 7, nom: 'B', dossierActuelId: null } });
    const c = ligne({ groupePlusieurs: '3', principal: true, fiche: { id: 3, nom: 'A', dossierActuelId: null } });
    expect(sectionsDuRapprochement([a, b, c]).plusieurs.map((l) => l.id)).toEqual([c.id, b.id, a.id]);
  });
});

describe('« Valider tous les SÛRS » : bloqué tant que les 20 du contrôle à l’œil ne sont pas VALIDÉS', () => {
  it('0, 19 validés → bloqué, avec le compte ; 20 validés → actif', () => {
    const autres = [ligne(), ligne()];
    expect(peutValiderTousLesSurs([...controle(0), ...autres])).toEqual({ ok: false, motif: expect.stringMatching(/0 validé\(s\) sur 20/) });
    expect(peutValiderTousLesSurs([...controle(19), ...autres])).toEqual({ ok: false, motif: expect.stringMatching(/19 validé\(s\) sur 20/) });
    expect(peutValiderTousLesSurs([...controle(20), ...autres])).toEqual({ ok: true, nombre: 2 });
  });
  it('une ligne du contrôle CORRIGÉE ou refusée laisse le contrôle incomplet', () => {
    const c = controle(20);
    c[3] = { ...c[3], decision: { ...valide(c[3]), geste: 'corriger', fiche: { id: 1, nom: 'AUTRE', dossierActuelId: null } } };
    expect(etatControle(c)).toEqual({ total: 20, valides: 19, complet: false });
    c[3] = { ...c[3], decision: { ...valide(c[3]), geste: 'aucun', fiche: null } };
    expect(peutValiderTousLesSurs([...c, ligne()]).ok).toBe(false);
  });
  it('les SÛRS visés : sans décision, avec une fiche, jamais un « vendu / perdu mais en gestion », jamais un probable', () => {
    const libre = ligne();
    const deja = ligne(); const dejaD = { ...deja, decision: { ...valide(deja), geste: 'aucun' as const, fiche: null } };
    const vendu = ligne({ venduEnGestion: true, branche: '2 vendus' });
    const probable = ligne({ niveau: 'PROBABLE' });
    expect(sursAValider([libre, dejaD, vendu, probable]).map((l) => l.id)).toEqual([libre.id]);
  });
});

describe('les gestes recevables', () => {
  it('Valider exige une fiche proposée ; Corriger exige une fiche choisie ; un client sans dossier ne se décide pas', () => {
    expect(verifierGeste(ligne(), 'valider', null)).toBeNull();
    expect(verifierGeste(ligne({ fiche: null }), 'valider', null)).toMatch(/Corriger/);
    expect(verifierGeste(ligne(), 'corriger', null)).toMatch(/Choisir/);
    expect(verifierGeste(ligne(), 'corriger', 12)).toBeNull();
    expect(verifierGeste(ligne({ fiche: null }), 'aucun', null)).toBeNull();
    expect(verifierGeste(ligne({ sorte: 'client_sans_dossier' }), 'aucun', null)).toMatch(/dossier actuel/);
  });
});

describe('le plan du lot suivant (rien n’est exécuté)', () => {
  it('actifs → Actifs, vendus/perdus → Inactifs ; repointage et corbeille seulement pour une fiche retenue', () => {
    const a = ligne(); const aD = { ...a, decision: valide(a) };
    const p = ligne({ branche: '3 perdus', niveau: 'PROBABLE' });
    const pD = { ...p, decision: { ...valide(p), geste: 'corriger' as const, fiche: { id: 77, nom: 'CORRIGÉE', dossierActuelId: 'ancien-77' } } };
    const z = ligne({ branche: '2 vendus', niveau: 'AUCUN', fiche: null }); const zD = { ...z, decision: { ...valide(z), geste: 'aucun' as const, fiche: null } };
    const libre = ligne();
    const plan = planDuLotSuivant([aD, pD, zD, libre]);
    expect(plan.deplacements.map((d) => [d.propositionId, d.vers, d.decide])).toEqual([[a.id, 'Actifs', true], [p.id, 'Inactifs', true], [z.id, 'Inactifs', true], [libre.id, 'Actifs', false]]);
    expect(plan.repointages.map((r) => [r.proprietaireId, r.de, r.vers])).toEqual([[77, 'ancien-77', p.copieDossierId], [a.fiche!.id, a.fiche!.dossierActuelId, a.copieDossierId]]);
    expect(plan.corbeille.map((c) => c.ancienDossierId)).toEqual(['ancien-77', a.fiche!.dossierActuelId]);
    expect(plan.nonDecides).toBe(1);
    expect(plan.dossiersTest.join(' ')).toMatch(/_TEST CLAUDE.*_TEST COPIE/);
  });
  it('décision 6 : un « vendu / perdu mais en gestion » est laissé en place ; validé, sa fiche le reçoit quand même (point 1 du 19/10)', () => {
    const v = ligne({ venduEnGestion: true, branche: '3 perdus' });
    const plan = planDuLotSuivant([{ ...v, decision: valide(v) }]);
    expect(plan.deplacements).toEqual([]);
    expect(plan.laissesEnPlace.map((x) => x.propositionId)).toEqual([v.id]);
    expect(plan.repointages.map((r) => [r.proprietaireId, r.vers])).toEqual([[v.fiche!.id, v.copieDossierId]]);
    expect(plan.corbeille.map((c) => c.ancienDossierId)).toEqual([v.fiche!.dossierActuelId]);
    const libre = ligne({ venduEnGestion: true, branche: '2 vendus' });
    expect(planDuLotSuivant([libre]).repointages).toEqual([]);
  });
  it('décision 7 : plusieurs dossiers validés pour une fiche → UN repointage, vers le principal ; une seule corbeille', () => {
    const fiche = { id: 5, nom: 'MULTI', dossierActuelId: 'ancien-5' };
    const x = ligne({ groupePlusieurs: '5', fiche, branche: '2 vendus' });
    const y = ligne({ groupePlusieurs: '5', fiche, principal: true });
    const plan = planDuLotSuivant([{ ...x, decision: valide(x) }, { ...y, decision: valide(y) }]);
    expect(plan.repointages).toEqual([{ proprietaireId: 5, nom: 'MULTI', de: 'ancien-5', vers: y.copieDossierId, propositionId: y.id }]);
    expect(plan.corbeille).toEqual([{ proprietaireId: 5, nom: 'MULTI', ancienDossierId: 'ancien-5' }]);
    expect(plan.deplacements.map((d) => d.vers)).toEqual(['Inactifs', 'Actifs']);
  });
});

describe('un calcul ne se charge que dans une base où ses fiches désignent les mêmes personnes', () => {
  it('même id, même n° WIPPIMMO → concordant ; id absent ou n° différent → discordant, avec le détail', () => {
    const lu = new Map([[1, '100'], [2, '200']]);
    expect(fichesDiscordantes({ 1: '100', 2: '200' }, lu)).toEqual([]);
    expect(fichesDiscordantes({ 1: '100', 2: '201', 3: '300' }, lu)).toEqual(['fiche 2 : WIPPIMMO 201 au calcul, 200 dans cette base', 'fiche 3 absente de cette base']);
  });
});
