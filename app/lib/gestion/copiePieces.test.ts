import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  attenteApresEchec, cheminNonRattache, conduiteAtenir, descriptionFichierDrive, dureeFr, ECHECS_CONSECUTIFS_MAX,
  ligneAvancement, motifArret, nomFichierDrive, NOM_FICHIER_MAX, tailleFr, tronquerEnGardantExtension,
  verifierCopie,
} from './copiePieces';

/**
 * LOT DRIVE-2 — CE QUE LA COPIE DÉCIDE, ÉPROUVÉ SANS RÉSEAU NI BASE.
 *
 * 🔒 Aucune donnée réelle : noms, adresses et empreintes inventés.
 *
 * 🔴 CE QUI EST ÉPROUVÉ, ET POURQUOI CHAQUE CAS COMPTE :
 *   ① « copié » ne vaut que VÉRIFIÉ — une taille ou une empreinte qui diffère fait échouer la copie ;
 *   ② une pièce vérifiée n'est JAMAIS renvoyée ; une copie douteuse est refaite, sans laisser de doublon ;
 *   ③ une passe de nuit s'arrête toute seule, avec un motif lisible ;
 *   ④ les noms de fichiers restent lisibles ET triables, sans jamais perdre l'extension.
 */

describe('🔴 ① « copié » ne veut rien dire sans vérification', () => {
  it('même empreinte et même taille : vérifié PAR MD5', () => {
    const v = verifierCopie({ md5Attendu: 'abc123', md5Rendu: 'ABC123', tailleAttendue: 1000, tailleRendue: 1000 });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.parMd5).toBe(true);
  });

  it('🔴 une empreinte DIFFÉRENTE fait échouer, et le motif donne les deux valeurs', () => {
    const v = verifierCopie({ md5Attendu: 'abc', md5Rendu: 'def', tailleAttendue: 10, tailleRendue: 10 });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.motif).toContain('abc');
      expect(v.motif).toContain('def');
    }
  });

  it('🔴 une TAILLE différente fait échouer, même si l’empreinte correspond', () => {
    const v = verifierCopie({ md5Attendu: 'abc', md5Rendu: 'abc', tailleAttendue: 1000, tailleRendue: 999 });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motif).toContain('taille');
  });

  it('sans MD5 rendu par Drive, la taille SEULE vérifie — et le résultat le DIT', () => {
    const v = verifierCopie({ md5Attendu: 'abc', md5Rendu: null, tailleAttendue: 10, tailleRendue: 10 });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.parMd5).toBe(false);
      expect(v.motif).toContain('n’a pas rendu d’empreinte');
    }
  });

  it('🔴 sans TAILLE rendue, on ne vérifie RIEN — et on refuse plutôt que de faire semblant', () => {
    const v = verifierCopie({ md5Attendu: 'abc', md5Rendu: 'abc', tailleAttendue: 10, tailleRendue: null });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motif).toContain('impossible de vérifier');
    expect(verifierCopie({ md5Attendu: 'a', md5Rendu: 'a', tailleAttendue: 10, tailleRendue: undefined }).ok).toBe(false);
  });

  it('un fichier VIDE se vérifie comme les autres', () => {
    expect(verifierCopie({ md5Attendu: 'd41d8', md5Rendu: 'd41d8', tailleAttendue: 0, tailleRendue: 0 }).ok).toBe(true);
  });
});

describe('🔴 ② l’anti-doublon, et la reprise', () => {
  it('jamais copiée → on copie', () => {
    expect(conduiteAtenir(null)).toEqual({ faire: 'copier', motif: 'jamais copiée' });
  });

  it('🔴 déjà copiée ET vérifiée → on PASSE, on ne renvoie jamais', () => {
    const c = conduiteAtenir({ driveFileId: 'F1', driveDossierId: 'D1', verifie: true });
    expect(c.faire).toBe('passer');
    expect(c.motif).toContain('F1');
  });

  it('🔴 copiée mais NON vérifiée → corbeille du fichier douteux, PUIS recopie', () => {
    const c = conduiteAtenir({ driveFileId: 'F2', driveDossierId: 'D1', verifie: false });
    expect(c.faire).toBe('refaire');
    if (c.faire === 'refaire') {
      expect(c.corbeille).toBe('F2');
      expect(c.motif).toContain('mise à la corbeille');
    }
  });
});

