import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  comptesVides, compter, effacementAutorise, resumeVidage, verdict, verdictBase,
  CONFIRMATION, LIBELLES_CONSERVATION, LOT_VIDAGE,
  type PieceCandidate, type RelectureDrive,
} from './vidageStockage';
import { lienDrive, lireContenuDrive, messageIndisponible, motifLecture } from './pieceDriveLecture';
import { lireOptions, ligneExemple, sousLaRacine } from '../../scripts/vider-stockage';
import type { NoeudArbre } from './driveGardeFou';

/**
 * LOT DRIVE-3 — LA RÈGLE QUI AUTORISE UN EFFACEMENT DÉFINITIF, ET LA LECTURE DE REMPLACEMENT.
 *
 * 🔴 CE QU'AUCUN TEST NE FERA ICI : effacer quoi que ce soit, ni sur MinIO, ni ailleurs. La décision est pure et
 * s'éprouve sans réseau ; la lecture Drive s'éprouve sur des doubles. Ce que PostgreSQL tient — l'unicité d'une
 * preuve de vidage, l'égalité des empreintes en contrainte, le refus de corriger une preuve — se prouve sur le
 * CLUSTER JETABLE (`npm run gestion:vidage:epreuve`).
 *
 * 🔒 Aucune donnée réelle : clés inventées, empreintes inventées.
 */

const piece = (o: Partial<PieceCandidate> = {}): PieceCandidate => ({
  pieceId: 42, nomFichier: 'quittance.pdf', typeMime: 'application/pdf',
  cleStockage: 'gestion/2026/09/abc.pdf', tailleOctets: 1024, dejaVidee: false,
  driveFileId: 'DRIVE-1', driveDossierId: 'DOSSIER-1', md5: 'aabbcc', verifieLe: '2026-09-26T10:00:00Z',
  brouillonEnCours: false, ...o,
});

const relu = (o: Partial<RelectureDrive> = {}): RelectureDrive => ({
  ok: true, md5: 'aabbcc', taille: 1024, sousLaRacine: true, ...o,
});

describe('🔴 ce que la base seule suffit à refuser — avant même de déranger Google', () => {
  it('rien à effacer quand il n’y a aucun contenu', () => {
    expect(verdictBase(piece({ cleStockage: null }))).toEqual({ effacable: false, motif: 'sans_contenu' });
    expect(verdictBase(piece({ cleStockage: '   ' }))).toEqual({ effacable: false, motif: 'sans_contenu' });
  });

  it('une pièce DÉJÀ vidée n’est pas une anomalie : c’est l’idempotence', () => {
    expect(verdictBase(piece({ dejaVidee: true }))).toEqual({ effacable: false, motif: 'deja_videe' });
  });

  it('🔴 une pièce attachée à un BROUILLON en cours n’est jamais vidée', () => {
    expect(verdictBase(piece({ brouillonEnCours: true }))).toEqual({ effacable: false, motif: 'brouillon_en_cours' });
  });

  it('aucune copie Drive ⇒ on garde', () => {
    expect(verdictBase(piece({ driveFileId: null }))).toEqual({ effacable: false, motif: 'sans_copie' });
    expect(verdictBase(piece({ driveFileId: '  ' }))).toEqual({ effacable: false, motif: 'sans_copie' });
  });

  it('🔴 une copie NON VÉRIFIÉE ne prouve rien', () => {
    expect(verdictBase(piece({ verifieLe: null }))).toEqual({ effacable: false, motif: 'copie_non_verifiee' });
    expect(verdictBase(piece({ md5: null }))).toEqual({ effacable: false, motif: 'copie_non_verifiee' });
    expect(verdictBase(piece({ md5: '' }))).toEqual({ effacable: false, motif: 'copie_non_verifiee' });
  });

  it('rien ne s’oppose côté base ⇒ `null`, donc « il reste à demander à Drive »', () => {
    expect(verdictBase(piece())).toBeNull();
  });
});

