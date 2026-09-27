import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  actionsDuStatut, libelleCartouche, lienVersCarte, precisionCartouche, statutDuMessage, tonCartouche,
  type EtatFil, type StatutClassement, capsuleStatut, motCapsule, bulleCapsule} from './statutClassement';
import { ecrireEtatUrl } from './ecranUrl';

/**
 * LOT 5-STATUT — LE STATUT DE CLASSEMENT. Trois façons de se tromper, et chacune se voit à l'écran :
 *   ① un mail déplacé SEUL affiche la carte de son échange → on croit qu'il l'a suivie, alors qu'il est ailleurs ;
 *   ② la couleur porte l'information seule → le cartouche devient muet en niveaux de gris, pour un daltonien, et
 *      pour un lecteur d'écran ;
 *   ③ un statut propose un geste qui n'existe pas → un bouton qui ment coûte plus cher qu'une absence.
 */

const fil = (o: Partial<EtatFil> = {}): EtatFil => ({ etat: 'a_classer', reference: null, evenementId: null, ...o });
const CLASSE = fil({ reference: 'GES-2026-000012', evenementId: 12, evenementObjet: 'Fuite salle de bain' });

describe('🔴 ① quel statut, et dans quel ordre', () => {
  it('rien de particulier → « À classer »', () => {
    expect(statutDuMessage(fil())).toEqual({ sorte: 'a_classer' });
  });

  it('échange rattaché → la carte, avec sa référence ET son titre', () => {
    expect(statutDuMessage(CLASSE)).toEqual({
      sorte: 'carte', reference: 'GES-2026-000012', libelle: 'Fuite salle de bain', evenementId: 12, propre: false,
    });
  });

  it('échange classé sans suite → « Sans suite »', () => {
    expect(statutDuMessage(fil({ etat: 'sans_suite' }))).toEqual({ sorte: 'sans_suite' });
  });

  it('message tenu hors de la file → « Courrier automatique », avec son motif', () => {
    const s = statutDuMessage(fil(), { horsFile: true, motifHorsFile: 'envoi de document produit par un logiciel' });
    expect(s).toEqual({ sorte: 'automatique', motif: 'envoi de document produit par un logiciel' });
  });

  it('🔴 ① un mail déplacé SEUL montre SA carte, jamais celle de son échange', () => {
    const s = statutDuMessage(CLASSE, { carteDuMail: { reference: 'GES-2026-000099', libelle: 'Bail', evenementId: 99 } });
    expect(s).toMatchObject({ sorte: 'carte', reference: 'GES-2026-000099', propre: true });
  });

  it('…et il l’emporte même sur « courrier automatique » : être ailleurs prime sur être écarté', () => {
    const s = statutDuMessage(fil(), {
      horsFile: true, carteDuMail: { reference: 'GES-2026-000099', libelle: null, evenementId: 99 },
    });
    expect(s.sorte).toBe('carte');
  });

  it('une référence vide n’est PAS une carte — elle ne ferait qu’un cartouche creux', () => {
    expect(statutDuMessage(fil({ reference: '' })).sorte).toBe('a_classer');
  });
});

