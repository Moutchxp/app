import { describe, expect, it } from 'vitest';
import { codeDigicodeTropLong, MAX_CODE_DIGICODE, MOTIF_CODE_DIGICODE_TROP_LONG, TEXTE_LIMITE_CODE_DIGICODE, verifierDigicode } from './digicodeImmeuble';
import { valeurSaisie, validerDigicodesBien } from '../gestion/digicodes';
import { verifierComplements } from './bienComplet';

/** 🔴🔴 Décision d'Arno (26/11/2026) — « une seule limite partout, 15 caractères, celle de la base […] plus jamais de code coupé sans prévenir ». */
const C = (n: number) => 'A1B2C3D4E5F6G7H8I9J0K'.slice(0, n);
describe('la longueur d’un digicode : 15, partout, refusée au-delà, jamais coupée', () => {
  it('la constante unique et ses mots', () => {
    expect([MAX_CODE_DIGICODE, TEXTE_LIMITE_CODE_DIGICODE, MOTIF_CODE_DIGICODE_TROP_LONG]).toEqual([15, '15 caractères au maximum', 'Digicode trop long : 15 caractères au maximum.']);
  });
  it('8 et 15 caractères : acceptés tels quels (la base unique et l’ancienne règle)', () => {
    for (const n of [8, 15]) {
      expect(valeurSaisie({ digicode: true, code: C(n) })).toEqual({ ok: true, valeur: { digicode: true, code: C(n) } });
      expect(verifierDigicode({ digicode: true, code: C(n) })).toEqual({ ok: true, valeur: { digicode: true, code: C(n) } });
      expect(codeDigicodeTropLong(C(n))).toBe(false);
    }
  });
  it('16 et 21 caractères : REFUSÉS par le serveur, avec le message — jamais coupés à 15 ni à 20', () => {
    for (const n of [16, 21]) {
      expect(valeurSaisie({ digicode: true, code: C(n) })).toEqual({ ok: false, motif: MOTIF_CODE_DIGICODE_TROP_LONG });
      expect(verifierDigicode({ digicode: true, code: C(n) })).toEqual({ ok: false, motif: MOTIF_CODE_DIGICODE_TROP_LONG });
      expect(codeDigicodeTropLong(C(n))).toBe(true);
    }
  });
  it('les codes d’un bien (validerDigicodesBien) passent ENTIERS : plus de coupe à 20 — le refus vient de l’écriture', () => {
    const d = validerDigicodesBien({ commun: { code: C(21), aucun: false }, batiment: 'A', codeBatiment: { code: ` ${C(16)} `, aucun: false } });
    expect(JSON.stringify(d)).toContain(`"${C(21)}"`);
    expect(JSON.stringify(d)).toContain(`"${C(16)}"`);
  });
  it('l’ancien champ « Code » d’un bien (bienComplet) : 15 accepté, 16 refusé avec le message', () => {
    const ok15 = verifierComplements({ digicode: 'oui', digicodeCode: C(15) });
    expect(ok15.ok && ok15.valeurs.digicodeCode).toBe(C(15));
    expect(verifierComplements({ digicode: 'oui', digicodeCode: C(16) })).toEqual({ ok: false, motif: MOTIF_CODE_DIGICODE_TROP_LONG });
    expect(verifierComplements({ digicode: 'oui', digicodeCode: C(21) })).toEqual({ ok: false, motif: MOTIF_CODE_DIGICODE_TROP_LONG });
  });
});
