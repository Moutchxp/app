import { describe, it, expect } from 'vitest';
import {
  changementsDuFil, estUnGeste, libelleSuiviModifie, lignesAutresChangements, motBiensRattaches, type PeriodeAncienne,
} from './changementsSuivi';
import { accoladesDuBienDansLeFil, LIBELLE_AJOUT, LIBELLE_RETRAIT } from './accoladesBien';
import { definitionAffichee } from './porteeSuivi';
import type { Classement, Periode } from './periodesConversation';

/**
 * ══ 🔴🔴 LOT ACCOLADE-AU-MAIL-DECLENCHEUR-ET-LIBELLES — DONNÉES DE BANC, À LA FORME DU FIL 16502 ══════════════════════
 * Trois mails : 26188 (le premier, celui de Valentin TALHOUARN), 26116, 26111. Rien n'est lu ni écrit en base.
 */
const biens = (...cles: string[]): Classement => ({ sorte: 'biens', biens: cles.map((cle) => ({ cle, libelle: `lot ${cle}` })) });
const MAILS = [26188, 26116, 26111];
const P = (id: number, depuis: number, c: Classement, par: string, le: string): Periode =>
  ({ id, depuisMessageId: depuis, classement: c, parLibelle: par, le });
const A = (id: number, depuis: number, c: Classement, par: string, le: string, remplaceeLe: string | null): PeriodeAncienne =>
  ({ ...P(id, depuis, c, par, le), remplaceeLe });

describe('🔴 quels changements portent une accolade', () => {
  it('la reprise des données n’est pas un geste ; un humain, si', () => {
    expect(estUnGeste({ parLibelle: 'reprise des périodes' })).toBe(false);
    expect(estUnGeste({ parLibelle: 'a.jorel@sansvisavis.com' })).toBe(true);
    expect(estUnGeste({ parLibelle: '' })).toBe(false);
  });

  it('🔴 le cas d’Arno : un changement posé SUR LE PREMIER MAIL a désormais son accolade, avec l’avant qu’il a remplacé', () => {
    const vivante = P(23854, 26188, biens('219'), 'a.jorel@sansvisavis.com', '2026-10-11T22:13:52.000Z');
    const anciennes = [
      A(23853, 26188, biens('219', '373'), 'a.jorel@sansvisavis.com', '2026-10-11T22:12:49.000Z', '2026-10-11T22:13:52.100Z'),
      A(23852, 26188, biens('219', '224'), 'a.jorel@sansvisavis.com', '2026-10-11T20:55:46.000Z', '2026-10-11T21:00:37.000Z'),
      A(4990, 26188, biens('219'), 'reprise des périodes', '2026-10-01T12:44:13.000Z', '2026-10-11T20:55:46.000Z'),
    ];
    const c = changementsDuFil({ mails: MAILS, periodes: [vivante], anciennes });
    expect(c).toHaveLength(1);
    expect(c[0].depuisMessageId).toBe(26188);
    /* L'AVANT est la fenêtre que CE geste a refermée (00:13:52), pas « rien ». */
    expect(c[0].avant).toEqual(biens('219', '373'));
    expect(c[0].apres).toEqual(biens('219'));
    /* Les AUTRES changements du même mail : les gestes humains, du plus récent au plus ancien ; jamais la reprise. */
    expect(c[0].autres.map((x) => x.id)).toEqual([23853, 23852]);
  });

  it('la fenêtre initiale de la reprise, au premier mail, ne porte toujours aucune accolade', () => {
    expect(changementsDuFil({ mails: MAILS, periodes: [P(4990, 26188, biens('219'), 'reprise des périodes', '2026-10-01T12:44:13Z')] }))
      .toEqual([]);
  });

  it('⚠️ aucune accolade existante ne disparaît : une fenêtre hors du premier mail garde la sienne, reprise comprise', () => {
    const c = changementsDuFil({
      mails: MAILS,
      periodes: [P(1, 26188, biens('219'), 'reprise des périodes', 'x'), P(2, 26116, biens('219', '373'), 'reprise des périodes', 'y')],
    });
    expect(c.map((x) => x.periode.id)).toEqual([2]);
    /* Rien n'a été remplacé sur ce mail : l'avant est la fenêtre du mail précédent (règle d'avant ce lot). */
    expect(c[0].avant).toEqual(biens('219'));
  });

  it('les autres changements se lisent en clair dans la fenêtre du « i »', () => {
    const l = lignesAutresChangements(
      [A(23853, 26188, biens('219', '373'), 'a.jorel@sansvisavis.com', '2026-10-11T22:12:49Z', '2026-10-11T22:13:52Z')],
      (iso) => `<${iso.slice(11, 16)}>`,
    );
    expect(l).toHaveLength(1);
    expect(l[0]).toMatch(/^Autre changement sur ce mail : <22:12> · a\.jorel@sansvisavis\.com — /);
    expect(l[0]).toContain('(remplacé le <22:13>)');
  });
});

