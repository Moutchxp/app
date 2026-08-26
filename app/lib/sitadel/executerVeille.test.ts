import { describe, it, expect, vi } from 'vitest';
import { executerVeille, type DepsVeille } from './executerVeille';
import { DiDoIndisponibleError, type CompteursIngestion } from './ingestionMillesime';

const COMPTEURS: CompteursIngestion = {
  millesime: '2026-07', millesimeId: 2, lignesLues: 100, dossiersRetenus: 10,
  dossiersNouveaux: 3, dossiersDejaConnus: 7, dossiersMisAJour: 0, dossiersAbsents: 0, pc: 6, pd: 4,
};

/** Deps par défaut = chemin de succès (distant 2026-07 ≠ base 2026-06) ; chaque test surcharge ce qu'il éprouve. */
function makeDeps(over: Partial<DepsVeille> = {}): DepsVeille {
  return {
    maintenant: () => new Date('2026-07-28T12:00:00Z'),
    chargerConfig: vi.fn(async () => ({ autoActive: false, autoIntervalleHeures: 24, csvRetentionJours: 0, runDemandeLe: null })),
    dernierSucces: vi.fn(async () => null),
    millesimeEnBase: vi.fn(async () => '2026-06'),
    acquerirVerrou: vi.fn(async () => true),
    libererVerrou: vi.fn(async () => {}),
    insererRun: vi.fn(async () => 1),
    finaliserRun: vi.fn(async () => {}),
    millesimeDistant: vi.fn(async () => ({ millesime: '2026-07', publieLe: null })),
    ingerer: vi.fn(async () => COMPTEURS),
    // un CSV du millésime COURANT (2026-07, protégé) + un ANTÉRIEUR (2026-06, purgeable).
    listerCsv: vi.fn(async () => [
      { chemin: 'data/sitadel/logements.2026-07.csv', mtime: new Date('2026-07-28T00:00:00Z'), millesime: '2026-07' },
      { chemin: 'data/sitadel/logements.2026-06.csv', mtime: new Date('2026-06-01T00:00:00Z'), millesime: '2026-06' },
    ]),
    supprimerFichiers: vi.fn(async () => {}),
    ...over,
  };
}

describe('S11a-FIX — executerVeille : verrou concurrent', () => {
  it('verrou déjà pris → « rien_a_faire » SANS aucun appel réseau ni ingestion', async () => {
    const millesimeDistant = vi.fn(async () => ({ millesime: '2026-07', publieLe: null }));
    const ingerer = vi.fn(async () => COMPTEURS);
    const insererRun = vi.fn(async () => 1);
    const deps = makeDeps({ acquerirVerrou: vi.fn(async () => false), millesimeDistant, ingerer, insererRun });

    const r = await executerVeille({ declencheur: 'planifie' }, deps);

    expect(r.statut).toBe('rien_a_faire');
    expect(millesimeDistant).not.toHaveBeenCalled();
    expect(ingerer).not.toHaveBeenCalled();
    expect(insererRun).not.toHaveBeenCalled();
  });
});

describe('S11a-FIX — executerVeille : millésime distant DIFFÉRENT', () => {
  it('ingère le millésime DÉTECTÉ (2026-07) une fois, purge les ANTÉRIEURS sans jamais le courant', async () => {
    const ingerer = vi.fn(async () => COMPTEURS);
    const supprimerFichiers = vi.fn(async () => {});
    const finaliserRun = vi.fn(async () => {});
    const deps = makeDeps({ ingerer, supprimerFichiers, finaliserRun });

    const r = await executerVeille({ declencheur: 'manuel' }, deps);

    expect(r.statut).toBe('succes');
    expect(ingerer).toHaveBeenCalledTimes(1);
    expect(ingerer).toHaveBeenCalledWith('2026-07');               // le DÉTECTÉ, pas une constante
    // purge : uniquement l'antérieur 2026-06 ; le courant 2026-07 est EXCLU.
    expect(supprimerFichiers).toHaveBeenCalledWith(['data/sitadel/logements.2026-06.csv']);
    expect(finaliserRun).toHaveBeenCalledWith(1, expect.objectContaining({ statut: 'succes', millesimeDetecte: '2026-07', millesimeIngere: '2026-07' }));
  });
});