describe('🔴 la relecture Drive, faite À L’INSTANT — et pourquoi « vérifiée » ne suffit pas', () => {
  it('tout concorde ⇒ effaçable, avec les valeurs qui iront dans la preuve', () => {
    expect(verdict(piece(), relu())).toEqual({
      effacable: true, cleStockage: 'gestion/2026/09/abc.pdf', driveFileId: 'DRIVE-1', md5: 'aabbcc', taille: 1024,
    });
  });

  it('🔴 le fichier est à la corbeille ⇒ on garde, et le motif le dit', () => {
    expect(verdict(piece(), { ok: false, motif: 'ce fichier est à la corbeille' }))
      .toEqual({ effacable: false, motif: 'drive_corbeille' });
  });

  it('Drive illisible ⇒ on garde', () => {
    expect(verdict(piece(), { ok: false, motif: 'Drive n’a pas répondu (503)' }))
      .toEqual({ effacable: false, motif: 'drive_illisible' });
  });

  it('🔴 le fichier a quitté « Base de données locative » ⇒ on garde', () => {
    // C'est le garde-fou du lot DRIVE-1, et il n'est pas assoupli ici : un fichier déplacé hors de notre racine
    // n'est plus le nôtre, et rien ne dit qu'il le restera.
    expect(verdict(piece(), relu({ sousLaRacine: false }))).toEqual({ effacable: false, motif: 'drive_hors_racine' });
    expect(verdict(piece(), relu({ sousLaRacine: undefined }))).toEqual({ effacable: false, motif: 'drive_hors_racine' });
  });

  it('🔴 « Drive n’a pas dit où est ce fichier » ≠ « il a quitté la racine »', () => {
    /**
     * DÉFAUT TROUVÉ PAR LA SIMULATION DU 26/09/2026. Deux fichiers sur 6 717 sont revenus sans champ `parents` —
     * puis avec leur parent normal au passage suivant : ils n'avaient jamais bougé. Le rapport annonçait pourtant
     * « 2 fichiers ne sont plus sous Base de données locative », ce qui aurait lancé une enquête sur le Drive pour
     * un hoquet de réseau. Un fichier réellement déplacé annonce son NOUVEAU parent, donc une liste NON VIDE.
     */
    expect(verdict(piece(), relu({ sansParent: true, sousLaRacine: false })))
      .toEqual({ effacable: false, motif: 'drive_sans_parent' });
    // Le motif le dit à qui le lit : à relancer, et ce n'est pas un déplacement.
    expect(LIBELLES_CONSERVATION.drive_sans_parent).toContain('relancer');
    expect(LIBELLES_CONSERVATION.drive_sans_parent).toContain('pas un déplacement');
    // 🔴 Et dans les deux cas on CONSERVE : la distinction sert à comprendre, jamais à autoriser un effacement.
    expect(verdict(piece(), relu({ sansParent: true, sousLaRacine: true })).effacable).toBe(false);
  });

  it('la commande nourrit `sansParent` depuis la LONGUEUR de la liste de parents', () => {
    const src = readFileSync('app/scripts/vider-stockage.ts', 'utf8');
    expect(src).toContain('sansParent: relu.parents.length === 0');
  });

  it('🔴 une empreinte DIFFÉRENTE ⇒ on garde. C’est le cœur du lot', () => {
    expect(verdict(piece(), relu({ md5: 'ddeeff' }))).toEqual({ effacable: false, motif: 'empreinte_differente' });
  });

  it('🔴 une empreinte ABSENTE vaut « différente », jamais « égale »', () => {
    // Drive ne rend pas de MD5 pour ses propres formats. Sur un tel fichier on ne peut RIEN prouver.
    expect(verdict(piece(), relu({ md5: null }))).toEqual({ effacable: false, motif: 'empreinte_differente' });
    expect(verdict(piece(), relu({ md5: '' }))).toEqual({ effacable: false, motif: 'empreinte_differente' });
  });

  it('la casse de l’empreinte n’est pas une différence', () => {
    expect(verdict(piece({ md5: 'AABBCC' }), relu({ md5: 'aabbcc' })).effacable).toBe(true);
  });

  it('🔴 une TAILLE différente ⇒ on garde, même si l’empreinte concorde', () => {
    expect(verdict(piece(), relu({ taille: 1025 }))).toEqual({ effacable: false, motif: 'taille_differente' });
    expect(verdict(piece(), relu({ taille: null }))).toEqual({ effacable: false, motif: 'taille_differente' });
  });

  it('🔴 les refus de la base l’emportent sur une relecture parfaite', () => {
    // Une relecture Drive impeccable ne peut PAS racheter une copie non vérifiée : la règle est conjonctive.
    expect(verdict(piece({ verifieLe: null }), relu())).toEqual({ effacable: false, motif: 'copie_non_verifiee' });
    expect(verdict(piece({ brouillonEnCours: true }), relu())).toEqual({ effacable: false, motif: 'brouillon_en_cours' });
  });
});

