import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { alignerCopiesSurLeNom, renommerFichierDrive } from './renommageDrive';
import type { CopieDrive } from './nomUsagePiece';

/**
 * ══ 🔴🔴 LOT NOM-UNIQUE-DES-PIECES — LE SEUL MODULE QUI ÉCRIT UN NOM DANS LE DRIVE ═══════════════════════════
 *
 * DÉCISION D'ARNO DU 30/09/2026, ET C'EST UN CHANGEMENT DE RÈGLE : l'application peut renommer dans le Drive,
 * mais UNIQUEMENT les fichiers qu'elle a elle-même créés. C'est la première fois qu'elle écrit autre chose qu'un
 * dépôt ou un déplacement — ce fichier est donc le garde de cette nouvelle permission.
 *
 * ⚠️ POURQUOI UN MODULE À PART : `drive.ts` porte un garde qui compte les verbes de son source et refuse tout ce
 * qui n'est pas `POST`. Y ajouter un `PATCH` aurait désarmé cette garantie pour TOUT le module d'accès. Même
 * raisonnement que `driveMouvement.ts` : un verbe nouveau, un fichier nouveau, un garde nouveau.
 */
const OK = () => ({ ok: true, json: async () => ({ id: 'f1', name: 'n' }) }) as unknown as Response;

const copie = (id: string, o: Partial<CopieDrive> = {}): CopieDrive => ({
  driveFileId: id, dossierId: 'dos-1', dossierNom: '00 Arrivée des mails', origine: 'copie', ...o,
});