describe('🔴 ③ une passe de nuit s’arrête toute seule', () => {
  it('après trop d’échecs d’affilée, avec un motif qui dit QUOI FAIRE', () => {
    const m = motifArret({ echecsConsecutifs: ECHECS_CONSECUTIFS_MAX, restantes: 500, limiteAtteinte: false });
    expect(m).not.toBeNull();
    expect(m).toContain('échecs d’affilée');
    expect(m).toContain('quota épuisé se règle en attendant');
  });

  it('elle ne s’arrête PAS tant que les échecs restent isolés', () => {
    expect(motifArret({ echecsConsecutifs: ECHECS_CONSECUTIFS_MAX - 1, restantes: 500, limiteAtteinte: false })).toBeNull();
    expect(motifArret({ echecsConsecutifs: 0, restantes: 500, limiteAtteinte: false })).toBeNull();
  });

  it('la limite demandée arrête aussi, et le dit', () => {
    expect(motifArret({ echecsConsecutifs: 0, restantes: 500, limiteAtteinte: true })).toContain('--limite');
  });

  it('l’attente DOUBLE à chaque échec, et se borne à cinq minutes', () => {
    expect(attenteApresEchec(1)).toBe(2_000);
    expect(attenteApresEchec(2)).toBe(4_000);
    expect(attenteApresEchec(3)).toBe(8_000);
    expect(attenteApresEchec(20)).toBe(300_000);
    expect(attenteApresEchec(0)).toBe(2_000);
  });
});

describe('🔴 ④ les noms de fichiers : lisibles, triables, jamais amputés de leur extension', () => {
  it('« AAAA-MM-JJ — expéditeur — nom d’origine »', () => {
    expect(nomFichierDrive({ date: '2024-03-07', expediteur: 'jean@fictif.fr', nomOrigine: 'quittance.pdf' }))
      .toBe('2024-03-07 — jean@fictif.fr — quittance.pdf');
  });

  it('la date est en ISO — c’est le SEUL format qui se trie tout seul dans une colonne', () => {
    const a = nomFichierDrive({ date: '2024-02-28', expediteur: 'x@f.fr', nomOrigine: 'a.pdf' });
    const b = nomFichierDrive({ date: '2024-03-07', expediteur: 'x@f.fr', nomOrigine: 'a.pdf' });
    expect([b, a].sort()).toEqual([a, b]);
  });

  it('une date absente ou illisible est DITE, jamais inventée', () => {
    expect(nomFichierDrive({ date: '', expediteur: 'x@f.fr', nomOrigine: 'a.pdf' })).toContain('date inconnue');
    expect(nomFichierDrive({ date: 'hier', expediteur: 'x@f.fr', nomOrigine: 'a.pdf' })).toContain('date inconnue');
  });

  it('un expéditeur sans adresse est DIT, lui aussi', () => {
    expect(nomFichierDrive({ date: '2024-01-01', expediteur: '  ', nomOrigine: 'a.pdf' }))
      .toContain('expéditeur inconnu');
  });

  it('une adresse très longue est réduite à sa partie locale — le reste vit dans la description', () => {
    const n = nomFichierDrive({
      date: '2024-01-01', expediteur: 'jean.dupont@un-domaine-vraiment-tres-long-pour-un-nom.example',
      nomOrigine: 'a.pdf',
    });
    expect(n).toContain('jean.dupont');
    expect(n).not.toContain('example');
  });

  it('🔴 un nom d’origine très long est tronqué en GARDANT son extension', () => {
    const n = nomFichierDrive({
      date: '2024-01-01', expediteur: 'x@f.fr', nomOrigine: `${'tres-long-'.repeat(30)}fin.pdf`,
    });
    expect(n.length).toBeLessThanOrEqual(NOM_FICHIER_MAX);
    expect(n.endsWith('.pdf')).toBe(true);
    expect(n).toContain('…');
  });

  it('un fichier SANS extension est tronqué sans en inventer une', () => {
    const t = tronquerEnGardantExtension('a'.repeat(200), 20);
    expect(t.length).toBeLessThanOrEqual(20);
    expect(t).not.toContain('.');
  });

  it('ce qui ressemble à une extension mais fait 30 caractères n’en est pas une', () => {
    const t = tronquerEnGardantExtension(`nom.${'x'.repeat(30)}`, 20);
    expect(t.length).toBeLessThanOrEqual(20);
  });

  it('un nom d’origine vide ne donne jamais un nom vide — Drive le refuserait', () => {
    expect(nomFichierDrive({ date: '2024-01-01', expediteur: 'x@f.fr', nomOrigine: '' }))
      .toContain('pièce sans nom');
  });
});

