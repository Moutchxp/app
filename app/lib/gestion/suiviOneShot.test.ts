import { describe, it, expect } from 'vitest';
import {
  AUTEURS_HORS_ONE_SHOT, exceptionEstUnGeste, modificationDeLaSortie, modificationDeMarque, modificationsDeLException,
  motBienCourt, motClassementDeFond, motParLe, motPastilleOneShot, photoDuFond, photoLue, sortieEstUnGeste,
  MOT_FOND_RECALCULE, MOT_PASTILLE_ONE_SHOT,
} from './suiviOneShot';
import type { Classement } from './periodesConversation';

/**
 * ══ 🔴🔴 LOT PASTILLE-SUIVI-MODIFIE-ONE-SHOT — LE MODULE PUR ══════════════════════════════════════════════════════
 *
 * Ce qui est éprouvé ici : QUAND il y a modification « ce mail uniquement » (et quand il n'y en a pas), COMBIEN (le
 * « ×N »), et COMMENT on la dit (suivi de fond / modifié pour ce mail / par / le), pour chaque type de geste trouvé à la
 * reconnaissance : exception de biens (retrait, ajout, remplacement, parties), exception Interne / Hors gestion, et
 * sortie du suivi d'un bien.
 */

const A = { cle: '316', libelle: '54 avenue du Puvis de Chavannes, COURBEVOIE — Appartement — lot 316' };
const B = { cle: '24', libelle: '15 rue Carle Hebert, COURBEVOIE — lot 24' };
const fondA: Classement = { sorte: 'biens', biens: [A] };
const PAR = 'Arnaud Jorel';
const LE = '2026-10-11T16:12:00Z';

describe('la pastille', () => {
  it('aucune pastille sans modification', () => {
    expect(motPastilleOneShot(0)).toBeNull();
    expect(motPastilleOneShot(-1)).toBeNull();
  });
  it('une modification : le mot seul', () => {
    expect(motPastilleOneShot(1)).toBe('Suivi modifié en one shot');
  });
  it('plusieurs : « ×N »', () => {
    expect(motPastilleOneShot(2)).toBe(`${MOT_PASTILLE_ONE_SHOT} ×2`);
    expect(motPastilleOneShot(3)).toBe(`${MOT_PASTILLE_ONE_SHOT} ×3`);
  });
});

describe('qui compte comme geste', () => {
  it('la reprise des périodes n’est pas un geste one shot', () => {
    expect(AUTEURS_HORS_ONE_SHOT).toContain('reprise des périodes');
    expect(exceptionEstUnGeste('reprise des périodes')).toBe(false);
    expect(exceptionEstUnGeste('automatique')).toBe(false);
    expect(exceptionEstUnGeste('')).toBe(false);
    expect(exceptionEstUnGeste('a.jorel@sansvisavis.com')).toBe(true);
  });
  it('une sortie écrite par une projection n’est pas un geste ; le bouton et « remplacé par » le sont', () => {
    const auto = ['retiré par le suivi de la conversation'];
    expect(sortieEstUnGeste({ par: 'a.jorel@sansvisavis.com', motif: auto[0], motifsAutomatiques: auto })).toBe(false);
    expect(sortieEstUnGeste({ par: 'automatique', motif: null, motifsAutomatiques: auto })).toBe(false);
    expect(sortieEstUnGeste({ par: 'a.jorel@sansvisavis.com', motif: null, motifsAutomatiques: auto })).toBe(true);
    expect(sortieEstUnGeste({ par: 'a.jorel@sansvisavis.com', motif: 'remplacé par lot 24', motifsAutomatiques: auto }))
      .toBe(true);
  });
});

