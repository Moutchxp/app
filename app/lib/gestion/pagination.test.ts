import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PAR_PAGE, barrePagination, etenduePage, nombreEcrit, trancheDePage } from './pagination';

/**
 * ══ 🔴🔴 LOT LISTE-PAGINATION — CE QUE LA BARRE « 1–25 sur N · ‹ › » PROMET ═════════════════════════════════════
 *
 * Ce fichier garde trois choses, et chacune répare un défaut nommé :
 *   ① N EST UN NOMBRE D'ÉCHANGES. C'est le défaut signalé par Arno (« 1–25 sur 291 354 ») ;
 *   ② LES CHEVRONS S'ÉTEIGNENT AUX DEUX BOUTS, et « › » suit le SERVEUR, pas une soustraction ;
 *   ③ LES TROIS TAILLES DE PAGE SONT ÉGALES — écran, boîte, recherche. Une pagination qui change de rythme en
 *      passant aux résultats se lit comme un défaut.
 */

describe('① le nombre écrit : lisible, et jamais coupé en deux', () => {
  it('groupe les milliers par une espace fine INSÉCABLE, comme Arno l’écrit', () => {
    expect(nombreEcrit(8546)).toBe('8 546');
    expect(nombreEcrit(291354)).toBe('291 354');
    expect(nombreEcrit(25)).toBe('25');
    expect(nombreEcrit(0)).toBe('0');
    expect(nombreEcrit(1000)).toBe('1 000');
  });

  /**
   * 🔴 L'ESPACE EST INSÉCABLE, ET CE N'EST PAS UN DÉTAIL DE TYPOGRAPHE. Avec une espace ordinaire, « sur 8 546 »
   * peut se couper en fin de ligne sur un téléphone et se lire « sur 8 ». Un nombre coupé est un nombre faux.
   */
  it('l’espace de groupement n’est JAMAIS une espace ordinaire', () => {
    expect(nombreEcrit(8546)).not.toContain(' ');
    expect(nombreEcrit(8546)).not.toContain(',');
  });

  /**
   * ⚠️ PAS `toLocaleString` : il suit la locale du NAVIGATEUR. Un poste réglé en anglais rendrait « 8,546 », qui se
   * lit « huit virgule cinq » pour un francophone. L'écran est en français, le groupement aussi.
   */
  it('ne s’en remet pas à la locale du navigateur', () => {
    const src = readFileSync('app/lib/gestion/pagination.ts', 'utf8');
    expect(src).not.toContain('toLocaleString');
    expect(src).not.toContain('Intl.NumberFormat');
  });
});

describe('② l’étendue de la page', () => {
  it('la première page va de 1 à 25', () => {
    expect(etenduePage(0, 25)).toEqual({ debut: 1, fin: 25 });
  });

  it('la deuxième page va de 26 à 50', () => {
    expect(etenduePage(1, 25)).toEqual({ debut: 26, fin: 50 });
  });

  it('la DERNIÈRE page s’arrête sur ce qu’elle contient vraiment, pas sur 25', () => {
    expect(etenduePage(3, 7)).toEqual({ debut: 76, fin: 82 });
  });

  /** 🔴 « 1–0 » est illisible. Une page vide rend deux zéros, et l'écran dit autre chose (voir ③). */
  it('une page vide ne rend jamais « 1–0 »', () => {
    expect(etenduePage(0, 0)).toEqual({ debut: 0, fin: 0 });
    expect(etenduePage(4, 0)).toEqual({ debut: 0, fin: 0 });
  });
});