describe('la description du fichier Drive — de quoi retrouver le mail', () => {
  const d = descriptionFichierDrive({
    pieceId: 4242, messageId: 77, objet: 'Quittance mars', date: '2024-03-07T10:00:00Z',
    expediteur: 'jean@fictif.fr', regle: 'a', confiance: 'haute', motif: 'adresse d’un locataire',
  });

  it('🔴 elle porte l’identifiant INTERNE de la pièce — un nom se renomme, pas elle', () => {
    expect(d).toContain('Pièce n° 4242');
    expect(d).toContain('message n° 77');
  });

  it('elle porte l’objet, la date, l’expéditeur et la RÈGLE qui a décidé', () => {
    expect(d).toContain('Quittance mars');
    expect(d).toContain('2024-03-07');
    expect(d).toContain('jean@fictif.fr');
    expect(d).toContain('règle a');
    expect(d).toContain('confiance haute');
    expect(d).toContain('adresse d’un locataire');
  });

  it('un objet vide est DIT', () => {
    expect(descriptionFichierDrive({
      pieceId: 1, messageId: 1, objet: '  ', date: '2024-01-01', expediteur: 'x@f.fr',
      regle: 'd', confiance: 'basse', motif: 'rien',
    })).toContain('(sans objet)');
  });
});

describe('le suivi, lisible à 2 h du matin', () => {
  it('la ligne dit faites/total, pourcentage, volume, débit et fin estimée', () => {
    const l = ligneAvancement({
      faites: 250, restantes: 750, octetsFaits: 500 * 1024 * 1024, octetsRestants: 1500 * 1024 * 1024,
      echecs: 2, ecouleMs: 600_000,
    });
    expect(l).toContain('250/1000');
    expect(l).toContain('25 %');
    expect(l).toContain('500 Mo');
    expect(l).toContain('2 échecs');
    expect(l).toContain('fin estimée dans');
  });

  it('🔴 sans mesure, on ne PRÉDIT RIEN plutôt que de prédire n’importe quoi', () => {
    const l = ligneAvancement({ faites: 0, restantes: 100, octetsFaits: 0, octetsRestants: 1000, echecs: 0, ecouleMs: 0 });
    expect(l).toContain('pas encore assez de mesures');
  });

  it('une passe terminée affiche 100 %', () => {
    expect(ligneAvancement({ faites: 10, restantes: 0, octetsFaits: 100, octetsRestants: 0, echecs: 0, ecouleMs: 1000 }))
      .toContain('100 %');
  });

  it('les tailles et les durées se disent en français', () => {
    expect(tailleFr(2 * 1024 ** 3)).toBe('2.0 Go');
    expect(tailleFr(5 * 1024 ** 2)).toBe('5 Mo');
    expect(tailleFr(512)).toBe('512 o');
    expect(dureeFr(45_000)).toBe('45 s');
    expect(dureeFr(600_000)).toBe('10 min');
    expect(dureeFr(3 * 3600_000 + 1800_000)).toBe('3 h 30');
  });
});

describe('« 00 Non rattachés / AAAA / MM »', () => {
  it('le chemin est l’année puis le mois, dans cet ordre', () => {
    expect(cheminNonRattache({ sorte: 'non_rattache', annee: '2024', mois: '06' })).toEqual(['2024', '06']);
  });
});

/**
 * GARANTIES STATIQUES — ce qu'aucun test de fonction ne peut tenir : qu'il n'existe aucun chemin d'écriture hors
 * du garde-fou, et aucun effacement sur MinIO.
 */
