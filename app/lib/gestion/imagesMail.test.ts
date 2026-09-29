import { describe, expect, it } from 'vitest';
import {
  adressesDesImages, estDistante, identifiantCid, pieceDuCid, reecrireImages, MENTION_IMAGE_INTROUVABLE,
} from './imagesMail';
import { assainirHtml } from './htmlMail';
import { estIpPrivee, refusDeLAdresse, typeImageAcceptable } from './relaisImage';

/**
 * LOT LECTURE-HTML-FIL-TROMBONE — LES IMAGES D'UN MAIL, ET CE QU'ON S'AUTORISE À ALLER CHERCHER.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUE CE FICHIER PROTÈGE, et c'est plus grave qu'un logo mal affiché.
 *
 * ① UNE IMAGE DISTANTE CHARGÉE DEPUIS LE NAVIGATEUR livre à l'expéditeur l'adresse IP de la personne qui lit, son
 *    navigateur et l'heure exacte de l'ouverture. C'est le pixel espion, et 48 162 mails de la base en portent.
 *
 * ② UN RELAIS QUI ACCEPTERAIT UNE ADRESSE EN PARAMÈTRE serait un relais OUVERT : on ferait appeler par notre
 *    serveur `http://127.0.0.1:9000` (le stockage), la base, ou `169.254.169.254` (le service de métadonnées d'un
 *    hébergeur, qui rend des identifiants) — et l'on en lirait la réponse. C'est la faille SSRF.
 *
 * ③ ET L'ADRESSE QUE NOUS LISONS VIENT D'UN MAIL, donc de quelqu'un d'extérieur : un expéditeur qui glisse
 *    `<img src="http://127.0.0.1:9000/…">` dans sa signature passerait le premier verrou sans difficulté. D'où le
 *    second, éprouvé ici.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const piece = (id: number) => `/api/admin/gestion/pieces/${id}`;
const relais = (rang: number) => `/api/admin/gestion/messages/9/image?rang=${rang}`;

describe('lire les images d’un document', () => {
  it('relève les `src` dans l’ordre du document, quelles que soient les guillemets', () => {
    const html = `<p><img src="a.png"><b>x</b><img src='b.png'><img src=c.png><img alt="sans src"></p>`;
    expect(adressesDesImages(html)).toEqual(['a.png', 'b.png', 'c.png', '']);
  });

  it('un document sans image rend une liste vide, jamais une erreur', () => {
    expect(adressesDesImages('<p>bonjour</p>')).toEqual([]);
    expect(adressesDesImages(null)).toEqual([]);
  });

  it('reconnaît un `cid:`, avec ou sans chevrons, et le décode', () => {
    expect(identifiantCid('cid:image003.png@01DC579B')).toBe('image003.png@01DC579B');
    expect(identifiantCid('cid:<image003.png@01DC579B>')).toBe('image003.png@01DC579B');
    expect(identifiantCid('CID:x%40y')).toBe('x@y');
    expect(identifiantCid('https://exemple.fr/a.png')).toBeNull();
  });

  it('distingue le distant de ce qui porte ses propres octets', () => {
    expect(estDistante('https://exemple.fr/a.png')).toBe(true);
    expect(estDistante('http://exemple.fr/a.png')).toBe(true);
    expect(estDistante('data:image/png;base64,AAAA')).toBe(false);
    expect(estDistante('cid:x@y')).toBe(false);
  });
});

describe('🔴 résoudre un `cid:` vers une pièce du message', () => {
  const pieces = [
    { pieceId: 7, nomFichier: 'image003.png' },
    { pieceId: 8, nomFichier: 'bail.pdf' },
  ];

  it('rapproche par le nom de fichier, tel qu’il s’écrit avant l’arobase', () => {
    expect(pieceDuCid('image003.png@01DC579B.8FCB6050', pieces)?.pieceId).toBe(7);
    expect(pieceDuCid('IMAGE003.PNG@autre', pieces)?.pieceId).toBe(7);
  });

  /**
   * 🔴 ON NE DEVINE PAS. Mesuré sur la vraie base le 29/09/2026 : sur 156 références `cid:`, TROIS se résolvent
   * par le nom — les pièces des autres ont été renommées à la capture (« Outlook-cid_image0.png »). Un
   * rapprochement approximatif (la première image du message, par exemple) afficherait le mauvais logo, et
   * personne ne s'en apercevrait. On rend `null`, et l'écran DIT que l'image n'a pas été retrouvée.
   */
  it('🔴 aucune correspondance ⇒ `null`, jamais une image prise au hasard', () => {
    expect(pieceDuCid('inconnu@01DC', pieces)).toBeNull();
    expect(pieceDuCid('Outlook-cid_image0.png@x', pieces)).toBeNull();
    expect(pieceDuCid('', pieces)).toBeNull();
  });
});

