import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  estProgrammeParLeContenu, estProgrammeParLeNom, estSignatureElectronique, extensionDe,
  mentionPieceRefusee, telechargementSeulement, typeReelSiVague, verdictPiece,
  EXTENSIONS_PROGRAMME, MENTION_DEFAUT, MENTION_PRECAUTION, MENTION_PROGRAMME, MENTION_SIGNATURE,
  MOTIF_PROGRAMME, MOTIF_SIGNATURE,
} from './pieceSecurite';

/**
 * ══ 🔴🔴 LOT PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE, POINT 1 — CE QU'ON GARDE, ET CE QU'ON REFUSE ════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISIONS D'ARNO (04/10/2026), sur les 394 pièces refusées à la relève :
 *
 *   À RÉCUPÉRER : images HEIF/HEIC · zip et `application/octet-stream` « stockés tels quels, proposés en
 *   TÉLÉCHARGEMENT SEULEMENT (jamais ouverts, prévisualisés ni décompressés par l'application), avec la mention
 *   “Fichier à ouvrir avec précaution” » · plafond relevé à 50 Mo.
 *
 *   À NE PAS RÉCUPÉRER : `pkcs7-signature` → « Signature électronique du mail — pas un document » · « tout
 *   exécutable ou script (.exe, .bat, .cmd, .com, .msi, .app, .dmg, .pkg, .js, .vbs, .scr, .jar, .sh, .ps1), quel
 *   que soit le type annoncé » → « Programme non récupéré par sécurité — voir dans Gmail ». Et : « Décide sur
 *   l'extension ET sur le contenu réel (signature du fichier), pas sur le type annoncé. »
 *
 * ⚠️ CES ÉPREUVES NE TOUCHENT NI GMAIL NI LE STOCKAGE : tout ce fichier est PUR. Le rattrapage réel, lui, est
 * journalisé sur le Bureau (165 pièces récupérées, 6 refus de sécurité, 4 échecs nommés).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Un en-tête de fichier fabriqué : les premiers octets, puis du remplissage. */