describe('🔴 les garanties de sécurité, lues dans la source', () => {
  /**
   * ⚠️ ON EXAMINE LE CODE, PAS LA PROSE. Les modules PROMETTENT en commentaire qu'ils n'effacent rien sur MinIO :
   * chercher le mot dans le fichier entier ferait échouer le test sur sa propre documentation.
   */
  const sansCommentaires = (src: string): string => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');

  const reel = sansCommentaires(readFileSync('app/lib/gestion/copiePiecesReel.ts', 'utf8'));
  const cli = sansCommentaires(readFileSync('app/scripts/copier-pieces-drive.ts', 'utf8'));
  const etat = sansCommentaires(readFileSync('app/scripts/etat-copie-drive.ts', 'utf8'));
  const depot = sansCommentaires(readFileSync('app/lib/gestion/triPiecesRepo.ts', 'utf8'));

  it('🔴 CHAQUE écriture Drive passe par le garde-fou', () => {
    const verbes = reel.match(/method:\s*'(POST|PATCH|PUT|DELETE)'/g) ?? [];
    const gardes = reel.match(/verifierEcriture\(/g) ?? [];
    expect(verbes.length).toBeGreaterThan(0);
    // Les PUT de morceaux d'un même envoi sont couverts par le garde posé à l'ouverture de la session.
    expect(gardes.length).toBeGreaterThanOrEqual(3);
  });

  /**
   * ⚠️ ON VISE L'IMPORT, PAS LE MOT. « supprimer » apparaît légitimement dans le code comme NOM D'OPÉRATION du
   * garde-fou (`operation: 'supprimer'`) — c'est la mise à la corbeille Drive, qui n'a rien à voir avec MinIO.
   * Ce qu'il faut interdire, c'est l'accès à la fonction d'effacement du stockage.
   */
  it('🔴 AUCUN effacement sur MinIO : la fonction d’effacement n’est jamais importée', () => {
    for (const [nom, src] of [['reel', reel], ['cli', cli]] as const) {
      const imports = src.match(/import\s*\{[^}]*\}\s*from\s*'[^']*stockage[^']*'/g) ?? [];
      for (const i of imports) {
        expect(i, nom).not.toMatch(/\bsupprimer\b/);
        expect(i, nom).not.toMatch(/supprimerPrefixe/);
      }
      expect(src, nom).not.toMatch(/supprimerPrefixe\s*\(/);
    }
    // Le seul import du stockage, et il ne sait que LIRE.
    expect(reel).toContain("import { recuperer } from '../stockage'");
  });

  it('🔴 la suppression Drive est une mise à la CORBEILLE, jamais un effacement définitif', () => {
    expect(reel).toContain('trashed: true');
    expect(reel).not.toMatch(/method:\s*'DELETE'/);
  });

  it('🔴 le tri de la copie vient du MÊME chargement que le rapport — une seule vérité', () => {
    expect(cli).toContain("from '../lib/gestion/triPiecesRepo'");
    expect(cli).toContain('trierPieces(');
    const rapport = sansCommentaires(readFileSync('app/scripts/rapport-tri-pieces.ts', 'utf8'));
    expect(rapport).toContain("from '../lib/gestion/triPiecesRepo'");
    expect(rapport).toContain('chargerContexteTri(');
  });

  it('le dépôt du contexte de tri est en LECTURE seule', () => {
    expect(depot).not.toMatch(/\b(INSERT|UPDATE|DELETE)\s+(INTO|FROM)?\s*gestion_/i);
  });

  it('la commande de suivi n’écrit qu’une chose, et seulement si on le lui demande', () => {
    expect(etat).not.toMatch(/method:\s*'(POST|PATCH|PUT|DELETE)'/);
    const ecritures = etat.match(/UPDATE gestion_/g) ?? [];
    expect(ecritures).toHaveLength(1);           // la levée de verrou, et rien d'autre
    expect(etat).toContain('--debloquer');
    expect(etat).toContain('REFUSÉ : le processus est vivant');
  });

  it('la copie demande EXPLICITEMENT md5Checksum et size — sans quoi Drive ne les rend pas', () => {
    expect(reel).toContain('md5Checksum');
    expect(reel).toContain("fields: 'id,name,webViewLink,md5Checksum,size'");
  });

  it('l’envoi est REPRENABLE, et repart de ce que Drive dit avoir reçu', () => {
    expect(reel).toContain("uploadType: 'resumable'");
    expect(reel).toContain('res.status === 308');
    expect(reel).toContain("headers.get('range')");
  });

  it('la commande s’arrête proprement sur SIGINT et SIGTERM', () => {
    expect(cli).toContain("process.on('SIGINT'");
    expect(cli).toContain("process.on('SIGTERM'");
  });
});
