import { describe, it, expect } from 'vitest';
import {
  corpsLisible, estImageDeSignature, masquerReferencesImages, separerCitation, sqlEstVraiePiece,
  TAILLE_MAX_SIGNATURE, adresseEnSignature, telephoneEnSignature, trierPieces,
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

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT RATTACHER-EN-ECRIVANT — LA MÊME RÈGLE, RENDUE EN SQL
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('④ « vraie pièce » en SQL : la même règle, dans l’autre langue', () => {
  /**
   * POURQUOI CE RENDU EXISTE. La recherche pagine : elle lit vingt-cinq lignes et s'arrête. Écarter les logos de
   * signature APRÈS la lecture rendrait des pages de dix-neuf lignes et un total qui ne correspondrait à rien. La
   * condition doit donc entrer dans le `WHERE` — d'où une version SQL.
   *
   * 🔴 CE QU'ON REFUSE, C'EST UNE SECONDE DÉFINITION. Les motifs et la taille limite sont écrits UNE fois et
   * servent aux deux rendus. Ces épreuves vérifient que la version SQL porte bien les mêmes morceaux : un préfixe
   * ajouté d'un côté et pas de l'autre est exactement le défaut qu'Arno a constaté à l'écran.
   *
   * ⚠️ VÉRIFIÉ AUSSI SUR LA VRAIE BASE, le 30/09/2026 : les deux règles appliquées aux 27 011 lignes de
   * `gestion_piece` donnent le MÊME verdict sur chacune — 16 686 vraies pièces des deux côtés, 0 désaccord.
   */
  it('🔴 porte les mêmes préfixes de signature que la règle TypeScript', () => {
    const sql = sqlEstVraiePiece('p');
    for (const prefixe of ['image', 'oledata', 'logo', 'signature', 'outlook-']) {
      expect(sql).toContain(prefixe);
    }
    // Les mêmes extensions d'image, et la même liste.
    for (const ext of ['png', 'jpe?g', 'gif', 'bmp', 'webp']) expect(sql).toContain(ext);
  });

  it('🔴 porte la MÊME taille limite, lue à la même constante', () => {
    expect(sqlEstVraiePiece('p')).toContain(`< ${TAILLE_MAX_SIGNATURE}`);
    expect(TAILLE_MAX_SIGNATURE).toBe(10 * 1024);
  });

  /** ⚠️ LES JUMEAUX macOS SONT UNE RÈGLE À PART, et elle est là aussi : « vraie pièce » veut dire les deux. */
  it('écarte les jumeaux macOS « ._ »', () => {
    expect(sqlEstVraiePiece('p')).toContain("nom_fichier NOT LIKE '._%'");
  });

  /** L'alias est celui qu'on lui donne : la condition se pose sous n'importe quel nom de table. */
  it('l’alias de table est celui demandé', () => {
    expect(sqlEstVraiePiece('pc')).toContain('pc.nom_fichier');
    expect(sqlEstVraiePiece('pc')).not.toContain('p.nom_fichier');
  });

  /**
   * 🔴 LA COMPARAISON DE CASSE EST INSENSIBLE DES DEUX CÔTÉS. Le motif JavaScript porte le drapeau `i` ; la
   * version SQL doit employer `~*` et non `~`, sans quoi « IMAGE001.PNG » passerait pour une vraie pièce d'un
   * côté et pas de l'autre. Ces noms-là arrivent en majuscules aussi souvent qu'en minuscules.
   */
  it('🔴 la comparaison est insensible à la casse, comme en TypeScript', () => {
    expect(sqlEstVraiePiece('p')).toContain('~*');
    expect(sqlEstVraiePiece('p')).not.toMatch(/[^~]~[^*]/);
    expect(estImageDeSignature({ nomFichier: 'IMAGE001.PNG', typeMime: 'image/png', tailleOctets: 900_000 }))
      .toBe(true);
  });

  /**
   * ⚠️ UN CAS QUE LES DEUX RÈGLES DOIVENT TRAITER PAREIL, et qui a failli passer : un PDF minuscule. Il est
   * PETIT, mais il n'est pas une IMAGE — la taille ne décide qu'après. Un quittance de 2 ko reste une pièce.
   */
  it('⚠️ un petit PDF reste une vraie pièce, des deux côtés', () => {
    expect(estImageDeSignature({ nomFichier: 'quittance.pdf', typeMime: 'application/pdf', tailleOctets: 2000 }))
      .toBe(false);
    // Côté SQL, la taille n'entre en jeu que sous la condition « c'est une image » : elle en est le facteur.
    expect(sqlEstVraiePiece('p')).toMatch(/LIKE 'image\/%'[\s\S]*AND[\s\S]*taille_octets/);
  });
});

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-4, POINT 5 — L'ATTRIBUTION QUE GMAIL REPLIE EN DEUX LIGNES ═════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * MESURÉ EN BASE LE 05/10/2026, et c'est la mesure qui a justifié d'y toucher : sur les 11 253 messages portant
 * une attribution, **5 374 — presque la moitié — l'ont coupée en deux lignes**, parce que Gmail replie son texte
 * à 72 colonnes sans se soucier de la phrase (544 de plus sur « wrote : »).
 *
 * 🔴 CE QUE ÇA COÛTAIT. Le motif est ancré aux deux bouts : coupée en deux, la phrase ne matchait plus. Quand la
 * citation était préfixée de « > », on s'en tirait avec deux lignes d'en-tête traînant sous la signature. Quand
 * elle ne l'était PAS — Gmail en « rich text » reconverti, iPhone —, rien ne la signalait et TOUT l'historique
 * s'affichait comme si on venait de l'écrire.
 *
 * 🔴 CE QUE LA CORRECTION A CHANGÉ, EN REJOUANT LES 55 883 CORPS DE LA BASE : 7 033 raccourcis (609 355 octets
 * d'historique retirés, jusqu'à 7 063 pour un seul message), ZÉRO phrase écrite perdue — tout ce qui disparaît
 * est un en-tête d'attribution —, et 18 corps RALLONGÉS, qui sont la prudence ci-dessous : un mail qui n'est QUE
 * de la citation s'affiche en entier.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('separerCitation — l’attribution repliée par Gmail', () => {
  it('🔴 reconnaît « … a » + « écrit : » sur deux lignes', () => {
    const r = separerCitation(
      'Bien à vous,\nPaul\n\nLe mar. 29 sept. 2026 à 16:36, Gestion <gestion@exemple.test> a\nécrit :\n\nBonjour,\n',
    );
    expect(r.visible).toBe('Bien à vous,\nPaul');
    expect(r.cite).toContain('Le mar. 29 sept. 2026');
    expect(r.cite).toContain('Bonjour,');
  });

  it('🔴 reconnaît « … » + « wrote : » sur deux lignes', () => {
    const r = separerCitation(
      'Thanks,\nMichael\n\nOn Fri, Oct 2, 2026 at 9:54 AM Brigitte <b@exemple.test>\nwrote:\n\nDear Mr X,\n',
    );
    expect(r.visible).toBe('Thanks,\nMichael');
    expect(r.cite).toContain('wrote:');
  });

  it('⚠️ TIENT SUR TROIS LIGNES : une adresse longue occupe un repli à elle seule', () => {
    const r = separerCitation(
      'Merci,\nAnna\n\nLe lun. 22 sept. 2025 à 13:08, Christelle Le Berrigaud <\nchristelle.le.berrigaud@exemple.test> a\nécrit :\n\nBonjour,\n',
    );
    expect(r.visible).toBe('Merci,\nAnna');
    expect(r.cite).toContain('christelle.le.berrigaud@exemple.test');
  });

  it('⚠️ AU-DELÀ DE DEUX REPLIS, ON NE RECOLLE PLUS : la borne est tenue', () => {
    const r = separerCitation(
      'Merci,\nAnna\n\nLe lun. 22 sept. 2025 à 13:08, Christelle <\nchristelle@exemple.test>\nen copie Jean\na\nécrit :\n',
    );
    // Rien ne coupe : le corps s'affiche tel quel plutôt que d'être tronqué au hasard.
    expect(r.cite).toBeNull();
    expect(r.visible).toContain('écrit :');
  });

  it('⚠️ AUCUN FAUX POSITIF : une phrase écrite qui parle d’un courrier n’est pas repliée', () => {
    const r = separerCitation(
      'Bonjour,\n\nLe syndic nous a transmis le devis que le plombier\navait rédigé en août : il est bien reçu.\n\nCordialement,\n',
    );
    expect(r.cite).toBeNull();
    expect(r.visible).toContain('il est bien reçu');
  });

  /**
   * ⚠️ LA PRUDENCE DÉJÀ ÉCRITE DANS `separerCitation` VAUT AUSSI POUR LE RECOLLAGE, et c'est la règle d'Arno :
   * « si elle échoue sur un cas, affiche tout plutôt que de couper ». Les 18 corps « rallongés » de la mesure
   * sont exactement ce cas-là.
   */
  it('🔴 un corps qui n’est QUE l’attribution repliée et sa citation s’affiche en entier', () => {
    const r = separerCitation('Le 3 oct. 2026 à 10:18, Gestion <gestion@exemple.test> a\nécrit :\n\n> Bonjour,\n');
    expect(r.cite).toBeNull();
    expect(r.visible).toContain('Bonjour,');
  });
});

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — LE TÉLÉPHONE QU'UNE SIGNATURE PORTE ════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO : la carte qu'ouvre le « + » « est pré-remplie : nom, adresse, téléphone trouvé en signature ».
 *
 * MESURÉ AVANT D'ÉCRIRE : sur les 485 cartes de contact actives du 05/10/2026, **zéro** porte un téléphone — la
 * colonne existe depuis la migration 304 et rien ne l'a jamais remplie. Or sur les 183 adresses de ces cartes qui
 * ont réellement écrit, **151 (83 %)** portent un numéro français dans le corps de leurs mails.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('telephoneEnSignature — le numéro de l’expéditeur, et pas celui d’un autre', () => {
  it('🔴🔴 LE NUMÉRO D’UNE SIGNATURE ORDINAIRE', () => {
    const corps = 'Bonjour,\n\nVoici le devis.\n\nCordialement,\nPaul Mercier\nPuro Flow\n01 41 21 43 31\n';
    expect(telephoneEnSignature(corps)).toBe('01 41 21 43 31');
  });

  it('🔴 LES TROIS SÉPARATEURS QUE LES SIGNATURES EMPLOIENT, et le format international', () => {
    for (const n of ['06.12.34.56.78', '06-12-34-56-78', '0612345678', '+33 6 12 34 56 78']) {
      expect(telephoneEnSignature(`Bonjour,\n\nMerci.\n\nJean\n${n}\n`)).toBe(n);
    }
  });

  it('🔴🔴 ON NE CHERCHE QUE DANS LA SIGNATURE : un numéro cité dans le corps n’est pas le sien', () => {
    /* Le plombier qu'on recommande n'est pas l'expéditeur. Un long message pousse ce numéro hors de la zone. */
    const corps = 'Bonjour,\n\nAppelez le plombier au 01 11 11 11 11 de ma part.\n'
      + Array.from({ length: 14 }, (_, i) => `Ligne de détail ${i + 1}.`).join('\n')
      + '\n\nCordialement,\nMme Durand\n';
    expect(telephoneEnSignature(corps)).toBeNull();
  });

  it('🔴🔴 ET JAMAIS DANS LA CITATION : le numéro y serait celui de quelqu’un d’autre, à coup sûr', () => {
    const corps = 'Bien reçu, merci.\n\nPaul\n\nLe mar. 29 sept. 2026 à 16:36, Gestion <g@exemple.test> a\nécrit :\n'
      + '\n> Bonjour,\n>\n> Notre standard : 01 41 21 43 31\n';
    expect(telephoneEnSignature(corps)).toBeNull();
  });

  it('🔴 LE DERNIER TROUVÉ GAGNE : fixe puis mobile, c’est le mobile qui est personnel', () => {
    const corps = 'Merci.\n\nPaul Mercier\nStandard : 01 41 21 43 31\nMobile : 06 12 34 56 78\n';
    expect(telephoneEnSignature(corps)).toBe('06 12 34 56 78');
  });

  it('⚠️ `null` EST UNE RÉPONSE : la plupart des mails n’ont pas de signature téléphonée', () => {
    expect(telephoneEnSignature('Bonjour,\n\nMerci pour votre retour.\n\nPaul\n')).toBeNull();
    expect(telephoneEnSignature('')).toBeNull();
    expect(telephoneEnSignature(null)).toBeNull();
  });

  /**
   * ⚠️ UN NUMÉRO DE DOSSIER N'EST PAS UN TÉLÉPHONE. Sans l'ancrage sur une frontière non numérique,
   * « 0123456789012 » rendrait ses dix premiers chiffres — et la carte proposerait un faux numéro, ce qui est
   * bien pire que de n'en proposer aucun.
   */
  it('🔴🔴 UNE SUITE DE CHIFFRES PLUS LONGUE N’EST PAS UN TÉLÉPHONE', () => {
    expect(telephoneEnSignature('Merci.\n\nPaul\nDossier 0123456789012\n')).toBeNull();
    expect(telephoneEnSignature('Merci.\n\nPaul\nSIRET 01234567890123\n')).toBeNull();
  });

  it('⚠️ UN NUMÉRO QUI COMMENCE PAR 00 N’EST PAS UN NUMÉRO FRANÇAIS', () => {
    expect(telephoneEnSignature('Merci.\n\nPaul\n00 12 34 56 78\n')).toBeNull();
  });

  /**
   * 🔴 `+33 (0) 1 …` EST ADMIS, ET C'EST LA MESURE QUI L'A IMPOSÉ : ce format est courant dans les signatures
   * professionnelles françaises, et la première version du motif rendait `null` sur une signature qui portait
   * bel et bien un numéro. Le cas est écrit pour que personne ne le resserre par mégarde.
   */
  it('🔴 LE FORMAT « +33 (0) 1 … » EST RECONNU, ET CONSERVÉ TEL QUEL', () => {
    expect(telephoneEnSignature('Merci.\n\nPaul\n+33 (0) 1 41 21 43 31\n')).toBe('+33 (0) 1 41 21 43 31');
  });

  it('⚠️ ON NE NORMALISE RIEN : le format rendu est celui de la signature, au caractère près', () => {
    expect(telephoneEnSignature('Merci.\n\nPaul\nTél. 01.41.21.43.31\n')).toBe('01.41.21.43.31');
  });
});

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — L'ADRESSE POSTALE EN SIGNATURE ═════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026) : le formulaire du « + » est « pré-rempli depuis le pré-remplissage : nom et prénom
 * séparés si possible, e-mail, téléphone ET ADRESSE trouvés dans la signature ».
 *
 * MESURÉ AVANT D'ÉCRIRE, sur la vraie base : sur les **187 adresses** qui portent une carte de contact et qui ont
 * réellement écrit, **65 (35 %)** laissent une adresse postale COMPLÈTE dans la zone de signature VISIBLE de l'un
 * de leurs quatre derniers mails. Un tiers des fiches dont trois champs se remplissent tout seuls.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('adresseEnSignature — trois champs, ou rien', () => {
  it('🔴🔴 LA VOIE SUR LA MÊME LIGNE QUE LE CODE POSTAL — forme réelle de la base', () => {
    const corps = 'Bonjour,\n\nBien reçu.\n\nBien cordialement,\nAnaïs BOURDEAU\n'
      + 'Responsable Service Gestion\n2 rue Mars et Roty, 92800 Puteaux\n06 23 53 32 36\n';
    expect(adresseEnSignature(corps))
      .toEqual({ voie: '2 rue Mars et Roty', codePostal: '92800', commune: 'Puteaux' });
  });

  it('🔴🔴 LA VOIE SUR LA LIGNE AU-DESSUS — l’autre forme réelle de la base', () => {
    const corps = 'Chers copropriétaires,\n\nVeuillez trouver l’appel de provisions.\n\nBien cordialement\n\n'
      + 'MDRC SYNDIC\n11 BOULEVARD RICHARD WALLACE\n92800 PUTEAUX\n\ncontact@mdrcsyndic.test\n';
    expect(adresseEnSignature(corps))
      .toEqual({ voie: '11 BOULEVARD RICHARD WALLACE', codePostal: '92800', commune: 'PUTEAUX' });
  });

  it('🔴 UNE VOIE SANS NUMÉRO EST RECONNUE PAR SON MOT : « Place du Marché »', () => {
    const corps = 'Merci.\n\nLe syndic\nPlace du Marché\n92400 COURBEVOIE\n';
    expect(adresseEnSignature(corps)?.voie).toBe('Place du Marché');
  });

  /**
   * ══ 🔴🔴 LA VOIE EST EXIGÉE, ET C'EST LA MESURE QUI L'A TRANCHÉ ═════════════════════════════════════════════
   *
   * Ma première version acceptait « code postal + commune » seuls : 6 adresses de plus, que je suis allé
   * regarder une par une. Elles donnaient « 92270 Bois colombes Bonjour », « 92309 LEVALLOIS PERRET CEDEX
   * Significations » — des bouts d'en-tête de courrier recopiés, pas des adresses. Six pré-remplissages faux
   * contre six champs gagnés : sans voie, on ne propose RIEN.
   */
  it('🔴🔴 SANS VOIE, ON NE PROPOSE RIEN — les six cas réels étaient tous faux', () => {
    expect(adresseEnSignature('Significations\n\n92309 LEVALLOIS PERRET CEDEX Significations\n')).toBeNull();
    expect(adresseEnSignature('Merci\n\nMme Durand\n92270 Bois colombes Bonjour\n')).toBeNull();
  });

  /**
   * 🔴🔴 LA CITATION EST ÉCARTÉE, ET CE N'EST PAS UN DÉTAIL : les premiers exemples trouvés en SQL brut étaient
   * l'adresse du GESTIONNAIRE, recopiée dans le mail cité par quelqu'un d'autre. Pré-remplir la fiche d'un
   * contact avec l'adresse de son interlocuteur serait pire que de la laisser vide.
   */
  it('🔴🔴 JAMAIS DANS LA CITATION : l’adresse y est celle de quelqu’un d’autre', () => {
    const corps = 'Bien reçu, merci.\n\nPaul\n\nLe mar. 29 sept. 2026 à 16:36, Gestion <g@exemple.test> a\n'
      + 'écrit :\n\n> Bien cordialement,\n> Anaïs BOURDEAU\n> 2 rue Mars et Roty, 92800 Puteaux\n';
    expect(adresseEnSignature(corps)).toBeNull();
  });

  it('🔴 LE DERNIER TROUVÉ GAGNE : ce qui est plus haut est du texte de message', () => {
    const corps = 'Le bien se trouve 5 avenue Foch, 75116 PARIS.\n\nCordialement,\nPaul\n'
      + 'Cabinet Paul\n2 rue Mars et Roty, 92800 Puteaux\n';
    expect(adresseEnSignature(corps)?.codePostal).toBe('92800');
  });

  it('⚠️ LA PONCTUATION DE LIAISON EST RETIRÉE — « 34, rue Eugène FLACHAT - 75017 PARIS »', () => {
    expect(adresseEnSignature('Merci.\n\nPaul\n34, rue Eugène FLACHAT - 75017 PARIS\n'))
      .toEqual({ voie: '34, rue Eugène FLACHAT', codePostal: '75017', commune: 'PARIS' });
  });

  it('⚠️ `null` EST UNE RÉPONSE : deux tiers des contacts n’ont pas d’adresse trouvable', () => {
    expect(adresseEnSignature('Bonjour,\n\nMerci pour votre retour.\n\nPaul\n')).toBeNull();
    expect(adresseEnSignature('')).toBeNull();
    expect(adresseEnSignature(null)).toBeNull();
  });

  /** ⚠️ CINQ CHIFFRES NE FONT PAS UN CODE POSTAL : un numéro de dossier plus long est écarté. */
  it('🔴 UNE SUITE DE CHIFFRES PLUS LONGUE N’EST PAS UN CODE POSTAL', () => {
    expect(adresseEnSignature('Merci.\n\nPaul\n2 rue Mars et Roty\nDossier 928001234 Puteaux\n')).toBeNull();
  });

  /** ⚠️ ON NE MET RIEN EN FORME : la commune garde sa casse, la voie ses abréviations. */
  it('⚠️ AUCUNE MISE EN FORME : c’est le formulaire qui formate, et lui seul', () => {
    expect(adresseEnSignature('Merci.\n\nPaul\n5 bd de la Paix, 21078 DIJON Cedex\n'))
      .toEqual({ voie: '5 bd de la Paix', codePostal: '21078', commune: 'DIJON Cedex' });
  });
});