describe('🔴 ② le MOT est toujours écrit, la couleur ne fait qu’appuyer', () => {
  const tous: StatutClassement[] = [
    statutDuMessage(CLASSE), statutDuMessage(fil()), statutDuMessage(fil({ etat: 'sans_suite' })),
    statutDuMessage(fil(), { horsFile: true }),
  ];

  it('aucun statut ne rend un libellé vide', () => {
    for (const s of tous) expect(libelleCartouche(s).trim().length).toBeGreaterThan(2);
  });

  it('les libellés sont ceux qu’Arno a demandés, mot pour mot', () => {
    expect(libelleCartouche(statutDuMessage(CLASSE))).toBe('GES-2026-000012 · Fuite salle de bain');
    expect(libelleCartouche(statutDuMessage(fil()))).toBe('À classer');
    expect(libelleCartouche(statutDuMessage(fil({ etat: 'sans_suite' })))).toBe('Sans suite');
    expect(libelleCartouche(statutDuMessage(fil(), { horsFile: true }))).toBe('Courrier automatique');
  });

  it('une carte sans titre connu se contente de sa référence — jamais d’un « · » orphelin', () => {
    expect(libelleCartouche(statutDuMessage(fil({ reference: 'GES-2026-000001', evenementId: 1 })))).toBe('GES-2026-000001');
    expect(libelleCartouche(statutDuMessage(fil({ reference: 'GES-2026-000001', evenementId: 1, evenementObjet: '   ' })))).toBe('GES-2026-000001');
  });

  it('le VERT est réservé à « classé dans une carte » ; les autres ne s’y trompent pas', () => {
    expect(tonCartouche(statutDuMessage(CLASSE))).toBe('succes');
    expect(tonCartouche(statutDuMessage(fil()))).toBe('attente');
    expect(tonCartouche(statutDuMessage(fil({ etat: 'sans_suite' })))).toBe('neutre');
    expect(tonCartouche(statutDuMessage(fil(), { horsFile: true }))).toBe('neutre');
  });

  it('chaque statut sait s’expliquer en une phrase — et la carte d’un mail déplacé dit qu’il est SEUL', () => {
    for (const s of tous) expect(precisionCartouche(s)).not.toBeNull();
    const seul = statutDuMessage(fil(), { carteDuMail: { reference: 'GES-1', libelle: null, evenementId: 1 } });
    expect(precisionCartouche(seul)).toContain('seul');
  });
});

describe('🔴 ③ ce que chaque statut PROPOSE — rien de plus que ce qui existe', () => {
  it('« À classer » → classer, créer, classer sans suite', () => {
    const p = actionsDuStatut(statutDuMessage(fil()));
    expect(p.declencheur).toBe('Classer');
    expect(p.actions.map((a) => a.cle)).toEqual(['classer', 'creer', 'sans_suite']);
  });

  it('classé dans une carte → changer l’affectation, créer, classer sans suite', () => {
    const p = actionsDuStatut(statutDuMessage(CLASSE));
    expect(p.declencheur).toBe('Modifier');
    expect(p.actions.map((a) => a.cle)).toEqual(['changer', 'creer', 'sans_suite']);
    expect(p.actions[0].libelle).toBe('Changer l’affectation');
  });

  it('« Sans suite » → rouvrir, classer, créer', () => {
    const p = actionsDuStatut(statutDuMessage(fil({ etat: 'sans_suite' })));
    expect(p.declencheur).toBe('Modifier');
    expect(p.actions.map((a) => a.cle)).toEqual(['rouvrir', 'classer', 'creer']);
  });

  it('🔴 un mail déplacé SEUL ne propose RIEN ici : ses gestes vivent dans son menu « ⋯ »', () => {
    const s = statutDuMessage(fil(), { carteDuMail: { reference: 'GES-1', libelle: null, evenementId: 1 } });
    expect(actionsDuStatut(s)).toEqual({ declencheur: null, actions: [] });
  });

  it('🔴 le courrier automatique non plus : il n’existe aucun geste propre à ce cas, on n’en invente pas', () => {
    expect(actionsDuStatut(statutDuMessage(fil(), { horsFile: true }))).toEqual({ declencheur: null, actions: [] });
  });
});

describe('le lien vers la carte', () => {
  it('mène à la boîte, sous l’étiquette de cette carte', () => {
    // LOT ERGO-BOITE — la boîte est l'écran par défaut : `ecran=boite` ne s'écrit plus dans l'adresse.
    expect(lienVersCarte(statutDuMessage(CLASSE))).toBe('/admin/gestion?etiquette=carte-12');
  });

  it('🔴 …et cette adresse est EXACTEMENT celle que l’écran sait relire — sinon le lien ouvrirait autre chose', () => {
    // Ce module est PUR (aucun import) : la grammaire de l'adresse y est recopiée. Ce test est ce qui empêche les
    //   deux formes de diverger — sans lui, un changement dans `ecranUrl` laisserait ce lien pointer dans le vide.
    const attendu = ecrireEtatUrl({ ecran: 'boite', etiquette: { sorte: 'carte', evenementId: 12 }, filOuvert: null });
    expect(lienVersCarte(statutDuMessage(CLASSE))).toBe(`/admin/gestion${attendu}`);
  });

  it('pas d’identifiant → pas de lien : un lien mort use la confiance plus qu’il ne sert', () => {
    expect(lienVersCarte(statutDuMessage(fil({ reference: 'GES-2026-000001' })))).toBeNull();
    expect(lienVersCarte(statutDuMessage(fil()))).toBeNull();
  });
});