describe('exception de biens', () => {
  it('🔴 la même chose que le fond : AUCUNE modification (pas de pastille)', () => {
    expect(modificationsDeLException({ fond: fondA, exception: { sorte: 'biens', biens: [A] }, par: PAR, le: LE }))
      .toEqual([]);
  });
  it('aucune fenêtre et « aucun bien » : rien n’a changé', () => {
    expect(modificationsDeLException({ fond: undefined, exception: { sorte: 'biens', biens: [] }, par: PAR, le: LE }))
      .toEqual([]);
  });
  it('sortir d’un bien : une ligne avec avant / après / auteur / date', () => {
    const l = modificationsDeLException({ fond: fondA, exception: { sorte: 'biens', biens: [] }, par: PAR, le: LE });
    expect(l).toEqual([{
      fond: 'rattaché à 54 avenue du Puvis de Chavannes, COURBEVOIE (lot 316)',
      modifie: 'sorti du suivi de 54 avenue du Puvis de Chavannes, COURBEVOIE (lot 316)',
      par: PAR, le: LE,
    }]);
  });
  it('rattacher aussi à un second bien : une ligne', () => {
    const l = modificationsDeLException({ fond: fondA, exception: { sorte: 'biens', biens: [A, B] }, par: PAR, le: LE });
    expect(l.map((x) => x.modifie)).toEqual(['rattaché aussi à 15 rue Carle Hebert, COURBEVOIE (lot 24)']);
  });
  it('remplacer un bien par un autre : DEUX modifications (×2)', () => {
    const l = modificationsDeLException({ fond: fondA, exception: { sorte: 'biens', biens: [B] }, par: PAR, le: LE });
    expect(l.map((x) => x.modifie)).toEqual([
      'sorti du suivi de 54 avenue du Puvis de Chavannes, COURBEVOIE (lot 316)',
      'rattaché aussi à 15 rue Carle Hebert, COURBEVOIE (lot 24)',
    ]);
    expect(motPastilleOneShot(l.length)).toBe('Suivi modifié en one shot ×2');
  });
  it('sans fenêtre : « rattaché à », et le fond dit qu’il n’y avait aucun suivi', () => {
    const l = modificationsDeLException({ fond: undefined, exception: { sorte: 'biens', biens: [B] }, par: PAR, le: LE });
    expect(l).toEqual([{
      fond: 'aucun suivi de conversation (mail à classer)',
      modifie: 'rattaché à 15 rue Carle Hebert, COURBEVOIE (lot 24)', par: PAR, le: LE,
    }]);
  });
  it('affecter une partie pour ce mail seulement', () => {
    const l = modificationsDeLException({
      fond: fondA, par: PAR, le: LE,
      exception: { sorte: 'biens', biens: [A], personnes: [{ sorte: 'locataire', cle: 'L1', libelle: 'Nevine Abdellatif' }] },
    });
    expect(l.map((x) => x.modifie)).toEqual(['partie LOCATAIRE ajoutée : Nevine Abdellatif']);
  });
  it('retirer une partie du fond', () => {
    const fond: Classement = { sorte: 'biens', biens: [A], personnes: [{ sorte: 'proprietaire', cle: 'P1', libelle: 'M. Dupont' }] };
    const l = modificationsDeLException({ fond, exception: { sorte: 'biens', biens: [A] }, par: PAR, le: LE });
    expect(l).toEqual([{
      fond: 'rattaché à 54 avenue du Puvis de Chavannes, COURBEVOIE (lot 316), partie PROPRIÉTAIRE M. Dupont',
      modifie: 'partie PROPRIÉTAIRE retirée : M. Dupont', par: PAR, le: LE,
    }]);
  });
  it('⚠️ un mail qui perd tous ses biens ne compte pas en plus ses parties', () => {
    const fond: Classement = { sorte: 'biens', biens: [A], personnes: [{ sorte: 'locataire', cle: 'L1', libelle: 'X' }] };
    expect(modificationsDeLException({ fond, exception: { sorte: 'biens', biens: [] }, par: PAR, le: LE })).toHaveLength(1);
  });
});

