import { describe, it, expect } from 'vitest';
import {
  corpsLisible, estImageDeSignature, masquerReferencesImages, separerCitation, TAILLE_MAX_SIGNATURE, trierPieces,
} from './lisibilite';

/**
 * LOT 4d-C — la lisibilité d'un mail à l'écran. Ce qui est vérifié ici tient en une phrase : on cache du BRUIT, on
 * ne perd RIEN. Chaque test d'un masquage a son jumeau qui vérifie que le texte utile, lui, est intact.
 */

describe('① masquer les références techniques d’images', () => {
  it('retire les [cid:…] laissés par les signatures', () => {
    expect(masquerReferencesImages('Cordialement [cid:image001.png@01DA1234.5678] Mme M.'))
      .toBe('Cordialement Mme M.');
  });

  it('retire les [https://…googleusercontent.com/…] de Gmail', () => {
    expect(masquerReferencesImages('Bonjour [https://lh3.googleusercontent.com/abc/def=s0] bien reçu'))
      .toBe('Bonjour bien reçu');
  });

  it('retire les [image: …]', () => {
    expect(masquerReferencesImages('[image: logo.png] Merci')).toBe(' Merci');
  });

  it('un marqueur peut être demandé plutôt que rien', () => {
    expect(masquerReferencesImages('Voici [cid:x.png] la photo', '[image]')).toBe('Voici [image] la photo');
  });

  it('ne touche PAS à un lien qu’on veut lire, ni au texte', () => {
    const texte = 'Le dossier est sur https://exemple.test/dossier (voir page 2).';
    expect(masquerReferencesImages(texte)).toBe(texte);
  });

  it('ne laisse ni trous ni lignes vides en cascade', () => {
    expect(masquerReferencesImages('Bonjour\n\n[cid:a.png]\n\n\n[cid:b.png]\n\nMerci'))
      .toBe('Bonjour\n\nMerci');
  });
});

describe('② replier le texte cité', () => {
  it('coupe à la première ligne « > »', () => {
    const r = separerCitation('Merci pour votre retour.\n\n> Bonjour,\n> Pouvez-vous confirmer ?');
    expect(r.visible).toBe('Merci pour votre retour.');
    expect(r.cite).toContain('Pouvez-vous confirmer ?');
  });

  it('coupe à « Le … a écrit : »', () => {
    const r = separerCitation('C’est noté.\n\nLe 21 septembre 2026, Mme M. a écrit :\nBonjour, il y a une fuite.');
    expect(r.visible).toBe('C’est noté.');
    expect(r.cite).toContain('il y a une fuite');
  });

  it('coupe à l’en-tête recopié par Outlook (De : / Envoyé : / À : / Objet :)', () => {
    const r = separerCitation('Bien reçu.\n\nDe : Mme M.\nEnvoyé : lundi 21 septembre\nÀ : Gestion\nObjet : Fuite');
    expect(r.visible).toBe('Bien reçu.');
    expect(r.cite).toContain('Objet : Fuite');
  });

  it('coupe à « ---------- Message transféré ---------- »', () => {
    const r = separerCitation('Pour suite à donner.\n\n---------- Message transféré ----------\nDe : locataire');
    expect(r.visible).toBe('Pour suite à donner.');
    expect(r.cite).toContain('Message transféré');
  });

  it('RIEN N’EST PERDU : le cité est rendu, jamais jeté', () => {
    const entier = 'Merci.\n\n> Bonjour,\n> Une fuite.';
    const r = separerCitation(entier);
    expect(`${r.visible}\n\n${r.cite}`).toBe(entier);
  });

  it('un mail SANS citation n’est pas coupé', () => {
    const r = separerCitation('Bonjour, il y a une fuite sous le lavabo.\n\nCordialement');
    expect(r.cite).toBeNull();
    expect(r.visible).toContain('Cordialement');
  });

  it('un mail qui n’est QUE de la citation s’affiche en entier — sinon l’écran serait vide', () => {
    const r = separerCitation('> Bonjour,\n> Une fuite.');
    expect(r.visible).toContain('Bonjour');
    expect(r.cite).toBeNull();
  });

  it('un corps vide ou absent ne casse rien', () => {
    expect(separerCitation(null)).toEqual({ visible: '', cite: null });
    expect(separerCitation('   ')).toEqual({ visible: '', cite: null });
  });

  it('les deux traitements se combinent, dans le bon ordre', () => {
    const r = corpsLisible('Bien reçu [cid:image001.png]\n\n> Bonjour [cid:image002.png]\n> Merci');
    expect(r.visible).toBe('Bien reçu');
    expect(r.cite).not.toContain('cid:');
  });
});

describe('③ trier les images de signature', () => {
  const p = (nomFichier: string, typeMime: string | null, tailleOctets: number | null) => ({ nomFichier, typeMime, tailleOctets });

  it('reconnaît les noms fabriqués par les clients de messagerie', () => {
    expect(estImageDeSignature(p('image001.png', 'image/png', 50000))).toBe(true);
    expect(estImageDeSignature(p('image002.jpg', 'image/jpeg', 99999))).toBe(true);
    expect(estImageDeSignature(p('logo.gif', 'image/gif', 40000))).toBe(true);
  });

  it('reconnaît les images minuscules, quel que soit leur nom', () => {
    expect(estImageDeSignature(p('photo.png', 'image/png', 2000))).toBe(true);
    expect(estImageDeSignature(p('x.png', 'image/png', TAILLE_MAX_SIGNATURE - 1))).toBe(true);
    expect(estImageDeSignature(p('x.png', 'image/png', TAILLE_MAX_SIGNATURE))).toBe(false);
  });

  it('une VRAIE photo reste une pièce jointe', () => {
    expect(estImageDeSignature(p('constat-fuite.jpg', 'image/jpeg', 2_400_000))).toBe(false);
    expect(estImageDeSignature(p('IMG_4821.HEIC', 'image/heic', 1_800_000))).toBe(false);
  });

  it('un document n’est JAMAIS une signature, même minuscule ou mal nommé', () => {
    expect(estImageDeSignature(p('bail.pdf', 'application/pdf', 500))).toBe(false);
    expect(estImageDeSignature(p('image001.pdf', 'application/pdf', 900))).toBe(false);
    expect(estImageDeSignature(p('releve.csv', 'text/csv', 100))).toBe(false);
  });

  it('une taille inconnue ne suffit pas à déclasser une pièce', () => {
    expect(estImageDeSignature(p('photo.jpg', 'image/jpeg', null))).toBe(false);
  });

  it('range en deux tas, dans l’ordre, sans rien perdre', () => {
    const pieces = [p('constat.pdf', 'application/pdf', 120000), p('image001.png', 'image/png', 3000), p('photo.jpg', 'image/jpeg', 900000)];
    const { vraies, signatures } = trierPieces(pieces);
    expect(vraies.map((x) => x.nomFichier)).toEqual(['constat.pdf', 'photo.jpg']);
    expect(signatures.map((x) => x.nomFichier)).toEqual(['image001.png']);
    expect(vraies.length + signatures.length).toBe(pieces.length); // rien ne disparaît au tri
  });
});
