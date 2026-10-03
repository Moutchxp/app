import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { oublierLeDrive } from '../../../../../../lib/gestion/driveMemoire';

/**
 * ══ 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — LA ROUTE QUI LOCALISE, ET QUI N'ÉCRIT RIEN ═══════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔒 CE QUE CE FICHIER TIENT AVANT TOUT : cette route est en LECTURE SEULE, et c'est une propriété de son code,
 * pas une intention. Elle n'importe aucun module d'écriture Drive, et n'émet aucun verbe HTTP d'écriture. Un
 * garde statique le vérifie, ligne à ligne.
 *
 * ET CE QU'ELLE RÉPOND :
 *   ① les occurrences du registre — la source, ses copies, et les copies de ses copies ;
 *   ② la CHAÎNE COMPLÈTE de dossiers de chacune, pour que l'arbre se surligne à tous les niveaux ;
 *   ③ l'empreinte de contenu de la source, que l'ÉCRAN comparera à ce qu'il a déjà lu ;
 *   ④ 🔴 une occurrence qu'on ne sait plus lire est ÉCARTÉE, jamais devinée.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const gardeMock = vi.fn();
const jetonMock = vi.fn();
const journalMock = vi.fn();
const copiesMock = vi.fn();
const metaMock = vi.fn();
const chaineMock = vi.fn();
/**
 * 🔴🔴 LOT EMPREINTE-PIECES-DEJA-DANS-LE-DRIVE, NIVEAU 1 — les emplacements d'une PIÈCE. Ils viennent désormais de
 * deux voies réunies : le lien de dépôt, et l'empreinte du contenu. Voir le dernier bloc de ce fichier.
 */
const piecesMock = vi.fn();
/**
 * 🔴🔴 NIVEAU 2 — l'index des empreintes du Drive. Il couvre les 181 001 fichiers que l'application n'a JAMAIS
 * touchés, et c'est la seule voie possible : `files.list` avec `q=md5Checksum='…'` répond HTTP 400.
 */
const md5PieceMock = vi.fn();
const md5IndexMock = vi.fn();
const memeEmpreinteMock = vi.fn();
const etatIndexMock = vi.fn();

vi.mock('../../../../../../lib/admin/garde', () => ({
  exigerCompteActif: (...a: unknown[]) => gardeMock(...a),
}));
vi.mock('../../../../../../lib/gestion/jetonCollaborateur', () => ({
  jetonPourRequete: (...a: unknown[]) => jetonMock(...a),
}));
vi.mock('../../../../../../lib/gestion/schema', () => ({
  journalMouvementDriveDisponible: () => journalMock(),
}));
vi.mock('../../../../../../lib/gestion/driveMouvementRepo', () => ({
  copiesDuDocument: (...a: unknown[]) => copiesMock(...a),
  fichiersDriveDeLaPiece: (...a: unknown[]) => piecesMock(...a),
}));
vi.mock('../../../../../../lib/gestion/empreinteDriveRepo', () => ({
  md5DeLaPiece: (...a: unknown[]) => md5PieceMock(...a),
  md5IndexeDuFichier: (...a: unknown[]) => md5IndexMock(...a),
  fichiersDeMemeEmpreinte: (...a: unknown[]) => memeEmpreinteMock(...a),
  etatDeLIndex: () => etatIndexMock(),
}));
vi.mock('../../../../../../lib/gestion/driveMemoire', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../lib/gestion/driveMemoire')>()),
  metadonneesMemo: (_s: string, _j: string, id: string) => metaMock(id),
  chaineDuDossierMemo: (_s: string, _j: string, depart: string) => chaineMock(depart),
}));

import { GET } from './route';

/**
 * L'ARBORESCENCE D'ESSAI :
 *   Racine ── Biens ── Bien A ── Travaux ── devis.pdf      (la SOURCE)
 *                   └─ Bien B ── Quittances ── devis.pdf   (une COPIE)
 */