describe('🔴 renommer — files.update avec `name`, et RIEN d’autre', () => {
  it('un PATCH sur files/{id}, avec le seul champ `name`', async () => {
    const appels: { url: string; init: RequestInit }[] = [];
    const fetchFeint = vi.fn(async (url: string | URL, init?: RequestInit) => {
      appels.push({ url: String(url), init: init ?? {} });
      return OK();
    });
    const r = await renommerFichierDrive(
      { accessToken: 'JETON', driveFileId: 'f1', nom: 'Quittance juillet.pdf' },
      { fetch: fetchFeint as unknown as typeof fetch });

    expect(r.ok).toBe(true);
    expect(appels).toHaveLength(1);
    expect(appels[0].init.method).toBe('PATCH');
    expect(appels[0].url).toContain('/files/f1');
    // ⚠️ `supportsAllDrives` EST OBLIGATOIRE : sans lui, l'API répond « File not found » sur un fichier qui existe.
    expect(appels[0].url).toContain('supportsAllDrives=true');
    const corps = JSON.parse(String(appels[0].init.body)) as Record<string, unknown>;
    expect(Object.keys(corps)).toEqual(['name']);
    expect(corps.name).toBe('Quittance juillet.pdf');
  });

  it('un refus de Google est rendu avec son statut, jamais avalé', async () => {
    const fetchFeint = vi.fn(async () => ({ ok: false, status: 403, text: async () => 'interdit' }) as never);
    const r = await renommerFichierDrive(
      { accessToken: 'J', driveFileId: 'f1', nom: 'n.pdf' }, { fetch: fetchFeint as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toContain('403');
  });

  it('un nom vide ou un identifiant vide n’émet AUCUNE requête', async () => {
    const fetchFeint = vi.fn(async () => OK());
    const deps = { fetch: fetchFeint as unknown as typeof fetch };
    expect((await renommerFichierDrive({ accessToken: 'J', driveFileId: 'f1', nom: '  ' }, deps)).ok).toBe(false);
    expect((await renommerFichierDrive({ accessToken: 'J', driveFileId: ' ', nom: 'n.pdf' }, deps)).ok).toBe(false);
    expect(fetchFeint).not.toHaveBeenCalled();
  });
});

describe('🔴🔴 les deux contrôles, avant la moindre écriture', () => {
  const lancer = async (copies: CopieDrive[], registre: string[]) => {
    const appels: string[] = [];
    const fetchFeint = vi.fn(async (url: string | URL) => { appels.push(String(url)); return OK(); });
    const bilan = await alignerCopiesSurLeNom(
      { accessToken: 'J', nom: 'Bon nom.pdf', copies, registre: new Set(registre) },
      { fetch: fetchFeint as unknown as typeof fetch });
    return { bilan, appels };
  };

  /** 🔴 L'ÉPREUVE CENTRALE : un identifiant hors registre n'est JAMAIS écrit. */
  it('🔴 un identifiant HORS REGISTRE est refusé, et aucune requête ne part pour lui', async () => {
    const { bilan, appels } = await lancer([copie('a-nous'), copie('pas-a-nous')], ['a-nous']);
    expect(bilan.faits).toEqual(['a-nous']);
    expect(bilan.refus.map((r) => r.driveFileId)).toEqual(['pas-a-nous']);
    expect(bilan.refus[0].motif).toContain('n’est pas une copie que ce programme a créée');
    expect(appels.filter((u) => u.includes('pas-a-nous'))).toHaveLength(0);
  });

  /** 🔴 L'AUTRE ÉPREUVE CENTRALE : rien sous « Documents clients scannés », quoi qu'en dise le registre. */
  it('🔴🔴 un fichier du dossier PROTÉGÉ est refusé, MÊME s’il est dans le registre', async () => {
    const { bilan, appels } = await lancer(
      [copie('f1', { dossierNom: 'Documents clients scannés' })], ['f1']);
    expect(bilan.faits).toEqual([]);
    expect(bilan.refus[0].motif).toContain('Documents clients scannés');
    expect(appels).toHaveLength(0);
  });

  it('🔴 un sous-dossier de production est refusé lui aussi', async () => {
    for (const nom of ['1 actifs', '2 vendus', '3 perdus']) {
      const { bilan } = await lancer([copie('f1', { dossierNom: nom })], ['f1']);
      expect(bilan.faits, nom).toEqual([]);
    }
  });

  it('🔴 un CHEMIN qui traverse le dossier protégé est refusé, même si le dossier immédiat est innocent', async () => {
    const { bilan } = await lancer(
      [copie('f1', { dossierNom: 'sous-dossier', chemin: 'Documents clients scannés/1 actifs/sous-dossier' })],
      ['f1']);
    expect(bilan.faits).toEqual([]);
  });

  /**
   * 🔴 UN REFUS N'ARRÊTE PAS LES AUTRES (demande d'Arno). Un refus, c'est une copie qu'on ne touche pas ; les
   * autres doivent quand même porter le bon nom. S'arrêter au premier laisserait la pièce avec trois noms.
   */
  it('🔴 un refus au MILIEU ne fait pas tomber les copies suivantes', async () => {
    const { bilan } = await lancer(
      [copie('a'), copie('interdit', { dossierNom: 'Documents clients scannés' }), copie('b')],
      ['a', 'interdit', 'b']);
    expect(bilan.faits).toEqual(['a', 'b']);
    expect(bilan.refus).toHaveLength(1);
  });

  it('⚠️ une copie listée deux fois n’est écrite qu’une fois', async () => {
    const { appels } = await lancer([copie('f1'), copie('f1')], ['f1']);
    expect(appels).toHaveLength(1);
  });

  it('⚠️ un réseau qui tombe est un refus, il n’interrompt pas les suivantes', async () => {
    let premier = true;
    const fetchFeint = vi.fn(async () => {
      if (premier) { premier = false; throw new Error('réseau coupé'); }
      return OK();
    });
    const bilan = await alignerCopiesSurLeNom(
      { accessToken: 'J', nom: 'n.pdf', copies: [copie('a'), copie('b')], registre: new Set(['a', 'b']) },
      { fetch: fetchFeint as unknown as typeof fetch });
    expect(bilan.faits).toEqual(['b']);
    expect(bilan.refus[0].motif).toContain('réseau coupé');
  });
});

/**
 * ══ 🔴🔴 LE GARDE STATIQUE — CE QUE CE MODULE NE SAURA JAMAIS FAIRE ═════════════════════════════════════════════
 *
 * Aucun test de fonction ne peut tenir cette promesse-là : il faut regarder le SOURCE. On y compte les verbes HTTP
 * un par un, et l'on y cherche les mots des gestes que l'application ne fait pas.
 *
 * ⚠️ C'EST LA MISE À JOUR DEMANDÉE PAR ARNO : « files.update(name) est autorisé seulement dans ce module, et
 * seulement sur des ids du registre ». Les deux moitiés sont éprouvées — la seconde par les tests ci-dessus.
 */
describe('🔴 aucune porte dérobée dans renommageDrive', () => {
  const src = readFileSync('app/lib/gestion/renommageDrive.ts', 'utf8');
  /** ⚠️ On examine le CODE, pas la prose : l'encadré du fichier NOMME justement ce qu'il s'interdit. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');

  it('🔴 EXACTEMENT UNE écriture, et c’est un PATCH', () => {
    const verbes = (code.match(/method:\s*'(GET|POST|PATCH|PUT|DELETE)'/g) ?? []);
    expect(verbes).toEqual([`method: 'PATCH'`]);
  });

  it('🔴 aucune suppression, aucune corbeille, aucun partage, aucun déplacement', () => {
    for (const mot of ['delete', 'trashed', 'permissions', 'emptyTrash', 'addParents', 'removeParents']) {
      expect(code.toLowerCase(), mot).not.toContain(mot.toLowerCase());
    }
  });

  /** 🔴 LE CORPS NE PORTE QUE `name`. Un champ de plus ferait de ce module autre chose qu'un renommage. */
  it('🔴 un seul champ écrit dans le corps : `name`', () => {
    expect((code.match(/\bname:/g) ?? [])).toHaveLength(1);
    expect(code).not.toContain('parents:');
  });

  it('aucun identifiant de dossier en dur — surtout pas celui de l’archive', () => {
    expect(code).not.toContain('1Urt6vEZSBaZXu1VJV5rq6ylEwmgtWqRI');
    expect(code).not.toMatch(/'1[A-Za-z0-9_-]{25,}'/);
  });

  it('ni contournement, ni mode « forcer »', () => {
    expect(code).not.toMatch(/--force|forcer|ignorerGarde|sansGarde|bypass/i);
  });

  /**
   * 🔴🔴 ET IL NE LIT PAS LE REGISTRE : celui-ci lui est DONNÉ. Un module qui irait le chercher lui-même pourrait
   * se tromper sur ce qu'il lit — et la garantie de tout ce lot tient à ce qu'il ne puisse pas.
   */
  it('🔴 il ne lit NI la base NI le registre : tout lui est fourni', () => {
    expect(code).not.toContain('db/client');
    expect(code).not.toContain('gestion_piece_drive');
  });
});

/**
 * ══ 🔒🔒 `files.update(name)` N'EXISTE QUE DANS CE MODULE ════════════════════════════════════════════════════
 *
 * Demande d'Arno : « Mets à jour le test statique des verbes Drive : files.update(name) est autorisé seulement
 * dans ce module. » On balaie donc TOUT le module gestion et l'on vérifie qu'aucun autre fichier n'émet un
 * `PATCH` portant un `name` — un second endroit voudrait dire une seconde règle de sécurité à tenir.
 */
describe('🔒 personne d’autre ne renomme dans le Drive', () => {
  it('🔴 aucun autre fichier du module n’émet un PATCH avec `name:`', async () => {
    const { readdirSync } = await import('node:fs');
    const dossier = 'app/lib/gestion';
    const coupables: string[] = [];
    for (const f of readdirSync(dossier)) {
      if (!f.endsWith('.ts') || f.endsWith('.test.ts') || f === 'renommageDrive.ts') continue;
      const s = readFileSync(`${dossier}/${f}`, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');
      if (!/method:\s*'PATCH'/.test(s)) continue;
      // ⚠️ `driveMouvement` PORTE UN `name:` LÉGITIME — à la CRÉATION du dossier d'accueil d'une copie récursive,
      //   dans un POST, où il n'y a rien à renommer puisque le dossier n'existe pas encore. Son propre garde le
      //   tient déjà (« exactement une occurrence »). On ne compte donc que les PATCH porteurs d'un nom.
      const patchs = s.split(/method:\s*'PATCH'/).slice(1);
      if (patchs.some((bloc) => /\bname:/.test(bloc.slice(0, 400)))) coupables.push(f);
    }
    expect(coupables).toEqual([]);
  });
});
