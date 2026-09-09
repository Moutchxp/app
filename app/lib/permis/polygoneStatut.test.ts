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

describe('AFF-2 — statutDepuisRecouvrement (deux seuils : plancher anti-bruit + seuil « détruit »)', () => {
  const PLANCHER = 3;   // défaut plancher anti-bruit de tracé
  const DETRUIT = 75;   // défaut seuil « détruit » (AFF-2)
  it('≥ 75 % → detruit ; 75 % → detruit (borne incluse) ; 74,9 % → mixte ; 3 % → mixte (plancher inclus) ; 2,9 % → aucun ; 0 % → aucun', () => {
    expect(statutDepuisRecouvrement(100, PLANCHER, DETRUIT)).toBe('detruit');
    expect(statutDepuisRecouvrement(75, PLANCHER, DETRUIT)).toBe('detruit');  // borne du seuil « détruit » INCLUSE
    expect(statutDepuisRecouvrement(74.9, PLANCHER, DETRUIT)).toBe('mixte');  // sous le seuil « détruit » → partiellement détruit
    expect(statutDepuisRecouvrement(50, PLANCHER, DETRUIT)).toBe('mixte');
    expect(statutDepuisRecouvrement(3, PLANCHER, DETRUIT)).toBe('mixte');     // borne du plancher INCLUSE
    expect(statutDepuisRecouvrement(2.9, PLANCHER, DETRUIT)).toBeNull();      // sous le plancher (bruit de tracé) → aucun (préservé)
    expect(statutDepuisRecouvrement(0, PLANCHER, DETRUIT)).toBeNull();
  });
  it('le SEUIL « détruit » est un PARAMÈTRE, pas une constante : 79 % bascule detruit↔mixte selon le seuil', () => {
    expect(statutDepuisRecouvrement(79, PLANCHER, 75)).toBe('detruit'); // 79 ≥ 75
    expect(statutDepuisRecouvrement(79, PLANCHER, 80)).toBe('mixte');   // 79 < 80 → partiellement détruit
  });
});