const ARBRE: Record<string, { nom: string; parentId: string | null; md5?: string | null }> = {
  racine: { nom: 'Racine', parentId: null },
  biens: { nom: 'Biens', parentId: 'racine' },
  bienA: { nom: 'Bien A', parentId: 'biens' },
  travaux: { nom: 'Travaux', parentId: 'bienA' },
  bienB: { nom: 'Bien B', parentId: 'biens' },
  quittances: { nom: 'Quittances', parentId: 'bienB' },
  source: { nom: 'devis.pdf', parentId: 'travaux', md5: 'EMPREINTE' },
  copie: { nom: 'devis.pdf', parentId: 'quittances', md5: 'EMPREINTE' },
};

function chaineDepuis(depart: string): { id: string; nom: string; parentId: string | null }[] {
  const out: { id: string; nom: string; parentId: string | null }[] = [];
  let courant: string | null = depart;
  for (let i = 0; i < 32 && courant !== null; i += 1) {
    const n: { nom: string; parentId: string | null } | undefined = ARBRE[courant];
    if (n === undefined) break;
    out.push({ id: courant, nom: n.nom, parentId: n.parentId });
    courant = n.parentId;
  }
  return out;
}

const demander = (source: string) =>
  GET(new Request(`http://local/api/admin/gestion/drive/localiser?source=${encodeURIComponent(source)}`));

beforeEach(() => {
  vi.clearAllMocks();
  oublierLeDrive();
  gardeMock.mockResolvedValue(null);
  jetonMock.mockResolvedValue({ etat: 'ok', jeton: 'JETON', compteGoogle: 'a.jorel@sansvisavis.com' });
  journalMock.mockResolvedValue(true);
  copiesMock.mockResolvedValue([{ source: 'source', copie: 'copie' }]);
  piecesMock.mockResolvedValue([]);
  /** ⚠️ PAR DÉFAUT, AUCUN INDEX : les cas d'avant ce lot doivent se comporter exactement comme avant. */
  md5PieceMock.mockResolvedValue(null);
  md5IndexMock.mockResolvedValue(null);
  memeEmpreinteMock.mockResolvedValue([]);
  etatIndexMock.mockResolvedValue({ fichiers: 0, releveLe: null });
  chaineMock.mockImplementation(async (depart: string) => chaineDepuis(depart));
  metaMock.mockImplementation(async (id: string) => {
    const n = ARBRE[id];
    if (n === undefined) return { ok: false, motif: 'introuvable' };
    return {
      ok: true,
      valeur: {
        nom: n.nom, typeMime: 'application/pdf', parents: [n.parentId ?? ''],
        md5: n.md5 ?? null, tailleOctets: 10, lien: null, vignette: null, driveId: null, id,
      },
    };
  });
});

