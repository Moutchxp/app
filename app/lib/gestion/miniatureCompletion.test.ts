import { describe, it, expect } from 'vitest';
import {
  bilanVide, echecDefinitif, peutAvoirMiniature, planifier, sourceContenu, type PieceACompleter,
} from './miniatureCompletion';

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * LOT MINIATURES-COMPLÈTES — LES DEUX DÉCISIONS QUI PEUVENT FAIRE DU DÉGÂT, ET ELLES SONT ÉPROUVÉES ICI :
 *
 *   ① OÙ SONT LES OCTETS. Le vidage NE VIDE PAS `cle_stockage` : lire « clé présente donc contenu présent » est faux
 *      pour 4 058 pièces, et c'est très exactement la cause des quatre PDF sans aperçu du fil 354. Une erreur ici
 *      n'échoue pas bruyamment : elle va chercher au mauvais endroit et conclut « illisible ».
 *
 *   ② UN ÉCHEC EST-IL DÉFINITIF. Inscrire « échec » condamne la pièce POUR TOUJOURS — la route ne retente jamais un
 *      échec mémorisé. Marquer ainsi une pièce parce que Google a répondu 503 pendant trois secondes effacerait son
 *      aperçu définitivement, sans que personne sache qu'il faut le défaire.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const piece = (o: Partial<PieceACompleter> = {}): PieceACompleter => ({
  pieceId: 352,
  nomFichier: 'Appel_Fonds_Q1.pdf',
  typeMime: 'application/pdf',
  cleStockage: 'gestion/messages/668/1f25c7a8.pdf',
  videe: false,
  driveFileId: null,
  driveMd5: null,
  ...o,
});

describe('🔴 ① où sont les octets', () => {
  it('pièce ordinaire : sur le stockage objet', () => {
    expect(sourceContenu(piece())).toBe('minio');
  });

  /**
   * 🔴 LE PIÈGE CENTRAL DU LOT, rejoué tel quel : la pièce 352 du message 668, vidée le 27/09/2026 à 02 h 23. Sa
   * `cle_stockage` est TOUJOURS renseignée en base — c'est voulu, la preuve de vidage la reprend — mais MinIO répond
   * « The specified key does not exist ». Croire la colonne, c'est ce que fait la route de vignette, et c'est
   * pourquoi ces quatre PDF n'ont jamais eu d'aperçu.
   */
  it('🔴 pièce VIDÉE : le Drive, MÊME si `cle_stockage` est encore renseignée', () => {
    const videe = piece({ videe: true, driveFileId: '11F-7BGQu-hgFRf4JvVc9sU4CEDCNXg8P', driveMd5: '2d70be8a' });
    expect(videe.cleStockage).not.toBeNull();   // la colonne ment : elle a survécu au vidage
    expect(sourceContenu(videe)).toBe('drive'); // …et on ne la croit pas
  });

  it('vidée sans identifiant Drive : aucun contenu, et on le dit', () => {
    expect(sourceContenu(piece({ videe: true, driveFileId: null }))).toBe('aucune');
    expect(sourceContenu(piece({ videe: true, driveFileId: '' }))).toBe('aucune');
  });

  it('jamais stockée (type refusé, trop lourde, stockage absent à la relève) : aucun contenu', () => {
    expect(sourceContenu(piece({ cleStockage: null }))).toBe('aucune');
  });
});