describe('exception Interne / Hors gestion', () => {
  it('classé Interne pour ce mail seulement', () => {
    const l = modificationsDeLException({ fond: fondA, exception: { sorte: 'interne', biens: [] }, par: PAR, le: LE });
    expect(l).toEqual([{
      fond: 'rattaché à 54 avenue du Puvis de Chavannes, COURBEVOIE (lot 316)', modifie: 'classé Interne', par: PAR, le: LE,
    }]);
  });
  it('classé Hors gestion', () => {
    const l = modificationsDeLException({ fond: fondA, exception: { sorte: 'hors_gestion', biens: [] }, par: PAR, le: LE });
    expect(l.map((x) => x.modifie)).toEqual(['classé Hors gestion']);
  });
  it('🔴 Interne sur un échange déjà marqué interne, sans fenêtre : rien n’a changé (cas réel du mail 57300)', () => {
    expect(modificationsDeLException({
      fond: undefined, exception: { sorte: 'interne', biens: [] }, interneDeLEchange: true, par: PAR, le: LE,
    })).toEqual([]);
  });
  it('rattacher à un bien un mail dont le fond est Interne', () => {
    const l = modificationsDeLException({
      fond: { sorte: 'interne', biens: [] }, exception: { sorte: 'biens', biens: [B] }, par: PAR, le: LE,
    });
    expect(l).toEqual([{
      fond: 'classé Interne', modifie: 'rattaché à 15 rue Carle Hebert, COURBEVOIE (lot 24)', par: PAR, le: LE,
    }]);
  });
});

describe('sortie du suivi d’un bien', () => {
  it('le bouton « Sortir du suivi » : avant = rattaché, après = sorti', () => {
    expect(modificationDeLaSortie({ bienLibelle: A.libelle, par: PAR, le: LE })).toEqual({
      fond: 'rattaché à 54 avenue du Puvis de Chavannes, COURBEVOIE (lot 316)',
      modifie: 'sorti du suivi de 54 avenue du Puvis de Chavannes, COURBEVOIE (lot 316)', par: PAR, le: LE,
    });
  });
  it('« Remplacer par » : le motif est dit tel quel', () => {
    expect(modificationDeLaSortie({ bienLibelle: A.libelle, motif: 'remplacé par lot 24', par: PAR, le: LE }).modifie)
      .toBe('sorti du suivi de 54 avenue du Puvis de Chavannes, COURBEVOIE (lot 316) (remplacé par lot 24)');
  });
});

