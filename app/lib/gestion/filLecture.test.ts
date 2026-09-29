import { describe, expect, it } from 'vitest';
import { piedUtile, etatCorps, ordonnerMessages } from './conversation';
import { etatTrombone, motTrombone } from './lisibilite';

/**
 * LOT LECTURE-HTML-FIL-TROMBONE — LES RÈGLES PURES DU FIL ET DE LA LIGNE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 DEUX DÉFAUTS VUS PAR ARNO, et ni l'un ni l'autre ne se lisait dans le code :
 *
 *   ① LE FIL 36526 montrait DEUX rangées « Répondre / Répondre à tous / Transférer » l'une sous l'autre. Ce ne sont
 *      pas des doublons de code : l'une répond AU MESSAGE (lot FIL-LECTURE), l'autre au plus RÉCENT (lot 5e). Sur
 *      une conversation d'un seul message, elles répondent au même — et se touchent.
 *
 *   ② LE TROMBONE comptait les pièces de TOUT l'échange. Une conversation de douze messages dont un seul portait
 *      un bail affichait « 📎 1 » sur la ligne du dernier, qui n'a rien : on ouvrait pour ne rien trouver.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Un fil, du plus ancien au plus récent — l'ordre dans lequel le serveur rend toujours ses messages. */
const fil = (n: number) => Array.from({ length: n }, (_, i) => ({ messageId: i + 1 }));
const deplies = (...ids: number[]) => new Set(ids);

describe('🔴 ① le pied de conversation ne double plus la rangée du message', () => {
  /**
   * 🔴 LE CAS D'ARNO : le fil 36526, un seul message. Le pied répond au même message que la rangée juste
   * au-dessus — c'est le même bouton, écrit deux fois.
   */
  it('🔴 un fil d’UN message, déplié : pas de pied (c’est le fil 36526)', () => {
    expect(piedUtile(fil(1), 'recent', deplies(1))).toBe(false);
    expect(piedUtile(fil(1), 'ancien', deplies(1))).toBe(false);
  });

  it('un fil d’un message REPLIÉ : le pied reprend son sens — aucune rangée au-dessus', () => {
    expect(piedUtile(fil(1), 'recent', deplies())).toBe(true);
  });

  /**
   * 🔴 ET CE N'EST PAS PROPRE AUX FILS D'UN SEUL MESSAGE. Lu du plus ancien au plus récent, le dernier message
   * affiché EST le plus récent : le pied se retrouve collé sous sa propre rangée, exactement comme sur le 36526.
   */
  it('🔴 un long fil lu du plus ANCIEN au plus récent : même doublon, même retrait', () => {
    expect(piedUtile(fil(4), 'ancien', deplies(4))).toBe(false);
    expect(piedUtile(fil(4), 'ancien', deplies(1, 2, 3))).toBe(true); // le plus récent est replié
  });

  /**
   * 🔴 ET IL GARDE TOUT SON SENS LÀ OÙ IL SERT : lu du plus récent au plus ancien (le défaut), le pied attend en
   * bas du fil, loin de la rangée du message le plus récent qui est tout en haut. On ne le retire pas.
   */
  it('🔴 un long fil lu du plus RÉCENT au plus ancien : le pied reste, il attend en bas', () => {
    expect(piedUtile(fil(4), 'recent', deplies(4))).toBe(true);
    expect(piedUtile(fil(4), 'recent', deplies(1, 2, 3, 4))).toBe(true);
  });

  it('un fil vide n’a rien à quoi répondre', () => {
    expect(piedUtile([], 'recent', deplies())).toBe(false);
  });

  /** ⚠️ LA RÈGLE S'APPUIE SUR `ordonnerMessages`, jamais sur une seconde idée de l'ordre. */
  it('l’ordre d’affichage est celui du fil, pas un second calcul', () => {
    expect(ordonnerMessages(fil(3), 'recent').map((m) => m.messageId)).toEqual([3, 2, 1]);
    expect(ordonnerMessages(fil(3), 'ancien').map((m) => m.messageId)).toEqual([1, 2, 3]);
  });
});

describe('🔴 ② le trombone dit OÙ est la pièce', () => {
  it('sur ce message : trombone « ici », avec le nombre de CE message', () => {
    expect(etatTrombone(2, 5)).toEqual({ ou: 'ici', nombre: 2 });
  });

  /**
   * 🔴 LE NOMBRE EST CELUI DE L'ÉTAT, JAMAIS LE TOTAL. « 📎 2 » sur un trombone noir veut dire « deux pièces DANS
   * CE MESSAGE ». Afficher le total de l'échange ferait lire « 7 » sur une ligne dont le mail n'en porte que deux.
   */
  it('🔴 le nombre affiché est celui de l’état, pas le total de l’échange', () => {
    const ici = etatTrombone(2, 5);
    expect(ici.ou !== 'aucune' && ici.nombre).toBe(2);     // 2, et non 7
    const loin = etatTrombone(0, 5);
    expect(loin.ou !== 'aucune' && loin.nombre).toBe(5);
  });

  it('ailleurs dans la conversation : trombone « ailleurs »', () => {
    expect(etatTrombone(0, 3)).toEqual({ ou: 'ailleurs', nombre: 3 });
  });

  it('nulle part : aucun trombone', () => {
    expect(etatTrombone(0, 0)).toEqual({ ou: 'aucune' });
  });

  /** 🔴 LA COULEUR NE PORTE JAMAIS L'INFORMATION SEULE : l'infobulle dit lequel des deux cas, en toutes lettres. */
  it('🔴 les infobulles sont celles d’Arno, mot pour mot', () => {
    expect(motTrombone(etatTrombone(1, 0))).toBe('Pièce jointe dans ce message');
    expect(motTrombone(etatTrombone(2, 0))).toBe('Pièces jointes dans ce message');
    expect(motTrombone(etatTrombone(0, 1))).toBe('Pièce jointe ailleurs dans la conversation');
    expect(motTrombone(etatTrombone(0, 4))).toBe('Pièces jointes ailleurs dans la conversation');
    expect(motTrombone(etatTrombone(0, 0))).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE HTML AVANT LE TEXTE — la règle du point ①, vue depuis le fil
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 le mail 57185 : la bonne version s’affiche', () => {
  /**
   * LE CAS RÉEL : 1 216 caractères de texte, 7 998 de HTML. L'ancienne règle servait le texte — la signature d'Arno
   * y devenait « <https://www.sansvisavis.com/> » et une adresse Google Maps en clair sur trois lignes.
   */
  const m57185 = {
    corps: 'Salut c’est prévu ça?\n\n<https://www.sansvisavis.com/>\nArnaud Jorel\n<https://www.google.com/maps/…>',
    extrait: 'Salut c’est prévu ça?',
    aHtml: true,
    html: null,
  };

  it('🔴 avec les deux versions, c’est le HTML qui s’affiche', () => {
    const e = etatCorps(m57185, m57185.corps, '<div><img src="/api/…"><b>Arnaud Jorel</b></div>');
    expect(e.v).toBe('html');
    expect(e.v === 'html' && e.html).toContain('Arnaud Jorel');
  });

  it('🔴 et tant qu’on ne l’a pas, on l’ATTEND — on ne montre pas la version de secours', () => {
    expect(etatCorps(m57185).v).toBe('html_a_charger');
  });

  it('un mail qui n’a que du texte l’affiche, exactement comme avant', () => {
    expect(etatCorps({ corps: 'Bonjour', extrait: 'Bonjour', aHtml: false, html: null }, 'Bonjour', null))
      .toEqual({ v: 'texte', texte: 'Bonjour' });
  });
});
