import { describe, expect, it } from 'vitest';
import { causeDeLaReponse, explicationEchec, ligneJournalEchec, MOTIF_DROIT, MOTIF_TECHNIQUE } from './issueEnregistrement';

/** 🔴 Arno (21/10/2026) — plus aucun échec silencieux : la cause d'un refus, les mots de la modale, la ligne de journal. */
describe('causeDeLaReponse', () => {
  it('401 / 403 / ACCES_REVOQUE / INTERDIT → droit ; sans_schema → base ; réseau, 5xx → technique ; sinon saisie', () => {
    expect(causeDeLaReponse({ statut: 403, erreur: 'ACCES_REVOQUE' })).toBe('droit');
    expect(causeDeLaReponse({ statut: 401 })).toBe('droit');
    expect(causeDeLaReponse({ statut: 200, erreur: 'INTERDIT' })).toBe('droit');
    expect(causeDeLaReponse({ statut: 200, etat: 'sans_schema' })).toBe('base');
    expect(causeDeLaReponse({ statut: null })).toBe('technique');
    expect(causeDeLaReponse({ statut: 503, etat: 'erreur' })).toBe('technique');
    expect(causeDeLaReponse({ statut: 400, etat: 'refus' })).toBe('saisie');
  });
});

describe('explicationEchec — quoi, pourquoi, quoi faire, en français simple', () => {
  it('droit : le droit « Location » ou la session, et qui contacter', () => {
    const e = explicationEchec('nouveau-bien', 'droit', null);
    expect(e).toEqual({ quoi: 'Le bien n’a pas été enregistré.', pourquoi: MOTIF_DROIT,
      faire: 'Rechargez la page et reconnectez-vous. Si le refus persiste, demandez à un administrateur d’activer le droit « Location » sur votre compte.',
      conserve: 'Rien n’a été enregistré. Votre saisie est conservée : vous pouvez réessayer.' });
  });
  it('champs : la liste dite, et le bouton de l’écran ; locataire : ses mots', () => {
    expect(explicationEchec('nouveau-locataire', 'champs', 'Il manque : la date d’entrée.')).toMatchObject({
      quoi: 'Le locataire n’a pas été enregistré.', pourquoi: 'Il manque : la date d’entrée.', faire: expect.stringContaining('« Enregistrer »') });
    expect(explicationEchec('nouveau-bien', 'champs', null).faire).toContain('« Enregistrer le bien »');
  });
  it('technique : le motif précis entre parenthèses, jamais deux fois la même phrase', () => {
    expect(explicationEchec('nouveau-bien', 'technique', 'Failed to fetch').pourquoi).toBe(`${MOTIF_TECHNIQUE} (Failed to fetch)`);
    expect(explicationEchec('nouveau-bien', 'technique', MOTIF_TECHNIQUE).pourquoi).toBe(MOTIF_TECHNIQUE);
  });
});

describe('ligneJournalEchec', () => {
  it('une ligne, sans saut, bornée', () => {
    expect(ligneJournalEchec({ compte: 'a@b.fr', ecran: 'nouveau-bien', action: 'creer-bien', cause: 'droit', raison: 'refus\nde la garde' }))
      .toBe('[location:echec] compte=a@b.fr ecran=nouveau-bien action=creer-bien cause=droit raison=refus de la garde');
    expect(ligneJournalEchec({ compte: 'x', ecran: 'e', action: 'a', cause: 'saisie', raison: 'r'.repeat(500) }).length).toBeLessThan(400);
  });
});