describe('🔴 les deux clés de l’effacement', () => {
  it('« --appliquer » SEUL n’efface rien', () => {
    expect(effacementAutorise(['--appliquer'])).toBe(false);
  });

  it('la confirmation SEULE n’efface rien non plus', () => {
    expect(effacementAutorise([CONFIRMATION])).toBe(false);
  });

  it('les deux ensemble, et seulement les deux', () => {
    expect(effacementAutorise(['--appliquer', CONFIRMATION])).toBe(true);
    expect(lireOptions(['--appliquer', CONFIRMATION]).appliquer).toBe(true);
  });

  it('🔴 rien qui RESSEMBLE à la confirmation ne la remplace', () => {
    for (const presque of [
      '--je-confirme', '--je-confirme-effacements', '-je-confirme-effacement',
      '--JE-CONFIRME-EFFACEMENT', '--je-confirme-effacement=1',
    ]) {
      expect(effacementAutorise(['--appliquer', presque]), presque).toBe(false);
    }
  });

  it('sans option : simulation, lot par défaut, dix exemples', () => {
    expect(lireOptions([])).toEqual({
      compte: 'gestion@criterimmo.fr', appliquer: false, limite: LOT_VIDAGE, depuis: 0, exemples: 10,
    });
  });
});

describe('le garde-fou de descendance, réutilisé tel quel', () => {
  const arbre: NoeudArbre[] = [
    { driveId: 'RACINE', parentDriveId: null, sorte: 'racine', nom: 'Base de données locative', chemin: '/' },
    { driveId: 'ARRIVEE', parentDriveId: 'RACINE', sorte: 'arrivee', nom: '00 Arrivée des mails', chemin: '/00' },
  ];

  it('un parent sous la racine est accepté', () => {
    expect(sousLaRacine(['ARRIVEE'], arbre)).toBe(true);
    expect(sousLaRacine(['RACINE'], arbre)).toBe(true);
  });

  it('🔴 un parent INCONNU de l’arbre est refusé — on ne peut rien affirmer, donc on n’efface pas', () => {
    expect(sousLaRacine(['AILLEURS'], arbre)).toBe(false);
    expect(sousLaRacine([], arbre)).toBe(false);
  });

  it('un fichier à DEUX parents passe s’il en a au moins un sous la racine', () => {
    expect(sousLaRacine(['AILLEURS', 'ARRIVEE'], arbre)).toBe(true);
  });
});

