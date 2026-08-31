import { describe, it, expect } from 'vitest';
import { executerCascadePartielleAuto, type DepsCascadePartielleAuto, type CandidatCascadePartielle } from './cascadePartielleAuto';
import { creerBudgetRun } from './plafondEnvoiRun';

/**
 * AUTO-PARTIEL — exécuteur de la cascade partielle. Testé PAR INJECTION (aucun e-mail réel). On prouve : une étape échue part sans
 * intervention ; l'interrupteur à FALSE suspend tout ; le cap par run borne ; un « déjà servi » (anti-doublon) ne compte pas comme envoi
 * ni erreur ; un échec est isolé ; hors fenêtre → reporté (rien).
 */
const JEUDI_MIDI = new Date('2026-08-20T10:00:00Z'); // jour ouvré, dans la fenêtre 0..23
const cand = (demandeId: number, etape: 'relance' | 'annonce' = 'relance', rang: number | null = 1): CandidatCascadePartielle =>
  ({ demandeId, etape, rang, objet: 'Pièces manquantes', corps: 'Madame, Monsieur, …' });
function deps(over: Partial<DepsCascadePartielleAuto> = {}): DepsCascadePartielleAuto {
  return {
    maintenant: () => JEUDI_MIDI,
    lireConfig: async () => ({ actif: true, envoiHeureDebut: 0, envoiHeureFin: 23, capParRun: 5 }),
    candidats: async () => [cand(1)],
    envoyer: async () => 'envoye',
    ...over,
  };
}

describe('executerCascadePartielleAuto', () => {
  it('une étape échue PART toute seule (aucun clic) : envoyes = 1', async () => {
    const b = await executerCascadePartielleAuto(deps());
    expect(b.envoyes).toBe(1);
    expect(b.candidats).toBe(1);
  });

  it('INTERRUPTEUR à FALSE → suspend TOUT (aucun candidat lu, rien n’est envoyé)', async () => {
    let candidatsLus = false;
    const b = await executerCascadePartielleAuto(deps({
      lireConfig: async () => ({ actif: false, envoiHeureDebut: 0, envoiHeureFin: 23, capParRun: 5 }),
      candidats: async () => { candidatsLus = true; return [cand(1)]; },
    }));
    expect(b.envoyes).toBe(0);
    expect(candidatsLus).toBe(false); // court-circuit avant même de chercher des candidats
    expect(b.raison).toContain('désactivé');
  });

  it('hors fenêtre d’envoi (jour/heure ouvrés) → REPORTÉ, rien ne part', async () => {
    const b = await executerCascadePartielleAuto(deps({
      lireConfig: async () => ({ actif: true, envoiHeureDebut: 23, envoiHeureFin: 23, capParRun: 5 }), // 10:00 hors [23;23]
    }));
    expect(b.reporte).toBe(true);
    expect(b.envoyes).toBe(0);
  });

  it('« déjà servi » (anti-doublon) → compté en IGNORÉ, jamais en envoi ni en erreur', async () => {
    const b = await executerCascadePartielleAuto(deps({ envoyer: async () => 'ignore' }));
    expect(b.envoyes).toBe(0);
    expect(b.ignores).toBe(1);
    expect(b.erreurs).toBe(0);
  });

  it('CAP par run : au-delà, les candidats restants ne partent pas dans ce run', async () => {
    const b = await executerCascadePartielleAuto(deps({
      lireConfig: async () => ({ actif: true, envoiHeureDebut: 0, envoiHeureFin: 23, capParRun: 2 }),
      candidats: async () => [cand(1), cand(2), cand(3)],
    }));
    expect(b.envoyes).toBe(2); // 2 partent, le 3e attend le prochain run
  });

  it('un envoi en échec (SMTP) est ISOLÉ : compté en erreur, les suivants continuent', async () => {
    let n = 0;
    const b = await executerCascadePartielleAuto(deps({
      candidats: async () => [cand(1), cand(2)],
      envoyer: async () => { n += 1; if (n === 1) throw new Error('SMTP'); return 'envoye'; },
    }));
    expect(b.erreurs).toBe(1);
    expect(b.envoyes).toBe(1);
  });
});

describe('executerCascadePartielleAuto — PLAFOND ANTI-CUMUL (budget partagé du run)', () => {
  it('un envoi NOTE le budget de la demande (compteur → 1)', async () => {
    const budget = creerBudgetRun(1);
    await executerCascadePartielleAuto(deps({ budget }));
    expect(budget.compteur(1)).toBe(1);
  });

  it('demande déjà servie ce run (budget plein) → REPORTÉE : aucun envoi, reportesPlafond=1, trace émise', async () => {
    const budget = creerBudgetRun(1);
    budget.noterEnvoi(1); // un émetteur antérieur (p. ex. ordinaire) a déjà servi la demande 1 ce run
    const traces: number[] = [];
    const b = await executerCascadePartielleAuto(deps({ budget, journaliserReport: async (id) => { traces.push(id); } }));
    expect(b.envoyes).toBe(0);
    expect(b.reportesPlafond).toBe(1);
    expect(traces).toEqual([1]); // jamais silencieux
  });

  it('sur refus par plafond, deps.envoyer n’est JAMAIS appelé → aucune réservation de créneau, butoir CADA intact', async () => {
    const budget = creerBudgetRun(1);
    budget.noterEnvoi(1);
    let envoyerAppele = false;
    await executerCascadePartielleAuto(deps({ budget, envoyer: async () => { envoyerAppele = true; return 'envoye'; } }));
    expect(envoyerAppele).toBe(false);
  });

  it('deux demandes DIFFÉRENTES partent toutes deux (le plafond est PAR DEMANDE, pas global)', async () => {
    const budget = creerBudgetRun(1);
    const b = await executerCascadePartielleAuto(deps({ budget, candidats: async () => [cand(1), cand(2)] }));
    expect(b.envoyes).toBe(2);
    expect(b.reportesPlafond).toBe(0);
  });

  it('plafond porté à 2 : une demande déjà servie une fois ce run repart (budget lu au runtime)', async () => {
    const budget = creerBudgetRun(2);
    budget.noterEnvoi(1); // 1 envoi déjà fait ce run
    const b = await executerCascadePartielleAuto(deps({ budget }));
    expect(b.envoyes).toBe(1);
    expect(budget.compteur(1)).toBe(2);
  });

  it('un envoi en ÉCHEC ne consomme PAS le budget (retentable au prochain run)', async () => {
    const budget = creerBudgetRun(1);
    await executerCascadePartielleAuto(deps({ budget, envoyer: async () => { throw new Error('SMTP'); } }));
    expect(budget.compteur(1)).toBe(0);
  });

  it('un « déjà servi » (ignore, créneau consommé) ne consomme PAS le budget', async () => {
    const budget = creerBudgetRun(1);
    await executerCascadePartielleAuto(deps({ budget, envoyer: async () => 'ignore' }));
    expect(budget.compteur(1)).toBe(0);
  });
});