describe('🔴 l’historique de CHAQUE bien concerné : entrée, sortie, et désormais « reste suivi »', () => {
  const periodes = [
    P(1, 26188, biens('219'), 'reprise des périodes', '2026-10-01T12:44:13Z'),
    P(2, 26116, biens('219', '373'), 'a.jorel@sansvisavis.com', '2026-10-11T22:22:52Z'),
  ];
  const pour = (cle: string) => accoladesDuBienDansLeFil({ filId: 16502, mails: MAILS, periodes, cle });
  it('le 25 rue Edith Cavell (219) reste suivi : « suivi de fond modifié — 2 biens rattachés »', () => {
    const a = pour('219');
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ depuisMessageId: 26116, sens: 'modif', libelle: 'suivi de fond modifié — 2 biens rattachés' });
  });
  it('le lot 373 entre : « suivi de fond modifié »', () => {
    expect(pour('373')[0]).toMatchObject({ sens: 'ajout', libelle: LIBELLE_AJOUT });
  });
  it('un bien qui sort : « sorti du suivi de ce bien » ; un bien étranger au changement : rien', () => {
    const p2 = [P(1, 26188, biens('219', '224'), 'reprise des périodes', 'a'), P(2, 26116, biens('219'), 'a.jorel@sansvisavis.com', 'b')];
    expect(accoladesDuBienDansLeFil({ filId: 1, mails: MAILS, periodes: p2, cle: '224' })[0])
      .toMatchObject({ sens: 'retrait', libelle: LIBELLE_RETRAIT });
    expect(accoladesDuBienDansLeFil({ filId: 1, mails: MAILS, periodes: p2, cle: '999' })).toEqual([]);
  });
});

describe('🔴 les libellés de la fenêtre « Bien(s) rattaché(s) à ce mail »', () => {
  it('accord singulier / pluriel, « aucun bien rattaché » à zéro', () => {
    expect(motBiensRattaches(0)).toBe('aucun bien rattaché');
    expect(motBiensRattaches(1)).toBe('1 bien rattaché');
    expect(motBiensRattaches(2)).toBe('2 biens rattachés');
    expect(libelleSuiviModifie(biens('219'))).toBe('suivi de fond modifié — 1 bien rattaché');
  });
  it('③ « rattachera », et le nombre de biens cochés au bout de la 2ᵉ phrase', () => {
    expect(definitionAffichee('suite', 2)).toBe('À partir de ce mail, et pour tous les prochains échanges de cette conversation, le suivi de fond rattachera les biens choisis ci-dessus. Les mails plus anciens ne changent pas — 2 biens rattachés.');
    expect(definitionAffichee('suite', 0)).toMatch(/ne changent pas — aucun bien rattaché\.$/);
    /* ④ n'emploie pas « appliquera » : inchangée (condition d'Arno). */
    expect(definitionAffichee('conversation', 3)).not.toContain('rattaché');
  });
});
