import { describe, it, expect, vi } from 'vitest';
import {
  executerEnvoiAuto, composerCompteRenduEnvoiAuto, type DepsEnvoiAuto,
} from './envoiAuto';
import type { RapportEnvoiRelance } from '../sitadel/envoiRelance';
import type { RapportEnvoiSaisine } from '../sitadel/envoiSaisineCada';

/**
 * RELANCE lot 6 — ENVOI AUTOMATIQUE. Orchestration testée avec des rapports INJECTÉS (aucun SMTP, aucune base) : les deux
 * interrupteurs, l'appel aux fonctions d'envoi EXISTANTES (gardes intactes, non réécrites), le plafond auto (PARTAGÉ sur le run),
 * l'isolation (une étape en échec n'arrête pas l'autre ni le compte rendu), le compte rendu conditionnel et son contenu.
 */
const MAINTENANT = new Date('2026-08-25T07:00:00Z');

// ── Fabriques de rapports ──────────────────────────────────────────────────────
function rapportRelance(over: Partial<RapportEnvoiRelance> = {}): RapportEnvoiRelance {
  return {
    mode: 'applique', candidats: 0, emisAujourdhui: 0, capParRun: 10, capParJour: 25, budget: 0,
    bloqueesCorps: [], bloqueesCompte: [], bloqueesObsoletes: [], destinataires: [], reportes: [], reportesHoraire: [], resultats: [], octetsPartis: 0, ...over,
  };
}
function rapportSaisine(over: Partial<RapportEnvoiSaisine> = {}): RapportEnvoiSaisine {
  return {
    mode: 'applique', canal: 'email', candidats: 0, emisAujourdhui: 0, capParRun: 10, capParJour: 25, budget: 0,
    bloqueesForclusion: [], bloqueesCorps: [], bloqueesCompte: [], bloqueesPiece: [], destinataires: [], reportes: [], reportesHoraire: [], resultats: [], fileADeposer: [], octetsPartis: 0, ...over,
  };
}
// une relance ENVOYÉE (destinataire + résultat 'envoye' cohérents)
function relanceEnvoyee(relanceId: number, demandeId: number, commune: string, numeros: string[], variante: string) {
  return {
    dest: { relanceId, demandeId, reference: `SVAV-DEM-${demandeId}`, commune, email: 'x@y.fr', expediteur: 'a@b.fr', apercuCorps: '…', variante, numeros },
    res: { relanceId, reference: `SVAV-DEM-${demandeId}`, issue: 'envoye' as const, messageId: '<m>' },
  };
}
function saisineEnvoyee(saisineId: number, demandeId: number, commune: string, numeros: string[]) {
  return {
    dest: { saisineId, demandeId, reference: `SVAV-DEM-${demandeId}`, commune, email: 'cada@cada.fr', expediteur: 'a@b.fr', apercuCorps: '…', numeros },
    res: { saisineId, reference: `SVAV-DEM-${demandeId}`, issue: 'envoye' as const, messageId: '<m>' },
  };
}

function deps(over: Partial<DepsEnvoiAuto> = {}): DepsEnvoiAuto {
  return {
    lireConfig: async () => ({ relanceActive: true, saisineActive: true, plafondAuto: 5, alerteEmail: 'a.jorel@sansvisavis.com', envoiHeureDebut: 9, envoiHeureFin: 11 }),
    envoyerRelances: vi.fn(async () => rapportRelance()),
    envoyerSaisines: vi.fn(async () => rapportSaisine()),
    envoyerCompteRendu: vi.fn(async () => undefined),
    journaliser: vi.fn(async () => undefined),
    maintenant: () => MAINTENANT,
    ...over,
  };
}
const spy = <K extends keyof DepsEnvoiAuto>(d: DepsEnvoiAuto, k: K) => d[k] as unknown as ReturnType<typeof vi.fn>;

