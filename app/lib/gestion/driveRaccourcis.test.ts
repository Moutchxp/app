import { describe, it, expect, vi } from 'vitest';
import { chercherDossiers, listerDossiers, listerPartagesAvecMoi, versDossiers, MIME_DOSSIER, MIME_RACCOURCI } from './drive';

/**
 * LOT 5-PJ-C — LES RACCOURCIS ET LES DOSSIERS PARTAGÉS.
 *
 * 🔴 LE DÉFAUT QUE CE FICHIER TIENT FERMÉ, constaté par Arno à l'écran le 25/09/2026 : le sélecteur filtrait sur
 * `mimeType = dossier`, et un raccourci N'EST PAS un dossier — son type est `shortcut`. Les raccourcis vers un Drive
 * partagé, qui sont justement la façon dont on range un accès dans son Drive, étaient donc invisibles. Rien
 * n'échouait : ils n'existaient pas, ce qui est pire, parce qu'on ne cherche pas ce qu'on ne voit pas manquer.
 */

function faussefetch(corps: unknown) {
  const appels: string[] = [];
  const f = vi.fn(async (url: RequestInfo | URL) => {
    appels.push(String(url));
    return new Response(JSON.stringify(corps), { status: 200 });
  });
  return { fetch: f as unknown as typeof fetch, appels };
}
const lisible = (u: string): string => decodeURIComponent(u.replace(/\+/g, ' '));

const dossier = (id: string, name: string) => ({ id, name, mimeType: MIME_DOSSIER });
const raccourciVers = (id: string, name: string, cible: string, typeCible: string) =>
  ({ id, name, mimeType: MIME_RACCOURCI, shortcutDetails: { targetId: cible, targetMimeType: typeCible } });

describe('traduire une réponse du Drive', () => {
  it('un dossier ordinaire passe tel quel', () => {
    expect(versDossiers({ files: [dossier('1', 'Baux')] })).toEqual([{ id: '1', nom: 'Baux', driveId: null }]);
  });

  /**
   * 🔴 L'IDENTIFIANT RENDU EST CELUI DE LA CIBLE, jamais celui du raccourci. Entrer dedans ouvre la cible, et
   * « déposer ici » dépose dans la cible. Garder l'identifiant du raccourci ferait ÉCHOUER le dépôt : un raccourci
   * n'a pas d'enfants.
   */
  it('un raccourci vers un DOSSIER devient une entrée, avec l’identifiant de sa CIBLE', () => {
    const r = versDossiers({ files: [raccourciVers('RAC', 'GESTION LOCATIVE', 'CIBLE', MIME_DOSSIER)] });
    expect(r).toEqual([{ id: 'CIBLE', nom: 'GESTION LOCATIVE', driveId: null, raccourci: true }]);
    expect(r[0].id).not.toBe('RAC');
  });

  /** On choisit une DESTINATION : un fichier n'en est pas une, et le proposer ne mènerait qu'à une erreur au dépôt. */
  it('un raccourci vers un FICHIER est IGNORÉ', () => {
    expect(versDossiers({ files: [raccourciVers('RAC', 'contrat.pdf', 'F', 'application/pdf')] })).toEqual([]);
  });

  it('un raccourci sans cible est ignoré plutôt que rendu à moitié', () => {
    expect(versDossiers({ files: [{ id: 'RAC', name: 'x', mimeType: MIME_RACCOURCI }] })).toEqual([]);
  });

  it('dossiers et raccourcis se mélangent sans se perdre', () => {
    const r = versDossiers({
      files: [dossier('1', 'A'), raccourciVers('R', 'B', 'CIBLE', MIME_DOSSIER), raccourciVers('R2', 'C', 'F', 'image/png')],
    });
    expect(r.map((x) => x.nom)).toEqual(['A', 'B']);
    expect(r[1].raccourci).toBe(true);
  });

  it('un nom vide ne laisse jamais une entrée sans nom', () => {
    expect(versDossiers({ files: [{ id: '1', name: '   ', mimeType: MIME_DOSSIER }] })[0].nom).toBe('(sans nom)');
  });
});

describe('les requêtes demandent bien dossiers ET raccourcis', () => {
  it('lister : le filtre accepte les deux types', async () => {
    const d = faussefetch({ files: [] });
    await listerDossiers('j', { parentId: 'abc' }, d);
    const u = lisible(d.appels[0]);
    expect(u).toContain(`mimeType = '${MIME_DOSSIER}'`);
    expect(u).toContain(`mimeType = '${MIME_RACCOURCI}'`);
    expect(u).toContain('shortcutDetails');
  });

  it('chercher : les raccourcis sont couverts par la recherche aussi', async () => {
    const d = faussefetch({ files: [] });
    await chercherDossiers('j', 'Dupont', d);
    const u = lisible(d.appels[0]);
    expect(u).toContain(`mimeType = '${MIME_RACCOURCI}'`);
    expect(u).toContain('corpora=allDrives');
  });
});

describe('« Partagés avec moi »', () => {
  /**
   * 🔴 CES DOSSIERS N'ONT PAS DE PARENT CHEZ NOUS : ils appartiennent à quelqu'un d'autre. `sharedWithMe = true` est
   * la SEULE façon de les voir — aucun `in parents` ne les atteindra jamais. C'est pourquoi ils manquaient
   * entièrement au sélecteur, sans que rien n'échoue.
   */
  it('se demandent par `sharedWithMe`, jamais par un parent', async () => {
    const d = faussefetch({ files: [] });
    await listerPartagesAvecMoi('j', d);
    const u = lisible(d.appels[0]);
    expect(u).toContain('sharedWithMe = true');
    expect(u).not.toContain('in parents');
  });

  it('un raccourci y est traité comme ailleurs', async () => {
    const d = faussefetch({ files: [raccourciVers('R', 'Partagé', 'CIBLE', MIME_DOSSIER)] });
    const r = await listerPartagesAvecMoi('j', d);
    expect(r.ok && r.valeur[0]).toMatchObject({ id: 'CIBLE', raccourci: true });
  });

  it('un refus rend un motif lisible', async () => {
    const f = vi.fn(async () => new Response('', { status: 403 }));
    const r = await listerPartagesAvecMoi('j', { fetch: f as unknown as typeof fetch });
    expect(r.ok).toBe(false);
  });
});