describe('les mots', () => {
  it('« Par …, le JJ/MM/AAAA à HH:MM », heure de Paris', () => {
    expect(motParLe('Arnaud Jorel', '2026-10-11T16:12:00Z')).toBe('Par Arnaud Jorel, le 11/10/2026 à 18:12');
    expect(motParLe('Arnaud Jorel', '2026-01-05T08:03:00Z')).toBe('Par Arnaud Jorel, le 05/01/2026 à 09:03');
    expect(motParLe('Arnaud Jorel', null)).toBe('Par Arnaud Jorel');
  });
  it('le nom court d’un bien garde l’adresse et le lot', () => {
    expect(motBienCourt(A.libelle)).toBe('54 avenue du Puvis de Chavannes, COURBEVOIE (lot 316)');
    expect(motBienCourt('Résidence sans tiret')).toBe('Résidence sans tiret');
    expect(motBienCourt('')).toBe('un bien sans nom');
  });
  it('le fond, en une phrase', () => {
    expect(motClassementDeFond({ sorte: 'interne', biens: [] })).toBe('classé Interne');
    expect(motClassementDeFond({ sorte: 'biens', biens: [] })).toBe('aucun bien (mail à classer)');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT TRACE-ONE-SHOT (migration 342) — LA PHOTO DU FOND, ET LES MARQUES « CE MAIL UNIQUEMENT »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('la photo du suivi de fond', () => {
  const periodes = [{ id: 1, depuisMessageId: 10, classement: { sorte: 'biens' as const, biens: [A],
    personnes: [{ sorte: 'locataire' as const, cle: 'L1', libelle: 'Nevine Abdellatif', contactExterneId: 9 }] } }];
  it('photographie la fenêtre qui couvre le mail (sorte, biens, parties) et la marque d’échange', () => {
    const p = photoDuFond({ messageId: 11, mails: [10, 11], periodes, interneEchange: true, le: new Date(LE) });
    expect(p).toEqual({
      fenetre: { sorte: 'biens', biens: [A], personnes: [{ sorte: 'locataire', cle: 'L1', libelle: 'Nevine Abdellatif' }] },
      interneEchange: true, le: '2026-10-11T16:12:00.000Z',
    });
  });
  it('aucune fenêtre : `fenetre` vaut null (ce n’est pas « aucun bien »)', () => {
    expect(photoDuFond({ messageId: 9, mails: [9, 10], periodes, interneEchange: false, le: new Date(LE) }).fenetre).toBeNull();
  });
  it('une photo lue en base se relit ; une photo illisible rend null (on recalculera)', () => {
    expect(photoLue({ fenetre: { sorte: 'biens', biens: [A] }, interneEchange: false, le: LE })?.fenetre?.biens).toEqual([A]);
    expect(photoLue({ fenetre: null, interneEchange: true, le: LE })).toEqual({ fenetre: null, interneEchange: true, le: LE });
    for (const x of [null, 'x', 7, { fenetre: { sorte: 'autre', biens: [] } }, { fenetre: { sorte: 'biens' } }]) {
      expect(photoLue(x), JSON.stringify(x)).toBeNull();
    }
  });
  it('le fond recalculé est DIT ; le fond photographié ne l’est pas', () => {
    const avec = modificationsDeLException({ fond: fondA, exception: { sorte: 'biens', biens: [] }, fondRecalcule: false, par: PAR, le: LE });
    const sans = modificationsDeLException({ fond: fondA, exception: { sorte: 'biens', biens: [] }, fondRecalcule: true, par: PAR, le: LE });
    expect(avec[0].fondRecalcule).toBe(false);
    expect(sans[0].fondRecalcule).toBe(true);
    expect(MOT_FOND_RECALCULE).toBe('(suivi de fond recalculé aujourd’hui)');
  });
});

describe('« Interne » / « Hors gestion » posés sur ce mail uniquement', () => {
  it('classé Interne, avec le fond de la photo', () => {
    expect(modificationDeMarque({ sorte: 'interne', fond: fondA, interneEchange: false, fondRecalcule: false, par: PAR, le: LE }))
      .toEqual([{ fond: 'rattaché à 54 avenue du Puvis de Chavannes, COURBEVOIE (lot 316)', modifie: 'classé Interne',
        par: PAR, le: LE, fondRecalcule: false }]);
  });
  it('classé Hors gestion, sans fenêtre', () => {
    expect(modificationDeMarque({ sorte: 'hors_gestion', fond: undefined, interneEchange: false, fondRecalcule: true, par: PAR, le: LE })[0])
      .toMatchObject({ fond: 'aucun suivi de conversation (mail à classer)', modifie: 'classé Hors gestion', fondRecalcule: true });
  });
  it('🔴 rien n’a changé si le fond disait déjà la même chose (échange déjà interne)', () => {
    expect(modificationDeMarque({ sorte: 'interne', fond: undefined, interneEchange: true, fondRecalcule: false, par: PAR, le: LE })).toEqual([]);
  });
  it('une sortie du suivi dit le fond entier quand il est connu', () => {
    const m = modificationDeLaSortie({ bienLibelle: A.libelle, par: PAR, le: LE,
      fond: { classement: { sorte: 'biens', biens: [A, B] }, interneEchange: false, recalcule: false } });
    expect(m.fond).toBe('rattaché à 54 avenue du Puvis de Chavannes, COURBEVOIE (lot 316), 15 rue Carle Hebert, COURBEVOIE (lot 24)');
    expect(m.fondRecalcule).toBe(false);
  });
});