describe('lot 6 — interrupteurs : rien ne part sans activation explicite', () => {
  it('les DEUX interrupteurs OFF → resultat ignore, AUCUN appel d’envoi, AUCUN compte rendu', async () => {
    const d = deps({ lireConfig: async () => ({ relanceActive: false, saisineActive: false, plafondAuto: 5, alerteEmail: 'a@b.fr', envoiHeureDebut: 9, envoiHeureFin: 11 }) });
    const r = await executerEnvoiAuto(d);
    expect(r.resultat).toBe('ignore');
    expect(spy(d, 'envoyerRelances')).not.toHaveBeenCalled();
    expect(spy(d, 'envoyerSaisines')).not.toHaveBeenCalled();
    expect(spy(d, 'envoyerCompteRendu')).not.toHaveBeenCalled();
  });

  it('relance ON, saisine OFF → SEULES les relances sont tentées (les interrupteurs sont distincts)', async () => {
    const { dest, res } = relanceEnvoyee(7, 42, 'Asnières', ['PC1'], 'rappel');
    const d = deps({
      lireConfig: async () => ({ relanceActive: true, saisineActive: false, plafondAuto: 5, alerteEmail: 'a@b.fr', envoiHeureDebut: 9, envoiHeureFin: 11 }),
      envoyerRelances: vi.fn(async () => rapportRelance({ destinataires: [dest], resultats: [res] })),
    });
    const r = await executerEnvoiAuto(d);
    expect(spy(d, 'envoyerRelances')).toHaveBeenCalledTimes(1);
    expect(spy(d, 'envoyerSaisines')).not.toHaveBeenCalled();
    expect(r.relancesEnvoyees).toBe(1);
  });

  it('saisine ON, relance OFF → SEULES les saisines sont tentées', async () => {
    const d = deps({ lireConfig: async () => ({ relanceActive: false, saisineActive: true, plafondAuto: 5, alerteEmail: 'a@b.fr', envoiHeureDebut: 9, envoiHeureFin: 11 }) });
    await executerEnvoiAuto(d);
    expect(spy(d, 'envoyerRelances')).not.toHaveBeenCalled();
    expect(spy(d, 'envoyerSaisines')).toHaveBeenCalledTimes(1);
  });
});

describe('lot 6 — appel des fonctions d’envoi EXISTANTES avec le plafond auto (jamais réécrites)', () => {
  it('relance ON → envoyerRelances appelé avec le plafond auto', async () => {
    const d = deps({ lireConfig: async () => ({ relanceActive: true, saisineActive: false, plafondAuto: 5, alerteEmail: 'a@b.fr', envoiHeureDebut: 9, envoiHeureFin: 11 }) });
    await executerEnvoiAuto(d);
    expect(spy(d, 'envoyerRelances')).toHaveBeenCalledWith(5, expect.anything());
  });

  it('plafond auto PARTAGÉ sur le run : 3 relances envoyées (plafond 5) → saisines appelées avec le RESTANT (2)', async () => {
    const rel = [relanceEnvoyee(1, 11, 'A', ['P1'], 'saisine'), relanceEnvoyee(2, 12, 'B', ['P2'], 'saisine'), relanceEnvoyee(3, 13, 'C', ['P3'], 'saisine')];
    const d = deps({
      envoyerRelances: vi.fn(async () => rapportRelance({ destinataires: rel.map((x) => x.dest), resultats: rel.map((x) => x.res) })),
    });
    await executerEnvoiAuto(d);
    expect(spy(d, 'envoyerSaisines')).toHaveBeenCalledWith(2, expect.anything()); // 5 − 3
  });

  it('relance OBSOLÈTE (bloquée par la garde du lot 3) → JAMAIS dans les envoyés, NOMMÉE dans les écartés', async () => {
    const d = deps({
      lireConfig: async () => ({ relanceActive: true, saisineActive: false, plafondAuto: 5, alerteEmail: 'a@b.fr', envoiHeureDebut: 9, envoiHeureFin: 11 }),
      envoyerRelances: vi.fn(async () => rapportRelance({ bloqueesObsoletes: [{ reference: 'SVAV-DEM-99', motif: 'l’étape enregistrée « rappel » ne correspond plus à la fenêtre du jour' }] })),
    });
    const r = await executerEnvoiAuto(d);
    expect(r.relancesEnvoyees).toBe(0);
    expect(r.ecartes).toBe(1);
    // rien n'est parti ET rien n'est en file → aucun compte rendu (mais l'écart est compté)
    expect(spy(d, 'envoyerCompteRendu')).not.toHaveBeenCalled();
  });
});