const octets = (...debut: number[]): Uint8Array => {
  const b = new Uint8Array(64);
  debut.forEach((o, i) => { b[i] = o; });
  return b;
};
/** Un conteneur ISO-BMFF : 4 octets de taille, « ftyp », puis la marque de format. */
const ftyp = (marque: string): Uint8Array => {
  const b = new Uint8Array(64);
  [0, 0, 0, 0x20].forEach((o, i) => { b[i] = o; });
  'ftyp'.split('').forEach((c, i) => { b[4 + i] = c.charCodeAt(0); });
  marque.split('').forEach((c, i) => { b[8 + i] = c.charCodeAt(0); });
  return b;
};
const PNG = octets(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = octets(0xff, 0xd8, 0xff, 0xe0);
const PDF = octets(0x25, 0x50, 0x44, 0x46, 0x2d);
const ZIP = octets(0x50, 0x4b, 0x03, 0x04);
const EXE = octets(0x4d, 0x5a, 0x90, 0x00);

describe('🔴🔴 ① les programmes — par le nom', () => {
  /**
   * 🔴🔴 LES QUATORZE EXTENSIONS D'ARNO, UNE PAR UNE. Elles sont figées ici parce qu'elles sont une DÉCISION :
   * personne ne doit pouvoir en retirer une au passage sans que cette épreuve le dise.
   */
  it('🔴🔴 les quatorze extensions nommées par Arno', () => {
    for (const ext of ['exe', 'bat', 'cmd', 'com', 'msi', 'app', 'dmg', 'pkg', 'js', 'vbs', 'scr', 'jar',
      'sh', 'ps1']) {
      expect(EXTENSIONS_PROGRAMME, ext).toContain(ext);
      expect(estProgrammeParLeNom(`piece.${ext}`), ext).toBe(true);
      /* ⚠️ LA CASSE NE SAUVE PAS : « FACTURE.EXE » est un exécutable comme « facture.exe ». */
      expect(estProgrammeParLeNom(`PIECE.${ext.toUpperCase()}`), ext).toBe(true);
    }
  });

  /**
   * 🔴 LES SYNONYMES DU MÊME FORMAT SONT REFUSÉS AUSSI, et chacun est justifié dans le module : `.command` est le
   * `.sh` de macOS (double-clic = exécution), `.mjs`/`.cjs` sont le même JavaScript, `.msix` le `.msi`
   * d'aujourd'hui. En refuser un et pas son synonyme aurait fait une liste pour la forme.
   */
  it('🔴 les synonymes aussi — sinon la liste ne protège de rien', () => {
    for (const ext of ['command', 'bash', 'zsh', 'mjs', 'cjs', 'msix', 'appx', 'lnk', 'reg', 'hta']) {
      expect(estProgrammeParLeNom(`piece.${ext}`), ext).toBe(true);
    }
  });

  it('🔴 un document ordinaire n’est pas un programme', () => {
    for (const nom of ['bail.pdf', 'photo.heic', 'archive.zip', 'tableau.xlsx', 'note.txt', 'lettre.doc']) {
      expect(estProgrammeParLeNom(nom), nom).toBe(false);
    }
  });

  /**
   * ⚠️ UN NOM SANS EXTENSION N'EST PAS UN PROGRAMME PAR DÉFAUT — 70 pièces de cette base n'ont pas d'extension
   * (« img-a1b4f031… », « IMG1 », « (sans nom) »). Les refuser en bloc aurait jeté des photos.
   */
  it('⚠️ pas d’extension ⇒ ce n’est pas le nom qui décide', () => {
    expect(estProgrammeParLeNom('img-a1b4f031-13cc-49dc-ab7f-ee67938c48b7')).toBe(false);
    expect(estProgrammeParLeNom('(sans nom)')).toBe(false);
    expect(extensionDe('(sans nom)')).toBe('');
    expect(extensionDe('JEUDI 05 JUIN-25.dump')).toBe('dump');
  });
});

describe('🔴🔴 ② les programmes — par les octets, quel que soit le nom', () => {
  /**
   * 🔴🔴 C'EST LA MOITIÉ DE LA RÈGLE D'ARNO, et celle qu'aucune extension ne peut tenir : un exécutable RENOMMÉ.
   * « facture.pdf » dont les octets commencent par « MZ » est un programme Windows, et il est refusé.
   */
  it('🔴🔴 un exécutable renommé « facture.pdf » est refusé', () => {
    expect(estProgrammeParLeContenu(EXE)).toBe(true);
    const v = verdictPiece({ nom: 'facture.pdf', typeMime: 'application/pdf', octets: EXE });
    expect(v.garder).toBe(false);
    expect(v).toEqual({ garder: false, motif: MOTIF_PROGRAMME });
  });

  it('🔴 les cinq familles de signatures binaires', () => {
    expect(estProgrammeParLeContenu(octets(0x4d, 0x5a))).toBe(true);                      // MZ (PE Windows)
    expect(estProgrammeParLeContenu(octets(0x7f, 0x45, 0x4c, 0x46))).toBe(true);           // ELF (Linux)
    expect(estProgrammeParLeContenu(octets(0xcf, 0xfa, 0xed, 0xfe))).toBe(true);           // Mach-O 64 (macOS)
    expect(estProgrammeParLeContenu(octets(0xca, 0xfe, 0xba, 0xbe))).toBe(true);           // Java / Mach-O gras
    expect(estProgrammeParLeContenu(octets(0x78, 0x61, 0x72, 0x21))).toBe(true);           // xar! (.pkg macOS)
  });

  /**
   * 🔴🔴 `D0CF11E0` (OLE) N'EST PAS UNE SIGNATURE DE PROGRAMME ICI, ET C'EST RAISONNÉ : c'est celle d'un `.msi`…
   * et aussi celle de TOUS les `.doc` et `.xls`. L'y mettre aurait refusé les 16 documents Word de cette base
   * pour attraper zéro installeur. Le `.msi` est couvert par son extension.
   */
  it('🔴🔴 un .doc n’est pas refusé par sa signature OLE', () => {
    const OLE = octets(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    expect(estProgrammeParLeContenu(OLE)).toBe(false);
    expect(verdictPiece({ nom: 'bail.doc', typeMime: 'application/msword', octets: OLE }).garder).toBe(true);
    /* …mais le même contenu nommé `.msi` est refusé : c'est l'extension qui tranche. */
    expect(verdictPiece({ nom: 'installeur.msi', typeMime: 'application/msword', octets: OLE }).garder)
      .toBe(false);
  });

  /**
   * ⚠️ AUCUNE RÈGLE SUR `#!` (shebang), et c'est délibéré : un fichier texte parfaitement légitime peut commencer
   * par ces deux caractères. Un script n'est dangereux que s'il est NOMMÉ comme tel, ce que la liste d'extensions
   * couvre. Refuser sur le shebang aurait écarté des `.txt` en croyant protéger quelqu'un.
   */
  it('⚠️ un texte qui commence par « #! » n’est pas refusé', () => {
    const SHEBANG = octets(0x23, 0x21, 0x2f, 0x62, 0x69, 0x6e);
    expect(estProgrammeParLeContenu(SHEBANG)).toBe(false);
    /* …mais `commandes.sh`, lui, l'est — par son nom. */
    expect(estProgrammeParLeNom('commandes.sh')).toBe(true);
  });

  it('⚠️ un fichier plus court qu’une signature n’est pas un programme', () => {
    expect(estProgrammeParLeContenu(new Uint8Array([0x4d]))).toBe(false);
    expect(estProgrammeParLeContenu(new Uint8Array(0))).toBe(false);
    expect(estProgrammeParLeContenu(null)).toBe(false);
  });
});

describe('🔴🔴 ③ la signature électronique du mail', () => {
  /** 🔴 LE TYPE **OU** LE NOM : on ne garde pas un `smime.p7s` parce qu'un client a mal rempli un en-tête. */
  it('🔴 `smime.p7s` et `application/pkcs7-signature`', () => {
    expect(estSignatureElectronique({ nom: 'smime.p7s', typeMime: 'application/pkcs7-signature' })).toBe(true);
    expect(estSignatureElectronique({ nom: 'smime.p7s', typeMime: null })).toBe(true);
    expect(estSignatureElectronique({ nom: 'piece', typeMime: 'application/x-pkcs7-signature' })).toBe(true);
    expect(estSignatureElectronique({ nom: 'bail.pdf', typeMime: 'application/pdf' })).toBe(false);
  });

  /** 🔴 ET C'EST UN REFUS, pas un stockage : les 6 pièces de cette base portent désormais ce motif. */
  it('🔴 le verdict la refuse, avec son motif', () => {
    expect(verdictPiece({ nom: 'smime.p7s', typeMime: 'application/pkcs7-signature', octets: octets(0x30, 0x82) }))
      .toEqual({ garder: false, motif: MOTIF_SIGNATURE });
  });
});

describe('🔴🔴 ④ téléchargement seulement — zip et octet-stream', () => {
  /**
   * 🔴🔴 LA CONTREPARTIE DE LEUR ENTRÉE DANS LA LISTE BLANCHE. Un `application/octet-stream` veut littéralement
   * dire « je ne sais pas ce que c'est » : le servir « inline » laisserait le navigateur deviner, et un
   * navigateur qui devine finit par exécuter.
   */
  it('🔴🔴 les types et les extensions d’archive', () => {
    for (const t of ['application/zip', 'application/x-zip-compressed', 'application/octet-stream']) {
      expect(telechargementSeulement({ nom: 'piece', typeMime: t }), t).toBe(true);
    }
    for (const ext of ['zip', 'rar', '7z', 'gz', 'tar']) {
      expect(telechargementSeulement({ nom: `dossier.${ext}`, typeMime: 'application/pdf' }), ext).toBe(true);
    }
  });

  /**
   * 🔴🔴 ET SURTOUT PAS UNE PHOTO. Une `.heic` annoncée `application/octet-stream` est redressée AVANT d'être
   * stockée (8 cas dans cette base) : elle est donc jugée sur son type RETENU, et garde son aperçu. C'est tout
   * l'intérêt du redressement — sans lui, 8 photos auraient été rangées parmi les fichiers à ouvrir avec
   * précaution.
   */
  it('🔴🔴 une photo n’est jamais « à ouvrir avec précaution »', () => {
    for (const t of ['image/heic', 'image/heif', 'image/jpeg', 'image/png', 'application/pdf', 'video/mp4']) {
      expect(telechargementSeulement({ nom: 'photo', typeMime: t }), t).toBe(false);
    }
  });

  it('🔴 la mention, mot pour mot', () => {
    expect(MENTION_PRECAUTION).toBe('Fichier à ouvrir avec précaution');
  });
});

describe('🔴🔴 ⑤ le type réel, quand le type annoncé ne dit rien', () => {
  /**
   * 🔴🔴 MESURÉ SUR CETTE BASE : le type annoncé ment couramment. 8 fichiers `.heic` étaient annoncés
   * `application/octet-stream`, et le rattrapage en a redressé 31 au total (photos JPEG, PNG, HEIC, et 2 PDF).
   */
  it('🔴🔴 les formats que les octets désignent sans ambiguïté', () => {
    expect(typeReelSiVague({ typeMime: 'application/octet-stream', octets: PNG })).toBe('image/png');
    expect(typeReelSiVague({ typeMime: 'application/octet-stream', octets: JPEG })).toBe('image/jpeg');
    expect(typeReelSiVague({ typeMime: 'application/octet-stream', octets: PDF })).toBe('application/pdf');
    expect(typeReelSiVague({ typeMime: null, octets: ZIP })).toBe('application/zip');
    expect(typeReelSiVague({ typeMime: '', octets: ftyp('heic') })).toBe('image/heic');
    expect(typeReelSiVague({ typeMime: 'application/octet-stream', octets: ftyp('mif1') })).toBe('image/heic');
    expect(typeReelSiVague({ typeMime: 'application/octet-stream', octets: ftyp('qt  ') })).toBe('video/quicktime');
    expect(typeReelSiVague({ typeMime: 'application/octet-stream', octets: ftyp('isom') })).toBe('video/mp4');
  });

  /**
   * 🔴🔴 IL NE CONTREDIT JAMAIS UN TYPE PRÉCIS, MÊME FAUX. Les 2 fichiers `.pdf` annoncés `text/plain` de cette
   * base restent annoncés `text/plain` : corriger un type précis, c'est décider qu'on sait mieux que
   * l'expéditeur, et ce n'est pas la même décision — elle n'a pas été demandée.
   */
  it('🔴🔴 un type précis, même faux, n’est pas redressé', () => {
    expect(typeReelSiVague({ typeMime: 'text/plain', octets: PDF })).toBeNull();
    expect(typeReelSiVague({ typeMime: 'image/heif', octets: ftyp('heic') })).toBeNull();
  });

  /** ⚠️ RIEN D'IDENTIFIABLE ⇒ `null` : on garde ce qui était annoncé plutôt que d'inventer. */
  it('⚠️ un contenu inconnu reste ce qu’il prétend être', () => {
    expect(typeReelSiVague({ typeMime: 'application/octet-stream', octets: new Uint8Array(64) })).toBeNull();
    expect(typeReelSiVague({ typeMime: 'application/octet-stream', octets: new Uint8Array(4) })).toBeNull();
  });
});

describe('🔴🔴 ⑥ l’ordre du verdict, et ce qu’il garantit', () => {
  /**
   * 🔴🔴 LE PROGRAMME EST TESTÉ **AVANT** TOUT LE RESTE. Un exécutable nommé « photo.jpg » et annoncé
   * `image/jpeg` ne doit pas être sauvé par le fait que `image/jpeg` soit dans la liste blanche.
   */
  it('🔴🔴 programme d’abord, signature ensuite, type en dernier', () => {
    expect(verdictPiece({ nom: 'photo.jpg', typeMime: 'image/jpeg', octets: EXE }))
      .toEqual({ garder: false, motif: MOTIF_PROGRAMME });
    /* Et un `.exe` arrivé en octet-stream l'est aussi — c'est le cas que la liste élargie rendait possible. */
    expect(verdictPiece({ nom: 'outil.exe', typeMime: 'application/octet-stream', octets: PNG }))
      .toEqual({ garder: false, motif: MOTIF_PROGRAMME });
  });

  it('🔴 un fichier ordinaire est gardé, sous son type annoncé', () => {
    expect(verdictPiece({ nom: 'bail.pdf', typeMime: 'application/pdf', octets: PDF }))
      .toEqual({ garder: true, typeRetenu: 'application/pdf', redresse: false });
  });

  it('🔴 un type vague est gardé, sous le type RETENU', () => {
    expect(verdictPiece({ nom: 'Rib.heic', typeMime: 'application/octet-stream', octets: JPEG }))
      .toEqual({ garder: true, typeRetenu: 'image/jpeg', redresse: true });
  });

  /**
   * ══ 🔴🔴 LA SÉPARATION DES DEUX COUCHES, ÉPROUVÉE SUR LE CODE ═══════════════════════════════════════════════
   *
   * 🔴 LE REFUS DE SÉCURITÉ N'EST PAS CONFIGURABLE, et c'est tout l'objet de la séparation : une règle de
   * sécurité rangée dans une table se débranche d'un `UPDATE`. Le verdict ne consulte donc AUCUNE liste
   * d'autorisation, et la porte de dépôt l'appelle AVANT de consulter la sienne.
   */
  it('🔴🔴 le verdict ne consulte aucune liste configurable, et la porte l’appelle en premier', () => {
    const module = readFileSync('app/lib/gestion/pieceSecurite.ts', 'utf8');
    const code = module.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
      .filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    /* ⚠️ ON INSPECTE LE CODE, PAS LA PROSE : l'encadré qui explique la règle NOMME forcément ce qu'il écarte. */
    expect(code).not.toContain('gestion_config');
    expect(code).not.toContain('typesAcceptes');

    const porte = readFileSync('app/lib/stockage/index.ts', 'utf8');
    const iVerdict = porte.indexOf('const verdict = verdictPiece(');
    const iListe = porte.indexOf('const acceptes = opts.typesAcceptes.map(');
    expect(iVerdict).toBeGreaterThan(0);
    expect(iListe).toBeGreaterThan(iVerdict);
    /* 🔴 ET C'EST LE TYPE **RETENU** qui passe devant la liste blanche, sinon le redressement ne servirait à rien. */
    expect(porte).toContain('const type = verdict.typeRetenu;');
  });

  /**
   * 🔴 UNE SEULE PORTE POUR LA RELÈVE ET POUR LE RATTRAPAGE — condition d'Arno (« la liste blanche vit à un seul
   * endroit et vaut pour la relève future comme pour ce rattrapage »). Les deux appelants passent le NOM, sans
   * lequel la moitié de la règle serait impossible.
   */
  it('🔴 les deux appelants passent le nom du fichier', () => {
    for (const f of ['app/lib/gestion/captureRepo.ts', 'app/scripts/rattraper-pieces-refusees.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toContain('deposerPieceGestion(');
      expect(src, f).toContain('nomFichier: p.nomFichier,');
    }
  });
});

describe('🔴🔴 ⑦ les trois phrases de l’écran', () => {
  it('🔴🔴 mot pour mot celles d’Arno', () => {
    expect(MENTION_PROGRAMME).toBe('Programme non récupéré par sécurité — voir dans Gmail');
    expect(MENTION_SIGNATURE).toBe('Signature électronique du mail — pas un document');
    expect(MENTION_DEFAUT.mention).toBe('Pièce non récupérée — voir dans Gmail');
  });

  /**
   * 🔴 LE LIEN SUIT LA PHRASE, il ne la contredit pas. Une signature n'est pas un document perdu : il n'y a RIEN
   * à aller chercher, et sa phrase ne mentionne pas Gmail — le lien ne s'affiche donc pas.
   */
  it('🔴 le lien Gmail est proposé exactement quand la phrase le dit', () => {
    expect(mentionPieceRefusee(MOTIF_PROGRAMME))
      .toEqual({ mention: MENTION_PROGRAMME, avecLienGmail: true });
    expect(mentionPieceRefusee(MOTIF_SIGNATURE))
      .toEqual({ mention: MENTION_SIGNATURE, avecLienGmail: false });
    expect(mentionPieceRefusee('type non autorisé pour la gestion : « text/plain »')).toEqual(MENTION_DEFAUT);
    expect(mentionPieceRefusee(null)).toEqual(MENTION_DEFAUT);
  });

  /**
   * ⚠️ LA COMPARAISON PORTE SUR LE MOTIF ENTIER, pas sur un préfixe deviné : c'est la porte de dépôt qui l'écrit,
   * mot pour mot, depuis les constantes de ce module. Un préfixe aurait fini par attraper un motif voisin.
   */
  it('⚠️ un motif voisin ne prend pas la phrase d’un autre', () => {
    expect(mentionPieceRefusee('programme')).toEqual(MENTION_DEFAUT);
    expect(mentionPieceRefusee('signature')).toEqual(MENTION_DEFAUT);
  });
});
