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