describe('S11a-FIX — executerVeille : millésime inchangé (LE test qui manquait)', () => {
  it('distant == base et !forcer → « rien_a_faire », AUCUNE ingestion, AUCUNE purge', async () => {
    const ingerer = vi.fn(async () => COMPTEURS);
    const supprimerFichiers = vi.fn(async () => {});
    const listerCsv = vi.fn(async () => []);
    const finaliserRun = vi.fn(async () => {});
    const deps = makeDeps({ millesimeDistant: vi.fn(async () => ({ millesime: '2026-06', publieLe: null })), ingerer, supprimerFichiers, listerCsv, finaliserRun });

    const r = await executerVeille({ declencheur: 'manuel' }, deps);

    expect(r.statut).toBe('rien_a_faire');
    expect(ingerer).not.toHaveBeenCalled();          // AUCUNE ré-ingestion
    expect(listerCsv).not.toHaveBeenCalled();
    expect(supprimerFichiers).not.toHaveBeenCalled(); // AUCUNE purge → le cache survit
    expect(finaliserRun).toHaveBeenCalledWith(1, expect.objectContaining({ statut: 'rien_a_faire', millesimeDetecte: '2026-06' }));
  });

  it('--forcer ré-ingère même à millésime égal, purge les antérieurs', async () => {
    const ingerer = vi.fn(async () => ({ ...COMPTEURS, millesime: '2026-06' }));
    const supprimerFichiers = vi.fn(async () => {});
    const deps = makeDeps({ millesimeDistant: vi.fn(async () => ({ millesime: '2026-06', publieLe: null })), ingerer, supprimerFichiers });

    const r = await executerVeille({ declencheur: 'manuel', forcer: true }, deps);

    expect(r.statut).toBe('succes');
    expect(ingerer).toHaveBeenCalledWith('2026-06');
    // millésime courant = 2026-06 (celui ingéré) → seul l'autre (2026-07) serait purgé s'il était antérieur ; ici il est
    // « courant côté fichiers » mais c'est 2026-06 qui vient d'être ingéré → 2026-07 est traité comme antérieur.
    expect(supprimerFichiers).toHaveBeenCalledWith(['data/sitadel/logements.2026-07.csv']);
  });
});

describe('S11a-FIX — executerVeille : appel DiDo en erreur', () => {
  it('métadonnées KO → « echec », ingestion JAMAIS appelée, purge JAMAIS appelée, verrou libéré', async () => {
    const ingerer = vi.fn(async () => COMPTEURS);
    const supprimerFichiers = vi.fn(async () => {});
    const finaliserRun = vi.fn(async () => {});
    const libererVerrou = vi.fn(async () => {});
    const deps = makeDeps({
      millesimeDistant: vi.fn(async () => { throw new Error('DiDo HTTP 503'); }),
      ingerer, supprimerFichiers, finaliserRun, libererVerrou,
    });

    await expect(executerVeille({ declencheur: 'manuel' }, deps)).rejects.toThrow('DiDo HTTP 503');

    expect(finaliserRun).toHaveBeenCalledWith(1, expect.objectContaining({ statut: 'echec', erreur: 'DiDo HTTP 503' }));
    expect(ingerer).not.toHaveBeenCalled();           // PAS de repli vers le travail lourd « au cas où »
    expect(supprimerFichiers).not.toHaveBeenCalled();
    expect(libererVerrou).toHaveBeenCalledTimes(1);
  });
});

describe('DiDo — millésime annoncé mais PAS ENCORE PUBLIÉ n’est PAS une panne (rien_a_faire, pas echec)', () => {
  it('publication dans le FUTUR → « rien_a_faire » AVEC la date, AUCUNE ingestion, AUCUNE purge', async () => {
    const ingerer = vi.fn(async () => COMPTEURS);
    const supprimerFichiers = vi.fn(async () => {});
    const finaliserRun = vi.fn(async () => {});
    // maintenant() = 2026-07-28 ; distant = 2026-08 (nouveau vs base 2026-06) mais publié le 28/08 → rien à télécharger.
    const deps = makeDeps({
      millesimeDistant: vi.fn(async () => ({ millesime: '2026-08', publieLe: new Date('2026-08-28T06:45:00Z') })),
      ingerer, supprimerFichiers, finaliserRun,
    });

    const r = await executerVeille({ declencheur: 'manuel' }, deps);

    expect(r.statut).toBe('rien_a_faire');
    expect(r.raison).toMatch(/28 août 2026/);          // date RÉELLE des métadonnées, en français
    expect(r.raison).toMatch(/rien à faire/);
    expect(ingerer).not.toHaveBeenCalled();            // on ne télécharge PAS
    expect(supprimerFichiers).not.toHaveBeenCalled();  // le cache survit
    expect(finaliserRun).toHaveBeenCalledWith(1, expect.objectContaining({ statut: 'rien_a_faire', millesimeDetecte: '2026-08' }));
  });

  it('publication DÉJÀ intervenue (date passée) → comportement NORMAL inchangé (ingère, succes)', async () => {
    const ingerer = vi.fn(async () => COMPTEURS);
    const deps = makeDeps({
      millesimeDistant: vi.fn(async () => ({ millesime: '2026-07', publieLe: new Date('2026-07-01T06:45:00Z') })),
      ingerer,
    });

    const r = await executerVeille({ declencheur: 'manuel' }, deps);

    expect(r.statut).toBe('succes');
    expect(ingerer).toHaveBeenCalledWith('2026-07');
  });

  it('date de publication ABSENTE (publieLe null) → comportement NORMAL (on tente, ici succes)', async () => {
    const ingerer = vi.fn(async () => COMPTEURS);
    const deps = makeDeps({
      millesimeDistant: vi.fn(async () => ({ millesime: '2026-07', publieLe: null })),
      ingerer,
    });

    const r = await executerVeille({ declencheur: 'manuel' }, deps);

    expect(r.statut).toBe('succes');
    expect(ingerer).toHaveBeenCalledWith('2026-07');
  });

  it('CEINTURE : le téléchargement lève DiDoIndisponibleError (400 daté) → « rien_a_faire », JAMAIS « echec »', async () => {
    const finaliserRun = vi.fn(async () => {});
    const supprimerFichiers = vi.fn(async () => {});
    const libererVerrou = vi.fn(async () => {});
    const deps = makeDeps({
      // publieLe null (métadonnées muettes) → on passe la pré-vérif, on tente, et c'est le 400 daté qui rattrape.
      ingerer: vi.fn(async () => { throw new DiDoIndisponibleError('rid-x', new Date('2026-08-28T06:45:00Z')); }),
      finaliserRun, supprimerFichiers, libererVerrou,
    });

    const r = await executerVeille({ declencheur: 'manuel' }, deps);

    expect(r.statut).toBe('rien_a_faire');            // pas une panne
    expect(r.raison).toMatch(/28 août 2026/);
    expect(finaliserRun).toHaveBeenCalledWith(1, expect.objectContaining({ statut: 'rien_a_faire' }));
    expect(finaliserRun).not.toHaveBeenCalledWith(1, expect.objectContaining({ statut: 'echec' }));
    expect(supprimerFichiers).not.toHaveBeenCalled();
    expect(libererVerrou).toHaveBeenCalledTimes(1);   // verrou toujours libéré
  });
});

