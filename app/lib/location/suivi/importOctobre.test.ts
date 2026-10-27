import { describe, expect, it } from 'vitest';
import type { LigneExcel } from './lectureExcel';
import type { CandidatBail } from './rapprochementImport';
import {
  ATTENDU, moisModifies, numeroDeLot, PREFIXE_CLE, rattacherOctobre, reconnaitreDejaSaisies, scoreAvecLot, tableauEmpreintes,
  type EmpreinteMois, type LigneExistante,
} from './importOctobre';

/**
 * ══ LOCATION — L'IMPORT DES LIGNES D'OCTOBRE 2026 (Arno, 27/10/2026) ═══════════════════════════════════════════════════════════════
 * Décision 2 : les lignes déjà saisies (même mois + même locataire ou propriétaire + même montant) ne sont pas touchées.
 * Décision 5 : rattachement sans ambiguïté, numéro de lot lu. Décision 1 : seul octobre change (empreintes). Noms du fichier d'Arno.
 */
const ligne = (rang: number, proprietaire: string, locataire: string, hp: number, hl: number, p: Partial<LigneExcel> = {}): LigneExcel => ({
  cle: `2026-10#${rang}`, mois: '2026-10', rang, proprietaire, locataire, honoProprietaireHt: hp, honoLocataireHt: hl, caFichier: hp + hl, prime: 0,
  apporteurTexte: null, commission: 0, tauxCommission: null, avenant: false, parking: false, avecGestion: null, ...p,
});
const existante = (id: number, proprietaire: string, locataire: string, hp: number, hl: number): LigneExistante =>
  ({ id, proprietaire, locataire, hp, hl, source: 'saisie', importCle: null });
const candidat = (bailId: number, lotId: number, proprietaire: string, locataires: string, entree = '2026-10-10'): CandidatBail =>
  ({ bailId, lotId, entree, proprietaireId: lotId, proprietaire, locataires, locataireId: bailId, avecGestion: true, parking: false });

describe('décision 2 — les 4 lignes déjà saisies sont reconnues, et seulement elles', () => {
  const fichier = [
    ligne(4, 'LATHAM Marine (Studio)', 'GOUTODIER', 232, 232), ligne(5, 'LATHAM Marine (2P)', 'MAS-LEVY', 491.73, 491.73),
    ligne(15, 'BLANCO', 'BELAHRECH', 0, 230.48), ligne(16, 'CHALAH', 'REIFHI', 0, 0, { prime: 150 }),
    ligne(18, 'COHEN Samuel', '', 0, 214.59, { prime: 150 }), ligne(9, 'NGUYEN', 'RYZHKOVICH', 518.45, 518.45),
  ];
  const enBase = [existante(1, 'BLANCO Ana', 'BELAHRECH Sami', 0, 230.48), existante(2, 'CHALAH', 'REIFHI', 0, 0),
    existante(3, 'COHEN Samuel', 'HANNARD', 0, 214.59), existante(4, 'LATHAM Marine', 'MAS-LEVY Ines', 491.73, 491.73)];

  it('même locataire ou propriétaire ET même montant ; le locataire vide du fichier (COHEN) se reconnaît par le propriétaire', () => {
    const r = reconnaitreDejaSaisies(fichier, enBase);
    expect([...r].map(([cle, e]) => `${cle}=${e.id}`).sort()).toEqual(['2026-10#15=1', '2026-10#16=2', '2026-10#18=3', '2026-10#5=4']);
  });

  it('le montant départage deux lignes du même propriétaire (LATHAM Studio 464 € n’est pas la ligne saisie 983,46 €)', () => {
    expect(reconnaitreDejaSaisies(fichier, enBase).has('2026-10#4')).toBe(false);
  });

  it('un montant différent, ou un autre nom, n’est jamais « déjà saisi » ; une ligne en base ne sert qu’une fois', () => {
    expect(reconnaitreDejaSaisies([ligne(15, 'BLANCO', 'BELAHRECH', 0, 230.47)], enBase).size).toBe(0);
    expect(reconnaitreDejaSaisies([ligne(3, 'NOUN-MOURRA', 'NYANDENI', 0, 230.48)], enBase).size).toBe(0);
    expect(reconnaitreDejaSaisies([ligne(15, 'BLANCO', 'BELAHRECH', 0, 230.48), ligne(19, 'BLANCO', 'BELAHRECH', 0, 230.48)], enBase).size).toBe(1);
  });
});