describe('🔴 ② un échec est-il définitif', () => {
  it('le FICHIER est en cause → définitif : on l’inscrit, on ne retentera pas', () => {
    for (const m of [
      'pièce vide',
      'pièce trop volumineuse pour une miniature (52 Mo)',
      'type sans miniature',
      'PDF sans page',
      'page PDF de dimension nulle',
      'page PDF trop grande à rasteriser',
      'image illisible (dimensions inconnues)',
      'Failed to load document',
      'Invalid PDF structure',
      // APPRIS DE LA PREMIÈRE PASSE RÉELLE : 1 pièce sur 1 560, un HEIC que libheif refuse. Le verdict porte sur le
      //   FICHIER et ne changera pas : le classer transitoire l'aurait fait relire depuis le Drive à chaque passe.
      'Input buffer has corrupt header: heif: Memory allocation error: Security limit exceeded: image size',
    ]) expect(echecDefinitif(m), m).toBe(true);
  });

  /** ⚠️ Mais « Security limit exceeded » SEUL parle d'une limite de bibliothèque, pas du fichier : on ne l'inscrit pas. */
  it('la limite de la bibliothèque, sans en-tête abîmé, reste transitoire', () => {
    expect(echecDefinitif('Security limit exceeded')).toBe(false);
  });

  /**
   * 🔴 LE CAS QUI COÛTE CHER SI ON SE TROMPE. Aucun de ces motifs ne parle du fichier : ils parlent du réseau, d'un
   * jeton ou du stockage. Les inscrire condamnerait des milliers de pièces parfaitement lisibles, et il faudrait
   * ensuite aller défaire à la main une colonne que rien ne signale.
   */
  it('🔴 le RÉSEAU ou le STOCKAGE sont en cause → transitoire : on n’inscrit RIEN', () => {
    for (const m of [
      'Drive injoignable : fetch failed',
      'copie Drive illisible (HTTP 503)',
      'contenu Drive illisible (HTTP 429)',
      'copie Drive à la corbeille',
      'contenu absent du stockage : The specified key does not exist.',
      'dépôt impossible : stockage non configuré',
      'jeton Drive indisponible : invalid_grant',
      'fabrication de la miniature : délai de 15000 ms dépassé',
    ]) expect(echecDefinitif(m), m).toBe(false);
  });

  /** ⚠️ LE DÉFAUT EST « TRANSITOIRE » : une panne qu'on n'a pas su nommer d'avance ne condamne pas la pièce. */
  it('un motif inconnu n’est JAMAIS tenu pour définitif', () => {
    expect(echecDefinitif('quelque chose que personne n’a prévu')).toBe(false);
    expect(echecDefinitif('')).toBe(false);
  });
});

describe('le type décide AVANT toute lecture', () => {
  it('PDF et images en ont un ; le reste, non', () => {
    expect(peutAvoirMiniature('application/pdf', 'x.pdf')).toBe(true);
    expect(peutAvoirMiniature('image/jpeg', 'photo.jpg')).toBe(true);
    // Le type manque : c'est l'extension qui tranche, et seulement pour l'affichage.
    expect(peutAvoirMiniature(null, 'Appel_Fonds.pdf')).toBe(true);
    expect(peutAvoirMiniature('application/vnd.ms-excel', 'compta.xls')).toBe(false);
    expect(peutAvoirMiniature('application/xml', 'facture.xml')).toBe(false);
  });

  /** 🔴 Ni HTML ni SVG : ce sont des documents qui peuvent porter du script. `sortePiece` les écarte, ici aussi. */
  it('🔴 ni HTML ni SVG — on n’ouvre jamais leurs octets', () => {
    expect(peutAvoirMiniature('image/svg+xml', 'logo.svg')).toBe(false);
    expect(peutAvoirMiniature('text/html', 'message.html')).toBe(false);
  });
});

describe('le plan d’une pièce, décidé sans lire un octet', () => {
  it('un type sans aperçu s’inscrit comme échec : la route cesse de redemander le fichier', () => {
    expect(planifier(piece({ typeMime: 'application/xml', nomFichier: 'f.xml' })))
      .toEqual({ faire: 'inscrire_echec', motif: 'type sans miniature' });
  });

  /**
   * 🔴 UNE ABSENCE DE CONTENU N'EST PAS UN ÉCHEC DU FICHIER, et ne s'inscrit donc PAS : les octets peuvent revenir
   * (copie Drive restaurée, stockage remonté). L'inscrire interdirait de reprendre la pièce à jamais.
   */
  it('🔴 sans contenu nulle part : on IGNORE, on n’inscrit rien', () => {
    expect(planifier(piece({ cleStockage: null }))).toEqual({ faire: 'ignorer', motif: 'aucun contenu stocké' });
    expect(planifier(piece({ videe: true, driveFileId: null })))
      .toEqual({ faire: 'ignorer', motif: 'vidée sans copie Drive utilisable' });
  });

  it('les deux chemins de fabrication', () => {
    expect(planifier(piece())).toEqual({ faire: 'fabriquer', source: 'minio' });
    expect(planifier(piece({ videe: true, driveFileId: 'abc' }))).toEqual({ faire: 'fabriquer', source: 'drive' });
  });

  /** L'ordre compte : on écarte le type AVANT de chercher les octets — sinon on télécharge un ZIP pour rien. */
  it('un type sans aperçu est écarté même quand le contenu est là', () => {
    expect(planifier(piece({ typeMime: 'application/zip', nomFichier: 'a.zip', videe: true, driveFileId: 'abc' })).faire)
      .toBe('inscrire_echec');
  });
});