describe('S11a-FIX — executerVeille : échec d’ingestion', () => {
  it('laisse une ligne « echec » avec erreur, NE PURGE PAS, libère le verrou, relance', async () => {
    const finaliserRun = vi.fn(async () => {});
    const supprimerFichiers = vi.fn(async () => {});
    const libererVerrou = vi.fn(async () => {});
    const deps = makeDeps({
      ingerer: vi.fn(async () => { throw new Error('boom ingestion'); }),
      finaliserRun, supprimerFichiers, libererVerrou,
    });

    await expect(executerVeille({ declencheur: 'manuel' }, deps)).rejects.toThrow('boom ingestion');

    expect(finaliserRun).toHaveBeenCalledWith(1, expect.objectContaining({ statut: 'echec', erreur: 'boom ingestion' }));
    expect(supprimerFichiers).not.toHaveBeenCalled();
    expect(libererVerrou).toHaveBeenCalledTimes(1);
  });
});

describe('S11b — executerVeille : drapeau de demande manuelle', () => {
  it('drapeau posé (auto éteinte) → run en « manuel », insererRun consomme le drapeau au démarrage', async () => {
    const insererRun = vi.fn(async () => 1);
    const deps = makeDeps({
      chargerConfig: vi.fn(async () => ({ autoActive: false, autoIntervalleHeures: 24, csvRetentionJours: 0, runDemandeLe: new Date('2026-07-28T11:59:00Z') })),
      insererRun,
    });

    const r = await executerVeille({ declencheur: 'planifie' }, deps);

    expect(r.statut).toBe('succes');
    // le run porte 'manuel' (le drapeau l'emporte) — insererRun (qui, en réel, remet le drapeau à NULL dans SA
    // transaction) est appelé avec 'manuel' AU DÉMARRAGE, avant tout travail.
    expect(insererRun).toHaveBeenCalledWith('manuel', expect.any(Date));
  });

  it('un ÉCHEC ne laisse pas le drapeau armé : insererRun (qui le consomme) est appelé AVANT l’échec', async () => {
    const insererRun = vi.fn(async () => 1);
    const finaliserRun = vi.fn(async () => {});
    const deps = makeDeps({
      chargerConfig: vi.fn(async () => ({ autoActive: false, autoIntervalleHeures: 24, csvRetentionJours: 0, runDemandeLe: new Date('2026-07-28T11:59:00Z') })),
      insererRun, finaliserRun,
      ingerer: vi.fn(async () => { throw new Error('boom'); }),
    });

    await expect(executerVeille({ declencheur: 'planifie' }, deps)).rejects.toThrow('boom');

    expect(insererRun).toHaveBeenCalledWith('manuel', expect.any(Date)); // drapeau consommé au démarrage
    expect(finaliserRun).toHaveBeenCalledWith(1, expect.objectContaining({ statut: 'echec' }));
  });
});