describe('AFF-2 — actionsAutoStatut (statut PROPOSÉ detruit|mixte selon deux seuils ; ne touche JAMAIS une décision humaine)', () => {
  const etat = (statut: EtatStatutPolygone['statut'], origine: OrigineStatut | null): EtatStatutPolygone =>
    ({ statut, origine, etatBdtopoAuMoment: null, decidePar: null, decideLe: null, historique: [] });
  const rec = (cleabs: string, tauxPct: number) => ({ cleabs, tauxPct }); // un recouvert au-dessus du plancher, avec son taux
  const PLANCHER = 3;
  const DETRUIT = 75;

  it('recouvert ≥ seuil « détruit » (100 %) + JAMAIS statué → « detruit » / « auto_recouvrement »', () => {
    expect(actionsAutoStatut([rec('A', 100)], PLANCHER, DETRUIT, new Map())).toEqual([{ cleabs: 'A', statut: 'detruit', origine: 'auto_recouvrement' }]);
  });
  it('recouvert PARTIEL (50 %, sous le seuil) + JAMAIS statué → « mixte » / « auto_mixte »', () => {
    expect(actionsAutoStatut([rec('A', 50)], PLANCHER, DETRUIT, new Map())).toEqual([{ cleabs: 'A', statut: 'mixte', origine: 'auto_mixte' }]);
  });

  it('recouvert + DÉJÀ statué par une SAISIE humaine → n’écrit RIEN (jamais par-dessus Arno)', () => {
    const statuts = new Map<string, EtatStatutPolygone>([['A', etat('preserve', 'saisie')]]);
    expect(actionsAutoStatut([rec('A', 100)], PLANCHER, DETRUIT, statuts)).toEqual([]);
    expect(actionsAutoStatut([rec('A', 50)], PLANCHER, DETRUIT, statuts)).toEqual([]); // même en zone mixte : la saisie prime
  });
  it('AFF-2 — un « mixte » posé à la MAIN prime, même si l’auto proposerait « detruit » (recouvert 80 %)', () => {
    const statuts = new Map<string, EtatStatutPolygone>([['A', etat('mixte', 'saisie')]]);
    expect(actionsAutoStatut([rec('A', 80)], PLANCHER, DETRUIT, statuts)).toEqual([]); // arbitrage manuel du mixte : jamais écrasé
  });

  it('recouvert + statut AUTO déjà à la bonne branche → n’écrit RIEN (pas de doublon)', () => {
    expect(actionsAutoStatut([rec('A', 100)], PLANCHER, DETRUIT, new Map([['A', etat('detruit', 'auto_recouvrement')]]))).toEqual([]);
    expect(actionsAutoStatut([rec('A', 50)], PLANCHER, DETRUIT, new Map([['A', etat('mixte', 'auto_mixte')]]))).toEqual([]);
  });

  it('AFF-2 — le recouvrement a changé de branche (autour du seuil « détruit ») → RÉALIGNE le statut AUTO', () => {
    // au-dessus → en dessous du seuil : detruit auto devient mixte auto.
    expect(actionsAutoStatut([rec('A', 50)], PLANCHER, DETRUIT, new Map([['A', etat('detruit', 'auto_recouvrement')]])))
      .toEqual([{ cleabs: 'A', statut: 'mixte', origine: 'auto_mixte' }]);
    // en dessous → au-dessus du seuil : mixte auto devient detruit auto.
    expect(actionsAutoStatut([rec('A', 100)], PLANCHER, DETRUIT, new Map([['A', etat('mixte', 'auto_mixte')]])))
      .toEqual([{ cleabs: 'A', statut: 'detruit', origine: 'auto_recouvrement' }]);
  });

  it('PLUS recouvert + statut AUTO (detruit OU mixte) → RÉVOQUE (auto_revocation)', () => {
    expect(actionsAutoStatut([], PLANCHER, DETRUIT, new Map([['A', etat('detruit', 'auto_recouvrement')]]))).toEqual([{ cleabs: 'A', statut: 'revoque', origine: 'auto_revocation' }]);
    expect(actionsAutoStatut([], PLANCHER, DETRUIT, new Map([['A', etat('mixte', 'auto_mixte')]]))).toEqual([{ cleabs: 'A', statut: 'revoque', origine: 'auto_revocation' }]);
  });

  it('PLUS recouvert + statut d’une SAISIE humaine → n’écrit RIEN (la décision d’Arno prime)', () => {
    expect(actionsAutoStatut([], PLANCHER, DETRUIT, new Map([['A', etat('detruit', 'saisie')]]))).toEqual([]);
  });
  it('PLUS recouvert + origine INCONNUE (null) → n’écrit RIEN', () => {
    expect(actionsAutoStatut([], PLANCHER, DETRUIT, new Map([['A', etat('detruit', null)]]))).toEqual([]);
  });

  it('cas composite : un ≥ seuil à poser + un ancien auto à révoquer, une saisie intouchée', () => {
    const statuts = new Map<string, EtatStatutPolygone>([
      ['ANCIEN_AUTO', etat('mixte', 'auto_mixte')], // n’est plus recouvert → révocation
      ['SAISIE', etat('detruit', 'saisie')],         // plus recouvert MAIS humain → intouché
    ]);
    const actions = actionsAutoStatut([rec('NOUVEAU', 100)], PLANCHER, DETRUIT, statuts);
    expect(actions).toContainEqual({ cleabs: 'NOUVEAU', statut: 'detruit', origine: 'auto_recouvrement' });
    expect(actions).toContainEqual({ cleabs: 'ANCIEN_AUTO', statut: 'revoque', origine: 'auto_revocation' });
    expect(actions.find((a) => a.cleabs === 'SAISIE')).toBeUndefined();
    expect(actions).toHaveLength(2);
  });

  // RATT-4 — un « en projet » recouvert est traité comme un existant (l'auto ne lit que taux + seuils).
  it('RATT-4/AFF-2 — « en projet » recouvert partiel (60 %) → « mixte » ; jamais statué à la main', () => {
    expect(actionsAutoStatut([rec('BATIMENT_EN_PROJET_C', 60)], PLANCHER, DETRUIT, new Map())).toEqual([{ cleabs: 'BATIMENT_EN_PROJET_C', statut: 'mixte', origine: 'auto_mixte' }]);
    const statuts = new Map<string, EtatStatutPolygone>([['BATIMENT_EN_PROJET_C', etat('preserve', 'saisie')]]);
    expect(actionsAutoStatut([rec('BATIMENT_EN_PROJET_C', 60)], PLANCHER, DETRUIT, statuts)).toEqual([]);
  });
});