describe('les comptes et le rapport', () => {
  it('chaque motif a son libellé, et le rapport ne cite que ceux qui comptent', () => {
    const c = comptesVides();
    compter(c, { effacable: true, cleStockage: 'k', driveFileId: 'd', md5: 'm', taille: 2048 });
    compter(c, { effacable: false, motif: 'sans_copie' });
    compter(c, { effacable: false, motif: 'sans_copie' });
    expect(c.vues).toBe(3);
    expect(c.effacables).toBe(1);
    expect(c.octetsEffacables).toBe(2048);
    expect(c.conservees.sans_copie).toBe(2);

    const lignes = resumeVidage(c, false).join('\n');
    expect(lignes).toContain(LIBELLES_CONSERVATION.sans_copie);
    // Les motifs à zéro ne sont pas listés : une liste de zéros cache celui qui compte.
    expect(lignes).not.toContain(LIBELLES_CONSERVATION.drive_corbeille);
  });

  it('🔒 un exemple ne porte AUCUN nom de fichier — un nom de pièce porte souvent le nom d’une personne', () => {
    const l = ligneExemple(piece({ nomFichier: 'Bail DUPONT Jean signé.pdf' }), { effacable: false, motif: 'sans_copie' });
    expect(l).not.toContain('DUPONT');
    expect(l).not.toContain('Bail');
    expect(l).toContain('pièce     42');
    expect(l).toContain(LIBELLES_CONSERVATION.sans_copie);
  });
});

describe('🔒 la lecture d’une pièce dans le Drive — sur des doubles, jamais le vrai Drive', () => {
  it('rend les octets et RECALCULE leur empreinte', async () => {
    const contenu = Buffer.from('bonjour');
    const faux = vi.fn(async () => ({ ok: true, arrayBuffer: async () => contenu }) as unknown as Response);
    const r = await lireContenuDrive('ID-1', 'jeton', { fetch: faux as unknown as typeof fetch });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.octets.toString()).toBe('bonjour');
      // L'empreinte est celle de CE QU'ON A REÇU, pas celle annoncée par les métadonnées.
      expect(r.md5).toBe('f02368945726d5fc2a14eb576f7276c0'); // md5('bonjour')
    }
  });

  it('🔴 elle n’émet qu’un GET, et seulement `alt=media`', async () => {
    let vue = { url: '', methode: '' };
    const faux = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      vue = { url: String(url), methode: init?.method ?? 'GET' };
      return { ok: true, arrayBuffer: async () => Buffer.from('x') } as unknown as Response;
    });
    await lireContenuDrive('ID-1', 'jeton', { fetch: faux as unknown as typeof fetch });
    expect(vue.methode).toBe('GET');
    expect(vue.url).toContain('alt=media');
    expect(vue.url).toContain('/files/ID-1');
    expect(vue.url).not.toContain('trashed');
  });

  it('un identifiant vide est refusé sans appeler Google', async () => {
    const faux = vi.fn();
    const r = await lireContenuDrive('   ', 'jeton', { fetch: faux as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    expect(faux).not.toHaveBeenCalled();
  });

  it('chaque code HTTP a un motif LISIBLE — « HTTP 404 » seul n’apprend rien', () => {
    expect(motifLecture(401)).toContain('expiré');
    expect(motifLecture(404)).toContain('n’existe plus');
    expect(motifLecture(503)).toContain('à réessayer');
    expect(motifLecture(418)).toContain('418');
  });

  it('🔴 le message d’échec ne dit JAMAIS « introuvable », et donne le lien vers la copie', () => {
    const m = messageIndisponible('ID-1', 'la connexion Google a expiré');
    expect(m).toContain('momentanément indisponible');
    expect(m).not.toMatch(/introuvable|supprim|perdu/i);
    expect(m).toContain(lienDrive('ID-1'));
  });
});

