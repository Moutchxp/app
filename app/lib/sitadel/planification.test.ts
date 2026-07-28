import { describe, it, expect } from 'vitest';
import {
  doitSExecuter, millesimeEstNouveau, fichiersCsvAPurger, resumeRun,
  prochainPassage, ordonnanceurSuspect, dureeRun, messageDemandeManuelle,
  millesimeFige, echecsConsecutifs,
  type ConfigAuto, type RunVeille,
} from './planification';

const CFG = (over: Partial<ConfigAuto> = {}): ConfigAuto => ({ autoActive: true, autoIntervalleHeures: 24, runDemandeLe: null, ...over });
const T = (iso: string) => new Date(iso);

describe('S11a — doitSExecuter (planification pure, raison chiffrée)', () => {
  const maintenant = T('2026-07-28T12:00:00Z');

  it('automatisation éteinte → NON', () => {
    const d = doitSExecuter(T('2026-07-01T12:00:00Z'), maintenant, CFG({ autoActive: false }));
    expect(d.executer).toBe(false);
    expect(d.raison).toContain('auto_active = false');
  });

  it('aucun run réussi antérieur → OUI', () => {
    const d = doitSExecuter(null, maintenant, CFG());
    expect(d.executer).toBe(true);
    expect(d.raison).toContain('aucun run réussi');
  });

  it('intervalle NON écoulé → NON, avec les heures restantes dans la raison', () => {
    const d = doitSExecuter(T('2026-07-28T06:00:00Z'), maintenant, CFG({ autoIntervalleHeures: 24 })); // 6 h écoulées
    expect(d.executer).toBe(false);
    expect(d.raison).toContain('6 h');
    expect(d.raison).toMatch(/prochain dans ~\d+ h/); // heures restantes chiffrées
  });

  it('intervalle écoulé → OUI', () => {
    const d = doitSExecuter(T('2026-07-27T06:00:00Z'), maintenant, CFG({ autoIntervalleHeures: 24 })); // 30 h
    expect(d.executer).toBe(true);
    expect(d.raison).toContain('≥ intervalle 24 h');
  });

  it('un échec ne bloque pas : le caller passe le dernier SUCCÈS (null si aucun) → OUI', () => {
    // dernier run = échec → dernierSucces reste null → on réessaie.
    expect(doitSExecuter(null, maintenant, CFG()).executer).toBe(true);
  });

  it('déclencheur par défaut = « planifie »', () => {
    expect(doitSExecuter(null, maintenant, CFG()).declencheur).toBe('planifie');
    expect(doitSExecuter(T('2026-07-28T06:00:00Z'), maintenant, CFG()).declencheur).toBe('planifie');
  });
});

describe('S11b — doitSExecuter : drapeau de demande manuelle prioritaire', () => {
  const maintenant = T('2026-07-28T12:00:00Z');
  const demande = T('2026-07-28T11:59:00Z');

  it('drapeau posé → EXÉCUTER en « manuel », même auto éteinte ET intervalle non écoulé', () => {
    const d = doitSExecuter(T('2026-07-28T11:00:00Z'), maintenant, CFG({ autoActive: false, autoIntervalleHeures: 24, runDemandeLe: demande }));
    expect(d.executer).toBe(true);
    expect(d.declencheur).toBe('manuel');
    expect(d.raison).toContain('demande manuelle du');
    expect(d.raison).toContain(demande.toISOString()); // horodatage chiffré
  });

  it('ordre de priorité : drapeau AVANT auto_active AVANT intervalle', () => {
    // sans drapeau, auto éteinte → NON (le drapeau ne l'emporte que s'il est posé)
    expect(doitSExecuter(null, maintenant, CFG({ autoActive: false, runDemandeLe: null })).executer).toBe(false);
    // drapeau posé l'emporte
    expect(doitSExecuter(null, maintenant, CFG({ autoActive: false, runDemandeLe: demande })).executer).toBe(true);
  });
});