describe('R7 — executerVeille : relève automatique branchée, ISOLÉE, sous le verrou', () => {
  it('une relève qui ÉCHOUE (throw) n’empêche PAS la veille de finaliser en « succes »', async () => {
    const releveAuto = vi.fn(async () => { throw new Error('IMAP KO'); });
    const finaliserRun = vi.fn(async () => {});
    const libererVerrou = vi.fn(async () => {});
    const deps = makeDeps({ releveAuto, finaliserRun, libererVerrou });

    const r = await executerVeille({ declencheur: 'manuel' }, deps);

    expect(releveAuto).toHaveBeenCalledTimes(1);
    expect(r.statut).toBe('succes'); // la veille n'est PAS contaminée par l'échec de relève
    expect(finaliserRun).toHaveBeenCalledWith(1, expect.objectContaining({ statut: 'succes' }));
    expect(libererVerrou).toHaveBeenCalledTimes(1); // verrou toujours libéré
  });

  it('la relève tourne AUSSI quand la veille Sitadel n’a « rien à faire » (millésime inchangé)', async () => {
    const releveAuto = vi.fn(async () => {});
    // distant == base → la veille sort en « rien_a_faire », mais la relève (placée avant §2/§4) a déjà tourné.
    const deps = makeDeps({ releveAuto, millesimeDistant: vi.fn(async () => ({ millesime: '2026-06', publieLe: null })) });

    const r = await executerVeille({ declencheur: 'manuel' }, deps);

    expect(r.statut).toBe('rien_a_faire');
    expect(releveAuto).toHaveBeenCalledTimes(1);
  });

  it('verrou déjà pris → la relève n’est PAS tentée (sortie avant le corps, sous le verrou)', async () => {
    const releveAuto = vi.fn(async () => {});
    const deps = makeDeps({ acquerirVerrou: vi.fn(async () => false), releveAuto });

    const r = await executerVeille({ declencheur: 'planifie' }, deps);

    expect(r.statut).toBe('rien_a_faire');
    expect(releveAuto).not.toHaveBeenCalled();
  });
});

describe('R6 — executerVeille : relève APPROFONDIE branchée, ISOLÉE, après la relève courante', () => {
  it('une approfondie qui ÉCHOUE (throw) n’empêche PAS la veille de finaliser en « succes »', async () => {
    const echeanceApprofondie = vi.fn(async () => { throw new Error('IMAP KO'); });
    const finaliserRun = vi.fn(async () => {});
    const libererVerrou = vi.fn(async () => {});
    const deps = makeDeps({ echeanceApprofondie, finaliserRun, libererVerrou });

    const r = await executerVeille({ declencheur: 'manuel' }, deps);

    expect(echeanceApprofondie).toHaveBeenCalledTimes(1);
    expect(r.statut).toBe('succes');
    expect(libererVerrou).toHaveBeenCalledTimes(1);
  });

  it('la relève COURANTE (§1bis) tourne AVANT l’approfondie (§1ter)', async () => {
    const ordre: string[] = [];
    const releveAuto = vi.fn(async () => { ordre.push('courante'); });
    const echeanceApprofondie = vi.fn(async () => { ordre.push('approfondie'); });
    const deps = makeDeps({ releveAuto, echeanceApprofondie });

    await executerVeille({ declencheur: 'manuel' }, deps);

    expect(ordre).toEqual(['courante', 'approfondie']); // fraîcheur d'abord, puis regard approfondi
  });

  it('verrou déjà pris → l’approfondie n’est PAS tentée (sortie avant le corps)', async () => {
    const echeanceApprofondie = vi.fn(async () => {});
    const deps = makeDeps({ acquerirVerrou: vi.fn(async () => false), echeanceApprofondie });

    const r = await executerVeille({ declencheur: 'planifie' }, deps);

    expect(r.statut).toBe('rien_a_faire');
    expect(echeanceApprofondie).not.toHaveBeenCalled();
  });
});

describe('R6b — executerVeille : génération de relance branchée, ISOLÉE, après l’approfondie', () => {
  it('une génération de relance qui ÉCHOUE (throw) n’empêche PAS la veille de finaliser en « succes »', async () => {
    const relanceEcheance = vi.fn(async () => { throw new Error('DB KO'); });
    const finaliserRun = vi.fn(async () => {});
    const deps = makeDeps({ relanceEcheance, finaliserRun });

    const r = await executerVeille({ declencheur: 'manuel' }, deps);

    expect(relanceEcheance).toHaveBeenCalledTimes(1);
    expect(r.statut).toBe('succes');
    expect(finaliserRun).toHaveBeenCalledWith(1, expect.objectContaining({ statut: 'succes' }));
  });

  it('ordre : relève courante → approfondie → relance (chacune avant la suivante)', async () => {
    const ordre: string[] = [];
    const deps = makeDeps({
      releveAuto: vi.fn(async () => { ordre.push('courante'); }),
      echeanceApprofondie: vi.fn(async () => { ordre.push('approfondie'); }),
      relanceEcheance: vi.fn(async () => { ordre.push('relance'); }),
    });

    await executerVeille({ declencheur: 'manuel' }, deps);

    expect(ordre).toEqual(['courante', 'approfondie', 'relance']);
  });

  it('verrou déjà pris → la génération de relance n’est PAS tentée', async () => {
    const relanceEcheance = vi.fn(async () => {});
    const deps = makeDeps({ acquerirVerrou: vi.fn(async () => false), relanceEcheance });

    const r = await executerVeille({ declencheur: 'planifie' }, deps);

    expect(r.statut).toBe('rien_a_faire');
    expect(relanceEcheance).not.toHaveBeenCalled();
  });
});

