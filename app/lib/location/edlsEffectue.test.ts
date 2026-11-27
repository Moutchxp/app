import { describe, expect, it } from 'vitest';
import { cartoucheEdls, DELAI_EDLS_EFFECTUE_MS, edlsEffectue, etapesPreavis } from './frisePreavis';
import { statutPrevisite } from './previsite';
import type { LignePreavisAccueil } from './preavis';

/**
 * 🔴🔴 Arno (27/11/2026, 21h19) — L'ÉTAT DES LIEUX DE SORTIE EFFECTUÉ, AUTOMATIQUEMENT, dès la FIN prévue + 1 h. Horloge SIMULÉE : l'instant est
 * passé en paramètre (jamais l'heure de la machine). Rendez-vous du 10/12/2026 de 10h00 à 11h00, heure de Paris (UTC+1 en décembre) :
 * fin = 10h00 UTC, effectué à 11h00 UTC pile. La pré-visite, elle, ne change pas (effectuée par le geste du compte rendu, Arno, 13/11/2026).
 */
const RDV = { jour: '2026-12-10', heure: '10:00', dureeMinutes: 60, confieA: 'Claire Test', statut: 'acceptee' as const };
const a = (iso: string): Date => new Date(iso);

describe('edlsEffectue — fin prévue + 1 h', () => {
  it('le délai est d’une heure', () => {
    expect(DELAI_EDLS_EFFECTUE_MS).toBe(3_600_000);
  });
  it('avant le RDV, pendant, à fin + 59 min : pas encore effectué ; à fin + 1 h pile : effectué ; après : effectué', () => {
    expect(edlsEffectue(RDV, a('2026-12-10T08:30:00Z'))).toBe(false); // 9h30 Paris : avant
    expect(edlsEffectue(RDV, a('2026-12-10T09:30:00Z'))).toBe(false); // 10h30 Paris : pendant
    expect(edlsEffectue(RDV, a('2026-12-10T10:00:00Z'))).toBe(false); // 11h00 Paris : fin
    expect(edlsEffectue(RDV, a('2026-12-10T10:59:00Z'))).toBe(false); // fin + 59 min
    expect(edlsEffectue(RDV, a('2026-12-10T10:59:59.999Z'))).toBe(false);
    expect(edlsEffectue(RDV, a('2026-12-10T11:00:00Z'))).toBe(true); // fin + 1 h
    expect(edlsEffectue(RDV, a('2026-12-11T08:00:00Z'))).toBe(true);
  });
  it('la FIN suit la durée (1 h 30 : effectué à fin 11h30 + 1 h) ; heure d’été (UTC+2)', () => {
    expect(edlsEffectue({ ...RDV, dureeMinutes: 90 }, a('2026-12-10T11:29:00Z'))).toBe(false);
    expect(edlsEffectue({ ...RDV, dureeMinutes: 90 }, a('2026-12-10T11:30:00Z'))).toBe(true);
    const ete = { ...RDV, jour: '2026-06-10' };
    expect(edlsEffectue(ete, a('2026-06-10T09:59:00Z'))).toBe(false); // 11h59 Paris
    expect(edlsEffectue(ete, a('2026-06-10T10:00:00Z'))).toBe(true); // 12h00 Paris = fin 11h00 + 1 h
  });
  it('refusé par le collègue (à réattribuer) : jamais effectué ; aucun état des lieux : non', () => {
    expect(edlsEffectue({ ...RDV, statut: 'refusee' }, a('2027-01-01T00:00:00Z'))).toBe(false);
    expect(edlsEffectue(null, a('2027-01-01T00:00:00Z'))).toBe(false);
    expect(edlsEffectue({ ...RDV, statut: 'en_attente' }, a('2026-12-10T11:00:00Z'))).toBe(true);
    expect(edlsEffectue({ ...RDV, statut: null }, a('2026-12-10T11:00:00Z'))).toBe(true);
  });
});