describe('S11b — prochainPassage', () => {
  const maintenant = T('2026-07-28T12:00:00Z');
  it('auto éteinte → aucune date', () => {
    const p = prochainPassage(T('2026-07-28T00:00:00Z'), CFG({ autoActive: false }), maintenant);
    expect(p.date).toBeNull();
    expect(p.phrase).toContain('éteinte');
  });
  it('aucun run antérieur → dès le prochain passage', () => {
    const p = prochainPassage(null, CFG(), maintenant);
    expect(p.date).toEqual(maintenant);
    expect(p.phrase).toContain('dès le prochain passage');
  });
  it('intervalle modifié → date = dernier succès + intervalle', () => {
    const p = prochainPassage(T('2026-07-28T06:00:00Z'), CFG({ autoIntervalleHeures: 12 }), maintenant); // +12h → 18:00
    expect(p.date).toEqual(T('2026-07-28T18:00:00Z'));
    expect(p.phrase).toMatch(/dans ~\d+ h/);
  });
  it('échéance dépassée → « dès le prochain passage »', () => {
    const p = prochainPassage(T('2026-07-26T06:00:00Z'), CFG({ autoIntervalleHeures: 24 }), maintenant);
    expect(p.phrase).toContain('échéance atteinte');
  });
  it('demande manuelle en attente → au prochain passage', () => {
    const p = prochainPassage(null, CFG({ runDemandeLe: maintenant }), maintenant);
    expect(p.phrase).toContain('demande manuelle en attente');
  });
});

describe('S11b — ordonnanceurSuspect', () => {
  const maintenant = T('2026-07-28T12:00:00Z');
  it('auto éteinte → jamais suspect', () => {
    expect(ordonnanceurSuspect(null, CFG({ autoActive: false }), maintenant).suspect).toBe(false);
  });
  it('auto active + aucun passage → suspect', () => {
    const s = ordonnanceurSuspect(null, CFG(), maintenant);
    expect(s.suspect).toBe(true);
    expect(s.message).toContain('ordonnanceur');
  });
  it('dernier passage > 2× intervalle → suspect avec les heures', () => {
    const s = ordonnanceurSuspect(T('2026-07-24T12:00:00Z'), CFG({ autoIntervalleHeures: 24 }), maintenant); // 96 h > 48 h
    expect(s.suspect).toBe(true);
    expect(s.message).toMatch(/depuis \d/);
  });
  it('dernier passage récent (< 2× intervalle) → non suspect', () => {
    expect(ordonnanceurSuspect(T('2026-07-28T06:00:00Z'), CFG({ autoIntervalleHeures: 24 }), maintenant).suspect).toBe(false);
  });
});

describe('S11b — dureeRun & messageDemandeManuelle', () => {
  it('durée lisible, — si incohérent', () => {
    expect(dureeRun('2026-07-28T12:00:00Z', '2026-07-28T12:00:42Z')).toBe('42 s');
    expect(dureeRun('2026-07-28T12:00:00Z', '2026-07-28T12:07:05Z')).toBe('7 min 5 s');
    expect(dureeRun(null, '2026-07-28T12:00:00Z')).toBe('—');
    expect(dureeRun('2026-07-28T12:00:00Z', '2026-07-28T11:00:00Z')).toBe('—'); // fin avant début
  });
  it('message « lancer maintenant » ne prétend JAMAIS un démarrage immédiat', () => {
    for (const m of [messageDemandeManuelle(false), messageDemandeManuelle(true)]) {
      expect(m).toContain('au prochain passage');
      expect(m.toLowerCase()).not.toContain('démarre à l’instant'.toLowerCase());
      expect(m).not.toMatch(/en cours d.exécution|démarré/i);
    }
    expect(messageDemandeManuelle(true)).toContain('déjà en attente');
  });
});