describe('R8 — executerVeille : alerte quotidienne branchée, ISOLÉE, après les relances', () => {
  it('une alerte qui ÉCHOUE (throw) n’empêche PAS la veille de finaliser en « succes »', async () => {
    const alerteQuotidienne = vi.fn(async () => { throw new Error('SMTP KO'); });
    const finaliserRun = vi.fn(async () => {});
    const deps = makeDeps({ alerteQuotidienne, finaliserRun });

    const r = await executerVeille({ declencheur: 'manuel' }, deps);

    expect(alerteQuotidienne).toHaveBeenCalledTimes(1);
    expect(r.statut).toBe('succes');
    expect(finaliserRun).toHaveBeenCalledWith(1, expect.objectContaining({ statut: 'succes' }));
  });

  it('ordre : relève courante → approfondie → relance → alerte', async () => {
    const ordre: string[] = [];
    const deps = makeDeps({
      releveAuto: vi.fn(async () => { ordre.push('courante'); }),
      echeanceApprofondie: vi.fn(async () => { ordre.push('approfondie'); }),
      relanceEcheance: vi.fn(async () => { ordre.push('relance'); }),
      alerteQuotidienne: vi.fn(async () => { ordre.push('alerte'); }),
    });

    await executerVeille({ declencheur: 'manuel' }, deps);

    expect(ordre).toEqual(['courante', 'approfondie', 'relance', 'alerte']);
  });

  it('verrou déjà pris → l’alerte n’est PAS tentée', async () => {
    const alerteQuotidienne = vi.fn(async () => {});
    const deps = makeDeps({ acquerirVerrou: vi.fn(async () => false), alerteQuotidienne });

    const r = await executerVeille({ declencheur: 'planifie' }, deps);

    expect(r.statut).toBe('rien_a_faire');
    expect(alerteQuotidienne).not.toHaveBeenCalled();
  });
});

describe('X5 — executerVeille : propositions CADA branchées, ISOLÉES, après l’alerte', () => {
  it('une proposition qui ÉCHOUE (throw) n’empêche PAS la veille de finaliser en « succes »', async () => {
    const propositionCada = vi.fn(async () => { throw new Error('SMTP KO'); });
    const finaliserRun = vi.fn(async () => {});
    const deps = makeDeps({ propositionCada, finaliserRun });

    const r = await executerVeille({ declencheur: 'manuel' }, deps);

    expect(propositionCada).toHaveBeenCalledTimes(1);
    expect(r.statut).toBe('succes'); // la veille n'est PAS contaminée par l'échec de la proposition
    expect(finaliserRun).toHaveBeenCalledWith(1, expect.objectContaining({ statut: 'succes' }));
  });

  it('ordre : relève → approfondie → relance → alerte → proposition (dernière étape auto)', async () => {
    const ordre: string[] = [];
    const deps = makeDeps({
      releveAuto: vi.fn(async () => { ordre.push('courante'); }),
      echeanceApprofondie: vi.fn(async () => { ordre.push('approfondie'); }),
      relanceEcheance: vi.fn(async () => { ordre.push('relance'); }),
      alerteQuotidienne: vi.fn(async () => { ordre.push('alerte'); }),
      propositionCada: vi.fn(async () => { ordre.push('proposition'); }),
    });

    await executerVeille({ declencheur: 'manuel' }, deps);

    expect(ordre).toEqual(['courante', 'approfondie', 'relance', 'alerte', 'proposition']);
  });

  it('verrou déjà pris → la proposition n’est PAS tentée', async () => {
    const propositionCada = vi.fn(async () => {});
    const deps = makeDeps({ acquerirVerrou: vi.fn(async () => false), propositionCada });

    await executerVeille({ declencheur: 'planifie' }, deps);

    expect(propositionCada).not.toHaveBeenCalled();
  });
});

describe('S11a-FIX — executerVeille : garde d’intervalle (planifie)', () => {
  it('auto éteinte + planifie → « rien_a_faire » sans insérer de run ni toucher le réseau', async () => {
    const insererRun = vi.fn(async () => 1);
    const millesimeDistant = vi.fn(async () => ({ millesime: '2026-07', publieLe: null }));
    const deps = makeDeps({
      chargerConfig: vi.fn(async () => ({ autoActive: false, autoIntervalleHeures: 24, csvRetentionJours: 0, runDemandeLe: null })),
      insererRun, millesimeDistant,
    });

    const r = await executerVeille({ declencheur: 'planifie' }, deps);

    expect(r.statut).toBe('rien_a_faire');
    expect(r.raison).toContain('auto_active = false');
    expect(insererRun).not.toHaveBeenCalled();
    expect(millesimeDistant).not.toHaveBeenCalled();
  });
});

