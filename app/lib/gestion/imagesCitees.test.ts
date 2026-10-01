import { describe, it, expect } from 'vitest';
import {
  adresseCitee, cidCite, citeesParmi, corpsCitePourEnvoi, nomCite, type ImageCitee,
} from './imagesCitees';
import { adressesDesImages } from './imagesMail';
import { construireRfc822 } from './envoiGmail';

/**
 * ══ 🔴🔴 LOT MODALE-SUIVI-ET-DEFILEMENT (point 0) — L'IMAGE CITÉE PART AVEC SES OCTETS ════════════════════════
 *
 * DÉCISION D'ARNO (02/10/2026) : « Les images citées dans une réponse ou un transfert partent avec leurs octets
 * intégrés (pièce en ligne cid:), jamais un lien vers nos routes internes. »
 *
 * L'essai demandé est l'INSPECTION DU MESSAGE MIME GÉNÉRÉ, sans envoi : c'est exactement ce que fait le dernier
 * bloc — il construit le RFC 822 et lit ce qui en sort.
 *
 * 🔒 Aucune donnée réelle : un pixel GIF inventé, des adresses fictives.
 */

const OCTETS = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const img = (src: string) => `<img src="${src}" alt="photo">`;

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① RECONNAÎTRE NOS ADRESSES — ET ELLES SEULES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('① nos trois adresses d’images, et rien d’autre', () => {
  it('🔴 une pièce, une image intégrée, une image distante relayée', () => {
    expect(adresseCitee('/api/admin/gestion/pieces/27064')).toEqual({ sorte: 'piece', pieceId: 27064 });
    expect(adresseCitee('/api/admin/gestion/messages/57381/integree?rang=0'))
      .toEqual({ sorte: 'integree', messageId: 57381, rang: 0 });
    expect(adresseCitee('/api/admin/gestion/messages/57381/image?rang=3'))
      .toEqual({ sorte: 'distante', messageId: 57381, rang: 3 });
  });

  /**
   * 🔴🔴 ANCRÉE AUX DEUX BOUTS, ET C'EST UNE RÈGLE DE SÛRETÉ. Une adresse distante qui CONTIENT notre chemin
   * n'est pas la nôtre : la reconnaître ferait partir les octets d'une pièce de la gestion à la demande d'un
   * expéditeur extérieur, qui n'aurait eu qu'à glisser cette image dans son mail.
   */
  it('🔴🔴 une adresse EXTÉRIEURE qui contient notre chemin n’est pas la nôtre', () => {
    expect(adresseCitee('https://pirate.test/api/admin/gestion/pieces/1')).toBeNull();
    expect(adresseCitee('/api/admin/gestion/pieces/1/../../secret')).toBeNull();
    expect(adresseCitee('/api/admin/gestion/messages/1/image?rang=0&x=1')).toBeNull();
  });

  it('⚠️ ce qui n’est pas à nous ne bouge pas', () => {
    expect(adresseCitee('data:image/gif;base64,AAAA')).toBeNull();
    expect(adresseCitee('cid:logo.png@01DC')).toBeNull();
    expect(adresseCitee('https://exemple.test/a.png')).toBeNull();
    expect(adresseCitee(null)).toBeNull();
  });

  it('🔴 l’indice compte LES NÔTRES, pas toutes les images', () => {
    const html = img('https://exemple.test/a.png')
      + img('/api/admin/gestion/pieces/7')
      + img('data:image/gif;base64,AAAA')
      + img('/api/admin/gestion/messages/9/integree?rang=2');
    const c = citeesParmi(adressesDesImages(html));
    expect(c.map((x) => x.indice)).toEqual([0, 1]);
    expect(c[0].quoi).toEqual({ sorte: 'piece', pieceId: 7 });
    expect(c[1].quoi).toEqual({ sorte: 'integree', messageId: 9, rang: 2 });
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LE CORPS QUI PART
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('② le corps tel qu’il part', () => {
  const image = (indice: number): ImageCitee => ({
    indice, cid: `cit${indice}.abc@sansvisavis.com`, nom: `image-${indice + 1}.gif`,
    typeMime: 'image/gif', octets: OCTETS,
  });

  it('🔴🔴 nos adresses deviennent des « cid: », les autres ne bougent pas', () => {
    const html = `<p>Bonjour</p>${img('/api/admin/gestion/pieces/7')}${img('https://exemple.test/a.png')}`;
    const r = corpsCitePourEnvoi(html, [image(0)]);
    expect(r.html).toContain('src="cid:cit0.abc@sansvisavis.com"');
    expect(r.html).toContain('https://exemple.test/a.png');
    expect(r.html).not.toContain('/api/admin/gestion/');
    expect(r.manquantes).toEqual([]);
  });

  /** 🔴 CE QU'ON N'A PAS PU RAPPORTER EST RETIRÉ — jamais un carré barré chez le destinataire. */
  it('🔴 une image non rapportée disparaît du corps, et elle est DITE', () => {
    const html = `<p>Bonjour</p>${img('/api/admin/gestion/messages/9/integree?rang=0')}`;
    const r = corpsCitePourEnvoi(html, []);
    expect(r.html).toBe('<p>Bonjour</p>');
    expect(r.manquantes).toEqual([0]);
  });

  it('⚠️ un corps sans image des nôtres n’est pas touché', () => {
    const html = `<p>Bonjour</p>${img('cid:deja@la')}`;
    expect(corpsCitePourEnvoi(html, []).html).toBe(html);
  });

  it('⚠️ les identifiants sont uniques, et distincts de ceux de la signature', () => {
    expect(cidCite(0, 'sansvisavis.com', 'a1-b2')).toBe('cit0.a1b2@sansvisavis.com');
    expect(cidCite(3, 'sansvisavis.com', '')).toBe('cit3.x@sansvisavis.com');
    expect(cidCite(0, 'd.fr', 'z').startsWith('cit')).toBe(true);
    expect(nomCite(0, 'image/jpeg')).toBe('image-1.jpeg');
    expect(nomCite(2, 'image/png')).toBe('image-3.png');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 ③ L'INSPECTION DU MESSAGE MIME GÉNÉRÉ — L'ESSAI DEMANDÉ PAR ARNO, SANS AUCUN ENVOI
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ le message MIME généré, inspecté sans envoi', () => {
  /**
   * ⚠️ LE CORPS D'UN MESSAGE MIME EST EN BASE64 : chercher « cid: » dans le brut ne trouverait rien. On décode
   * donc les parties pour les LIRE — c'est exactement ce que fait le client du destinataire.
   */
  const lisible = (rfc: string): string => rfc.replace(
    /\r\n\r\n((?:[A-Za-z0-9+/=]+\r\n)+)/g,
    (_tout, bloc: string) => {
      try { return `\r\n\r\n${Buffer.from(bloc.replace(/\r\n/g, ''), 'base64').toString('utf8')}\r\n`; }
      catch { return _tout as string; }
    },
  );

  const BASE = {
    de: 'gestion@criterimmo.fr', deNom: 'Gestion', a: ['anna@exemple.test'], cc: [], cci: [],
    objet: 'Re: Travaux', corps: 'Bonjour', messageId: '<m1@criterimmo.fr>',
  };

  it('🔴🔴 l’image citée voyage DANS le message, en « multipart/related », et plus aucune de nos adresses', () => {
    const corpsEcran = `<p>Bonjour</p><blockquote>${img('/api/admin/gestion/messages/57381/integree?rang=0')}</blockquote>`;
    // Ce que fait `envoi.ts` : on remplace, puis on assemble.
    const images: ImageCitee[] = [{
      indice: 0, cid: 'cit0.abc@criterimmo.fr', nom: 'image-1.jpeg', typeMime: 'image/jpeg', octets: OCTETS,
    }];
    const { html } = corpsCitePourEnvoi(corpsEcran, images);
    const rfc = construireRfc822({ ...BASE, corpsHtml: html, imagesIntegrees: images }, 'z');

    // ① LE CORPS APPELLE L'IMAGE PAR SON `cid:`…
    expect(lisible(rfc)).toContain('cid:cit0.abc@criterimmo.fr');
    // ② …LA PARTIE EXISTE, EN LIGNE, AVEC SES OCTETS…
    expect(rfc).toContain('Content-ID: <cit0.abc@criterimmo.fr>');
    expect(rfc).toContain('Content-Type: image/jpeg; name="image-1.jpeg"');
    expect(rfc).toContain('Content-Disposition: inline;');
    expect(rfc).toContain(OCTETS.toString('base64'));
    // ③ …ET PLUS AUCUNE ADRESSE INTERNE NE SORT.
    expect(lisible(rfc)).not.toContain('/api/admin/gestion/');
    // ④ LA STRUCTURE EST CELLE QUE GMAIL ET OUTLOOK PRODUISENT : le message d'abord, les images ensuite.
    expect(rfc).toContain('Content-Type: multipart/related; type="multipart/alternative"');
    expect(rfc.indexOf('multipart/alternative; boundary')).toBeLessThan(rfc.indexOf('Content-ID:'));
  });

  it('🔴 sans octets, l’image est retirée : le message part, sans adresse interne ni image cassée', () => {
    const corpsEcran = `<p>Bonjour</p>${img('/api/admin/gestion/pieces/7')}`;
    const { html, manquantes } = corpsCitePourEnvoi(corpsEcran, []);
    const rfc = construireRfc822({ ...BASE, corpsHtml: html, imagesIntegrees: [] }, 'z');
    expect(manquantes).toEqual([0]);
    expect(lisible(rfc)).not.toContain('/api/admin/gestion/');
    expect(rfc).not.toContain('Content-ID:');
    expect(lisible(rfc)).toContain('Bonjour');
  });

  it('⚠️ une signature et une image citée partent ensemble sans se heurter', () => {
    const images = [
      { cid: 'sig0.abc@criterimmo.fr', nom: 'signature-1.png', typeMime: 'image/png', octets: OCTETS },
      { cid: 'cit0.abc@criterimmo.fr', nom: 'image-1.jpeg', typeMime: 'image/jpeg', octets: OCTETS },
    ];
    const rfc = construireRfc822({
      ...BASE,
      corpsHtml: `<p>Bonjour</p><img src="cid:sig0.abc@criterimmo.fr"><img src="cid:cit0.abc@criterimmo.fr">`,
      imagesIntegrees: images,
    }, 'z');
    expect(rfc).toContain('Content-ID: <sig0.abc@criterimmo.fr>');
    expect(rfc).toContain('Content-ID: <cit0.abc@criterimmo.fr>');
    // 🔴 DEUX PARTIES DISTINCTES : deux `cid` identiques feraient afficher la même image aux deux endroits.
    expect(new Set(images.map((i) => i.cid)).size).toBe(2);
  });
});