describe('S11a — millesimeEstNouveau', () => {
  it('aucun millésime en base → nouveau', () => {
    const r = millesimeEstNouveau(null, '2026-06');
    expect(r.nouveau).toBe(true);
    expect(r.raison).toContain('aucun millésime en base');
  });
  it('millésime différent → nouveau', () => {
    expect(millesimeEstNouveau('2026-06', '2026-07').nouveau).toBe(true);
  });
  it('millésime identique → pas nouveau', () => {
    const r = millesimeEstNouveau('2026-06', '2026-06');
    expect(r.nouveau).toBe(false);
    expect(r.raison).toContain('déjà à jour');
  });
});

describe('S11a-FIX — fichiersCsvAPurger (protège le millésime courant)', () => {
  const maintenant = T('2026-07-28T12:00:00Z');
  const COURANT = '2026-07';
  const f = (chemin: string, iso: string, millesime: string) => ({ chemin, mtime: T(iso), millesime });

  it('aucun fichier → aucune purge', () => {
    expect(fichiersCsvAPurger([], maintenant, 0, COURANT)).toEqual([]);
    expect(fichiersCsvAPurger([], maintenant, 30, COURANT)).toEqual([]);
  });

  it('le millésime COURANT n’est JAMAIS purgé, même très ancien, même rétention 0', () => {
    const fichiers = [
      f('courant.csv', '2000-01-01T00:00:00Z', COURANT), // ancien mais = millésime en base → protégé
      f('anterieur.csv', '2000-01-01T00:00:00Z', '2026-06'),
    ];
    expect(fichiersCsvAPurger(fichiers, maintenant, 0, COURANT)).toEqual(['anterieur.csv']);
    expect(fichiersCsvAPurger(fichiers, maintenant, 30, COURANT)).toEqual(['anterieur.csv']);
  });

  it('rétention 0 → tous les ANTÉRIEURS (le courant reste)', () => {
    const fichiers = [f('a.2026-07.csv', '2026-07-28T11:00:00Z', COURANT), f('b.2026-06.csv', '2020-01-01T00:00:00Z', '2026-06')];
    expect(fichiersCsvAPurger(fichiers, maintenant, 0, COURANT)).toEqual(['b.2026-06.csv']);
  });

  it('rétention N → antérieurs plus vieux que N jours ; récent/futur/courant conservés', () => {
    const fichiers = [
      f('vieux.csv', '2026-05-01T00:00:00Z', '2026-05'),  // ~88 j → purgé
      f('recent.csv', '2026-07-27T00:00:00Z', '2026-06'), // ~1,5 j → conservé
      f('futur.csv', '2026-08-10T00:00:00Z', '2026-06'),  // futur → conservé
      f('courant.csv', '2020-01-01T00:00:00Z', COURANT),  // courant → conservé
    ];
    expect(fichiersCsvAPurger(fichiers, maintenant, 30, COURANT)).toEqual(['vieux.csv']);
  });
});

describe('S11a — resumeRun (phrase lisible, jamais figée)', () => {
  const base: RunVeille = {
    declencheur: 'planifie', statut: 'succes', demarreLe: '2026-07-28 12:00:00+00', finiLe: '2026-07-28 12:05:00+00',
    millesimeDetecte: '2026-06', millesimeIngere: '2026-06', lignesLues: 2875592, dossiersRetenus: 29670,
    dossiersNouveaux: 0, message: 'millésime 2026-06 ingéré', erreur: null,
  };
  it('succès → statut, millésime et compteurs', () => {
    const s = resumeRun(base);
    expect(s).toContain('[succes]');
    expect(s).toContain('millésime 2026-06');
    expect(s).toContain('2875592 lues');
    expect(s).toContain('29670 retenus');
    expect(s).toContain('0 nouveaux');
  });
  it('échec → le motif d’erreur est présent', () => {
    const s = resumeRun({ ...base, statut: 'echec', erreur: 'DiDo HTTP 503', message: null });
    expect(s).toContain('[echec]');
    expect(s).toContain('DiDo HTTP 503');
  });
});