describe('T7-B — executerVeille : alerte « action requise » (cas ③) branchée, ISOLÉE, après les alertes GED', () => {
  it('une alerte action qui ÉCHOUE (throw) n’empêche PAS la veille de finaliser en « succes »', async () => {
    const alerteAction = vi.fn(async () => { throw new Error('SMTP KO'); });
    const finaliserRun = vi.fn(async () => {});
    const libererVerrou = vi.fn(async () => {});
    const deps = makeDeps({ alerteAction, finaliserRun, libererVerrou });

    const r = await executerVeille({ declencheur: 'manuel' }, deps);

    expect(alerteAction).toHaveBeenCalledTimes(1);
    expect(r.statut).toBe('succes');
    expect(libererVerrou).toHaveBeenCalledTimes(1);
  });

  it('l’alerte GED (§1septies) tourne AVANT l’alerte action (§1octies)', async () => {
    const ordre: string[] = [];
    const alerteGed = vi.fn(async () => { ordre.push('ged'); });
    const alerteAction = vi.fn(async () => { ordre.push('action'); });
    const deps = makeDeps({ alerteGed, alerteAction });

    await executerVeille({ declencheur: 'manuel' }, deps);

    expect(ordre).toEqual(['ged', 'action']);
  });

  it('verrou déjà pris → l’alerte action n’est PAS tentée (sortie avant le corps)', async () => {
    const alerteAction = vi.fn(async () => {});
    const deps = makeDeps({ acquerirVerrou: vi.fn(async () => false), alerteAction });

    const r = await executerVeille({ declencheur: 'planifie' }, deps);

    expect(r.statut).toBe('rien_a_faire');
    expect(alerteAction).not.toHaveBeenCalled();
  });
});

describe('T7-C — executerVeille : pré-cochage « répondu » branché, ISOLÉ, après l’alerte action', () => {
  it('un pré-cochage qui ÉCHOUE (throw) n’empêche PAS la veille de finaliser en « succes »', async () => {
    const preCochageRepondu = vi.fn(async () => { throw new Error('IMAP KO'); });
    const finaliserRun = vi.fn(async () => {});
    const libererVerrou = vi.fn(async () => {});
    const deps = makeDeps({ preCochageRepondu, finaliserRun, libererVerrou });

    const r = await executerVeille({ declencheur: 'manuel' }, deps);

    expect(preCochageRepondu).toHaveBeenCalledTimes(1);
    expect(r.statut).toBe('succes');
    expect(libererVerrou).toHaveBeenCalledTimes(1);
  });

  it('l’alerte action (§1octies) tourne AVANT le pré-cochage (§1nonies)', async () => {
    const ordre: string[] = [];
    const alerteAction = vi.fn(async () => { ordre.push('action'); });
    const preCochageRepondu = vi.fn(async () => { ordre.push('precochage'); });
    const deps = makeDeps({ alerteAction, preCochageRepondu });

    await executerVeille({ declencheur: 'manuel' }, deps);

    expect(ordre).toEqual(['action', 'precochage']);
  });

  it('verrou déjà pris → le pré-cochage n’est PAS tenté (sortie avant le corps)', async () => {
    const preCochageRepondu = vi.fn(async () => {});
    const deps = makeDeps({ acquerirVerrou: vi.fn(async () => false), preCochageRepondu });

    const r = await executerVeille({ declencheur: 'planifie' }, deps);

    expect(r.statut).toBe('rien_a_faire');
    expect(preCochageRepondu).not.toHaveBeenCalled();
  });
});

describe('RELANCE lot 6 — executerVeille : envoi automatique branché (§1decies), ISOLÉ, après le pré-cochage', () => {
  it('un envoi auto qui ÉCHOUE (throw) n’empêche PAS la veille de finaliser en « succes »', async () => {
    const envoiAuto = vi.fn(async () => { throw new Error('SMTP mairie KO'); });
    const libererVerrou = vi.fn(async () => {});
    const deps = makeDeps({ envoiAuto, libererVerrou });

    const r = await executerVeille({ declencheur: 'manuel' }, deps);

    expect(envoiAuto).toHaveBeenCalledTimes(1);
    expect(r.statut).toBe('succes');        // isolation : un échec d'envoi ne fait jamais échouer la veille
    expect(libererVerrou).toHaveBeenCalledTimes(1);
  });

  it('l’envoi auto tourne APRÈS le pré-cochage (§1nonies → §1decies)', async () => {
    const ordre: string[] = [];
    const preCochageRepondu = vi.fn(async () => { ordre.push('precochage'); });
    const envoiAuto = vi.fn(async () => { ordre.push('envoiauto'); });
    const deps = makeDeps({ preCochageRepondu, envoiAuto });

    await executerVeille({ declencheur: 'manuel' }, deps);

    expect(ordre).toEqual(['precochage', 'envoiauto']);
  });

  it('verrou déjà pris → l’envoi auto n’est PAS tenté (sortie avant le corps)', async () => {
    const envoiAuto = vi.fn(async () => {});
    const deps = makeDeps({ acquerirVerrou: vi.fn(async () => false), envoiAuto });

    const r = await executerVeille({ declencheur: 'planifie' }, deps);

    expect(r.statut).toBe('rien_a_faire');
    expect(envoiAuto).not.toHaveBeenCalled();
  });
});

