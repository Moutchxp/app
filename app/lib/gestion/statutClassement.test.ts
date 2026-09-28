import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  SORTES_BIEN, actionDeLaCapsule, actionsDuStatut, bulleCapsule, bulleCapsuleMessage, capsuleDuMessage, capsuleStatut, libelleCartouche, lienVersCarte, motCapsule, motMotifHorsGestion, precisionCartouche, regrouperParBien, statutDuMessage, tonCapsule, tonCartouche, type EtatFil, type LienPourRegroupement, type LienPourStatut, type StatutClassement,
} from './statutClassement';
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

  /**
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * 🔴 LOT STATUT-PAR-MAIL — CE CARTOUCHE NE PARLE PLUS QUE D'ÉVÉNEMENT, ET IL LE DIT.
   *
   * LE DÉFAUT QU'IL CORRIGE, vu par Arno sur le fil 803 (Thirion) : chaque message affichait « À classer » ET le
   * lien vert « Visualiser / Modifier ». Les deux disaient vrai — l'un de l'ÉVÉNEMENT (aucune carte), l'autre du
   * BIEN (les trois mails sont rattachés au lot 445) — mais côte à côte, ils se contredisaient à l'œil.
   *
   * Le mot « À classer » est désormais RÉSERVÉ à la capsule du BIEN. Ce cartouche-ci est préfixé « Événement : »,
   * pour qu'on ne puisse plus le lire comme un verdict de classement.
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  it('🔴 les libellés nomment l’ÉVÉNEMENT, et ne disent plus jamais « À classer »', () => {
    expect(libelleCartouche(statutDuMessage(CLASSE))).toBe('Événement : GES-2026-000012 · Fuite salle de bain');
    expect(libelleCartouche(statutDuMessage(fil()))).toBe('Événement : aucun');
    expect(libelleCartouche(statutDuMessage(fil({ etat: 'sans_suite' })))).toBe('Sans suite');
    expect(libelleCartouche(statutDuMessage(fil(), { horsFile: true }))).toBe('Courrier automatique');
    // 🔴 LE MOT RÉSERVÉ : aucun libellé de ce cartouche ne peut plus être « À classer », sous aucune forme.
    for (const s of tous) expect(libelleCartouche(s), libelleCartouche(s)).not.toBe('À classer');
  });

  it('une carte sans titre connu se contente de sa référence — jamais d’un « · » orphelin', () => {
    expect(libelleCartouche(statutDuMessage(fil({ reference: 'GES-2026-000001', evenementId: 1 })))).toBe('Événement : GES-2026-000001');
    expect(libelleCartouche(statutDuMessage(fil({ reference: 'GES-2026-000001', evenementId: 1, evenementObjet: '   ' })))).toBe('Événement : GES-2026-000001');
  });

  /**
   * 🔴 « AUCUN ÉVÉNEMENT » EST NEUTRE, plus « en attente ». Le ton « attente » est celui d'un travail à faire ; or
   * l'immense majorité des mails n'a pas d'événement et n'en aura jamais. C'est la capsule du BIEN qui porte
   * désormais le « à faire », et elle seule.
   */
  it('🔴 le VERT reste à la carte, et plus AUCUN cartouche ne réclame d’attention', () => {
    expect(tonCartouche(statutDuMessage(CLASSE))).toBe('succes');
    expect(tonCartouche(statutDuMessage(fil()))).toBe('neutre');
    expect(tonCartouche(statutDuMessage(fil({ etat: 'sans_suite' })))).toBe('neutre');
    expect(tonCartouche(statutDuMessage(fil(), { horsFile: true }))).toBe('neutre');
    for (const s of tous) expect(tonCartouche(s)).not.toBe('attente');
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

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LOT STATUT-PAR-MAIL — UN SEUL STATUT PAR MAIL, ET C'EST LE BIEN.
 *
 * LE DÉFAUT D'ORIGINE, vu par Arno sur le fil 803 (Thirion) : trois messages, tous rattachés au lot 445, et tous
 * trois affichant « À classer ». Le badge parlait de l'ÉVÉNEMENT, le lien vert du BIEN ; l'œil n'avait aucun moyen
 * de le deviner.
 *
 * CE QUE CE BLOC VERROUILLE :
 *   ① la capsule ne regarde QUE les biens — logement, propriétaire, locataire — et JAMAIS l'événement ;
 *   ② une proposition non confirmée ne classe rien ;
 *   ③ le geste humain l'emporte sur l'automatique ;
 *   ④ le propriétaire et le locataire comptent autant que le logement : beaucoup de mails parlent d'une PERSONNE
 *      sans désigner d'appartement, et les exclure les laisserait « à classer » pour toujours.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴 LOT STATUT-PAR-MAIL — la capsule d’un message', () => {
  const lien = (sorte: string, o: Partial<LienPourStatut> = {}): LienPourStatut => ({
    cible: { sorte }, statut: 'confirme', origine: 'automatique', ...o,
  });

  it('① sans aucun rattachement : « À classer »', () => {
    expect(capsuleDuMessage([])).toBe('a_classer');
  });

  /** 🔴 LE CAS DU FIL 803, rejoué tel quel : un lot confirmé, aucun événement → la capsule est VERTE. */
  it('🔴 ① un lot confirmé suffit — l’absence d’événement n’y change RIEN (cas du fil 803)', () => {
    expect(capsuleDuMessage([lien('lot')])).toBe('auto');
  });

  /** 🔴 ① L'ÉVÉNEMENT NE COMPTE PAS : c'est l'autre question, et les mêler est le défaut qu'on corrige. */
  it('🔴 ① un rattachement vers un ÉVÉNEMENT ne classe rien', () => {
    expect(capsuleDuMessage([lien('evenement')])).toBe('a_classer');
    expect(capsuleDuMessage([lien('evenement', { origine: 'manuel' })])).toBe('a_classer');
  });

  it('② une PROPOSITION non confirmée ne classe rien', () => {
    expect(capsuleDuMessage([lien('lot', { statut: 'propose' })])).toBe('a_classer');
    expect(capsuleDuMessage([lien('lot', { statut: 'retire' })])).toBe('a_classer');
    expect(capsuleDuMessage([lien('lot', { statut: 'rejete' })])).toBe('a_classer');
  });

  it('③ le geste humain l’emporte : posé à la main, ou statut touché par quelqu’un', () => {
    expect(capsuleDuMessage([lien('lot', { origine: 'manuel' })])).toBe('classe');
    expect(capsuleDuMessage([lien('lot', { parUnHumain: true })])).toBe('classe');
    // Mêlés : un seul geste humain suffit à faire basculer tout le mail.
    expect(capsuleDuMessage([lien('lot'), lien('proprietaire', { origine: 'manuel' })])).toBe('classe');
  });

  it('④ propriétaire et locataire comptent autant qu’un logement', () => {
    expect(capsuleDuMessage([lien('proprietaire')])).toBe('auto');
    expect(capsuleDuMessage([lien('locataire')])).toBe('auto');
  });

  it('une sorte inconnue ne classe rien — on ne devine pas', () => {
    expect(capsuleDuMessage([lien('carte')])).toBe('a_classer');
    expect(capsuleDuMessage([lien('')])).toBe('a_classer');
  });

  it('les trois sortes de bien sont celles-là, et rien d’autre', () => {
    expect([...SORTES_BIEN].sort()).toEqual(['locataire', 'lot', 'proprietaire']);
    expect(SORTES_BIEN).not.toContain('evenement');
  });
});

describe('l’info-bulle de la capsule d’un message', () => {
  it('quand c’est rouge, elle dit POURQUOI, et que la proposition ne compte pas', () => {
    const b = bulleCapsuleMessage('a_classer', []);
    expect(b).toContain('aucun bien');
    expect(b).toContain('non confirmée');
  });

  it('quand c’est vert, elle nomme les biens et dit qui a tranché', () => {
    expect(bulleCapsuleMessage('classe', ['Lot 445 — 127 rue Gerhard'])).toBe('Rattaché à la main : Lot 445 — 127 rue Gerhard');
    expect(bulleCapsuleMessage('auto', ['Lot 445'])).toBe('Rattaché automatiquement : Lot 445');
  });

  it('sans libellé connu, elle reste une phrase — jamais une bulle vide', () => {
    expect(bulleCapsuleMessage('auto', [])).toBe('Rattaché automatiquement.');
    expect(bulleCapsuleMessage('classe', ['  '])).toBe('Rattaché à la main.');
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LOT STATUT-PAR-MAIL — REGROUPER PAR BIEN.
 *
 * LE DÉFAUT D'ORIGINE, vu par Arno sur le fil 803 : la fenêtre « Rattachements de l'échange » affichait TROIS LIGNES
 * IDENTIQUES — « Lot 445 » trois fois — une par message, sans dire que c'était le même bien vu trois fois. On croyait
 * à un triplon.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴 LOT STATUT-PAR-MAIL — regrouper par bien', () => {
  const l = (id: number, messageId: number, o: Record<string, unknown> = {}) => ({
    id, messageId, cible: { sorte: 'lot', cle: '445', id: 445 }, libelle: 'Lot 445 — 127 rue Gerhard',
    statut: 'confirme', origine: 'automatique', parUnHumain: false, ...o,
  } as LienPourRegroupement);

  /** 🔴 LE CAS DU FIL 803 : trois mails, un seul bien → UNE ligne, et le nombre de mails écrit. */
  it('🔴 trois mails sur le même lot ⇒ UNE ligne, « sur 3 mails »', () => {
    const g = regrouperParBien([l(1, 2896), l(2, 2830), l(3, 1449)]);
    expect(g).toHaveLength(1);
    expect(g[0].libelle).toBe('Lot 445 — 127 rue Gerhard');
    expect(g[0].nbMails).toBe(3);
    expect(g[0].liens).toHaveLength(3);
  });

  /**
   * ⚠️ ON COMPTE LES MAILS, PAS LES LIENS. Un mail peut porter deux liens vers le même bien (un hérité d'une pièce,
   * un posé à la main) : les compter deux fois annoncerait « sur 4 mails » sur une conversation de trois.
   */
  it('🔴 deux liens sur le MÊME mail ne comptent qu’un seul mail', () => {
    const g = regrouperParBien([l(1, 900), l(2, 900)]);
    expect(g[0].nbMails).toBe(1);
    expect(g[0].liens).toHaveLength(2);
  });

  it('deux biens distincts ⇒ deux lignes', () => {
    const g = regrouperParBien([
      l(1, 900),
      l(2, 900, { cible: { sorte: 'proprietaire', cle: 'p-12', id: 12 }, libelle: 'M. Thirion' }),
    ]);
    expect(g).toHaveLength(2);
  });

  it('un lot et un propriétaire de MÊME clé ne se confondent pas', () => {
    const g = regrouperParBien([
      l(1, 900, { cible: { sorte: 'lot', cle: '445', id: 445 }, libelle: 'Lot 445' }),
      l(2, 900, { cible: { sorte: 'proprietaire', cle: '445', id: 445 }, libelle: 'Propriétaire 445' }),
    ]);
    expect(g).toHaveLength(2);
  });

  it('le statut du groupe suit la règle du mail : le geste humain l’emporte', () => {
    expect(regrouperParBien([l(1, 900), l(2, 901)])[0].statut).toBe('auto');
    expect(regrouperParBien([l(1, 900), l(2, 901, { origine: 'manuel' })])[0].statut).toBe('classe');
    expect(regrouperParBien([l(1, 900, { statut: 'propose' })])[0].statut).toBe('a_classer');
  });

  /** ⚠️ UN ORDRE STABLE : le rattachement principal de la conversation d'abord, puis par libellé. */
  it('l’ordre est stable : le plus de mails d’abord, puis par libellé', () => {
    const g = regrouperParBien([
      l(1, 900, { cible: { sorte: 'lot', cle: 'b', id: 2 }, libelle: 'Zèbre' }),
      l(2, 901, { cible: { sorte: 'lot', cle: 'a', id: 1 }, libelle: 'Abricot' }),
      l(3, 902, { cible: { sorte: 'lot', cle: 'a', id: 1 }, libelle: 'Abricot' }),
    ]);
    expect(g.map((x) => x.libelle)).toEqual(['Abricot', 'Zèbre']);
    expect(g[0].nbMails).toBe(2);
  });

  it('une liste vide ne jette pas', () => {
    expect(regrouperParBien([])).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LOT STATUT-HORS-GESTION — LES QUATRE STATUTS D'UN MAIL, ET LEUR PRIORITÉ
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
describe('🔴 LOT STATUT-HORS-GESTION — quatre statuts, une seule priorité', () => {
  const lien = (o: Record<string, unknown> = {}) => ({
    cible: { sorte: 'lot' }, statut: 'confirme', origine: 'automatique', ...o,
  } as Parameters<typeof capsuleDuMessage>[0][number]);

  it('les quatre mots sont écrits, et aucun n’est porté par la seule couleur', () => {
    expect(motCapsule('classe')).toBe('Classé');
    expect(motCapsule('auto')).toBe('Auto');
    expect(motCapsule('hors_gestion')).toBe('Hors gestion');
    expect(motCapsule('a_classer')).toBe('À classer');
  });

  it('les trois tons : vert pour les deux verts, GRIS pour hors gestion, rouge pour à classer', () => {
    expect(tonCapsule('classe')).toBe('vert');
    expect(tonCapsule('auto')).toBe('vert');
    expect(tonCapsule('hors_gestion')).toBe('gris');
    expect(tonCapsule('a_classer')).toBe('rouge');
  });

  /** 🔴 LA PRIORITÉ DEMANDÉE PAR ARNO : Classé > Auto > Hors gestion > À classer. */
  it('aucun rattachement + aucune marque ⇒ « À classer »', () => {
    expect(capsuleDuMessage([], false)).toBe('a_classer');
  });

  it('aucun rattachement + une marque ⇒ « Hors gestion » (et non plus le rouge éternel)', () => {
    expect(capsuleDuMessage([], true)).toBe('hors_gestion');
  });

  it('🔴 un rattachement AUTOMATIQUE l’emporte sur la marque : le mail est « Auto », pas gris', () => {
    expect(capsuleDuMessage([lien()], true)).toBe('auto');
  });

  it('🔴 un rattachement POSÉ À LA MAIN l’emporte aussi : « Classé »', () => {
    expect(capsuleDuMessage([lien({ origine: 'manuel' })], true)).toBe('classe');
  });

  it('🔴 c’est CE QUI REND LA MARQUE RÉVERSIBLE par le geste naturel : rattacher un bien la neutralise', () => {
    // Même mail, même marque : seul le rattachement change, et la capsule repasse au vert d'elle-même.
    expect(capsuleDuMessage([], true)).toBe('hors_gestion');
    expect(capsuleDuMessage([lien({ origine: 'manuel' })], true)).toBe('classe');
  });

  it('un rattachement vers un ÉVÉNEMENT ne compte toujours pas — l’événement est FACULTATIF', () => {
    expect(capsuleDuMessage([lien({ cible: { sorte: 'evenement' } })], true)).toBe('hors_gestion');
    expect(capsuleDuMessage([lien({ cible: { sorte: 'evenement' } })], false)).toBe('a_classer');
  });

  it('une PROPOSITION non confirmée ne l’emporte pas sur la marque', () => {
    expect(capsuleDuMessage([lien({ statut: 'propose' })], true)).toBe('hors_gestion');
  });

  it('la capsule d’un ÉCHANGE suit la même priorité, sur les mêmes mots', () => {
    expect(capsuleStatut({ nbActifs: 0, parUnHumain: false })).toBe('a_classer');
    expect(capsuleStatut({ nbActifs: 0, parUnHumain: false, horsGestion: true })).toBe('hors_gestion');
    expect(capsuleStatut({ nbActifs: 2, parUnHumain: false, horsGestion: true })).toBe('auto');
    expect(capsuleStatut({ nbActifs: 2, parUnHumain: true, horsGestion: true })).toBe('classe');
  });

  it('le bouton de fin de barre : « Visualiser / Modifier » en GRIS pour un mail hors gestion', () => {
    expect(actionDeLaCapsule('hors_gestion')).toEqual({ mot: 'Visualiser / Modifier', ton: 'gris' });
    expect(actionDeLaCapsule('classe')).toEqual({ mot: 'Visualiser / Modifier', ton: 'vert' });
    expect(actionDeLaCapsule('auto')).toEqual({ mot: 'Visualiser / Modifier', ton: 'vert' });
    expect(actionDeLaCapsule('a_classer')).toEqual({ mot: 'Classer', ton: 'rouge' });
    // Sans capsule (Brouillons, Spam, réponse de serveur d'hier) : on garde « Classer », on ne devine pas.
    expect(actionDeLaCapsule(null).mot).toBe('Classer');
    expect(actionDeLaCapsule(undefined).mot).toBe('Classer');
  });

  it('l’info-bulle DIT que c’est une décision humaine, et qu’elle se défait', () => {
    const b = bulleCapsuleMessage('hors_gestion', [], 'prospection');
    expect(b).toContain('à la main');
    expect(b).toContain('prospection');
    expect(b).toContain('Rattacher un bien lève cette marque');
  });

  it('…et sans motif, elle ne l’invente pas', () => {
    const b = bulleCapsuleMessage('hors_gestion', [], null);
    expect(b).toContain('à la main');
    expect(b).not.toContain('(');
  });

  it('le motif se dit en toutes lettres, et une valeur inconnue ne rend rien', () => {
    expect(motMotifHorsGestion('prospection')).toBe('Prospection');
    expect(motMotifHorsGestion('interne')).toBe('Interne (collègue)');
    expect(motMotifHorsGestion('autre')).toBe('Autre');
    expect(motMotifHorsGestion(null)).toBeNull();
    expect(motMotifHorsGestion('n’importe quoi')).toBeNull();
  });

  /**
   * 🔴 RÈGLE MÉTIER ③ — AUCUN TEXTE DE CE MODULE N'ASSIMILE « SANS ÉVÉNEMENT » À « À CLASSER ». C'est la
   * vérification demandée par Arno, faite sur la source plutôt que sur une liste de phrases qu'on oublierait
   * d'allonger.
   */
  it('🔴 aucune bulle ni aucun mot de statut ne parle d’événement', () => {
    const tous = ['classe', 'auto', 'hors_gestion', 'a_classer'] as const;
    for (const s of tous) {
      expect(motCapsule(s).toLowerCase()).not.toContain('événement');
      expect(bulleCapsuleMessage(s, ['Lot 445']).toLowerCase()).not.toContain('événement');
      expect(bulleCapsule(s, 'Lot 445').toLowerCase()).not.toContain('événement');
    }
  });
});