describe('🔴 réécrire les images vers NOS routes', () => {
  it('un `cid:` résolu pointe vers notre route de pièce jointe', () => {
    const out = reecrireImages('<img src="cid:image003.png@01DC">', {
      pieces: [{ pieceId: 7, nomFichier: 'image003.png' }], piece, relais,
    });
    expect(out).toContain('src="/api/admin/gestion/pieces/7"');
    expect(out).not.toContain('cid:');
  });

  /** 🔴 PAS UNE IMAGE CASSÉE : le `src` est RETIRÉ (donc aucun appel) et le mot est posé en `alt` et `title`. */
  it('🔴 un `cid:` introuvable perd son `src` et gagne son mot', () => {
    const out = reecrireImages('<img src="cid:inconnu@x" alt="logo">', { pieces: [], piece, relais });
    expect(out).not.toContain('src=');
    expect(out).toContain(MENTION_IMAGE_INTROUVABLE);
    expect(out).toContain('data-absente');
  });

  it('une image distante passe par le relais, avec son RANG', () => {
    const out = reecrireImages('<img src="https://exemple.fr/a.png"><img src="https://exemple.fr/b.png">', {
      piece, relais,
    });
    expect(out).toContain('rang=0');
    expect(out).toContain('rang=1');
    expect(out).not.toContain('exemple.fr');
  });

  /**
   * 🔴 LE RANG COMPTE **TOUTES** LES IMAGES, `data:` et `cid:` comprises. Ne compter que les distantes obligerait
   * le relais à refaire exactement le même tri pour retomber sur le même numéro — deux comptages pour un seul
   * rang, donc un jour deux rangs différents, donc une image servie pour une autre.
   */
  it('🔴 le rang est celui du DOCUMENT, pas celui des seules images distantes', () => {
    const html = '<img src="data:image/png;base64,AA"><img src="cid:x@y"><img src="https://exemple.fr/c.png">';
    const out = reecrireImages(html, { pieces: [], piece, relais });
    expect(out).toContain('rang=2');
    expect(out).not.toContain('rang=0');
    // …et le MÊME document, relu par le relais, donne la même adresse au rang 2.
    expect(adressesDesImages(html)[2]).toBe('https://exemple.fr/c.png');
  });

  it('une image `data:` porte ses octets : on n’y touche pas', () => {
    const out = reecrireImages('<img src="data:image/png;base64,AAAA">', { pieces: [], piece, relais });
    expect(out).toContain('data:image/png;base64,AAAA');
  });

  it('relais absent ⇒ l’image distante est dite, jamais chargée', () => {
    const out = reecrireImages('<img src="https://exemple.fr/a.png">', { pieces: [], piece, relais: null });
    expect(out).not.toContain('exemple.fr');
    expect(out).toContain('image distante non affichée');
  });

  /**
   * 🔴 L'ORDRE EST : ASSAINIR PUIS RÉÉCRIRE. `reecrireImages` ne protège de rien — elle range. Employée sur du
   * HTML BRUT, elle laisserait passer ce que l'assainissement aurait retiré. Ce test scelle l'ordre.
   */
  it('🔴 le script tombe à l’assainissement, AVANT toute réécriture', () => {
    const brut = '<script>alert(1)</script><img src="https://exemple.fr/a.png" onerror="alert(2)">';
    const out = reecrireImages(assainirHtml(brut), { pieces: [], piece, relais });
    expect(out).not.toContain('script');
    expect(out).not.toContain('onerror');
    expect(out).toContain('rang=0');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE SECOND VERROU : CE QU'ON REFUSE D'ALLER CHERCHER
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 le relais refuse tout ce qui n’est pas une image publique', () => {
  it('accepte une adresse publique en http ou https', () => {
    expect(refusDeLAdresse('https://lh5.googleusercontent.com/abc')).toBeNull();
    expect(refusDeLAdresse('http://exemple.fr/a.png')).toBeNull();
  });

  it.each([
    ['http://localhost:9000/svav/a.png', 'hôte local'],
    ['http://127.0.0.1:5432/', 'boucle locale'],
    ['http://10.0.0.5/interne.png', 'réseau privé 10/8'],
    ['http://192.168.1.4/a.png', 'réseau privé 192.168/16'],
    ['http://172.20.1.1/a.png', 'réseau privé 172.16/12'],
    ['http://169.254.169.254/latest/meta-data/', 'métadonnées de l’hébergeur'],
    ['http://[::1]/a.png', 'boucle locale IPv6'],
    ['http://0.0.0.0/a.png', 'la machine elle-même'],
    ['file:///etc/passwd', 'protocole de fichier'],
    ['gopher://exemple.fr/', 'protocole inattendu'],
    ['pas une adresse', 'adresse illisible'],
  ])('🔴 refuse « %s » (%s)', (url) => {
    expect(refusDeLAdresse(url)).not.toBeNull();
  });

  it('🔴 le service de métadonnées d’un hébergeur est refusé — c’est la cible classique d’une SSRF', () => {
    expect(estIpPrivee('169.254.169.254')).toBe(true);
    expect(refusDeLAdresse('http://169.254.169.254/')).toContain('169.254.169.254');
  });

  /** ⚠️ UNE ADRESSE IPv4 ÉCRITE EN IPv6 est la même adresse : la refuser d'un côté seulement ne servirait à rien. */
  it('🔴 une IPv4 déguisée en IPv6 ne passe pas', () => {
    expect(estIpPrivee('::ffff:127.0.0.1')).toBe(true);
    expect(estIpPrivee('::ffff:10.0.0.1')).toBe(true);
  });

  it('une adresse publique reste publique', () => {
    expect(estIpPrivee('8.8.8.8')).toBe(false);
    expect(estIpPrivee('172.32.0.1')).toBe(false);   // hors de 172.16/12
    expect(estIpPrivee('exemple.fr')).toBe(false);
  });

  /**
   * 🔴 `image/svg+xml` EST REFUSÉ, et ce n'est pas un oubli. Un SVG est un DOCUMENT : il porte du script, des
   * références externes et sa propre feuille de style. Le servir depuis NOTRE domaine reviendrait à laisser un
   * expéditeur poser du code dans notre page — exactement ce que l'assainissement interdit par ailleurs.
   */
  it('🔴 n’accepte que des images, et jamais un SVG', () => {
    expect(typeImageAcceptable('image/png')).toBe(true);
    expect(typeImageAcceptable('image/jpeg; charset=binary')).toBe(true);
    expect(typeImageAcceptable('image/svg+xml')).toBe(false);
    expect(typeImageAcceptable('text/html')).toBe(false);
    expect(typeImageAcceptable(null)).toBe(false);
  });
});
