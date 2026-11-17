import { describe, expect, it } from 'vitest';
import { digicodesBienLisibles, reporterSaisieBien, type DigicodesAdresseSaisis } from './DigicodesCopropriete';

/** 🔴 Arno (17/11/2026 — l'écart du lot 4) : ce qui est saisi avant l'adresse n'est jamais perdu ; un code connu n'est jamais écrasé. */
const VIDE: DigicodesAdresseSaisis = { cle: '', voie: '', codePostal: null, commune: null, commun: { code: '', aucun: false }, communInitial: { code: '', aucun: false }, batiments: [] };
const CONNU = { connu: true, valeur: { digicode: true, code: '1234' }, depuis: null, source: 'unifie' as const, aVenir: [], aArbitrer: [], historique: [] };

describe('le report de la saisie quand l’adresse arrive', () => {
  it('la place sans code connu reçoit le code commun et celui du bâtiment déjà saisis', () => {
    const avant = { ...VIDE, commun: { code: '9999', aucun: false }, batiments: [{ k: 'b', libelle: 'B', code: '2B', aucun: false, nouveau: false, initial: { code: '', aucun: false } }] };
    const apres = { ...VIDE, cle: '15 rue fictive', voie: '15 rue Fictive' };
    const r = reporterSaisieBien(avant, apres);
    expect(r.commun).toEqual({ code: '9999', aucun: false });
    expect(r.batiments.map((b) => [b.libelle, b.code])).toEqual([['B', '2B']]);
    expect(r.voie).toBe('15 rue Fictive');
  });
  it('🔴 un code CONNU de la nouvelle place n’est jamais écrasé ; rien saisi : rien reporté', () => {
    const avant = { ...VIDE, commun: { code: '9999', aucun: false } };
    const apres = { ...VIDE, cle: 'x', communEtat: CONNU as never };
    expect(reporterSaisieBien(avant, apres).commun).toEqual({ code: '', aucun: false });
    expect(reporterSaisieBien(VIDE, { ...VIDE, cle: 'y' }).commun).toEqual({ code: '', aucun: false });
    expect(reporterSaisieBien(null, apres)).toBe(apres);
  });
  it('une réponse illisible du serveur vaut « non disponible »', () => {
    expect(digicodesBienLisibles([])).toBeNull();
    expect(digicodesBienLisibles(null)).toBeNull();
    expect(digicodesBienLisibles({ adresse: { cle: '', batiments: [] }, connus: [] })).not.toBeNull();
  });
});