describe('lot 6 — budget : plafond du jour atteint → rien ne part', () => {
  it('les deux rapports vides (budget 0) → aucun courrier, aucun compte rendu', async () => {
    const d = deps({ envoyerRelances: vi.fn(async () => rapportRelance({ budget: 0 })), envoyerSaisines: vi.fn(async () => rapportSaisine({ budget: 0 })) });
    const r = await executerEnvoiAuto(d);
    expect(r.relancesEnvoyees).toBe(0);
    expect(r.saisinesEnvoyees).toBe(0);
    expect(spy(d, 'envoyerCompteRendu')).not.toHaveBeenCalled();
  });
});

describe('lot 6 — cada_email vide : la saisine va en FILE de dépôt, le compte rendu le DIT', () => {
  it('canal formulaire + 1 en file → aucun envoi, compte rendu émis mentionnant « à déposer à la main »', async () => {
    const file = [{ saisineId: 5, demandeId: 55, reference: 'SVAV-DEM-55', communeNom: 'Aubervilliers', numeros: ['0930012500081'], objet: 'Saisine', corps: 'C', urlFormulaire: 'https://cada' }];
    const d = deps({
      lireConfig: async () => ({ relanceActive: false, saisineActive: true, plafondAuto: 5, alerteEmail: 'a.jorel@sansvisavis.com', envoiHeureDebut: 9, envoiHeureFin: 11 }),
      envoyerSaisines: vi.fn(async () => rapportSaisine({ canal: 'formulaire', fileADeposer: file })),
    });
    const r = await executerEnvoiAuto(d);
    expect(r.saisinesEnvoyees).toBe(0);
    expect(r.saisinesEnFile).toBe(1);
    expect(spy(d, 'envoyerCompteRendu')).toHaveBeenCalledTimes(1);
    const [, , corps] = spy(d, 'envoyerCompteRendu').mock.calls[0];
    expect(corps).toContain('à DÉPOSER À LA MAIN');
    expect(corps).toContain('0930012500081');
  });
});

describe('ENVOI OUVRÉ — reportés (heure/jour) mentionnés dans le compte rendu avec la date d’envoi prévue', () => {
  it('1 relance envoyée + 1 reportée hors fenêtre → le compte rendu NOMME la reportée + « envoi prévu le … »', async () => {
    const { dest, res } = relanceEnvoyee(7, 42, 'Asnières', ['PC1'], 'rappel');
    const d = deps({
      lireConfig: async () => ({ relanceActive: true, saisineActive: false, plafondAuto: 5, alerteEmail: 'a.jorel@sansvisavis.com', envoiHeureDebut: 9, envoiHeureFin: 11 }),
      envoyerRelances: vi.fn(async () => rapportRelance({
        destinataires: [dest], resultats: [res],
        reportesHoraire: [{ reference: 'SVAV-DEM-99', commune: 'Pantin', numeros: ['PC9'], motif: 'hors fenêtre d’envoi automatique (jour ouvré / heures ouvrées)', prevu: '2026-08-31T07:00:00Z' }],
      })),
    });
    const r = await executerEnvoiAuto(d);
    expect(r.relancesEnvoyees).toBe(1);
    expect(r.ecartes).toBe(1); // la reportée-horaire compte comme un écart
    expect(spy(d, 'envoyerCompteRendu')).toHaveBeenCalledTimes(1);
    const [, , corps] = spy(d, 'envoyerCompteRendu').mock.calls[0];
    expect(corps).toContain('Pantin');          // la reportée est nommée (commune + permis)
    expect(corps).toContain('PC9');
    expect(corps).toContain('hors fenêtre');
    expect(corps).toContain('envoi prévu le 31 août 2026'); // la date prévue est jointe au motif
  });
});