describe('le bilan', () => {
  it('part de zéro partout — un compteur oublié ferait un rapport faux', () => {
    expect(Object.values(bilanVide()).every((v) => v === 0)).toBe(true);
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 GARANTIES STATIQUES SUR LA COMMANDE — LES INTERDITS POSÉS PAR ARNO, LUS DANS LE CODE LUI-MÊME.
 *
 * Ce ne sont pas des comportements qu'on peut éprouver en exécutant : il faudrait un vrai Drive pour constater
 * qu'on n'y écrit pas, et constater une non-écriture demande d'attendre indéfiniment. On les lit donc dans le
 * SOURCE, comme le dépôt le fait déjà pour « ce dépôt ne fait QUE lire » (`boiteRepo.test.ts`).
 *
 * ⚠️ SUR LES LIGNES DE CODE SEULEMENT : les encadrés du fichier CITENT `files.create` et `files.delete` pour dire
 * qu'on ne s'en sert pas. Une assertion sur la prose rougirait pour une bonne explication.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴🔴 la commande de complétion, lue dans son source', () => {
  const code = (): string => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    return readFileSync('app/scripts/completer-miniatures.ts', 'utf8')
      .split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l.trim())).join('\n');
  };

  it('🔴 aucune ÉCRITURE Drive : ni création, ni modification, ni suppression', () => {
    expect(/files\.create|files\.update|files\.delete|deposerFichier/.test(code())).toBe(false);
    // Les seuls appels Drive sont des GET : aucune méthode HTTP d'écriture n'est posée nulle part.
    expect(/method:\s*'(POST|PATCH|PUT|DELETE)'/.test(code())).toBe(false);
  });

  it('🔴 elle ne redépose JAMAIS le contenu d’origine — seule la vignette part au stockage', () => {
    const c = code();
    expect(c).toContain('deposerMiniatureGestion');
    // `deposerPieceGestion` remettrait les octets complets dans MinIO : c'est précisément ce qui est interdit.
    expect(c).not.toContain('deposerPieceGestion');
    expect(c).not.toContain('deposerPieceBrouillon');
  });

  it('🔴 le garde-fou de racine est POSÉ avant toute lecture de contenu', () => {
    const c = code();
    expect(c).toContain('ascensionVersRacine');
    // L'ordre compte : la descendance est prouvée AVANT de demander les octets (`alt=media`).
    expect(c.indexOf('ascensionVersRacine')).toBeLessThan(c.indexOf('alt=media'));
  });

  it('🔴 « Documents clients scannés » n’est nommé nulle part — on n’y va pas, même par erreur', () => {
    expect(code()).not.toContain('Documents clients scannés');
  });

  it('elle n’écrit que les DEUX colonnes de miniature, jamais `cle_stockage`', () => {
    const c = code();
    expect(c).toContain('memoriserMiniature');
    expect(c).toContain('memoriserEchecMiniature');
    // Aucun UPDATE/DELETE écrit à la main : tout passe par le dépôt, dont le périmètre d'écriture est énuméré.
    expect(/UPDATE\s+gestion_|DELETE\s+FROM|INSERT\s+INTO/i.test(c)).toBe(false);
  });
});
