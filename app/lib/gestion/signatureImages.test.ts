import { describe, expect, it } from 'vitest';
import {
  CHEMIN_IMAGE_SIGNATURE, adresseEcranSignature, cidSignature, corpsPourEnvoi, rangSignature, signaturePourEcran,
} from './signatureImages';
import { construireRfc822 } from './envoiGmail';
import { assainirHtml } from './htmlMail';

/**
 * LOT ETOILE-ET-SIGNATURE — LA SIGNATURE PART DANS SON VRAI FORMAT.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QU'ARNO DEMANDE, ET CE QUE LE LOT PRÉCÉDENT AVAIT CONCLU À TORT.
 *
 * Demande : « que mes signatures partent dans leur vrai format, comme dans Gmail » — logo, nom en gras, adresse en
 * lien, icônes de téléphone.
 *
 * Le lot LECTURE-HTML-FIL-TROMBONE avait laissé la signature en TEXTE, en concluant que ses images « ne sont
 * servies qu'à une session Google ». MESURÉ LE 29/09/2026, c'est l'inverse :
 *
 *     adresse NUE depuis notre SERVEUR      → 200  image/png  1 933 / 835 / 1 600 octets
 *     la MÊME adresse AVEC un jeton Google  → 403
 *     depuis le NAVIGATEUR, dans la page    → image vide
 *
 * Ce n'était donc pas une question d'identité, mais de QUI APPELLE. D'où le chemin en deux temps que ce fichier
 * protège : notre route à l'écran, des `cid:` à l'envoi.
 *
 * ═══ CE QUE CE FICHIER PROTÈGE ══════════════════════════════════════════════════════════════════════════════════
 *   ① À L'ÉCRAN, aucune image n'est demandée à Google par le navigateur ;
 *   ② À L'ENVOI, elles voyagent DANS le message — aucun lien externe, donc rien à bloquer ni à espionner ;
 *   ③ UNE IMAGE QU'ON N'A PAS SUE perd son `src` ENTIER : jamais un carré barré chez le destinataire ;
 *   ④ SEULES NOS ADRESSES SONT TOUCHÉES : une image collée dans le corps reste ce qu'elle est.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** La vraie signature de gestion@, réduite à ce qui compte : trois images distantes, du texte, un lien. */
const SIGNATURE = '<div><img src="https://lh5.googleusercontent.com/AAA" width="198" height="43">'
  + '<b>Arnaud Jorel</b><a href="https://maps.google.com/x">19 Avenue Marceau</a>'
  + '<img src="https://lh3.googleusercontent.com/BBB" width="23" height="23"> 07 60 20 10 10'
  + '<img src="https://lh5.googleusercontent.com/CCC" width="20" height="20"> 01 84 20 49 42</div>';

const img = (n: number, cid: string) => ({
  rang: n, cid, nom: `signature-${n + 1}.png`, typeMime: 'image/png', octets: Buffer.from(`octets${n}`),
});

