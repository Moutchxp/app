import { describe, it, expect } from 'vitest';
import { statutCourantParCleabs, estStatuable, actionsAutoStatut, estRecouvertParEmprise, statutDepuisRecouvrement, type LigneStatutPolygone, type EtatStatutPolygone, type OrigineStatut } from './polygoneStatut';

const l = (cleabs: string, statut: LigneStatutPolygone['statut'], le: string, etat: string | null = 'En service', par = 'admin', origine: OrigineStatut | null = 'saisie'): LigneStatutPolygone =>
  ({ cleabs, statut, etatBdtopoAuMoment: etat, decidePar: par, decideLe: le, origine });

describe('RATT-1 (2) — statutCourantParCleabs (append-only : dernière décision = courant)', () => {
  it('une seule décision → statut courant + snapshot source + origine', () => {
    const m = statutCourantParCleabs([l('A', 'preserve', '2026-08-01T10:00:00Z', 'En projet')]);
    expect(m.get('A')).toMatchObject({ statut: 'preserve', etatBdtopoAuMoment: 'En projet', origine: 'saisie' });
  });
  it('la DERNIÈRE ligne (decide_le max) fait foi ; l’historique est du plus récent au plus ancien', () => {
    const m = statutCourantParCleabs([
      l('A', 'preserve', '2026-08-01T10:00:00Z'),
      l('A', 'detruit', '2026-08-03T09:00:00Z'),
      l('A', 'preserve', '2026-08-02T09:00:00Z'),
    ]);
    expect(m.get('A')!.statut).toBe('detruit');                 // la plus récente (03/08)
    expect(m.get('A')!.historique.map((h) => h.statut)).toEqual(['detruit', 'preserve', 'preserve']); // récent → ancien
  });
  it('révoquer en dernier → statut null, MAIS l’historique reste (audit)', () => {
    const m = statutCourantParCleabs([
      l('A', 'detruit', '2026-08-01T10:00:00Z'),
      l('A', 'revoque', '2026-08-02T10:00:00Z'),
    ]);
    expect(m.get('A')!.statut).toBeNull();
    expect(m.get('A')!.historique).toHaveLength(2);             // la décision « détruit » reste lisible
  });
  it('origine de la ligne COURANTE = celle de la dernière décision (auto vs saisie)', () => {
    const m = statutCourantParCleabs([
      l('A', 'detruit', '2026-08-01T10:00:00Z', 'En service', 'auto:emprise', 'auto_recouvrement'),
      l('A', 'preserve', '2026-08-02T10:00:00Z', 'En service', 'admin', 'saisie'),
    ]);
    expect(m.get('A')).toMatchObject({ statut: 'preserve', origine: 'saisie' }); // une saisie humaine a repris la main
  });
  it('aucune ligne pour un cleabs → absent de la Map (aucun statut décidé)', () => {
    expect(statutCourantParCleabs([]).get('X')).toBeUndefined();
  });
});

describe('RATT-2 — estStatuable (TOUS les existants, recouverts compris ; seul le futur bâti est exclu)', () => {
  it('polygone En service → statuable', () => {
    expect(estStatuable({ cleabs: 'A', etat: 'En service' })).toBe(true);
  });
  it('polygone « En projet » / « En construction » (futur bâti) → NON statuable (relève de l’adoption)', () => {
    expect(estStatuable({ cleabs: 'A', etat: 'En projet' })).toBe(false);
    expect(estStatuable({ cleabs: 'A', etat: 'En construction' })).toBe(false);
  });
  it('RATT-2 — polygone recouvert par une emprise projetée → DÉSORMAIS statuable (détruit par défaut, basculable)', () => {
    // (avant RATT-2 : NON statuable) — il entre maintenant dans la liste, quel que soit le recouvrement.
    expect(estStatuable({ cleabs: 'A', etat: 'En service' })).toBe(true);
  });
  it('sans cleabs → non statuable', () => {
    expect(estStatuable({ cleabs: null, etat: 'En service' })).toBe(false);
  });
});

describe('RATT-4 — estStatuable ouvre la liste aux « en projet » RECOUVERTS (le param recouvert)', () => {
  it('« En projet » + RECOUVERT → statuable', () => {
    expect(estStatuable({ cleabs: 'C', etat: 'En projet' }, true)).toBe(true);
  });
  it('« En projet » + NON recouvert → NON statuable (inchangé)', () => {
    expect(estStatuable({ cleabs: 'C', etat: 'En projet' }, false)).toBe(false);
    expect(estStatuable({ cleabs: 'C', etat: 'En projet' })).toBe(false); // défaut = non recouvert
  });
  it('« En construction » (futur bâti) + recouvert → statuable ; non recouvert → non', () => {
    expect(estStatuable({ cleabs: 'C', etat: 'En construction' }, true)).toBe(true);
    expect(estStatuable({ cleabs: 'C', etat: 'En construction' }, false)).toBe(false);
  });
  it('« En service » (existant) → statuable dans les DEUX cas (le recouvrement ne change rien pour l’existant)', () => {
    expect(estStatuable({ cleabs: 'A', etat: 'En service' }, true)).toBe(true);
    expect(estStatuable({ cleabs: 'A', etat: 'En service' }, false)).toBe(true);
  });
  it('sans cleabs, même recouvert → non statuable', () => {
    expect(estStatuable({ cleabs: null, etat: 'En projet' }, true)).toBe(false);
  });
});