describe('lot 6 — isolation', () => {
  it('l’étape relances qui LÈVE n’empêche pas les saisines (ni la suite)', async () => {
    const d = deps({
      envoyerRelances: vi.fn(async () => { throw new Error('SMTP down'); }),
      envoyerSaisines: vi.fn(async () => rapportSaisine({ ...saisineRapportUnEnvoye() })),
    });
    const r = await executerEnvoiAuto(d);
    expect(spy(d, 'envoyerSaisines')).toHaveBeenCalledTimes(1); // la saisine est tentée malgré l'échec relance
    expect(spy(d, 'journaliser')).toHaveBeenCalled();           // l'échec est journalisé
    expect(r.saisinesEnvoyees).toBe(1);
  });

  it('le compte rendu qui ÉCHOUE ne défait pas les envois (comptés, tracés) et se journalise', async () => {
    const { dest, res } = relanceEnvoyee(7, 42, 'Asnières', ['PC1'], 'saisine');
    const d = deps({
      lireConfig: async () => ({ relanceActive: true, saisineActive: false, plafondAuto: 5, alerteEmail: 'a.jorel@sansvisavis.com', envoiHeureDebut: 9, envoiHeureFin: 11 }),
      envoyerRelances: vi.fn(async () => rapportRelance({ destinataires: [dest], resultats: [res] })),
      envoyerCompteRendu: vi.fn(async () => { throw new Error('compte rendu SMTP down'); }),
    });
    const r = await executerEnvoiAuto(d);
    expect(r.relancesEnvoyees).toBe(1);      // l'envoi tient
    expect(r.compteRenduEmis).toBe(false);
    expect(spy(d, 'journaliser')).toHaveBeenCalled();
  });

  it('alerte_email vide → aucun compte rendu envoyé, mais l’absence est journalisée (envois faits)', async () => {
    const { dest, res } = relanceEnvoyee(7, 42, 'Asnières', ['PC1'], 'saisine');
    const d = deps({
      lireConfig: async () => ({ relanceActive: true, saisineActive: false, plafondAuto: 5, alerteEmail: '', envoiHeureDebut: 9, envoiHeureFin: 11 }),
      envoyerRelances: vi.fn(async () => rapportRelance({ destinataires: [dest], resultats: [res] })),
    });
    const r = await executerEnvoiAuto(d);
    expect(spy(d, 'envoyerCompteRendu')).not.toHaveBeenCalled();
    expect(r.relancesEnvoyees).toBe(1);
    expect(spy(d, 'journaliser')).toHaveBeenCalled();
  });
});

function saisineRapportUnEnvoye() {
  const { dest, res } = saisineEnvoyee(9, 90, 'Pantin', ['0930012600010']);
  return { destinataires: [dest], resultats: [res] } as Partial<RapportEnvoiSaisine>;
}

describe('lot 6 — composerCompteRenduEnvoiAuto (pur) : NOMME chaque demande, chaque écart', () => {
  it('12 envoyables plafond 5 → le compte rendu NOMME les 7 reportés (par commune + permis)', () => {
    const emis = Array.from({ length: 5 }, (_, i) => ({ reference: `R${i}`, commune: `Ville${i}`, numeros: [`P${i}`], etape: 'relance « saisine »' }));
    const reportes = Array.from({ length: 7 }, (_, i) => ({ reference: `R${i + 5}`, commune: `Ville${i + 5}`, numeros: [`P${i + 5}`], motif: 'plafond d’envoi atteint (envoi auto / caps) — relance reportée au prochain run' }));
    const { sujet, corps } = composerCompteRenduEnvoiAuto({ emis, ecartes: reportes, file: [], maintenant: MAINTENANT });
    expect(sujet).toContain('5 courrier(s) parti(s)');
    expect(corps).toContain('Courriers envoyés (5)');
    expect(corps).toContain('Écartés / reportés (7)');
    for (let i = 5; i < 12; i++) { expect(corps).toContain(`Ville${i}`); expect(corps).toContain(`P${i}`); }
  });

  it('sujet mentionne aussi les saisines à déposer quand la file n’est pas vide', () => {
    const { sujet, corps } = composerCompteRenduEnvoiAuto({
      emis: [], ecartes: [], file: [{ reference: 'R1', commune: 'Aubervilliers', numeros: ['0930012500081'] }], maintenant: MAINTENANT,
    });
    expect(sujet).toContain('1 saisine(s) à déposer');
    expect(corps).toContain('DÉPOSER À LA MAIN');
    expect(corps).toContain('0930012500081');
  });
});
