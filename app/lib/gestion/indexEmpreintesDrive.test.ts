import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  chiffrageBalayage, cheminDepuisIndex, empreinteNormalisee, ligneDepuisEntreeAffichee, ligneIndexable,
  MIME_DOSSIER, motChiffrage, motDuree, motEtatIndex, NIVEAUX_MAX, TAILLE_PAGE_INDEX,
} from './indexEmpreintesDrive';

/**
 * ══ 🔴🔴 LOT EMPREINTE-PIECES-DEJA-DANS-LE-DRIVE, NIVEAU 2 — L'INDEX DES EMPREINTES DU DRIVE ═════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « un index en LECTURE SEULE : fileId, md5Checksum, nom, parents, drive, date de
 * modification. Alimenté à chaque dossier ouvert ; par un balayage de fond ; puis par changes.list. La loupe et la
 * pastille utilisent l'index ; le chemin est tracé jusqu'au fichier comme aujourd'hui. »
 *
 * ═══ 🔴🔴 POURQUOI UN INDEX, ET NON UNE RECHERCHE ════════════════════════════════════════════════════════════════
 *
 * Parce que GOOGLE REFUSE DE CHERCHER PAR EMPREINTE, et c'est MESURÉ le 03/10/2026 : `files.list` avec
 * `q=md5Checksum='4b782aa3d863fd2e7f2e849d523b0448'` répond **HTTP 400 « Invalid Value »** sur le paramètre `q`,
 * sur chacun des 10 drives partagés visibles et avec `corpora=allDrives`. Il n'existe aucune autre voie.
 *
 * ⚠️ ET L'INDEX EST UN REFLET, JAMAIS UNE VÉRITÉ : le Drive fait foi. C'est pourquoi chaque ligne porte la date
 * où on l'a vue, et pourquoi le compteur de la fenêtre dit toujours « connus » — même avec 181 001 empreintes.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① L'EMPREINTE, NORMALISÉE DES DEUX CÔTÉS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ① l’empreinte se compare en minuscules, et jamais à vide', () => {
  it('🔴 elle est normalisée', () => {
    expect(empreinteNormalisee('4B782AA3D863FD2E7F2E849D523B0448'))
      .toBe('4b782aa3d863fd2e7f2e849d523b0448');
    expect(empreinteNormalisee('  abc  ')).toBe('abc');
  });

  /**
   * 🔴🔴 UNE EMPREINTE ABSENTE N'EST PAS UNE EMPREINTE VIDE. Deux documents Google natifs n'ont pas « le même
   * contenu » : les laisser s'apparier par une chaîne vide aurait fait de chaque Doc la copie de tous les autres.
   */
  it('🔴🔴 absente ⇒ `null`, jamais la chaîne vide', () => {
    expect(empreinteNormalisee(null)).toBeNull();
    expect(empreinteNormalisee(undefined)).toBeNull();
    expect(empreinteNormalisee('   ')).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② CE QUI ENTRE DANS L'INDEX, ET CE QUI N'Y ENTRE PAS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② une entrée de liste devient une ligne d’index', () => {
  it('🔴 les champs voulus, et le premier parent', () => {
    const l = ligneIndexable({
      id: 'F1', name: 'Bail.pdf', md5Checksum: 'ABC', parents: ['D1'], driveId: 'DR1',
      mimeType: 'application/pdf', size: '1234', modifiedTime: '2026-10-03T11:54:20Z',
    });
    expect(l).toEqual({
      driveFileId: 'F1', md5: 'abc', nom: 'Bail.pdf', parentId: 'D1', driveId: 'DR1',
      estDossier: false, typeMime: 'application/pdf', tailleOctets: 1234,
      modifieLe: '2026-10-03T11:54:20Z',
    });
  });

  /** ⚠️ `driveId` ABSENT ⇒ « Mon Drive » : Google ne le nomme que pour un drive partagé. */
  it('⚠️ sans `driveId`, c’est le corpus par défaut qui s’applique', () => {
    expect(ligneIndexable({ id: 'F1', name: 'x', mimeType: 'application/pdf' }, null)?.driveId).toBeNull();
    expect(ligneIndexable({ id: 'F1', name: 'x' }, 'DR9')?.driveId).toBe('DR9');
  });

  /**
   * ⚠️ LES DOSSIERS SONT INDEXÉS AUSSI, et c'est ce qui rend le chemin reconstituable EN BASE : les remonter chez
   * Google coûterait un appel par niveau, sur une arborescence qui en fait treize.
   */
  it('⚠️ un dossier entre, et il se reconnaît', () => {
    const l = ligneIndexable({ id: 'D1', name: 'Biens', mimeType: MIME_DOSSIER });
    expect(l?.estDossier).toBe(true);
    expect(l?.md5).toBeNull();
  });

  /** 🔴 UN FICHIER À LA CORBEILLE N'ENTRE PAS : annoncer un emplacement dans la corbeille ferait chercher en vain. */
  it('🔴 la corbeille est refusée', () => {
    expect(ligneIndexable({ id: 'F1', name: 'x', trashed: true })).toBeNull();
  });

  /** ⚠️ SANS IDENTIFIANT OU SANS NOM, rien : une clé vide écraserait la ligne précédente à chaque passage. */
  it('⚠️ une entrée sans identifiant ni nom est refusée', () => {
    expect(ligneIndexable({ name: 'x' })).toBeNull();
    expect(ligneIndexable({ id: 'F1' })).toBeNull();
    expect(ligneIndexable({ id: '  ', name: 'x' })).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 LE PIÈGE DU RACCOURCI — LA SEULE VRAIE DIFFICULTÉ DE L'ALIMENTATION GRATUITE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ depuis un dossier ouvert, un raccourci ne doit rien détruire', () => {
  /**
   * 🔴🔴 LA FENÊTRE SUIT LES RACCOURCIS : pour un raccourci, `id` est celui de la CIBLE et `md5` celui du
   * raccourci — donc presque toujours `null`. Ranger cette ligne telle quelle ÉCRASERAIT l'empreinte véritable de
   * la cible par un `null`, et l'on perdrait un fichier qu'on connaissait déjà. C'est une perte silencieuse, donc
   * la pire espèce.
   */
  it('🔴🔴 un fichier sans empreinte n’entre pas par cette voie', () => {
    expect(ligneDepuisEntreeAffichee({ id: 'CIBLE', nom: 'Bail.pdf', md5: null }, 'D1')).toBeNull();
  });

  it('🔴 un fichier avec empreinte entre, et prend le dossier ouvert pour parent', () => {
    const l = ligneDepuisEntreeAffichee({ id: 'F1', nom: 'Bail.pdf', md5: 'ABC' }, 'D1');
    expect(l).toMatchObject({ driveFileId: 'F1', md5: 'abc', parentId: 'D1', estDossier: false });
  });

  /** ⚠️ UN DOSSIER ENTRE TOUJOURS : il n'a jamais d'empreinte, et c'est lui qui porte les chemins. */
  it('⚠️ un dossier entre sans empreinte', () => {
    expect(ligneDepuisEntreeAffichee({ id: 'D2', nom: 'Travaux', dossier: true, md5: null }, 'D1'))
      .toMatchObject({ driveFileId: 'D2', estDossier: true, md5: null, parentId: 'D1' });
  });

  it('⚠️ le parent de la ligne prime sur le dossier ouvert quand il est connu', () => {
    expect(ligneDepuisEntreeAffichee({ id: 'F1', nom: 'x', md5: 'a', parentId: 'VRAI' }, 'OUVERT')?.parentId)
      .toBe('VRAI');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LE CHEMIN, REMONTÉ SANS RÉSEAU
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ④ le chemin se reconstitue en base', () => {
  const noeuds = new Map([
    ['travaux', { nom: 'Travaux', parentId: 'bienA' }],
    ['bienA', { nom: 'Bien A', parentId: 'biens' }],
    ['biens', { nom: 'Biens', parentId: 'racine' }],
    ['racine', { nom: 'Racine', parentId: null }],
  ]);

  it('🔴🔴 du parent immédiat jusqu’à la racine', () => {
    expect(cheminDepuisIndex('travaux', noeuds).map((c) => c.nom))
      .toEqual(['Travaux', 'Bien A', 'Biens', 'Racine']);
  });

  /**
   * ⚠️ UN CHEMIN INCOMPLET SE LIT, UN CHEMIN DEVINÉ NE SE LIT PAS. Si un ancêtre manque à l'index, on rend ce
   * qu'on sait et l'on s'arrête — jamais un nom inventé pour faire joli.
   */
  it('⚠️ un ancêtre manquant arrête la remontée, sans rien inventer', () => {
    const partiel = new Map([['travaux', { nom: 'Travaux', parentId: 'inconnu' }]]);
    expect(cheminDepuisIndex('travaux', partiel).map((c) => c.nom)).toEqual(['Travaux']);
  });

  /** 🔴 UN CYCLE NE FIGE RIEN : la fenêtre doit répondre tout de suite, même sur une table abîmée. */
  it('🔴 un cycle est arrêté net', () => {
    const cycle = new Map([
      ['a', { nom: 'A', parentId: 'b' }],
      ['b', { nom: 'B', parentId: 'a' }],
    ]);
    const r = cheminDepuisIndex('a', cycle);
    expect(r.map((c) => c.nom)).toEqual(['A', 'B']);
    expect(r.length).toBeLessThan(NIVEAUX_MAX);
  });

  it('⚠️ aucun départ ⇒ aucun chemin', () => {
    expect(cheminDepuisIndex(null, noeuds)).toEqual([]);
    expect(cheminDepuisIndex('   ', noeuds)).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ 🔴🔴 LE CHIFFRAGE — CE QU'ARNO A DEMANDÉ AVANT DE DÉCIDER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ⑤ ce que coûte un balayage complet', () => {
  /**
   * 🔴 LES MESURES RÉELLES DU 03/10/2026 — le script a tourné en entier dans son mode par défaut, avec exactement
   * les champs que l'indexation demande, et sans rien écrire. Ce ne sont pas des estimations.
   */
  const MESURES = [
    { nom: 'Catherine', fichiers: 21, dossiers: 9, pages: 1, dureeMs: 507 },
    { nom: 'COMPTABILITE', fichiers: 420, dossiers: 93, pages: 2, dureeMs: 1719 },
    { nom: 'Direction', fichiers: 23659, dossiers: 3124, pages: 59, dureeMs: 69575 },
    { nom: 'GESTION LOCATIVE', fichiers: 74799, dossiers: 9162, pages: 183, dureeMs: 240455 },
    { nom: 'Hélène', fichiers: 1, dossiers: 0, pages: 1, dureeMs: 366 },
    { nom: 'IA', fichiers: 1, dossiers: 1, pages: 1, dureeMs: 406 },
    { nom: 'Mot de passe', fichiers: 15, dossiers: 1, pages: 1, dureeMs: 455 },
    { nom: 'SANSVISAVIS', fichiers: 48040, dossiers: 6058, pages: 118, dureeMs: 145746 },
    { nom: 'Test', fichiers: 30, dossiers: 4, pages: 1, dureeMs: 462 },
    { nom: 'TRAVELNKEYS', fichiers: 6201, dossiers: 619, pages: 15, dureeMs: 17997 },
    { nom: 'Mon Drive', fichiers: 27814, dossiers: 1926, pages: 65, dureeMs: 70018 },
  ];

  it('🔴🔴 les chiffres soumis à Arno, à l’unité près', () => {
    const c = chiffrageBalayage(MESURES);
    expect(c.fichiers).toBe(181001);
    expect(c.dossiers).toBe(20997);
    expect(c.entrees).toBe(201998);
    /**
     * ⚠️ 447 PAGES POUR 201 998 ENTRÉES, et non 202 : une page en porte mille AU PLUS, mais Google plafonne
     * aussi la TAILLE de la réponse. Avec les champs de l'index, les pages se remplissent moins qu'avec
     * `files(id,mimeType)` seul — une énumération à champs minimaux n'en avait demandé que 209. Le chiffre qui
     * compte est celui-ci : c'est celui du balayage qu'on lancerait vraiment.
     */
    expect(c.appels).toBe(447);
    expect(motDuree(c.dureeMs)).toBe('9 min 8 s');
  });

  /**
   * 🔴 LE QUOTA SE COMPTE EN REQUÊTES, PAS EN FICHIERS, et c'est tout l'intérêt des pages de mille : 209 appels
   * pour 181 001 fichiers. La phrase dit les deux nombres, parce que c'est leur écart qui répond à « est-ce que
   * ça passe ? ».
   */
  it('🔴 la phrase dit les entrées ET les appels', () => {
    const p = motChiffrage(chiffrageBalayage(MESURES));
    /* ⚠️ `toLocaleString('fr-FR')` SÉPARE PAR UNE ESPACE FINE INSÉCABLE (U+202F), pas par une espace ordinaire :
       on compare donc à la valeur formatée, jamais à une chaîne tapée à la main. */
    expect(p).toContain(`${(201998).toLocaleString('fr-FR')} entrées`);
    expect(p).toContain(`${(447).toLocaleString('fr-FR')} appels files.list`);
    expect(p).toContain('9 min 8 s');
    expect(TAILLE_PAGE_INDEX).toBe(1000);
  });

  it('⚠️ un corpus aux chiffres absurdes ne fait pas baisser le total', () => {
    const c = chiffrageBalayage([{ nom: 'x', fichiers: -5, dossiers: -2, pages: -1, dureeMs: -9 }]);
    expect(c).toEqual({ fichiers: 0, dossiers: 0, entrees: 0, appels: 0, dureeMs: 0 });
  });

  it('⚠️ les durées se disent comme on les dit', () => {
    expect(motDuree(900)).toBe('1 s');
    expect(motDuree(59_000)).toBe('59 s');
    expect(motDuree(120_000)).toBe('2 min');
    expect(motDuree(362_844)).toBe('6 min 3 s');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ L'INDEX DIT DEPUIS QUAND IL SAIT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ⑥ un index sans date ne se relit pas', () => {
  it('🔴 il annonce son nombre et sa date', () => {
    const m = motEtatIndex({ fichiers: 181001, releveLe: new Date('2026-10-03T14:30:00') });
    expect(m).toContain(`${(181001).toLocaleString('fr-FR')} empreintes du Drive indexées`);
    expect(m).toContain('03/10/2026');
  });

  it('⚠️ vide, il le dit plutôt que d’annoncer zéro empreinte « relevée »', () => {
    expect(motEtatIndex({ fichiers: 0, releveLe: null })).toBe('Aucune empreinte du Drive n’est indexée.');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔒🔒 LES GARDES STATIQUES — AUCUNE ÉCRITURE DRIVE DANS TOUT LE CHEMIN DE L'INDEX
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Le code d'un fichier, commentaires ôtés : les encadrés citent volontiers les mots qu'on interdit. */
const codeDe = (chemin: string): string =>
  readFileSync(chemin, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
    .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');

/**
 * ══ 🔒🔒 LA GARANTIE LA PLUS FORTE : ON NE PEUT PAS ÉCRIRE CE QU'ON N'A PAS LE MOYEN D'APPELER ═══════════════════
 *
 * 🔴🔴 ET C'EST CE QUI PROTÈGE « Documents clients scannés ». L'index le couvre EN MÉTADONNÉES — un nom, un
 * parent, une empreinte — parce que c'est ce qu'il faut pour DIRE qu'un document y est déjà rangé. Que ce chemin
 * ne sache pas écrire n'est donc pas une précaution de confort : c'est la condition pour qu'indexer l'archive
 * soit sans danger.
 */
describe('🔒🔒 le chemin de l’index ne sait pas écrire dans le Drive', () => {
  const FICHIERS = [
    ['app/lib/gestion/indexEmpreintesDrive.ts', 'le module pur'],
    ['app/lib/gestion/empreinteDriveRepo.ts', 'le dépôt'],
    ['app/scripts/indexer-empreintes-drive.ts', 'le balayage'],
  ] as const;

  for (const [chemin, quoi] of FICHIERS) {
    it(`🔒🔒 ${quoi} n’émet aucun verbe d’écriture`, () => {
      const code = codeDe(chemin);
      for (const mot of ["method: 'POST'", "method: 'PATCH'", "method: 'PUT'", "method: 'DELETE'",
        'files.copy', "method: 'post'", 'trashed: true', 'addParents', 'removeParents']) {
        expect(code, `${chemin} : ${mot}`).not.toContain(mot);
      }
    });

    it(`🔒 ${quoi} n’importe aucun module d’écriture Drive`, () => {
      const code = codeDe(chemin);
      for (const mod of ['driveMouvement', 'driveCorbeilleReel', 'driveEcriture', 'driveCreation',
        'driveDeplacement', 'renommageDrive', 'copiePiecesReel']) {
        expect(code, `${chemin} : ${mod}`).not.toContain(`/${mod}'`);
      }
    });
  }

  /** 🔒 LE MODULE PUR NE TOUCHE NI AU RÉSEAU NI À LA BASE : il normalise, il trace, il chiffre. */
  it('🔒 le module pur ne connaît ni `fetch` ni SQL', () => {
    const code = codeDe('app/lib/gestion/indexEmpreintesDrive.ts');
    for (const mot of ['fetch(', 'query(', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'import ']) {
      expect(code, mot).not.toContain(mot);
    }
  });

  /**
   * 🔒 LE DÉPÔT N'APPELLE PAS GOOGLE : il range ce qu'un appelant a lu. C'est la même séparation que le lot
   * DRIVE-DEPLACER — l'endroit qui écrit la preuve et l'endroit qui touche au Drive ne doivent pas être confondus.
   */
  it('🔒 le dépôt n’appelle pas Google', () => {
    const code = codeDe('app/lib/gestion/empreinteDriveRepo.ts');
    expect(code).not.toContain('fetch(');
    expect(code).not.toContain('googleapis.com');
  });

  /**
   * 🔒🔒 LE BALAYAGE N'ÉMET QUE QUATRE LECTURES, ET TOUTES PAR LA MÊME PORTE. Il n'existe qu'UN SEUL `fetch` dans
   * tout le fichier — dans `lire`, qui ne pose aucune option de méthode, donc un `GET`. Tout le reste passe par
   * lui, et ce test compte les portes plutôt que d'énumérer les chemins : une seconde porte le ferait rougir.
   */
  it('🔒🔒 un seul `fetch` dans tout le balayage, et il ne sait que lire', () => {
    const code = codeDe('app/scripts/indexer-empreintes-drive.ts');
    expect((code.match(/fetch\(/g) ?? [])).toHaveLength(1);
    expect(code).toContain('const r = await fetch(`${API}/${chemin}`, { headers: h });');
    /* 🔒 ET LES QUATRE CHEMINS SONT NOMMÉS EN CLAIR : trois lectures de contenu, une liste de drives. */
    expect(code).toContain('files?');
    expect(code).toContain('changes/startPageToken');
    expect(code).toContain('changes?pageToken=');
    expect(code).toContain('drives?pageSize=100');
  });

  /**
   * 🔴🔴 ET LE BALAYAGE COMPLET NE PART PAS TOUT SEUL. Arno : « AVANT de lancer le balayage complet […] arrête-toi
   * et demande à Arno. » Le mode par défaut COMPTE, et ne range rien — ni en base, ni ailleurs.
   */
  it('🔴🔴 sans `--appliquer`, le balayage ne range rien', () => {
    const code = codeDe('app/scripts/indexer-empreintes-drive.ts');
    expect(code).toContain("process.argv.includes('--appliquer')");
    expect(code).toContain('if (ecrire && lignes.length > 0)');
    expect(code).toContain('RIEN N’A ÉTÉ ÉCRIT');
  });

  /**
   * 🔴🔴 LE JETON DE REPRISE SE PREND AVANT LE BALAYAGE, et l'ordre des lignes le dit. Pris après, il manquerait
   * les six minutes pendant lesquelles quelqu'un range des fichiers — et personne ne le saurait.
   */
  it('🔴🔴 le jeton de reprise est pris avant le balayage', () => {
    const code = codeDe('app/scripts/indexer-empreintes-drive.ts');
    const iJeton = code.indexOf('await jetonDeReprise(h, c)');
    const iBalayage = code.indexOf('await balayer(h, c, appliquer)');
    expect(iJeton).toBeGreaterThan(0);
    expect(iBalayage).toBeGreaterThan(iJeton);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 L'ALIMENTATION GRATUITE : CHAQUE DOSSIER OUVERT NOURRIT L'INDEX
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 la fenêtre nourrit l’index à chaque dossier ouvert', () => {
  const code = codeDe('app/(admin)/api/admin/gestion/drive/fichiers/route.ts');

  /** 🔴 L'EMPREINTE EST DÉJÀ DANS LA RÉPONSE REÇUE : la ranger ne coûte pas un octet de réseau. */
  it('🔴🔴 elle range ce qu’elle vient de lire, par l’adaptateur pur', () => {
    expect(code).toContain('ligneDepuisEntreeAffichee');
    expect(code).toContain('noterFichiersVus');
  });

  /**
   * 🔴🔴 ET ELLE NE FAIT PAS ATTENDRE LA LISTE. Un index moins complet est un désagrément ; une liste qui
   * n'arrive pas est un écran cassé. Les deux enjeux ne se mélangent pas : la réponse part, le rangement se fait
   * à côté, et son échec n'est que journalisé.
   */
  it('🔴🔴 le rangement ne bloque pas la réponse, et son échec ne la casse pas', () => {
    const i = code.indexOf('ligneDepuisEntreeAffichee');
    expect(i).toBeGreaterThan(0);
    const bloc = code.slice(Math.max(0, i - 400), i + 600);
    expect(bloc).toContain('void (async () => {');
    expect(bloc).toContain('try {');
    expect(bloc).toContain('catch');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑦ LE DÉPÔT : LA REQUÊTE QUE GOOGLE REFUSE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
let migration299 = true;
let migration298 = true;
vi.mock('./schema', () => ({
  indexEmpreintesDriveDisponible: async () => migration299,
  pieceMd5Disponible: async () => migration298,
}));

const { fichiersDeMemeEmpreinte, md5DeLaPiece, noterFichiersDisparus, noterFichiersVus } =
  await import('./empreinteDriveRepo');

describe('🔴🔴 ⑦ « quels fichiers portent cette empreinte ? »', () => {
  beforeEach(() => {
    migration299 = true; migration298 = true;
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('🔴🔴 la requête cherche par empreinte, hors corbeille et hors dossiers', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ drive_file_id: 'F1', nom: 'x.pdf', parent_id: 'D1', drive_id: 'DR', releve_le: '2026-10-03T14:00:00Z' }],
    });
    queryMock.mockResolvedValueOnce({ rows: [{ drive_file_id: 'D1', nom: 'Travaux', parent_id: null }] });
    const r = await fichiersDeMemeEmpreinte('4B782AA3D863FD2E7F2E849D523B0448');
    const sql = String(queryMock.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(sql).toContain('lower(md5) = $1');
    expect(sql).toContain('disparu_le IS NULL');
    expect(sql).toContain('NOT est_dossier');
    // 🔴 L'EMPREINTE EST NORMALISÉE AVANT D'ÊTRE LIÉE : l'index SQL porte sur `lower(md5)`.
    expect(queryMock.mock.calls[0][1]).toEqual(['4b782aa3d863fd2e7f2e849d523b0448', 50]);
    expect(r[0].chemin.map((c) => c.nom)).toEqual(['Travaux']);
  });

  /** 🔴 LE CHEMIN SE REMONTE EN UNE REQUÊTE, pas une par niveau : un `WITH RECURSIVE`, borné. */
  it('🔴 les ancêtres remontent en une seule requête récursive', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ drive_file_id: 'F1', nom: 'x.pdf', parent_id: 'D1', drive_id: null, releve_le: '2026-10-03T14:00:00Z' }],
    });
    await fichiersDeMemeEmpreinte('abc');
    const sql = String(queryMock.mock.calls[1][0]).replace(/\s+/g, ' ');
    expect(sql).toContain('WITH RECURSIVE');
    expect(sql).toContain('r.niveau < 32');
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it('⚠️ une empreinte absente n’interroge rien', async () => {
    expect(await fichiersDeMemeEmpreinte(null)).toEqual([]);
    expect(await fichiersDeMemeEmpreinte('  ')).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });

  /** 🔴🔴 SANS LA MIGRATION 299, la table n’est NOMMÉE NULLE PART : on retombe sur le niveau 1, sans rien casser. */
  it('🔴🔴 sans la migration 299, aucune requête n’est émise', async () => {
    migration299 = false;
    expect(await fichiersDeMemeEmpreinte('abc')).toEqual([]);
    expect(await noterFichiersVus([{
      driveFileId: 'F', md5: 'a', nom: 'x', parentId: null, driveId: null,
      estDossier: false, typeMime: null, tailleOctets: null, modifieLe: null,
    }])).toBe(0);
    expect(await noterFichiersDisparus(['F'])).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });

  /** 🔴 SANS LA MIGRATION 298, on ne connaît pas l’empreinte d’une pièce — donc rien à chercher dans l’index. */
  it('🔴 sans la migration 298, l’empreinte d’une pièce est inconnue', async () => {
    migration298 = false;
    expect(await md5DeLaPiece(27125)).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  /**
   * 🔴🔴 REVOIR UN FICHIER MET À JOUR SON REFLET **ET** SA DATE, et le fait revenir d'entre les disparus : sans
   * ce retour, une suppression puis une restauration dans le Drive l'aurait effacé de l'index pour de bon.
   */
  it('🔴🔴 ranger une page met à jour le reflet, la date, et annule la disparition', async () => {
    queryMock.mockResolvedValue({ rowCount: 2 });
    await noterFichiersVus([
      { driveFileId: 'F1', md5: 'a', nom: 'x', parentId: 'D', driveId: null, estDossier: false, typeMime: null, tailleOctets: 1, modifieLe: null },
      { driveFileId: 'F2', md5: 'b', nom: 'y', parentId: 'D', driveId: null, estDossier: true, typeMime: null, tailleOctets: null, modifieLe: null },
    ]);
    const sql = String(queryMock.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(sql).toContain('ON CONFLICT (drive_file_id) DO UPDATE');
    expect(sql).toContain('releve_le = now()');
    expect(sql).toContain('disparu_le = NULL');
    // ⚠️ UNE SEULE REQUÊTE POUR TOUTE LA PAGE : mille `INSERT` séparés auraient fait du balayage un chantier.
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(sql).toContain('unnest(');
  });

  /** 🔴 ON DATE UNE DISPARITION, ON NE L’EFFACE PAS : « ce contenu a été ici jusqu’au … » se relit, le vide non. */
  it('🔴 une disparition est datée, jamais supprimée', async () => {
    queryMock.mockResolvedValue({ rowCount: 1 });
    await noterFichiersDisparus(['F1', 'F1', '  ']);
    const sql = String(queryMock.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(sql).toContain('SET disparu_le = now()');
    expect(sql).not.toContain('DELETE');
    // ⚠️ DÉDOUBLONNÉ ET NETTOYÉ avant d'être lié.
    expect(queryMock.mock.calls[0][1]).toEqual([['F1']]);
  });
});