describe('S11c — millesimeFige (prudent, chiffré)', () => {
  const now = T('2026-07-28T12:00:00Z');

  it('sous le seuil → pas d’alerte', () => {
    const r = millesimeFige(T('2026-07-20T12:00:00Z'), '2026-07', now, 35); // 8 j
    expect(r.alerte).toBe(false);
    expect(r.jours).toBe(8);
  });

  it('au-dessus du seuil → alerte, avec les jours, le millésime, et un texte PRUDENT (jamais « cassé »)', () => {
    const r = millesimeFige(T('2026-06-01T12:00:00Z'), '2026-05', now, 35); // ~57 j
    expect(r.alerte).toBe(true);
    expect(r.jours).toBeGreaterThanOrEqual(35);
    expect(r.phrase).toContain('2026-05');
    expect(r.phrase).toContain(`${r.jours} j`);
    expect(r.phrase).toContain('vérifie la source');
    expect(r.phrase).not.toMatch(/cassé|panne|en échec/i);
  });

  it('une suite de « rien_a_faire » ne remet PAS à zéro : la date reste celle du dernier AVANCE (ancienne) → alerte', () => {
    // La date d'entrée = min(fini_le) d'un run 'succes' ayant ingéré ce millésime (côté route) ; les 'rien_a_faire'
    // ultérieurs ne la modifient pas → l'alerte se déclenche bien.
    expect(millesimeFige(T('2026-06-10T12:00:00Z'), '2026-06', now, 35).alerte).toBe(true);
  });

  it('un run qui fait avancer le millésime remet à zéro : date récente → pas d’alerte', () => {
    expect(millesimeFige(T('2026-07-27T12:00:00Z'), '2026-07', now, 35).alerte).toBe(false);
  });

  it('date/millésime inconnu → pas d’alerte trompeuse', () => {
    expect(millesimeFige(null, '2026-07', now, 35).alerte).toBe(false);
    expect(millesimeFige(T('2000-01-01T00:00:00Z'), null, now, 35).alerte).toBe(false);
  });
});

describe('S11c — echecsConsecutifs', () => {
  const run = (statut: string, erreur: string | null = null): RunVeille => ({
    declencheur: 'planifie', statut, demarreLe: '2026-07-28 12:00:00+00', finiLe: '2026-07-28 12:01:00+00',
    millesimeDetecte: null, millesimeIngere: null, lignesLues: null, dossiersRetenus: null, dossiersNouveaux: null, message: null, erreur,
  });

  it('seuil non atteint → pas d’alerte', () => {
    const r = echecsConsecutifs([run('echec', 'x'), run('succes')], 3);
    expect(r.alerte).toBe(false);
    expect(r.nombre).toBe(1);
  });

  it('seuil atteint → alerte + message d’erreur RÉEL du dernier échec (pas une paraphrase)', () => {
    const r = echecsConsecutifs([run('echec', 'DiDo HTTP 503'), run('echec', 'x'), run('echec', 'y')], 3);
    expect(r.alerte).toBe(true);
    expect(r.nombre).toBe(3);
    expect(r.dernierMessage).toBe('DiDo HTTP 503');
    expect(r.phrase).toContain('DiDo HTTP 503');
  });

  it('un succès intercalé casse la série', () => {
    expect(echecsConsecutifs([run('echec', 'a'), run('succes'), run('echec', 'b'), run('echec', 'c')], 2).nombre).toBe(1);
  });

  it('« rien_a_faire » en tête casse la série (0 échec consécutif)', () => {
    const r = echecsConsecutifs([run('rien_a_faire'), run('echec', 'a')], 1);
    expect(r.nombre).toBe(0);
    expect(r.dernierMessage).toBeNull();
  });

  it('historique vide → 0, pas d’alerte', () => {
    const r = echecsConsecutifs([], 3);
    expect(r.nombre).toBe(0);
    expect(r.alerte).toBe(false);
  });
});