describe('décision 5 — rattachement sans ambiguïté, numéro de lot lu', () => {
  const numeros = new Map<number, string[]>([[2, ['421']], [3, ['420']], [4, ['116']]]);

  it('le numéro de lot est le dernier mot du propriétaire', () => {
    expect(numeroDeLot('NGO 421')).toBe('421');
    expect(numeroDeLot('DE MIRAMON 1003')).toBe('1003');
    expect(numeroDeLot('LATHAM Marine (2P)')).toBeNull();
    expect(numeroDeLot('SCI CML Parking')).toBeNull();
  });

  it('le lot qui porte le numéro est rattaché (le numéro ne pèse pas contre le nom) ; un lot d’un autre numéro est exclu', () => {
    const l = ligne(6, 'NGO 421', 'OBAGAYELE-CHEME', 416.67, 265.4);
    expect(scoreAvecLot(l, candidat(2, 2, 'NGO Laurence', 'OBAGAYELE-CHEME Paul'), numeros)).toBeGreaterThanOrEqual(0.8);
    expect(scoreAvecLot(l, candidat(3, 3, 'NGO Laurence', 'OBAGAYELE-CHEME Paul'), numeros)).toBe(0);
    expect(scoreAvecLot(ligne(7, 'MURDOCK 115', 'ASSOUAN', 416.67, 230.1), candidat(4, 4, 'MURDOCK Fiona', 'ASSOUAN Eva'), numeros)).toBe(0);
  });

  it('deux baux au-dessus du seuil : « à rattacher », les deux candidats montrés ; un seul : rattaché ; aucun bail ne sert deux fois', () => {
    const r = rattacherOctobre([ligne(11, 'JEULIN', 'PIEULHET', 0, 425.66), ligne(9, 'NGUYEN', 'RYZHKOVICH', 518.45, 518.45)],
      [candidat(7, 7, 'JEULIN Patrice', 'PIEULHET Marc'), candidat(8, 8, 'JEULIN Patrice', 'PIEULHET Lea'), candidat(1, 1, 'NGUYEN Giang', 'RYZHKOVICH Anna')], numeros);
    expect(r.get('2026-10#11')).toMatchObject({ ambigu: true, rapprochement: { statut: 'non_rattache', candidat: null } });
    expect(r.get('2026-10#11')?.candidats.map((x) => x.c.bailId)).toEqual([7, 8]);
    expect(r.get('2026-10#9')).toMatchObject({ ambigu: false, rapprochement: { statut: 'rattache', candidat: { bailId: 1 } } });
  });

  it('un bail trop éloigné du mois, ou un nom différent : aucun candidat, « à rattacher »', () => {
    const r = rattacherOctobre([ligne(17, 'VM IMMO INVEST', 'BRITEL', 593.48, 1208.33)], [candidat(5, 5, 'VM IMMO INVEST', 'BRITEL Nora', '2025-05-19')], numeros);
    expect(r.get('2026-10#17')).toMatchObject({ candidats: [], rapprochement: { statut: 'non_rattache' } });
  });
});

describe('décision 1 — seul octobre change', () => {
  const e = (mois: string, lignes: number, montantHt: number, controle: string): EmpreinteMois => ({ mois, lignes, montantHt, controle });
  const avant = [e('2026-09', 17, 9000, 'aaa'), e('2026-10', 4, 1428.53, 'bbb')];

  it('octobre changé, les autres identiques : rien à signaler ; un autre mois changé : il est nommé', () => {
    expect(moisModifies(avant, [e('2026-09', 17, 9000, 'aaa'), e('2026-10', 16, 11177.77, 'ccc')])).toEqual([]);
    expect(moisModifies(avant, [e('2026-09', 17, 9000, 'zzz'), e('2026-10', 16, 11177.77, 'ccc')])).toEqual(['2026-09']);
    expect(moisModifies(avant, [e('2026-08', 1, 10, 'q'), ...avant])).toEqual(['2026-08']);
  });

  it('le tableau dit « identique » ou « CHANGÉ » mois par mois', () => {
    const t = tableauEmpreintes(avant, [e('2026-09', 17, 9000, 'aaa'), e('2026-10', 16, 11177.77, 'ccc')]);
    expect(t).toContain('2026-09 : avant 17 ligne(s)');
    expect(t.split('\n')[0]).toContain('identique');
    expect(t.split('\n')[1]).toContain('CHANGÉ');
  });

  it('l’attendu d’Arno, et la clé de la reprise', () => {
    expect(ATTENDU).toEqual({ lignes: 12, totalHt: 9749.24 });
    expect(PREFIXE_CLE).toBe('CA_JBP_2026#2026-10#');
  });
});
