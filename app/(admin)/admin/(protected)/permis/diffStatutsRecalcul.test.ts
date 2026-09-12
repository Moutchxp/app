import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { diffStatutsRecalcul, construireEtatsPourDiff, desaccordsActifs, marquageRecalcul, type EtatPourDiff, type DiffRecalcul } from './diffStatutsRecalcul';
import type { EtatStatutPolygone } from '../../../../lib/permis/polygoneStatut';

const e = (over: Partial<EtatPourDiff> & { cleabs: string }): EtatPourDiff =>
  ({ statut: null, origine: null, recouvert: false, autoPropose: 'preserve', ...over });

// EtatStatutPolygone minimal (seuls statut + origine comptent pour desaccordsActifs).
const courant = (statut: EtatStatutPolygone['statut'], origine: EtatStatutPolygone['origine']): EtatStatutPolygone =>
  ({ statut, origine, etatBdtopoAuMoment: null, decidePar: null, decideLe: null, historique: [] });

describe('diffStatutsRecalcul — changements et désaccords entre AVANT et APRÈS le recalcul', () => {
  it('changement SIMPLE de statut auto (mixte → détruit) : un changement « statut », aucun désaccord', () => {
    const avant = [e({ cleabs: 'A', statut: 'mixte', origine: 'auto_mixte', recouvert: true, autoPropose: 'mixte' })];
    const apres = [e({ cleabs: 'A', statut: 'detruit', origine: 'auto_recouvrement', recouvert: true, autoPropose: 'detruit' })];
    const d = diffStatutsRecalcul(avant, apres);
    expect(d.changements).toEqual([{ cleabs: 'A', nature: 'statut', avant: 'mixte', apres: 'detruit' }]);
    expect(d.desaccords).toEqual([]);
    expect(d.aDesChangements).toBe(true);
  });

  it('ENTRÉE sous l’emprise : un changement « entree » (aucun statut → détruit)', () => {
    const avant = [e({ cleabs: 'A', statut: null, recouvert: false, autoPropose: 'preserve' })];
    const apres = [e({ cleabs: 'A', statut: 'detruit', origine: 'auto_recouvrement', recouvert: true, autoPropose: 'detruit' })];
    expect(diffStatutsRecalcul(avant, apres).changements).toEqual([{ cleabs: 'A', nature: 'entree', avant: null, apres: 'detruit' }]);
  });

  it('SORTIE de l’emprise : un changement « sortie » (détruit → aucun statut)', () => {
    const avant = [e({ cleabs: 'A', statut: 'detruit', origine: 'auto_recouvrement', recouvert: true, autoPropose: 'detruit' })];
    const apres = [e({ cleabs: 'A', statut: null, origine: 'auto_revocation', recouvert: false, autoPropose: 'preserve' })];
    expect(diffStatutsRecalcul(avant, apres).changements).toEqual([{ cleabs: 'A', nature: 'sortie', avant: 'detruit', apres: null }]);
  });

  it('DÉSACCORD avec une décision MANUELLE : le recalcul dirait détruit, la main dit préservé — aucun changement (le manuel ne bouge pas)', () => {
    const etat = e({ cleabs: 'A', statut: 'preserve', origine: 'saisie', recouvert: true, autoPropose: 'detruit' });
    const d = diffStatutsRecalcul([etat], [etat]);
    expect(d.changements).toEqual([]); // une décision manuelle n'est jamais changée par le recalcul
    expect(d.desaccords).toEqual([{ cleabs: 'A', manuel: 'preserve', autoPropose: 'detruit' }]);
    expect(d.aDesChangements).toBe(true);
  });

  it('AUCUN changement (états identiques, aucun désaccord) → rien', () => {
    const etat = [e({ cleabs: 'A', statut: 'detruit', origine: 'auto_recouvrement', recouvert: true, autoPropose: 'detruit' })];
    const d = diffStatutsRecalcul(etat, etat);
    expect(d.changements).toEqual([]);
    expect(d.desaccords).toEqual([]);
    expect(d.aDesChangements).toBe(false);
  });
});

describe('construireEtatsPourDiff — instantané depuis statuts + recouverts + seuils', () => {
  it('un recouvert au-dessus du seuil détruit → autoPropose détruit ; un statut manuel préservé conservé', () => {
    const statuts = new Map<string, EtatStatutPolygone>([['A', courant('preserve', 'saisie')]]);
    const recouverts = [{ cleabs: 'A', tauxPct: 90 }];
    const [etat] = construireEtatsPourDiff(statuts, recouverts, 3, 60);
    expect(etat).toEqual({ cleabs: 'A', statut: 'preserve', origine: 'saisie', recouvert: true, autoPropose: 'detruit' });
  });
  it('non recouvert → autoPropose préservé', () => {
    const [etat] = construireEtatsPourDiff(new Map([['B', courant('detruit', 'saisie')]]), [], 3, 60);
    expect(etat.recouvert).toBe(false); expect(etat.autoPropose).toBe('preserve');
  });
});