describe('ATT-BATI — executerVeille : rappel « attente de bâti » branché, ISOLÉ, indépendant de RATT-AUTO', () => {
  it('un rappel qui ÉCHOUE (throw) n’empêche PAS la veille de finaliser en « succes »', async () => {
    const alerteAttenteBati = vi.fn(async () => { throw new Error('SMTP KO'); });
    const finaliserRun = vi.fn(async () => {});
    const libererVerrou = vi.fn(async () => {});
    const deps = makeDeps({ alerteAttenteBati, finaliserRun, libererVerrou });

    const r = await executerVeille({ declencheur: 'manuel' }, deps);

    expect(alerteAttenteBati).toHaveBeenCalledTimes(1);
    expect(r.statut).toBe('succes');
    expect(libererVerrou).toHaveBeenCalledTimes(1);
  });

  it('le rappel part MÊME quand RATT-AUTO échoue (indépendance : familles distinctes, isolation propre)', async () => {
    const alerteAttenteBati = vi.fn(async () => {});
    const suiviRattachementAuto = vi.fn(async () => { throw new Error('rejeu KO'); });
    const deps = makeDeps({ alerteAttenteBati, suiviRattachementAuto });

    const r = await executerVeille({ declencheur: 'manuel' }, deps);

    expect(suiviRattachementAuto).toHaveBeenCalledTimes(1); // RATT-AUTO a tenté puis échoué (isolé)
    expect(alerteAttenteBati).toHaveBeenCalledTimes(1);      // le rappel part quand même
    expect(r.statut).toBe('succes');
  });

  it('verrou déjà pris → le rappel n’est PAS tenté (sortie avant le corps)', async () => {
    const alerteAttenteBati = vi.fn(async () => {});
    const deps = makeDeps({ acquerirVerrou: vi.fn(async () => false), alerteAttenteBati });

    const r = await executerVeille({ declencheur: 'planifie' }, deps);

    expect(r.statut).toBe('rien_a_faire');
    expect(alerteAttenteBati).not.toHaveBeenCalled();
  });
});

describe('ALERTE obstacle disparu — executerVeille : brique branchée, ISOLÉE (données)', () => {
  it('une alerte qui ÉCHOUE (throw) n’empêche PAS la veille de finaliser en « succes »', async () => {
    const alerteObstacleDisparu = vi.fn(async () => { throw new Error('SMTP KO'); });
    const finaliserRun = vi.fn(async () => {});
    const libererVerrou = vi.fn(async () => {});
    const deps = makeDeps({ alerteObstacleDisparu, finaliserRun, libererVerrou });
    const r = await executerVeille({ declencheur: 'manuel' }, deps);
    expect(alerteObstacleDisparu).toHaveBeenCalledTimes(1);
    expect(r.statut).toBe('succes');
    expect(libererVerrou).toHaveBeenCalledTimes(1);
  });

  it('verrou déjà pris → l’alerte n’est PAS tentée', async () => {
    const alerteObstacleDisparu = vi.fn(async () => {});
    const deps = makeDeps({ acquerirVerrou: vi.fn(async () => false), alerteObstacleDisparu });
    const r = await executerVeille({ declencheur: 'planifie' }, deps);
    expect(r.statut).toBe('rien_a_faire');
    expect(alerteObstacleDisparu).not.toHaveBeenCalled();
  });
});

describe('RATT-AUTO — executerVeille : rejeu automatique du suivi branché, ISOLÉ, après l’ingestion nocturne', () => {
  it('un rejeu qui ÉCHOUE (throw) n’empêche PAS la veille de finaliser en « succes »', async () => {
    const suiviRattachementAuto = vi.fn(async () => { throw new Error('suivi KO'); });
    const finaliserRun = vi.fn(async () => {});
    const libererVerrou = vi.fn(async () => {});
    const deps = makeDeps({ suiviRattachementAuto, finaliserRun, libererVerrou });

    const r = await executerVeille({ declencheur: 'manuel' }, deps);

    expect(suiviRattachementAuto).toHaveBeenCalledTimes(1);
    expect(r.statut).toBe('succes');           // isolation : un échec de rejeu ne fait jamais échouer la veille
    expect(libererVerrou).toHaveBeenCalledTimes(1);
  });

  it('le rejeu tourne APRÈS l’ingestion automatique (§1duodecies → §1duodecies-bis)', async () => {
    const ordre: string[] = [];
    const ingestionAuto = vi.fn(async () => { ordre.push('ingestion'); });
    const suiviRattachementAuto = vi.fn(async () => { ordre.push('suivi'); });
    const deps = makeDeps({ ingestionAuto, suiviRattachementAuto });

    await executerVeille({ declencheur: 'manuel' }, deps);

    expect(ordre).toEqual(['ingestion', 'suivi']); // une édition fraîchement ingérée est aussitôt re-détectée
  });

  it('verrou déjà pris → le rejeu n’est PAS tenté (sortie avant le corps)', async () => {
    const suiviRattachementAuto = vi.fn(async () => {});
    const deps = makeDeps({ acquerirVerrou: vi.fn(async () => false), suiviRattachementAuto });

    const r = await executerVeille({ declencheur: 'planifie' }, deps);

    expect(r.statut).toBe('rien_a_faire');
    expect(suiviRattachementAuto).not.toHaveBeenCalled();
  });
});