describe('garanties STATIQUES', () => {
  it('🔴 module PUR : aucun import, donc rien qui puisse tirer `pg` jusque dans le navigateur', () => {
    const src = readFileSync('app/lib/gestion/statutClassement.ts', 'utf8');
    expect(src.split('\n').filter((l) => /^\s*import\b/.test(l))).toEqual([]);
  });

  it('il ne connaît ni base, ni React, ni réseau : il ne sait que trancher un statut', () => {
    const src = readFileSync('app/lib/gestion/statutClassement.ts', 'utf8');
    expect(/useState|fetch\(|query\(|gestion_/.test(src)).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LOT CAPSULE-STATUT — LES TROIS STATUTS D'UNE LIGNE DE LISTE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 la capsule d’une ligne : Classé > Auto > À classer', () => {
  it('aucun rattachement confirmé ⇒ « À classer », en rouge', () => {
    expect(capsuleStatut({ nbActifs: 0, parUnHumain: false })).toBe('a_classer');
    expect(motCapsule('a_classer')).toBe('À classer');
  });

  it('rattaché par le seul moteur ⇒ « Auto »', () => {
    expect(capsuleStatut({ nbActifs: 1, parUnHumain: false })).toBe('auto');
    expect(motCapsule('auto')).toBe('Auto');
  });

  /**
   * 🔴 LE GESTE HUMAIN L'EMPORTE. Un échange dont UN mail a été rattaché à la main est CLASSÉ, même si dix autres
   * n'ont qu'un rattachement automatique : quelqu'un a tranché, et c'est l'information qui compte.
   */
  it('dès qu’un humain a tranché ⇒ « Classé », quelle que soit la part d’automatique', () => {
    expect(capsuleStatut({ nbActifs: 1, parUnHumain: true })).toBe('classe');
    expect(capsuleStatut({ nbActifs: 11, parUnHumain: true })).toBe('classe');
    expect(motCapsule('classe')).toBe('Classé');
  });

  /**
   * 🔴 UNE PROPOSITION NON CONFIRMÉE NE CLASSE RIEN. Elle n'entre pas dans `nbActifs` — la requête ne compte que
   * les rattachements `confirme` —, donc l'échange reste « à classer », ce qui est exactement ce qu'il est.
   */
  it('une proposition en attente laisse l’échange « À classer »', () => {
    // C'est le SQL qui l'exclut ; ici on éprouve que la règle ne rattrape pas ce qu'il a écarté.
    expect(capsuleStatut({ nbActifs: 0, parUnHumain: true })).toBe('a_classer');
  });

  it('l’info-bulle dit POURQUOI c’est rouge, et détaille sinon', () => {
    expect(bulleCapsule('a_classer', null)).toContain('Aucun rattachement confirmé');
    expect(bulleCapsule('a_classer', null)).toContain('proposition non confirmée ne compte pas');
    expect(bulleCapsule('auto', 'lot 513 — automatique')).toBe('lot 513 — automatique');
    // Détail manquant : on ne rend pas une bulle vide, qui aurait l'air d'un défaut.
    expect(bulleCapsule('classe', null)).toBe('Rattaché.');
    expect(bulleCapsule('classe', '   ')).toBe('Rattaché.');
  });
});

describe('🔴 la capsule ne dit PAS la même chose que l’entrée « À classer » de la colonne', () => {
  /**
   * Mesuré sur la vraie base le 27/09/2026 : 474 échanges sans ÉVÉNEMENT (l'entrée de la colonne), 9 631 sans
   * RATTACHEMENT (la capsule rouge). Deux questions différentes, deux nombres, et aucun ne remplace l'autre. Ce
   * test ne vérifie pas les nombres — ils bougent chaque jour — mais que les deux notions restent SÉPARÉES dans le
   * code : la capsule ne regarde jamais l'état du fil, et l'étiquette ne regarde jamais les rattachements.
   */
  it('la capsule ignore l’état du fil (« a_classer », « affecte », « sans_suite »)', () => {
    const src = readFileSync('app/lib/gestion/statutClassement.ts', 'utf8');
    const bloc = src.slice(src.indexOf('export function capsuleStatut'));
    expect(bloc).not.toContain('sans_suite');
    expect(bloc).not.toContain('evenement');
  });
});