/** LA MIGRATION 260, éprouvée par sa FORME. */
describe('la migration 260', () => {
  const sql = readFileSync('db/migrations/260_gestion_piece_vidage.sql', 'utf8');
  const code = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

  it('crée la table du registre', () => {
    expect(code).toContain('CREATE TABLE IF NOT EXISTS gestion_piece_vidage');
  });

  it('🔴 une pièce n’est vidée QU’UNE FOIS — c’est l’idempotence, tenue en base', () => {
    expect(code).toContain('piece_id       bigint      NOT NULL UNIQUE');
  });

  it('🔴 l’ÉGALITÉ des empreintes est une CONTRAINTE, pas une promesse du code', () => {
    expect(code).toContain('CHECK (md5 = drive_md5 AND taille_octets = drive_taille)');
  });

  it('🔴 ajout seul : ni correction, ni effacement, ni TRUNCATE', () => {
    expect(code).toContain('BEFORE UPDATE OR DELETE ON gestion_piece_vidage');
    expect(code).toContain('BEFORE TRUNCATE ON gestion_piece_vidage');
  });

  it('🔴 elle ne touche PAS à `gestion_piece` : la clé de stockage n’est jamais effacée', () => {
    const alteres = [...code.matchAll(/ALTER TABLE\s+(\w+)/gi)].map((m) => m[1]);
    expect(new Set(alteres)).toEqual(new Set(['gestion_journal']));
    expect(code).not.toMatch(/UPDATE\s+gestion_piece\b/i);
  });

  it('elle exige ses prédécesseurs, dont la VÉRIFICATION des copies', () => {
    expect(code).toContain("to_regclass('public.gestion_piece_drive') IS NULL");
    expect(code).toContain("column_name = 'verifie_le'");
  });

  it('🔒 ne contient aucune donnée, et s’exécute en UNE transaction', () => {
    expect(code).not.toMatch(/INSERT\s+INTO\s+gestion_piece_vidage/i);
    expect(code.trimStart().startsWith('BEGIN;')).toBe(true);
    expect(code.trimEnd().endsWith('COMMIT;')).toBe(true);
  });

  it('donne la commande exacte', () => {
    expect(sql).toContain('psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/260_gestion_piece_vidage.sql');
  });
});