describe('le cartouche de la case 3', () => {
  it('RDV fixé : « RDV fixé — le JJ/MM/AAAA de HHhMM à HHhMM', () => {
    const c = cartoucheEdls(RDV, a('2026-12-10T10:59:00Z'));
    expect([c.texte, c.effectue]).toEqual(['RDV fixé — le 10/12/2026 de 10h00 à 11h00', false]);
  });
  it('effectué : « État des lieux effectué — le JJ/MM/AAAA de HHhMM à HHhMM', () => {
    const c = cartoucheEdls(RDV, a('2026-12-10T11:00:00Z'));
    expect([c.texte, c.effectue]).toEqual(['État des lieux effectué — le 10/12/2026 de 10h00 à 11h00', true]);
  });
  it('sans instant : jamais effectué (le texte « RDV fixé »)', () => {
    expect(cartoucheEdls(RDV).effectue).toBe(false);
  });
});

const ligne = (o: Partial<LignePreavisAccueil> = {}): LignePreavisAccueil => ({
  cle: 'C', occupationId: 11, occupationIds: [11], lotId: 7, adresse: '4 rue Fictive', locataires: [], recuLe: '2026-10-01', dateMax: '2026-12-31',
  etatDesLieuxLe: '2026-12-10', previsite: { statut: 'effectuee', rdv: { jour: '2026-11-20', heure: '10:00', dureeMinutes: 30 } },
  edls: { edlsId: 1, tacheId: 500, ...RDV, confieAId: 4, reponduPar: null, motifRefus: null }, ...o,
} as unknown as LignePreavisAccueil);

describe('la frise : la case 3 passe au VERT (étape faite) à fin + 1 h', () => {
  const etape3 = (maintenant: Date) => etapesPreavis(ligne(), '2026-12-10', { maintenant }).find((e) => e.cle === 'edls')!;
  it('avant, pendant, fin + 59 min : « programmée », étape en cours ; fin + 1 h : « faite », l’étape 4 devient la courante', () => {
    for (const t of ['2026-12-10T08:30:00Z', '2026-12-10T09:30:00Z', '2026-12-10T10:59:00Z']) {
      expect([etape3(a(t)).statut, etape3(a(t)).enCours], t).toEqual(['programmee', true]);
    }
    expect([etape3(a('2026-12-10T11:00:00Z')).statut, etape3(a('2026-12-10T11:00:00Z')).enCours]).toEqual(['faite', false]);
    expect(etapesPreavis(ligne(), '2026-12-10', { maintenant: a('2026-12-10T11:00:00Z') }).find((e) => e.enCours)?.cle).toBe('sortie');
  });
  it('sans instant (écran de validation de sortie) : la règle du jour, inchangée', () => {
    expect(etapesPreavis(ligne(), '2026-12-10').find((e) => e.cle === 'edls')!.statut).toBe('programmee');
    expect(etapesPreavis(ligne(), '2026-12-11').find((e) => e.cle === 'edls')!.statut).toBe('faite');
  });
  it('la PRÉ-VISITE ne change pas : programmée, sa fin + 1 h passée, elle reste « programmée » tant que le compte rendu n’est pas envoyé', () => {
    const p = { recuLe: '2026-10-01', rdvSaisiLe: '2026-11-20T10:00:00Z', rdvModifieLe: null, refusLe: null, effectueeLe: null };
    expect(statutPrevisite(p as Parameters<typeof statutPrevisite>[0], '2027-01-15')).toBe('programmee');
    const l = ligne({ previsite: { statut: 'programmee', rdv: { jour: '2026-12-01', heure: '10:00', dureeMinutes: 30 } } as LignePreavisAccueil['previsite'] });
    expect(etapesPreavis(l, '2026-12-10', { maintenant: a('2026-12-10T11:00:00Z') }).find((e) => e.cle === 'previsite')!.statut).toBe('programmee');
  });
});