describe('RATT-5 — estRecouvertParEmprise (seuil de recouvrement, borne incluse)', () => {
  const SEUIL = 50; // un seuil de test (le défaut config est 3 depuis RATT-6, mais estRecouvertParEmprise prend le seuil en paramètre)
  it('à un seuil de 50 % : 100 %, 96,3 % et 50 % → recouverts ; 49,9 %, 2 %, 0 % → non', () => {
    expect(estRecouvertParEmprise(100, SEUIL)).toBe(true);
    expect(estRecouvertParEmprise(96.3, SEUIL)).toBe(true);
    expect(estRecouvertParEmprise(50, SEUIL)).toBe(true);   // borne INCLUSE
    expect(estRecouvertParEmprise(49.9, SEUIL)).toBe(false);
    expect(estRecouvertParEmprise(2, SEUIL)).toBe(false);
    expect(estRecouvertParEmprise(0, SEUIL)).toBe(false);
  });
  it('le SEUIL est un PARAMÈTRE, pas une constante en dur : 49,9 % bascule selon le seuil fourni', () => {
    expect(estRecouvertParEmprise(49.9, 50)).toBe(false); // sous 50
    expect(estRecouvertParEmprise(49.9, 40)).toBe(true);  // au-dessus de 40 → la décision suit le seuil, pas un chiffre figé
    expect(estRecouvertParEmprise(80, 90)).toBe(false);   // même 80 % ne suffit pas si le seuil est 90
  });
});

describe('RATT-6 — statutDepuisRecouvrement (fait géométrique à trois branches ; seuil = anti-bruit)', () => {
  const SEUIL = 3; // défaut RATT-6 (anti-bruit de tracé)
  it('100 % → detruit ; 99,9 % → mixte ; 50 % → mixte ; 3 % → mixte (borne incluse) ; 2,9 % → aucun ; 0 % → aucun', () => {
    expect(statutDepuisRecouvrement(100, SEUIL)).toBe('detruit');
    expect(statutDepuisRecouvrement(99.9, SEUIL)).toBe('mixte'); // sous la tolérance de « total » → partiellement détruit
    expect(statutDepuisRecouvrement(50, SEUIL)).toBe('mixte');
    expect(statutDepuisRecouvrement(3, SEUIL)).toBe('mixte');    // borne du seuil INCLUSE
    expect(statutDepuisRecouvrement(2.9, SEUIL)).toBeNull();     // sous le seuil (bruit de tracé) → aucun statut
    expect(statutDepuisRecouvrement(0, SEUIL)).toBeNull();
  });
  it('la tolérance de « total » n’absorbe QUE l’epsilon (≈ 100 %) : 100,001 % et 99,97 % → detruit, 99,9 % → mixte', () => {
    expect(statutDepuisRecouvrement(100.001, SEUIL)).toBe('detruit');
    expect(statutDepuisRecouvrement(99.97, SEUIL)).toBe('detruit'); // ≥ 99,95 → total à l’epsilon près
    expect(statutDepuisRecouvrement(99.9, SEUIL)).toBe('mixte');    // < 99,95 → un survivant réel
  });
});

