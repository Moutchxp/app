import { describe, expect, it } from 'vitest';
import { dateRdvDeLigne, LIBELLE_TRI_RDV, maintenantParis, MODE_TRI_RDV_DEFAUT, modeTriRdvSuivant, ordonnerParRdv, rendezVousDeLigne, type LigneRdv } from './triRdvPreavis';

/** 🔴🔴 Arno (15/11/2026) — le tri chronologique des rendez-vous de la liste des préavis. */
const MAINTENANT = '2026-11-15 18:00';
const pv = (statut: string, jour?: string, heure = '10:00') => ({ statut, rdv: jour ? { jour, heure } : null });
const L = (cle: string, l: LigneRdv) => ({ cle, ...l });

describe('le tri chronologique des rendez-vous', () => {
  it('le cycle : plus proches (défaut) → plus lointains → désactivé → plus proches ; les libellés', () => {
    expect(MODE_TRI_RDV_DEFAUT).toBe('proches');
    expect([modeTriRdvSuivant('proches'), modeTriRdvSuivant('lointains'), modeTriRdvSuivant('off')]).toEqual(['lointains', 'off', 'proches']);
    expect(Object.values(LIBELLE_TRI_RDV)).toEqual(['RDV : plus proches d’abord', 'RDV : plus lointains d’abord', 'Tri RDV désactivé']);
  });
  it('la date d’une ligne : le PROCHAIN rendez-vous à venir (pré-visite ou état des lieux), à défaut le dernier passé ; un refus ou une alerte n’a pas de rendez-vous', () => {
    expect(dateRdvDeLigne({ previsite: pv('effectuee', '2026-11-10'), edls: { jour: '2026-12-01', heure: '09:00:00' } }, MAINTENANT)).toEqual({ quand: '2026-12-01 09:00', aVenir: true });
    expect(dateRdvDeLigne({ previsite: pv('programmee', '2026-11-20'), edls: { jour: '2026-12-01', heure: '09:00' } }, MAINTENANT)).toEqual({ quand: '2026-11-20 10:00', aVenir: true });
    expect(dateRdvDeLigne({ previsite: pv('effectuee', '2026-11-10') }, MAINTENANT)).toEqual({ quand: '2026-11-10 10:00', aVenir: false });
    expect(dateRdvDeLigne({ previsite: pv('refusee', '2026-11-20') }, MAINTENANT)).toBeNull();
    expect(dateRdvDeLigne({ previsite: pv('alerte') }, MAINTENANT)).toBeNull();
    expect(rendezVousDeLigne({ previsite: null, edls: null })).toEqual([]);
  });
  it('plus proches : à venir du plus proche au plus lointain, puis passés du plus récent au plus ancien, puis SANS rendez-vous dans l’ordre reçu ; plus lointains : l’inverse ; aucune ligne perdue', () => {
    const lignes = [
      L('sans1', { previsite: pv('recu') }), L('passe-ancien', { previsite: pv('effectuee', '2026-11-01') }), L('futur-loin', { edls: { jour: '2027-01-10', heure: '10:00' } }),
      L('refus', { previsite: pv('refusee') }), L('futur-proche', { previsite: pv('programmee', '2026-11-16') }), L('passe-recent', { previsite: pv('effectuee', '2026-11-14') }),
    ];
    const p = ordonnerParRdv(lignes, 'proches', MAINTENANT);
    expect(p.avecRdv.map((x) => x.cle)).toEqual(['futur-proche', 'futur-loin', 'passe-recent', 'passe-ancien']);
    expect(p.sansRdv.map((x) => x.cle)).toEqual(['sans1', 'refus']);
    const l = ordonnerParRdv(lignes, 'lointains', MAINTENANT);
    expect(l.avecRdv.map((x) => x.cle)).toEqual(['passe-ancien', 'passe-recent', 'futur-loin', 'futur-proche']);
    expect(l.sansRdv.map((x) => x.cle)).toEqual(['sans1', 'refus']);
    expect(p.avecRdv.length + p.sansRdv.length).toBe(lignes.length);
  });
  it('le moment présent, à Paris', () => {
    expect(maintenantParis(new Date('2026-11-15T17:05:00Z'))).toBe('2026-11-15 18:05');
  });
});

describe('🔴 (15/11/2026) la colonne « rendez-vous » du listing et la mémoire du tri', async () => {
  const { colonneRdv, jourCourt, lireModeTriRdv, ecrireModeTriRdv, AUCUN_RDV_FIXE } = await import('./triRdvPreavis');
  it('« Pré-visite · dim. 15/11 · 00h16 », « État des lieux · mer. 18/11 · 11h30 » : le prochain à venir, à défaut le dernier passé', () => {
    expect(jourCourt('2026-11-15')).toBe('dim. 15/11'); // le 15/11/2026 est un dimanche
    expect(colonneRdv({ previsite: { statut: 'programmee', rdv: { jour: '2026-11-15', heure: '00:16' } } }, '2026-11-14 12:00'))
      .toEqual({ sorte: 'previsite', quand: '2026-11-15 00:16', texte: 'Pré-visite · dim. 15/11 · 00h16' });
    expect(colonneRdv({ previsite: { statut: 'effectuee', rdv: { jour: '2026-11-15', heure: '00:16' } }, edls: { jour: '2026-11-18', heure: '11:30:00' } }, MAINTENANT))
      .toEqual({ sorte: 'edl', quand: '2026-11-18 11:30', texte: 'État des lieux · mer. 18/11 · 11h30' });
    expect(colonneRdv({ previsite: { statut: 'programmee', rdv: { jour: '2026-11-14', heure: '23:49' } } }, MAINTENANT).texte).toBe('Pré-visite · sam. 14/11 · 23h49'); // passé, gardé
  });
  it('pré-visite effectuée sans état des lieux : « Pré-visite effectuée le 15/11 » ; rien : « — Aucun RDV fixé » ; un refus n’a pas de rendez-vous', () => {
    expect(colonneRdv({ previsite: { statut: 'effectuee', rdv: { jour: '2026-11-15', heure: '00:16' } } }, MAINTENANT)).toEqual({ sorte: 'effectuee', texte: 'Pré-visite effectuée le 15/11' });
    expect(colonneRdv({ previsite: { statut: 'recu' } }, MAINTENANT)).toEqual({ sorte: 'aucun', texte: AUCUN_RDV_FIXE });
    expect(colonneRdv({ previsite: { statut: 'refusee', rdv: { jour: '2026-11-20', heure: '10:00' } } }, MAINTENANT).sorte).toBe('aucun');
  });
  it('la mémoire du tri RDV est VERSIONNÉE : sans préférence, ou un format ancien / invalide → « plus proches d’abord »', () => {
    expect(lireModeTriRdv(null)).toBe('proches');
    expect(lireModeTriRdv('off')).toBe('proches'); // l'ancien format (texte nu) ne survit pas
    expect(lireModeTriRdv('{"v":1,"mode":"off"}')).toBe('proches');
    expect(lireModeTriRdv('{"v":2,"mode":"n-importe"}')).toBe('proches');
    expect(lireModeTriRdv('pas du json')).toBe('proches');
    expect(lireModeTriRdv(ecrireModeTriRdv('lointains'))).toBe('lointains');
    expect(lireModeTriRdv(ecrireModeTriRdv('off'))).toBe('off');
  });
});