describe('🔴🔴 les emplacements connus d’un document', () => {
  it('🔴 la source ET sa copie sont rendues, chacune avec sa chaîne complète', async () => {
    const d = (await (await demander('source')).json()) as {
      etat: string; md5: string | null;
      occurrences: { id: string; nom: string; chemin: { id: string; nom: string }[]; voie: string }[];
    };
    expect(d.etat).toBe('ok');
    expect(d.occurrences.map((o) => o.id).sort()).toEqual(['copie', 'source']);

    /**
     * 🔴🔴 LA CHAÎNE ENTIÈRE, ET C'EST TOUT L'OBJET DE LA LOUPE. Sans elle, un document rangé quatre niveaux plus
     * bas ne surlignerait rien tant qu'on ne serait pas déjà arrivé à côté de lui.
     */
    const src = d.occurrences.find((o) => o.id === 'source');
    expect(src?.chemin.map((c) => c.nom)).toEqual(['Travaux', 'Bien A', 'Biens', 'Racine']);
    const cop = d.occurrences.find((o) => o.id === 'copie');
    expect(cop?.chemin.map((c) => c.nom)).toEqual(['Quittances', 'Bien B', 'Biens', 'Racine']);
  });

  /** 🔴 L'EMPREINTE DE LA SOURCE PART VERS L'ÉCRAN : c'est lui qui comparera, sans un appel de plus. */
  it('🔴 l’empreinte de contenu de la source est rendue', async () => {
    const d = (await (await demander('source')).json()) as { md5: string | null };
    expect(d.md5).toBe('EMPREINTE');
  });

  /** ⚠️ ON PART AUSSI BIEN D'UNE COPIE : chercher seulement `drive_id = $1` aurait raté la moitié des cas. */
  it('⚠️ ouvrir la loupe sur la COPIE retrouve l’original', async () => {
    const d = (await (await demander('copie')).json()) as { occurrences: { id: string }[] };
    expect(d.occurrences.map((o) => o.id).sort()).toEqual(['copie', 'source']);
  });

  /**
   * 🔴 UNE OCCURRENCE QU'ON NE SAIT PLUS LIRE EST ÉCARTÉE. Le journal garde la trace d'une copie qui a pu être
   * supprimée depuis : la compter ferait annoncer un emplacement où l'on n'irait rien trouver.
   */
  it('🔴 une copie disparue n’est pas annoncée', async () => {
    copiesMock.mockResolvedValue([{ source: 'source', copie: 'envolee' }]);
    const d = (await (await demander('source')).json()) as { occurrences: { id: string }[] };
    expect(d.occurrences.map((o) => o.id)).toEqual(['source']);
  });

  /** ⚠️ SANS LE JOURNAL (274), le registre est muet — et ce n'est pas une panne : il n'y a aucune copie connue. */
  it('⚠️ sans le journal, seule la source est rendue', async () => {
    journalMock.mockResolvedValue(false);
    const d = (await (await demander('source')).json()) as { occurrences: { id: string }[] };
    expect(d.occurrences.map((o) => o.id)).toEqual(['source']);
    expect(copiesMock).not.toHaveBeenCalled();
  });

  it('⚠️ sans source désignée, la route refuse', async () => {
    const r = await GET(new Request('http://local/api/admin/gestion/drive/localiser'));
    expect(r.status).toBe(422);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT EMPREINTE-PIECES-DEJA-DANS-LE-DRIVE, NIVEAU 1 — LA PIÈCE REVENUE RENOMMÉE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   CAS RÉEL D'ARNO (03/10/2026) : une pièce prise dans notre Drive, renommée, envoyée puis renvoyée à gestion@.
   Elle revient comme une pièce NEUVE — aucun dépôt à son nom — et c'est pourquoi la loupe ne trouvait rien.
   Mesuré sur la pièce 27125 : 0 ligne dans `gestion_piece_drive`, alors que le contenu (md5
   `4b782aa3d863fd2e7f2e849d523b0448`) est bien dans le Drive.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const surLaPiece = (id: number) =>
  GET(new Request(`http://local/api/admin/gestion/drive/localiser?piece=${id}`));

describe('🔴🔴 une pièce reconnue par son CONTENU, pas par son nom', () => {
  /**
   * 🔴🔴 LE CAS D'ARNO, DE BOUT EN BOUT. La pièce n'a aucun dépôt à son nom : son seul départ vient de
   * l'empreinte. Le chemin est tracé comme pour n'importe quel emplacement — c'est le minimum qu'il a demandé.
   */
  it('🔴🔴 aucun dépôt à son nom, et pourtant le chemin est tracé', async () => {
    piecesMock.mockResolvedValue([{ driveFileId: 'copie', md5: 'EMPREINTE', parEmpreinte: true }]);
    copiesMock.mockResolvedValue([]);
    const d = (await (await surLaPiece(27125)).json()) as {
      etat: string; parRegistre: number;
      occurrences: { id: string; voie: string; chemin: { nom: string }[] }[];
    };
    expect(d.etat).toBe('ok');
    expect(d.occurrences.map((o) => o.id)).toEqual(['copie']);
    expect(d.occurrences[0].chemin.map((c) => c.nom)).toEqual(['Quittances', 'Bien B', 'Biens', 'Racine']);
    /**
     * 🔴 ET LA VOIE EST DITE : « par empreinte », jamais « par le registre ». Compter cet emplacement comme une
     * copie faite par l'application ferait dire d'un fichier qu'elle n'a jamais touché qu'elle l'a produit.
     */
    expect(d.occurrences[0].voie).toBe('empreinte');
    expect(d.parRegistre).toBe(0);
  });

  /**
   * 🔴 LES DEUX VOIES COHABITENT, et le compte de chacune est juste : l'écran en fait une phrase qui distingue
   * une certitude sur ce qu'on a fait d'une certitude sur le contenu.
   */
  it('🔴 un dépôt à son nom ET un fichier de même contenu : deux voies, deux comptes', async () => {
    piecesMock.mockResolvedValue([
      { driveFileId: 'source', md5: 'EMPREINTE', parEmpreinte: false },
      { driveFileId: 'copie', md5: 'EMPREINTE', parEmpreinte: true },
    ]);
    copiesMock.mockResolvedValue([]);
    const d = (await (await surLaPiece(27125)).json()) as {
      parRegistre: number; occurrences: { id: string; voie: string }[];
    };
    expect(d.occurrences.map((o) => `${o.id}:${o.voie}`).sort())
      .toEqual(['copie:empreinte', 'source:registre']);
    expect(d.parRegistre).toBe(1);
  });

  /**
   * ⚠️ LA VOIE SE PROPAGE AUX COPIES D'UN DÉPART, et c'est juste : la copie d'un fichier connu par le registre
   * est connue par le registre, même si l'on est arrivé au départ par l'empreinte.
   */
  it('⚠️ un fichier atteint par les deux voies garde la plus forte', async () => {
    piecesMock.mockResolvedValue([
      { driveFileId: 'source', md5: 'EMPREINTE', parEmpreinte: false },
      { driveFileId: 'copie', md5: 'EMPREINTE', parEmpreinte: true },
    ]);
    // Le journal relie la source à la copie : la copie est donc AUSSI connue par le registre.
    copiesMock.mockResolvedValue([{ source: 'source', copie: 'copie' }]);
    const d = (await (await surLaPiece(27125)).json()) as {
      parRegistre: number; occurrences: { id: string; voie: string }[];
    };
    expect(d.occurrences.every((o) => o.voie === 'registre')).toBe(true);
    expect(d.parRegistre).toBe(2);
  });

  /**
   * 🔴 UN CONTENU DIFFÉRENT SOUS LE MÊME NOM N'EST PAS RECONNU, et c'est le sens même de l'empreinte : elle
   * juge les octets, jamais le nom. Ici la base ne rend aucun emplacement — la fenêtre dit « aucun connu ».
   */
  it('🔴🔴 même nom, contenu différent : rien n’est reconnu', async () => {
    piecesMock.mockResolvedValue([]);
    const d = (await (await surLaPiece(27125)).json()) as { occurrences: unknown[]; nombre: number };
    expect(d.occurrences).toEqual([]);
    expect(d.nombre).toBe(0);
  });

  /**
   * 🔴🔴 LA PASTILLE PARAÎT SANS UN SEUL APPEL GOOGLE. `?compte=1` ne lit que la base : c'est ce qui permet de
   * l'afficher pour toutes les vignettes dès l'ouverture de la fenêtre, et Arno l'a demandé explicitement.
   */
  it('🔴🔴 `?compte=1` compte par empreinte, et n’appelle pas Google', async () => {
    piecesMock.mockResolvedValue([
      { driveFileId: 'source', md5: 'EMPREINTE', parEmpreinte: true },
      { driveFileId: 'copie', md5: 'EMPREINTE', parEmpreinte: true },
    ]);
    copiesMock.mockResolvedValue([]);
    const r = await GET(new Request('http://local/api/admin/gestion/drive/localiser?piece=27125&compte=1'));
    const d = (await r.json()) as { nombre: number; md5: string | null };
    expect(d.nombre).toBe(2);
    expect(d.md5).toBe('EMPREINTE');
    // 🔴 AUCUNE MÉTADONNÉE DEMANDÉE : ni `files.get`, ni remontée de parents.
    expect(metaMock).not.toHaveBeenCalled();
    expect(chaineMock).not.toHaveBeenCalled();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 NIVEAU 2 — UN FICHIER QUE L'APPLICATION N'A JAMAIS TOUCHÉ, MAIS QUI EST INDEXÉ
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   C'est l'immense majorité du Drive : 181 001 fichiers recensés le 03/10/2026, contre 26 552 copies au registre.
   Et c'est la seule voie possible, parce que `files.list` avec `q=md5Checksum='…'` répond HTTP 400 « Invalid
   Value » — mesuré sur les 10 drives partagés visibles et avec `corpora=allDrives`.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 l’index retrouve ce que le registre ignore', () => {
  /**
   * 🔴🔴 LE CAS QUE LE NIVEAU 1 NE SAIT PAS TRAITER : le contenu est dans le Drive, mais aucune de ses copies
   * n'est passée par l'application. Sans index, la pièce est introuvable par son contenu, pour toujours.
   */
  it('🔴🔴 aucun dépôt, aucune copie au registre : l’index seul répond', async () => {
    piecesMock.mockResolvedValue([]);
    copiesMock.mockResolvedValue([]);
    md5PieceMock.mockResolvedValue('empreinte');
    memeEmpreinteMock.mockResolvedValue([{ driveFileId: 'copie' }]);
    etatIndexMock.mockResolvedValue({ fichiers: 181001, releveLe: new Date('2026-10-03T14:00:00Z') });
    const d = (await (await surLaPiece(27125)).json()) as {
      parRegistre: number; indexes: number;
      occurrences: { id: string; voie: string; chemin: { nom: string }[] }[];
    };
    expect(d.occurrences.map((o) => o.id)).toEqual(['copie']);
    expect(d.occurrences[0].voie).toBe('empreinte');
    expect(d.occurrences[0].chemin.map((c) => c.nom)).toEqual(['Quittances', 'Bien B', 'Biens', 'Racine']);
    expect(d.parRegistre).toBe(0);
    /** 🔴 L'ÉTENDUE DE L'INDEX REMONTE À L'ÉCRAN : c'est elle qui lui donne le droit de ne plus dire
     *  « le Drive n'est pas balayé ». Sans ce nombre, la fenêtre sous-estimerait ce qu'elle sait. */
    expect(d.indexes).toBe(181001);
  });

  /**
   * ⚠️ L'INDEX NE FAIT QUE TROUVER DES CANDIDATS : chaque emplacement est VÉRIFIÉ chez Google comme n'importe
   * quel autre. Un reflet périmé ne doit pas faire annoncer un fichier qui n'est plus là.
   */
  it('⚠️ un fichier indexé mais disparu du Drive n’est pas annoncé', async () => {
    md5PieceMock.mockResolvedValue('empreinte');
    memeEmpreinteMock.mockResolvedValue([{ driveFileId: 'envolee' }]);
    copiesMock.mockResolvedValue([]);
    const d = (await (await surLaPiece(27125)).json()) as { occurrences: unknown[] };
    expect(d.occurrences).toEqual([]);
  });

  /**
   * 🔴 POUR UNE VIGNETTE, L'EMPREINTE VIENT DE L'INDEX, SANS APPEL GOOGLE. C'est ce qui rend la pastille gratuite
   * sur une colonne entière : si l'index a vu le fichier, on connaît son empreinte sans rien demander.
   */
  it('🔴 l’empreinte d’une vignette est lue dans l’index, pas chez Google', async () => {
    md5IndexMock.mockResolvedValue('empreinte');
    memeEmpreinteMock.mockResolvedValue([{ driveFileId: 'copie' }]);
    copiesMock.mockResolvedValue([]);
    const r = await GET(new Request('http://local/api/admin/gestion/drive/localiser?source=source&compte=1'));
    const d = (await r.json()) as { nombre: number; md5: string | null };
    expect(d.md5).toBe('empreinte');
    expect(d.nombre).toBe(2);                 // la vignette elle-même, plus l'emplacement trouvé par l'index
    expect(metaMock).not.toHaveBeenCalled();  // 🔴 ZÉRO APPEL GOOGLE
  });

  /**
   * 🔴🔴 SANS LA MIGRATION 299, TOUT EST COMME AVANT. Les deux lectures d'index rendent « rien », l'index annonce
   * zéro empreinte, et la phrase de la fenêtre dit encore — à juste titre — que le Drive n'est pas balayé.
   */
  it('🔴🔴 sans index, la route retombe exactement sur le niveau 1', async () => {
    piecesMock.mockResolvedValue([{ driveFileId: 'source', md5: 'EMPREINTE', parEmpreinte: false }]);
    copiesMock.mockResolvedValue([]);
    const d = (await (await surLaPiece(27125)).json()) as {
      occurrences: { id: string; voie: string }[]; parRegistre: number; indexes: number;
    };
    expect(d.occurrences.map((o) => o.id)).toEqual(['source']);
    expect(d.parRegistre).toBe(1);
    expect(d.indexes).toBe(0);
    expect(memeEmpreinteMock).toHaveBeenCalledWith(null);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔒 LE GARDE STATIQUE — LECTURE SEULE, PROUVÉE PAR LE CODE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔒 cette route n’écrit rien', () => {
  const src = readFileSync('app/(admin)/api/admin/gestion/drive/localiser/route.ts', 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
    .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');

  /**
   * 🔒 AUCUN MODULE D'ÉCRITURE DRIVE N'EST IMPORTÉ. C'est la garantie la plus forte : on ne peut pas écrire ce
   * qu'on n'a pas le moyen d'appeler. Un import de plus ici, et ce test rougit.
   */
  it('🔒 elle n’importe aucun module d’écriture', () => {
    /**
     * ⚠️ ON CHERCHE LE CHEMIN D'IMPORT COMPLET, guillemet fermant compris, et non le mot nu. `driveMouvementRepo`
     * contient « driveMouvement » et il est IMPORTÉ ici — en lecture seule, pour relire le registre des copies.
     * Un test sur le mot nu aurait rougi pour un import parfaitement licite, et on l'aurait désarmé.
     */
    for (const mod of ['driveMouvement', 'driveCorbeilleReel', 'driveEcriture', 'driveCreation']) {
      expect(code).not.toContain(`/${mod}'`);
    }
    /**
     * ⚠️ ET CE QU'ELLE IMPORTE DU DÉPÔT EST DE LA LECTURE, ET RIEN QUE DE LA LECTURE : les deux fonctions du
     * registre (les copies d'un document, les dépôts d'une pièce) sont des `SELECT`. Les écritures du même
     * fichier — `inscrireMouvement`, `marquerAnnule` — ne doivent jamais apparaître ici.
     */
    expect(code).toContain('copiesDuDocument');
    expect(code).toContain('fichiersDriveDeLaPiece');
    expect(code).not.toContain('inscrireMouvement');
    expect(code).not.toContain('marquerAnnule');
  });

  it('🔒 elle n’émet aucun verbe d’écriture', () => {
    for (const mot of ['POST', 'PATCH', 'PUT', 'DELETE', 'trashed:', 'files.copy']) {
      expect(code).not.toContain(mot);
    }
    // ⚠️ ET ELLE N'EXPORTE QU'UN `GET` : un `POST` exporté ici serait une porte d'écriture ouverte par mégarde.
    expect(code).toContain('export async function GET');
    expect(code).not.toContain('export async function POST');
  });

  /**
   * 🔴🔴 LES ANCÊTRES DE L'ARCHIVE PEUVENT ÊTRE LUS — c'est ce qui permet de DIRE qu'un document y est, sans
   * jamais en ouvrir le contenu. Cette route ne lit que des métadonnées : jamais d'octets.
   */
  it('🔒 elle ne lit aucun contenu, seulement des métadonnées', () => {
    for (const mot of ['octets', 'alt=media', 'recuperer(', 'lireOctets']) {
      expect(code).not.toContain(mot);
    }
  });
});