describe('③ la barre : ce qu’elle dit, ce qu’elle laisse cliquer', () => {
  it('première page d’une Réception de 8 546 échanges : « 1–25 sur 8 546 », ‹ éteint, › allumé', () => {
    const b = barrePagination({ page: 0, lignes: 25, total: 8546, suite: true });
    expect(b.mot).toBe('1–25 sur 8 546');
    expect(b.reculer).toBe(false);
    expect(b.avancer).toBe(true);
    expect(b.visible).toBe(true);
  });

  it('page du milieu : les deux chevrons sont allumés', () => {
    const b = barrePagination({ page: 12, lignes: 25, total: 8546, suite: true });
    expect(b.mot).toBe('301–325 sur 8 546');
    expect(b.reculer).toBe(true);
    expect(b.avancer).toBe(true);
  });

  it('dernière page : › s’éteint, ‹ reste allumé', () => {
    const b = barrePagination({ page: 341, lignes: 21, total: 8546, suite: false });
    expect(b.mot).toBe('8 526–8 546 sur 8 546');
    expect(b.reculer).toBe(true);
    expect(b.avancer).toBe(false);
  });

  /**
   * ══ 🔴🔴 L'ÉPREUVE CENTRALE DU DÉFAUT SIGNALÉ PAR ARNO ═══════════════════════════════════════════════════════
   *
   * « un essai d'Arno affiche “1–25 sur 291 354”, ce qui est faux (ça ressemble à un nombre de messages ou de
   * lignes) ». Ce module ne peut pas inventer N — il le reçoit —, mais il peut garantir que ce qu'on lui donne est
   * ce qu'il écrit, sans transformation. L'épreuve qui compte vraiment vit côté serveur (`sqlCompteBoite` emploie
   * le MÊME prédicat que la page) ; celle-ci garde le maillon d'affichage : aucun total n'est déduit du nombre de
   * lignes, ni d'un produit, ni d'un cumul de pages.
   */
  it('🔴 N est rendu TEL QUEL : il n’est ni déduit des lignes, ni cumulé de page en page', () => {
    expect(barrePagination({ page: 0, lignes: 25, total: 258, suite: true }).mot).toBe('1–25 sur 258');
    // La même page, avec le même nombre de lignes, mais un autre total : seul le total change le mot.
    expect(barrePagination({ page: 0, lignes: 25, total: 8546, suite: true }).mot).toBe('1–25 sur 8 546');
    // Et le rang de la page ne multiplie jamais le total.
    expect(barrePagination({ page: 9, lignes: 25, total: 258, suite: false }).mot).toContain('sur 258');
  });

  /**
   * 🔴 « › » SUIT LE SERVEUR (`suite`), PAS UNE SOUSTRACTION. Le serveur lit une ligne de plus que la page et sait
   * donc s'il y en a une autre. Déduire « il reste des pages » de `fin < total` ferait cliquer sur un chevron qui
   * ramène une page VIDE dès que le total et la liste s'écartent d'une unité — un mail relevé entre les deux
   * lectures suffit à créer l'écart.
   */
  it('🔴 › obéit à « suite », même quand le total dit le contraire', () => {
    // Le total prétend qu'il reste 8 000 échanges ; le serveur dit qu'il n'y a pas de page suivante. Il gagne.
    expect(barrePagination({ page: 0, lignes: 25, total: 8546, suite: false }).avancer).toBe(false);
    // L'inverse : le total est atteint, mais le serveur a une suite. Il gagne aussi.
    expect(barrePagination({ page: 0, lignes: 25, total: 25, suite: true }).avancer).toBe(true);
  });

  /** ⚠️ TOTAL INCONNU = un état normal (« on ne l'a pas compté »), jamais zéro. */
  it('sans total, l’étendue s’écrit seule — jamais « sur 0 »', () => {
    const b = barrePagination({ page: 1, lignes: 25, total: null, suite: true });
    expect(b.mot).toBe('26–50');
    expect(b.mot).not.toContain('sur');
  });

  it('une seule ligne ne s’écrit pas « 1–1 »', () => {
    expect(barrePagination({ page: 0, lignes: 1, total: 1, suite: false }).mot).toBe('1 sur 1');
  });

  /** ⚠️ UNE SEULE PAGE QUI TIENT ENTIÈREMENT ⇒ PAS DE BARRE : deux chevrons éteints n'apprennent rien. */
  it('liste tenant sur une page : la barre ne s’affiche pas', () => {
    expect(barrePagination({ page: 0, lignes: 7, total: 7, suite: false }).visible).toBe(false);
    expect(barrePagination({ page: 0, lignes: 25, total: 25, suite: false }).visible).toBe(false);
  });

  it('liste vide de la première page : rien à paginer, et on le dit', () => {
    const b = barrePagination({ page: 0, lignes: 0, total: 0, suite: false });
    expect(b.mot).toBe('Aucun échange');
    expect(b.visible).toBe(false);
  });

  /**
   * ⚠️ UNE PAGE VIDE APRÈS LA PREMIÈRE PEUT ARRIVER : du courrier a été classé pendant qu'on lisait, et le curseur
   * tombe après le dernier échange. La barre reste alors VISIBLE — sans elle, on serait coincé sur un écran vide
   * sans moyen de revenir en arrière.
   */
  it('page vide au-delà de la première : la barre reste, pour pouvoir revenir', () => {
    const b = barrePagination({ page: 3, lignes: 0, total: 60, suite: false });
    expect(b.visible).toBe(true);
    expect(b.reculer).toBe(true);
    expect(b.mot).toBe('Plus aucun échange après celui-ci');
  });
});

