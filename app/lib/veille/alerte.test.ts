import { describe, it, expect } from 'vitest';
import { composerAlerte, type EntreeAlerte } from './alerte';

/**
 * R8 — composition PURE du récapitulatif. Rien à dire → null ; relève non fraîche → avertissement EN TÊTE et jamais de
 * silence déclaré ; rebond présenté comme acheminement ; échéance datée ; réponse rattachée avec ses dossiers.
 */
function entree(over: Partial<EntreeAlerte> = {}): EntreeAlerte {
  return {
    releveFraiche: true,
    releveDetail: 'dernière relève réussie il y a 10 minutes',
    reponsesRattachees: [],
    accusesRecus: [],
    nbAReattacher: 0,
    rebondsAppliques: [],
    demandesEcheance: [],
    relancesPreparees: [],
    ...over,
  };
}

describe('R8 — composerAlerte', () => {
  it('rien à signaler (relève fraîche, aucun changement) → null (pas d’e-mail)', () => {
    expect(composerAlerte(entree())).toBeNull();
  });

  it('relève TROP ANCIENNE → avertissement EN TÊTE du corps', () => {
    const r = composerAlerte(entree({ releveFraiche: false, releveDetail: 'aucune relève réussie depuis 3 jours' }));
    expect(r).not.toBeNull();
    expect(r!.corps.split('\n')[0]).toContain('RELÈVE À VÉRIFIER');
    expect(r!.corps).toContain('aucune relève réussie depuis 3 jours');
  });

  it('un REBOND appliqué → présent et présenté comme un problème d’acheminement, PAS un silence', () => {
    const r = composerAlerte(entree({ rebondsAppliques: [{ reference: 'SVAV-DEM-2026-000042', communeNom: 'Asnieres', motif: '550 user unknown' }] }));
    expect(r).not.toBeNull();
    expect(r!.corps).toContain('SVAV-DEM-2026-000042');
    expect(r!.corps).toContain('acheminement');
    expect(r!.corps).toContain('pas un silence');
  });

  it('une demande DÉPASSÉE → présente avec sa date d’échéance', () => {
    const r = composerAlerte(entree({ demandesEcheance: [{ reference: 'SVAV-DEM-2026-000007', communeNom: 'Clichy', etat: 'depassee', echeanceLe: '2026-04-15' }] }));
    expect(r!.corps).toContain('SVAV-DEM-2026-000007');
    expect(r!.corps).toContain('échéance dépassée');
    expect(r!.corps).toContain('2026-04-15');
  });

  it('une RÉPONSE rattachée → présente avec ses dossiers satisfaits et le nombre de pièces', () => {
    const r = composerAlerte(entree({ reponsesRattachees: [{ reference: 'SVAV-DEM-2026-000003', communeNom: 'Levallois', nbPieces: 2, dossiersSatisfaits: ['PC0920442500011'] }] }));
    expect(r!.corps).toContain('SVAV-DEM-2026-000003');
    expect(r!.corps).toContain('PC0920442500011');
    expect(r!.corps).toContain('2 pièce');
  });

  it('J1 DEFAUT 2 — un ACCUSÉ est annoncé « accusé de réception », JAMAIS « réponse », et compté À PART dans le sujet', () => {
    const r = composerAlerte(entree({ accusesRecus: [{ reference: 'SVAV-DEM-2026-000160', communeNom: 'Paris' }] }));
    expect(r).not.toBeNull();
    expect(r!.corps).toContain('Accusés de réception reçus');
    expect(r!.corps).toContain('SVAV-DEM-2026-000160');
    expect(r!.corps).toContain('la mairie a écrit, pas encore répondu');
    expect(r!.corps).not.toContain('Réponses reçues et rattachées'); // jamais présenté comme une réponse (T3)
    expect(r!.sujet).toContain('1 accusé(s)');
    expect(r!.sujet).not.toContain('réponse(s)'); // le sujet ne fond JAMAIS un accusé dans « réponse(s) »
  });

  it('J1 DEFAUT 2 — une réponse RÉELLE et un accusé coexistent : chacun dans SA rubrique et son décompte', () => {
    const r = composerAlerte(entree({
      reponsesRattachees: [{ reference: 'SVAV-DEM-2026-000003', communeNom: 'Levallois', nbPieces: 1, dossiersSatisfaits: [] }],
      accusesRecus: [{ reference: 'SVAV-DEM-2026-000160', communeNom: 'Paris' }],
    }));
    expect(r!.corps).toContain('Réponses reçues et rattachées depuis la dernière alerte (1)');
    expect(r!.corps).toContain('Accusés de réception reçus depuis la dernière alerte (1)');
    expect(r!.sujet).toContain('1 réponse(s)');
    expect(r!.sujet).toContain('1 accusé(s)');
  });

  it('relève INDÉTERMINÉE → le corps ne DÉCLARE jamais un silence non vérifié', () => {
    const r = composerAlerte(entree({ releveFraiche: false, releveDetail: 'aucune relève réussie depuis 3 jours' }));
    expect(r).not.toBeNull();
    expect(r!.corps).not.toMatch(/n['’]a pas répondu|silence gardé|refus tacite/i);
  });

  it('file à rattacher non vide (relève fraîche) → quelque chose à dire (non null)', () => {
    const r = composerAlerte(entree({ nbAReattacher: 3 }));
    expect(r).not.toBeNull();
    expect(r!.corps).toContain('3 en attente d’arbitrage');
  });
});