describe('H1 — GARDE PAR FAMILLE (sûreté : une passe « donnees » n’envoie JAMAIS de courrier mairie)', () => {
  // Étapes (A) mairies/permis — dont envoiAuto (§1decies), le SEUL envoi vers des tiers.
  const A = ['releveAuto', 'echeanceApprofondie', 'relanceEcheance', 'alerteQuotidienne', 'propositionCada', 'alerteGed', 'alerteAttenteBati', 'alerteAction', 'preCochageRepondu', 'envoiAuto'] as const;
  // Étapes (B) sources de données — dont RATT-AUTO (rejeu du suivi APRÈS l'ingestion, famille « donnees »).
  const B = ['detecterEditions', 'ingestionAuto', 'suiviRattachementAuto', 'alerteMisesAJour', 'alerteObstacleDisparu'] as const;

  function depsAvecEspions(over: Partial<DepsVeille> = {}) {
    const espions: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const k of [...A, ...B]) espions[k] = vi.fn(async () => {});
    const deps = makeDeps({ ...(espions as Partial<DepsVeille>), ...over });
    return { deps, espions };
  }

  it('--famille=donnees → AUCUNE étape (A) (notamment envoiAuto) ; (B) OUI ; cœur Sitadel NON exécuté', async () => {
    const { deps, espions } = depsAvecEspions();
    await executerVeille({ declencheur: 'manuel', famille: 'donnees' }, deps);
    for (const k of A) expect(espions[k], `${k} (A) ne doit PAS être appelée`).not.toHaveBeenCalled();
    for (const k of B) expect(espions[k], `${k} (B) doit être appelée`).toHaveBeenCalled();
    expect(deps.millesimeDistant).not.toHaveBeenCalled(); // cœur Sitadel (C→A) sauté
    expect(deps.ingerer).not.toHaveBeenCalled();
    expect(deps.insererRun).not.toHaveBeenCalled();
  });

  it('--famille=mairies → AUCUNE étape (B) ; (A) OUI ; cœur Sitadel exécuté', async () => {
    const { deps, espions } = depsAvecEspions();
    await executerVeille({ declencheur: 'manuel', famille: 'mairies' }, deps);
    for (const k of B) expect(espions[k], `${k} (B) ne doit PAS être appelée`).not.toHaveBeenCalled();
    for (const k of A) expect(espions[k], `${k} (A) doit être appelée`).toHaveBeenCalled();
    expect(deps.millesimeDistant).toHaveBeenCalled(); // cœur Sitadel exécuté
  });

  it('sans famille → comportement STRICTEMENT inchangé : toutes les étapes (A) ET (B) appelées + cœur Sitadel', async () => {
    const { deps, espions } = depsAvecEspions();
    await executerVeille({ declencheur: 'manuel' }, deps);
    for (const k of [...A, ...B]) expect(espions[k], `${k} doit être appelée`).toHaveBeenCalled();
    expect(deps.millesimeDistant).toHaveBeenCalled();
  });
});

describe('H1 — parserFamille : valeur inconnue REFUSÉE (jamais un repli silencieux sur « tout »)', () => {
  it('absent → undefined (TOUT, inchangé)', async () => {
    const { parserFamille } = await import('./executerVeille');
    expect(parserFamille([])).toBeUndefined();
    expect(parserFamille(['--forcer'])).toBeUndefined();
  });
  it('valeurs acceptées', async () => {
    const { parserFamille } = await import('./executerVeille');
    expect(parserFamille(['--famille=mairies'])).toBe('mairies');
    expect(parserFamille(['--famille=donnees'])).toBe('donnees');
  });
  it('valeur inconnue → LÈVE (pas de repli sur « tout »)', async () => {
    const { parserFamille } = await import('./executerVeille');
    expect(() => parserFamille(['--famille=nimportequoi'])).toThrow(/invalide/);
    expect(() => parserFamille(['--famille'])).toThrow(/invalide/); // sans valeur → refus aussi
  });
});