describe('④ la page N d’une liste déjà en mémoire', () => {
  const liste = Array.from({ length: 60 }, (_, i) => i + 1);

  it('la première page rend les 25 premiers', () => {
    expect(trancheDePage(liste, 0)).toHaveLength(25);
    expect(trancheDePage(liste, 0)[0]).toBe(1);
    expect(trancheDePage(liste, 0)[24]).toBe(25);
  });

  it('la deuxième page rend les 25 suivants, sans en sauter ni en répéter', () => {
    expect(trancheDePage(liste, 1)[0]).toBe(26);
    expect(trancheDePage(liste, 1)[24]).toBe(50);
  });

  it('la dernière page rend ce qui reste, et pas 25', () => {
    expect(trancheDePage(liste, 2)).toEqual([51, 52, 53, 54, 55, 56, 57, 58, 59, 60]);
  });

  /**
   * 🔴 AUCUN ÉLÉMENT PERDU NI COMPTÉ DEUX FOIS. C'est la seule propriété qui compte vraiment pour un découpage :
   * recoller les pages doit redonner la liste, à l'identique et dans l'ordre.
   */
  it('🔴 recoller toutes les pages redonne la liste entière, dans l’ordre', () => {
    const recollee = [0, 1, 2].flatMap((p) => trancheDePage(liste, p));
    expect(recollee).toEqual(liste);
  });

  /** ⚠️ UNE PAGE AU-DELÀ DE LA FIN : un tableau vide, jamais une erreur — la liste a pu raccourcir. */
  it('une page au-delà de la fin rend un tableau vide', () => {
    expect(trancheDePage(liste, 9)).toEqual([]);
    expect(trancheDePage([], 0)).toEqual([]);
  });

  /** ⚠️ UN RANG NÉGATIF RETOMBE SUR LA PREMIÈRE PAGE, au lieu de découper par la fin (ce que ferait `slice`). */
  it('un rang négatif retombe sur la première page', () => {
    expect(trancheDePage(liste, -3)).toEqual(trancheDePage(liste, 0));
  });
});

describe('⑤ une seule taille de page, des trois côtés', () => {
  /**
   * 🔴 LES TROIS CONSTANTES SONT ÉGALES, ET C'EST VÉRIFIÉ SUR LE TEXTE DES FICHIERS. On ne peut pas les importer
   * ici : `boiteRepo` et `rechercheBoite` tirent `pg`, donc `dns` — le graphe qui a fait tomber toute
   * l'application le 24/09/2026. On lit donc la valeur écrite, ce qui suffit à empêcher la dérive.
   */
  it('PAR_PAGE, PAGE_BOITE et PAGE_RECHERCHE valent 25', () => {
    expect(PAR_PAGE).toBe(25);
    expect(readFileSync('app/lib/gestion/boiteRepo.ts', 'utf8')).toContain('export const PAGE_BOITE = 25;');
    expect(readFileSync('app/lib/gestion/rechercheBoite.ts', 'utf8')).toContain('export const PAGE_RECHERCHE = 25;');
  });
});