describe('desaccordsActifs — un désaccord réglé par Arno disparaît du marquage', () => {
  const desaccords = [{ cleabs: 'A', manuel: 'preserve' as const, autoPropose: 'detruit' as const }];
  it('toujours en désaccord (manuel « préservé » inchangé) → actif', () => {
    expect(desaccordsActifs(desaccords, new Map([['A', courant('preserve', 'saisie')]]))).toHaveLength(1);
  });
  it('Arno a adopté le recalcul (statut passé à l’auto) → désaccord résolu, plus actif', () => {
    expect(desaccordsActifs(desaccords, new Map([['A', courant('detruit', 'auto_recouvrement')]]))).toEqual([]);
  });
  it('Arno a re-décidé « détruit » à la main (= ce que proposait le recalcul) → résolu', () => {
    expect(desaccordsActifs(desaccords, new Map([['A', courant('detruit', 'saisie')]]))).toEqual([]);
  });
});

describe('marquageRecalcul — index par cleabs pour le marquage du bloc (changements + désaccords ACTIFS)', () => {
  const diff: DiffRecalcul = {
    changements: [{ cleabs: 'A', nature: 'statut', avant: 'mixte', apres: 'detruit' }],
    desaccords: [{ cleabs: 'B', manuel: 'preserve', autoPropose: 'detruit' }],
    aDesChangements: true,
  };
  it('un changement indexé + un désaccord ENCORE actif indexé', () => {
    const m = marquageRecalcul(diff, new Map([['B', courant('preserve', 'saisie')]]));
    expect(m.changementsParCleabs.get('A')).toEqual({ cleabs: 'A', nature: 'statut', avant: 'mixte', apres: 'detruit' });
    expect(m.desaccordsParCleabs.get('B')).toEqual({ cleabs: 'B', manuel: 'preserve', autoPropose: 'detruit' });
  });
  it('un désaccord réglé par Arno (statut adopté = auto) n’est plus marqué (filtré live)', () => {
    const m = marquageRecalcul(diff, new Map([['B', courant('detruit', 'saisie')]])); // Arno a adopté « détruit »
    expect(m.changementsParCleabs.size).toBe(1); // le changement reste (acquittable)
    expect(m.desaccordsParCleabs.size).toBe(0);  // le désaccord a disparu
  });
  it('diff null → aucun marquage', () => {
    const m = marquageRecalcul(null, new Map());
    expect(m.changementsParCleabs.size).toBe(0);
    expect(m.desaccordsParCleabs.size).toBe(0);
  });
});

describe('SOCLE (garde de source) — la règle e est levée : un ajustement recalcule les statuts et renvoie le diff', () => {
  const ROUTE = readFileSync('app/(admin)/api/admin/permis/emprise/route.ts', 'utf8').replace(/\s+/g, ' ');
  const BLOC = readFileSync('app/(admin)/admin/(protected)/permis/BlocTraceEmprise.tsx', 'utf8').replace(/\s+/g, ' ');
  it('les 4 gestes d’ajustement (poser/revenir, une/bloc) passent par reponseAjustement (recalcul + diff)', () => {
    expect((ROUTE.match(/return reponseAjustement\(dossierId, avant,/g) ?? []).length).toBe(4);
    // reponseAjustement RELANCE le recalcul auto ET calcule le diff PUR partagé.
    expect(ROUTE).toContain('await appliquerAutoStatut(dossierId, \'auto:emprise\')');
    expect(ROUTE).toContain('const recalculStatut = diffStatutsRecalcul(avant, await instantaneStatuts(dossierId))');
    // l’ancien commentaire « AUCUN appliquerAutoStatut … règle e » a disparu (inversion documentée sur place).
    expect(ROUTE).not.toContain('AUCUN appliquerAutoStatut');
  });
  it('le client rafraîchit les statuts du bloc après un ajustement (le recalcul devient visible)', () => {
    // enregistrerAjustementGeste ET revenirOrigineAjustement remontent statutsPolygones/polygonesRecouverts (2 chacun avec revenirOrigineDirect = 3).
    expect((BLOC.match(/if \(j\.statutsPolygones\) setStatutsLignes\(j\.statutsPolygones\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