describe('🔴 ① à l’écran, le navigateur n’appelle jamais Google', () => {
  it('chaque image distante passe par NOTRE route, par son rang', () => {
    const out = signaturePourEcran(SIGNATURE);
    expect(out).toContain(`src="${CHEMIN_IMAGE_SIGNATURE}?rang=0"`);
    expect(out).toContain(`src="${CHEMIN_IMAGE_SIGNATURE}?rang=1"`);
    expect(out).toContain(`src="${CHEMIN_IMAGE_SIGNATURE}?rang=2"`);
    expect(out).not.toContain('googleusercontent');
  });

  /** ⚠️ LE RESTE DE LA SIGNATURE NE BOUGE PAS : le gras, le lien, les dimensions — c'est « comme dans Gmail ». */
  it('le reste de la signature est intact', () => {
    const out = signaturePourEcran(SIGNATURE);
    expect(out).toContain('<b>Arnaud Jorel</b>');
    expect(out).toContain('href="https://maps.google.com/x"');
    expect(out).toContain('width="198"');
  });

  it('une image `data:` porte ses octets : on n’y touche pas', () => {
    expect(signaturePourEcran('<img src="data:image/png;base64,AA">')).toContain('data:image/png;base64,AA');
  });

  /**
   * 🔴🔴 LE DÉFAUT QUI A FAILLI PASSER, ET QU'ON NE VOYAIT QU'À L'ŒIL. L'éditeur riche réassainit ce qu'on lui
   * donne (`EditeurRiche`, ligne `zone.innerHTML = assainirHtml(…)`) — et `assainirHtml` n'acceptait comme source
   * d'image que `http://`, `https://`, `cid:` et `data:image/`. Notre chemin RELATIF n'en est aucun : le `src`
   * tombait, et une image sans source acceptable n'est pas rendue DU TOUT.
   *
   * Vu à l'écran le 29/09/2026 : la signature s'insérait bien, en HTML, avec sa table et son gras — et SANS
   * aucune de ses trois icônes. Proprement, silencieusement, et à contresens de la demande.
   */
  it('🔴 l’assainissement accepte NOTRE chemin comme source d’image', () => {
    const out = assainirHtml(signaturePourEcran(SIGNATURE));
    expect((out.match(/<img/g) ?? []).length).toBe(3);
    expect(out).toContain(`src="${CHEMIN_IMAGE_SIGNATURE}?rang=0"`);
  });

  /** ⚠️ ET IL N'ACCEPTE QUE CELUI-LÀ : un autre chemin de chez nous reste refusé, comme avant. */
  it('🔴 un AUTRE chemin relatif reste refusé', () => {
    expect(assainirHtml('<img src="/api/admin/gestion/pieces/7">')).toBe('');
    expect(assainirHtml('<img src="/admin/gestion">')).toBe('');
  });

  /**
   * 🔴 L'ORDRE EST : ASSAINIR PUIS RÉÉCRIRE. Réécrire du HTML BRUT laisserait passer ce que l'assainissement
   * aurait retiré — même règle, et même raison, que pour les images d'un mail reçu.
   */
  it('🔴 le script tombe à l’assainissement, AVANT toute réécriture', () => {
    const out = signaturePourEcran(assainirHtml('<script>alert(1)</script><img src="https://x.fr/a.png" onerror="x()">'));
    expect(out).not.toContain('script');
    expect(out).not.toContain('onerror');
    expect(out).toContain('rang=0');
  });
});

describe('🔴 ② nos adresses sont reconnues, et elles seules', () => {
  it('relative ou absolue, c’est la nôtre', () => {
    expect(rangSignature('/api/admin/gestion/signature/image?rang=2')).toBe(2);
    expect(rangSignature('http://localhost:3000/api/admin/gestion/signature/image?rang=2')).toBe(2);
    expect(rangSignature('https://interne.sansvisavis.com/api/admin/gestion/signature/image?rang=0')).toBe(0);
  });

  /**
   * 🔴 L'ÉDITEUR RICHE DU NAVIGATEUR RÉÉCRIT VOLONTIERS UN `src` RELATIF EN ABSOLU au moment de sérialiser. Ne
   * reconnaître que la forme relative ferait partir la signature avec des adresses vers NOTRE serveur —
   * invisibles à l'écran, mortes chez le destinataire. Le genre de défaut qu'on ne voit jamais chez soi.
   */
  it('🔴 seul NOTRE chemin compte — un chemin qui y ressemble ne passe pas', () => {
    /**
     * ⚠️ L'HÔTE N'EST PAS VÉRIFIÉ, ET C'EST ASSUMÉ. Le rang ne désigne rien d'autre qu'une image de NOTRE
     * signature, relue chez nous à l'envoi : le pire qu'une adresse forgée puisse obtenir est que NOTRE logo
     * parte dans un message qu'on envoie soi-même. Vérifier l'hôte demanderait de connaître, dans un module PUR,
     * le domaine sous lequel l'application est servie — une dépendance pour un gain nul.
     */
    expect(rangSignature('https://pirate.example/api/admin/gestion/signature/image?rang=1')).toBe(1);
    // …mais ce qui suit n'est pas notre chemin, et n'est donc pas reconnu :
    expect(rangSignature('https://x.fr/image?rang=1')).toBeNull();
    expect(rangSignature('https://x.fr/redir?to=/api/admin/gestion/signature/image?rang=1')).toBeNull();
    expect(rangSignature('https://lh5.googleusercontent.com/AAA')).toBeNull();
  });

  it('sans rang lisible, ce n’est pas une adresse de signature', () => {
    expect(rangSignature(`${CHEMIN_IMAGE_SIGNATURE}`)).toBeNull();
    expect(rangSignature(`${CHEMIN_IMAGE_SIGNATURE}?rang=abc`)).toBeNull();
  });
});

