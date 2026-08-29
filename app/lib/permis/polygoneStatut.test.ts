import { describe, it, expect } from 'vitest';
import { statutCourantParCleabs, estStatuable, actionsAutoStatut, type LigneStatutPolygone, type EtatStatutPolygone, type OrigineStatut } from './polygoneStatut';

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

describe('RATT-2 — actionsAutoStatut (écriture/révocation auto ; ne touche JAMAIS une décision humaine)', () => {
  // Fabrique un état COURANT minimal (seuls statut + origine importent à la décision).
  const etat = (statut: EtatStatutPolygone['statut'], origine: OrigineStatut | null): EtatStatutPolygone =>
    ({ statut, origine, etatBdtopoAuMoment: null, decidePar: null, decideLe: null, historique: [] });

  it('recouvert + JAMAIS statué → écrit « detruit » d’origine « auto_recouvrement »', () => {
    const actions = actionsAutoStatut(['A'], new Map());
    expect(actions).toEqual([{ cleabs: 'A', statut: 'detruit', origine: 'auto_recouvrement' }]);
  });

  it('recouvert + DÉJÀ statué par une SAISIE humaine → n’écrit RIEN (jamais par-dessus une décision d’Arno)', () => {
    const statuts = new Map<string, EtatStatutPolygone>([['A', etat('preserve', 'saisie')]]);
    expect(actionsAutoStatut(['A'], statuts)).toEqual([]);
  });

  it('recouvert + DÉJÀ « detruit » auto → n’écrit RIEN (pas de doublon)', () => {
    const statuts = new Map<string, EtatStatutPolygone>([['A', etat('detruit', 'auto_recouvrement')]]);
    expect(actionsAutoStatut(['A'], statuts)).toEqual([]);
  });

  it('PLUS recouvert + statut auto « detruit » → RÉVOQUE (origine « auto_revocation »)', () => {
    const statuts = new Map<string, EtatStatutPolygone>([['A', etat('detruit', 'auto_recouvrement')]]);
    expect(actionsAutoStatut([], statuts)).toEqual([{ cleabs: 'A', statut: 'revoque', origine: 'auto_revocation' }]);
  });

  it('PLUS recouvert + statut « detruit » d’une SAISIE humaine → n’écrit RIEN (la décision d’Arno prime)', () => {
    const statuts = new Map<string, EtatStatutPolygone>([['A', etat('detruit', 'saisie')]]);
    expect(actionsAutoStatut([], statuts)).toEqual([]);
  });

  it('PLUS recouvert + origine INCONNUE (migration 165 absente, origine=null) → n’écrit RIEN (jamais révoquer ce qu’on ne sait pas auto)', () => {
    const statuts = new Map<string, EtatStatutPolygone>([['A', etat('detruit', null)]]);
    expect(actionsAutoStatut([], statuts)).toEqual([]);
  });

  it('cas mixte : un nouveau recouvert à poser + un ancien auto à révoquer, une saisie intouchée', () => {
    const statuts = new Map<string, EtatStatutPolygone>([
      ['ANCIEN_AUTO', etat('detruit', 'auto_recouvrement')], // n’est plus recouvert → révocation
      ['SAISIE', etat('detruit', 'saisie')],                  // n’est plus recouvert MAIS humain → intouché
    ]);
    const actions = actionsAutoStatut(['NOUVEAU'], statuts);
    expect(actions).toContainEqual({ cleabs: 'NOUVEAU', statut: 'detruit', origine: 'auto_recouvrement' });
    expect(actions).toContainEqual({ cleabs: 'ANCIEN_AUTO', statut: 'revoque', origine: 'auto_revocation' });
    expect(actions.find((a) => a.cleabs === 'SAISIE')).toBeUndefined();
    expect(actions).toHaveLength(2);
  });

  // RATT-4 — l'auto-statut est ÉTAT-AGNOSTIQUE (il ne lit que le jeu de cleabs recouverts) : un « en projet » recouvert est traité
  //   EXACTEMENT comme un existant recouvert. Ces deux cas documentent l'intention RATT-4 sur un cleabs « en projet » (C/D/I du 11430).
  it('RATT-4 — « en projet » recouvert JAMAIS statué → écrit « detruit » / « auto_recouvrement » (comme un existant)', () => {
    expect(actionsAutoStatut(['BATIMENT_EN_PROJET_C'], new Map())).toEqual([
      { cleabs: 'BATIMENT_EN_PROJET_C', statut: 'detruit', origine: 'auto_recouvrement' },
    ]);
  });
  it('RATT-4 — « en projet » recouvert DÉJÀ statué à la main (préservé) → n’écrit RIEN', () => {
    const statuts = new Map<string, EtatStatutPolygone>([['BATIMENT_EN_PROJET_C', etat('preserve', 'saisie')]]);
    expect(actionsAutoStatut(['BATIMENT_EN_PROJET_C'], statuts)).toEqual([]);
  });
});