/** 🔴🔴 CE QUE CE LOT NE DOIT JAMAIS FAIRE — vérifié sur les sources. */
describe('les garanties du lot', () => {
  const sansCommentaires = (src: string): string => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*')).join('\n');

  const cmd = sansCommentaires(readFileSync('app/scripts/vider-stockage.ts', 'utf8'));
  const lecture = sansCommentaires(readFileSync('app/lib/gestion/pieceDriveLecture.ts', 'utf8'));
  const repo = sansCommentaires(readFileSync('app/lib/gestion/vidageRepo.ts', 'utf8'));
  const route = sansCommentaires(readFileSync('app/(admin)/api/admin/gestion/pieces/[id]/route.ts', 'utf8'));

  it('🔴🔴 AUCUNE ÉCRITURE DRIVE nulle part dans ce lot', () => {
    for (const [nom, src] of [['commande', cmd], ['lecture', lecture], ['route', route]] as const) {
      expect(src, nom).not.toMatch(/method:\s*'(POST|PATCH|PUT|DELETE)'/);
      for (const interdit of ['trashed: true', 'addParents', 'removeParents', 'permissions', 'uploadType']) {
        expect(src, `${nom} / ${interdit}`).not.toContain(interdit);
      }
    }
  });

  it('🔴 le dépôt du vidage NE SAIT PAS effacer : `supprimer` n’y est pas importé', () => {
    const imports = [...repo.matchAll(/^import\s+(?!type\b)[^;]*from\s*'([^']*)'/gm)].map((m) => m[1]);
    expect(imports.filter((i) => /stockage/.test(i))).toHaveLength(0);
    expect(repo).not.toContain('supprimer(');
  });

  it('🔴 la commande n’efface QU’APRÈS un verdict « effaçable » ET seulement avec les deux options', () => {
    const boucle = cmd.slice(cmd.indexOf('for (const p of lot)'));
    // Le refus vient AVANT l'effacement, et l'effacement est gardé par `o.appliquer`.
    expect(boucle).toContain('if (!v.effacable) continue;');
    expect(boucle).toContain('if (!o.appliquer) continue;');
    expect(boucle.indexOf('if (!v.effacable) continue;')).toBeLessThan(boucle.indexOf('await supprimer('));
    expect(boucle.indexOf('if (!o.appliquer) continue;')).toBeLessThan(boucle.indexOf('await supprimer('));
  });

  it('🔴 elle efface PUIS inscrit la preuve — jamais l’inverse', () => {
    const boucle = cmd.slice(cmd.indexOf('for (const p of lot)'));
    expect(boucle.indexOf('await supprimer(')).toBeLessThan(boucle.indexOf('await noterVidage('));
  });

  it('🔒 elle ne touche JAMAIS aux miniatures : la colonne n’est même pas nommée', () => {
    for (const [nom, src] of [['commande', cmd], ['dépôt', repo]] as const) {
      expect(src, nom).not.toContain('miniature');
    }
  });

  it('🔴 elle n’efface qu’une clé issue d’un VERDICT, jamais une clé lue directement sur la pièce', () => {
    // `v.cleStockage` vient du verdict, qui a exigé les sept conditions. `p.cleStockage` court-circuiterait tout.
    expect(cmd).toContain('await supprimer(v.cleStockage)');
    expect(cmd).not.toContain('await supprimer(p.cleStockage)');
  });

  it('🔴 la route ne lit dans le Drive que sur une copie d’ORIGINE « copie »', () => {
    const carte = sansCommentaires(readFileSync('app/lib/gestion/carteRepo.ts', 'utf8'));
    const lire = carte.slice(carte.indexOf('export async function lirePieceAServir'));
    expect(lire.slice(0, lire.indexOf('return {'))).toContain("d.origine = 'copie'");
    expect(lire.slice(0, lire.indexOf('return {'))).toContain('d.verifie_le IS NOT NULL');
  });

  it('🔴 l’épreuve exige une base jetable ET un bucket jetable, par la FORME du nom', () => {
    const epreuve = sansCommentaires(readFileSync('app/scripts/vidage-epreuve.ts', 'utf8'));
    expect(epreuve).toContain("BASE_JETABLE = 'gestion_jetable'");
    // 🔴 LISTE BLANCHE PAR LA FORME, jamais une liste noire de noms à tenir à jour : `svav-dev` ne peut pas la
    //   satisfaire, ni aucun bucket de production, et personne n'a à se souvenir de les y inscrire.
    expect(epreuve).toContain("SUFFIXE_BUCKET_JETABLE = '-jetable'");
    expect(epreuve).toContain('config.bucket.endsWith(SUFFIXE_BUCKET_JETABLE)');
    // Les deux gardes sortent AVANT toute écriture : le premier `supprimer` vient après elles.
    expect(epreuve.indexOf('endsWith(SUFFIXE_BUCKET_JETABLE)')).toBeLessThan(epreuve.indexOf('supprimer('));
    expect(epreuve.indexOf("!== BASE_JETABLE")).toBeLessThan(epreuve.indexOf('supprimer('));
  });

  it('🔒 la preuve du chemin Drive est en LECTURE SEULE : aucun effacement, aucune écriture', () => {
    const preuve = sansCommentaires(readFileSync('app/scripts/vidage-preuve-drive.ts', 'utf8'));
    for (const interdit of ['supprimer', 'noterVidage', 'INSERT', 'UPDATE', 'DELETE', "method: 'POST'"]) {
      expect(preuve, interdit).not.toContain(interdit);
    }
    // 🔒 Elle n'affiche aucun nom de fichier : un nom de pièce porte souvent le nom d'une personne.
    expect(preuve).not.toContain('nomFichier');
  });

  it('🔴 un échec de lecture Drive rend 503 avec un message, jamais un 404 ni un corps vide', () => {
    expect(route).toContain('status: 503');
    const bloc = route.slice(route.indexOf('if (!(octets instanceof Buffer)'));
    expect(bloc.slice(0, 400)).toContain('lienDrive');
  });
});