describe('🔴 ③ à l’envoi, les images voyagent DANS le message', () => {
  const corps = signaturePourEcran(SIGNATURE);

  it('nos adresses deviennent des `cid:`, sans chevrons', () => {
    const r = corpsPourEnvoi(corps, [img(0, 'sig0.a@x.fr'), img(1, 'sig1.a@x.fr'), img(2, 'sig2.a@x.fr')]);
    expect(r.html).toContain('src="cid:sig0.a@x.fr"');
    expect(r.html).toContain('src="cid:sig2.a@x.fr"');
    expect(r.html).not.toContain(CHEMIN_IMAGE_SIGNATURE);
    expect(r.manquantes).toEqual([]);
  });

  /**
   * 🔴🔴 CONSIGNE D'ARNO : « si une image ne peut pas être récupérée, la signature part sans cette image, jamais
   * une image cassée ». Le `src` est donc RETIRÉ EN ENTIER — l'image ne demande alors rien à personne.
   */
  it('🔴 une image non rapportée perd son `src` ENTIER, et on sait laquelle', () => {
    const r = corpsPourEnvoi(corps, [img(0, 'sig0.a@x.fr'), img(2, 'sig2.a@x.fr')]);
    expect(r.manquantes).toEqual([1]);
    expect(r.html).toContain('src="cid:sig0.a@x.fr"');
    expect(r.html).not.toContain('rang=1');
    // …et rien ne reste qui pointerait vers nulle part.
    expect(r.html).not.toContain('src=""');
  });

  /**
   * 🔴 LA LISTE PEUT ÊTRE TROUÉE, et le rapprochement se fait par RANG. Le faire par POSITION décalerait tout ce
   * qui suit le trou : le logo prendrait la place de l'icône de téléphone, et personne ne le verrait avant qu'un
   * destinataire le dise.
   */
  it('🔴 le rapprochement se fait par RANG, jamais par position dans la liste', () => {
    const r = corpsPourEnvoi(corps, [img(2, 'sig2.a@x.fr')]);
    expect(r.html).toContain('src="cid:sig2.a@x.fr"');
    expect(r.manquantes).toEqual([0, 1]);
  });

  /** ⚠️ SEULES NOS ADRESSES SONT TOUCHÉES : une image collée dans le corps reste exactement ce qu'elle est. */
  it('🔴 une image qui n’est pas de la signature n’est pas touchée', () => {
    const avec = `<p><img src="https://exemple.fr/photo.png"></p>${corps}`;
    const r = corpsPourEnvoi(avec, [img(0, 'c0@x'), img(1, 'c1@x'), img(2, 'c2@x')]);
    expect(r.html).toContain('src="https://exemple.fr/photo.png"');
  });

  it('un identifiant d’image est unique au monde : rang, aléa, domaine', () => {
    expect(cidSignature(1, 'criterimmo.fr', 'ab-cd')).toBe('sig1.abcd@criterimmo.fr');
    expect(cidSignature(0, 'criterimmo.fr', '')).toBe('sig0.x@criterimmo.fr');
  });

  it('l’adresse d’écran et le rang se répondent', () => {
    expect(rangSignature(adresseEcranSignature(7))).toBe(7);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LE MESSAGE TEL QU'IL PART
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const BASE = {
  de: 'gestion@criterimmo.fr', deNom: 'Gestion', a: ['a.jorel@sansvisavis.com'], cc: [], cci: [],
  objet: 'Essai', corps: 'Bonjour', messageId: '<m1@criterimmo.fr>',
};

describe('🔴 ④ la structure MIME est celle de Gmail', () => {
  it('🔴 HTML + images, sans pièce : un `multipart/related` à la racine', () => {
    const rfc = construireRfc822({
      ...BASE, corpsHtml: '<p>Bonjour<img src="cid:sig0.a@x"></p>',
      imagesIntegrees: [img(0, 'sig0.a@x')],
    }, 'z');
    expect(rfc).toContain('Content-Type: multipart/related; type="multipart/alternative"');
    // …et le message lui-même est la PREMIÈRE partie : c'est elle que le client affiche.
    const iAlt = rfc.indexOf('multipart/alternative; boundary');
    const iImg = rfc.indexOf('Content-ID:');
    expect(iAlt).toBeGreaterThan(0);
    expect(iImg).toBeGreaterThan(iAlt);
  });

  /** ⚠️ CHEVRONS OBLIGATOIRES dans `Content-ID` (RFC 2392), INTERDITS après `cid:` dans le HTML. */
  it('🔴 `Content-ID: <…>` avec chevrons, `cid:…` sans', () => {
    const rfc = construireRfc822({
      ...BASE, corpsHtml: '<img src="cid:sig0.a@x">', imagesIntegrees: [img(0, 'sig0.a@x')],
    }, 'z');
    expect(rfc).toContain('Content-ID: <sig0.a@x>');
    expect(rfc).toContain('Content-Disposition: inline;');
  });

  /**
   * ⚠️ SANS IMAGE INCORPORÉE, LE MESSAGE EST EXACTEMENT CELUI D'AVANT CE LOT. Envelopper systématiquement dans un
   * `related` changerait la forme de TOUS les envois pour le bénéfice de quelques-uns.
   */
  it('sans image, aucun `related` : la forme d’avant, intacte', () => {
    const rfc = construireRfc822({ ...BASE, corpsHtml: '<p>Bonjour</p>' }, 'z');
    expect(rfc).toContain('Content-Type: multipart/alternative');
    expect(rfc).not.toContain('multipart/related');
  });

  it('avec une pièce jointe ET des images : `mixed` ⊃ `related` ⊃ `alternative`', () => {
    const rfc = construireRfc822({
      ...BASE, corpsHtml: '<img src="cid:sig0.a@x">', imagesIntegrees: [img(0, 'sig0.a@x')],
      pieces: [{ nom: 'bail.pdf', typeMime: 'application/pdf', octets: Buffer.from('pdf') }],
    }, 'z');
    const iMixed = rfc.indexOf('multipart/mixed');
    const iRelated = rfc.indexOf('multipart/related');
    const iAlt = rfc.indexOf('multipart/alternative');
    expect(iMixed).toBeGreaterThanOrEqual(0);
    expect(iRelated).toBeGreaterThan(iMixed);
    expect(iAlt).toBeGreaterThan(iRelated);
    expect(rfc).toContain('Content-Disposition: attachment; filename="bail.pdf"');
  });

  /** 🔴 L'ORDRE TEXTE PUIS HTML reste imposé par la RFC 2046, `related` ou pas : du moins riche au plus riche. */
  it('🔴 le texte reste AVANT le HTML, même dans un `related`', () => {
    const rfc = construireRfc822({
      ...BASE, corpsHtml: '<img src="cid:sig0.a@x">', imagesIntegrees: [img(0, 'sig0.a@x')],
    }, 'z');
    expect(rfc.indexOf('text/plain')).toBeLessThan(rfc.indexOf('text/html'));
  });
});