describe('RATT-2/RATT-6 — actionsAutoStatut (statut géométrique detruit|mixte ; ne touche JAMAIS une décision humaine)', () => {
  const etat = (statut: EtatStatutPolygone['statut'], origine: OrigineStatut | null): EtatStatutPolygone =>
    ({ statut, origine, etatBdtopoAuMoment: null, decidePar: null, decideLe: null, historique: [] });
  const rec = (cleabs: string, tauxPct: number) => ({ cleabs, tauxPct }); // un recouvert au-dessus du seuil, avec son taux
  const SEUIL = 3;

  it('recouvert TOTAL (100 %) + JAMAIS statué → « detruit » / « auto_recouvrement »', () => {
    expect(actionsAutoStatut([rec('A', 100)], SEUIL, new Map())).toEqual([{ cleabs: 'A', statut: 'detruit', origine: 'auto_recouvrement' }]);
  });
  it('recouvert PARTIEL (80 %) + JAMAIS statué → « mixte » / « auto_mixte »', () => {
    expect(actionsAutoStatut([rec('A', 80)], SEUIL, new Map())).toEqual([{ cleabs: 'A', statut: 'mixte', origine: 'auto_mixte' }]);
  });

  it('recouvert + DÉJÀ statué par une SAISIE humaine → n’écrit RIEN (jamais par-dessus Arno)', () => {
    const statuts = new Map<string, EtatStatutPolygone>([['A', etat('preserve', 'saisie')]]);
    expect(actionsAutoStatut([rec('A', 100)], SEUIL, statuts)).toEqual([]);
    expect(actionsAutoStatut([rec('A', 80)], SEUIL, statuts)).toEqual([]); // même en zone mixte : la saisie prime
  });

  it('recouvert + statut AUTO déjà à la bonne branche → n’écrit RIEN (pas de doublon)', () => {
    expect(actionsAutoStatut([rec('A', 100)], SEUIL, new Map([['A', etat('detruit', 'auto_recouvrement')]]))).toEqual([]);
    expect(actionsAutoStatut([rec('A', 80)], SEUIL, new Map([['A', etat('mixte', 'auto_mixte')]]))).toEqual([]);
  });

  it('RATT-6 — le recouvrement a changé de branche → RÉALIGNE le statut AUTO', () => {
    // total → partiel : detruit auto devient mixte auto.
    expect(actionsAutoStatut([rec('A', 80)], SEUIL, new Map([['A', etat('detruit', 'auto_recouvrement')]])))
      .toEqual([{ cleabs: 'A', statut: 'mixte', origine: 'auto_mixte' }]);
    // partiel → total : mixte auto devient detruit auto.
    expect(actionsAutoStatut([rec('A', 100)], SEUIL, new Map([['A', etat('mixte', 'auto_mixte')]])))
      .toEqual([{ cleabs: 'A', statut: 'detruit', origine: 'auto_recouvrement' }]);
  });

  it('PLUS recouvert + statut AUTO (detruit OU mixte) → RÉVOQUE (auto_revocation)', () => {
    expect(actionsAutoStatut([], SEUIL, new Map([['A', etat('detruit', 'auto_recouvrement')]]))).toEqual([{ cleabs: 'A', statut: 'revoque', origine: 'auto_revocation' }]);
    expect(actionsAutoStatut([], SEUIL, new Map([['A', etat('mixte', 'auto_mixte')]]))).toEqual([{ cleabs: 'A', statut: 'revoque', origine: 'auto_revocation' }]);
  });

  it('PLUS recouvert + statut d’une SAISIE humaine → n’écrit RIEN (la décision d’Arno prime)', () => {
    expect(actionsAutoStatut([], SEUIL, new Map([['A', etat('detruit', 'saisie')]]))).toEqual([]);
  });
  it('PLUS recouvert + origine INCONNUE (null) → n’écrit RIEN', () => {
    expect(actionsAutoStatut([], SEUIL, new Map([['A', etat('detruit', null)]]))).toEqual([]);
  });

  it('cas composite : un total à poser + un ancien auto à révoquer, une saisie intouchée', () => {
    const statuts = new Map<string, EtatStatutPolygone>([
      ['ANCIEN_AUTO', etat('mixte', 'auto_mixte')], // n’est plus recouvert → révocation
      ['SAISIE', etat('detruit', 'saisie')],         // plus recouvert MAIS humain → intouché
    ]);
    const actions = actionsAutoStatut([rec('NOUVEAU', 100)], SEUIL, statuts);
    expect(actions).toContainEqual({ cleabs: 'NOUVEAU', statut: 'detruit', origine: 'auto_recouvrement' });
    expect(actions).toContainEqual({ cleabs: 'ANCIEN_AUTO', statut: 'revoque', origine: 'auto_revocation' });
    expect(actions.find((a) => a.cleabs === 'SAISIE')).toBeUndefined();
    expect(actions).toHaveLength(2);
  });

  // RATT-4 — un « en projet » recouvert est traité comme un existant (l'auto ne lit que taux + seuil).
  it('RATT-4/RATT-6 — « en projet » recouvert partiel → « mixte » ; jamais statué à la main', () => {
    expect(actionsAutoStatut([rec('BATIMENT_EN_PROJET_C', 60)], SEUIL, new Map())).toEqual([{ cleabs: 'BATIMENT_EN_PROJET_C', statut: 'mixte', origine: 'auto_mixte' }]);
    const statuts = new Map<string, EtatStatutPolygone>([['BATIMENT_EN_PROJET_C', etat('preserve', 'saisie')]]);
    expect(actionsAutoStatut([rec('BATIMENT_EN_PROJET_C', 60)], SEUIL, statuts)).toEqual([]);
  });
});
