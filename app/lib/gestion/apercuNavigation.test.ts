import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  motCompteur, positionDans, voisinVers, voisinsVisualisables, type VoisinPossible,
} from './apercuDrive';
import { MEMOIRE_MS, chaineDuDossierMemo, metadonneesMemo, oublierLeDrive, tailleMemoire } from './driveMemoire';

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LOT APERCU-RAPIDE — LE PÉRIMÈTRE DE « PRÉCÉDENT / SUIVANT », ET LA MÉMOIRE QUI REND L'OUVERTURE RAPIDE.
 *
 * Les deux sont PURS ou presque, et c'est ce qui permet de les éprouver exhaustivement : on ne saurait pas provoquer
 * à la main une recherche qui tombe sur deux dossiers dont l'un est l'archive interdite, ni faire expirer une
 * mémoire de soixante secondes en cliquant.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const f = (p: Partial<VoisinPossible>): VoisinPossible => ({
  id: 'x', nom: 'x.pdf', typeMime: 'application/pdf', dossier: false, parentId: 'D1', ...p,
});

describe('🔴🔴 le périmètre : LE DOSSIER DU DOCUMENT AFFICHÉ, jamais d’un dossier à un autre', () => {
  const ouvert = { id: 'b', typeMime: 'application/pdf', parentId: 'D1' };

  it('dans un dossier : tous ses fichiers visualisables, DANS L’ORDRE DE LA LISTE', () => {
    const v = voisinsVisualisables([
      f({ id: 'a' }), f({ id: 'b' }), f({ id: 'c' }),
    ], ouvert);
    expect(v.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  /** ① Les DOSSIERS ne sont pas des documents : on parcourt ce qui se regarde, pas l'arborescence. */
  it('les sous-dossiers sont écartés', () => {
    const v = voisinsVisualisables([
      f({ id: 'sous', dossier: true, typeMime: 'application/vnd.google-apps.folder' }),
      f({ id: 'b' }),
    ], ouvert);
    expect(v.map((x) => x.id)).toEqual(['b']);
  });

  /**
   * 🔴🔴 ② LA CLAUSE QUI PROTÈGE. Une recherche rend quarante fichiers venus de quarante endroits. « Suivant » y
   * ferait passer du bail d'un logement à la pièce d'identité d'un autre client — et celle-là peut être sous
   * « Documents clients scannés ». Borner au dossier n'est pas un confort : c'est ce qui empêche l'aperçu de
   * sortir de l'endroit où l'on avait le droit de regarder.
   */
  it('🔴🔴 depuis une recherche, seuls les fichiers du MÊME dossier sont parcourus', () => {
    const v = voisinsVisualisables([
      f({ id: 'a', parentId: 'D1' }),
      f({ id: 'b', parentId: 'D1' }),
      f({ id: 'ailleurs', parentId: 'ARCHIVE' }),
      f({ id: 'encore', parentId: 'D2' }),
    ], ouvert);
    expect(v.map((x) => x.id)).toEqual(['a', 'b']);
  });

  /** Un parent INCONNU ne fait jamais partie du tour : on ne peut pas affirmer qu'il est au même endroit. */
  it('un fichier sans parent connu est écarté', () => {
    const v = voisinsVisualisables([f({ id: 'a', parentId: null }), f({ id: 'b' })], ouvert);
    expect(v.map((x) => x.id)).toEqual(['b']);
  });

  /**
   * 🔴 ③ LES TYPES SANS APERÇU SONT SAUTÉS (demande d'Arno), SVG COMPRIS — et le compteur ne les compte pas.
   * Sans cela, « Suivant » ouvrirait trois fenêtres vides d'affilée pour traverser trois archives zip.
   */
  it('🔴 les fichiers non visualisables sont sautés, SVG compris', () => {
    const v = voisinsVisualisables([
      f({ id: 'a' }),
      f({ id: 'zip', typeMime: 'application/zip' }),
      f({ id: 'svg', typeMime: 'image/svg+xml' }),
      f({ id: 'docx', typeMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      f({ id: 'b' }),
      f({ id: 'img', typeMime: 'image/png' }),
    ], ouvert);
    expect(v.map((x) => x.id)).toEqual(['a', 'b', 'img']);
    expect(motCompteur(positionDans(v, 'b'), v.length)).toBe('2 / 3');
  });

  /**
   * ⚠️ LE DOCUMENT OUVERT EST TOUJOURS DANS LE TOUR, même quand la liste ne le porte pas — on a pu l'ouvrir depuis
   * une liste qui ne dit aucun parent. Il est alors SEUL, et les deux boutons sont éteints : c'est la vérité.
   */
  it('un document ouvert hors de la liste est seul dans son tour', () => {
    const v = voisinsVisualisables([f({ id: 'a', parentId: 'D9' })], ouvert);
    expect(v.map((x) => x.id)).toEqual(['b']);
    expect(voisinVers(v, 'b', 1)).toBeNull();
    expect(voisinVers(v, 'b', -1)).toBeNull();
  });
});

describe('🔴 aux extrémités, on ne boucle pas', () => {
  const liste = [f({ id: 'a' }), f({ id: 'b' }), f({ id: 'c' })];
  const v = voisinsVisualisables(liste, { id: 'a', typeMime: 'application/pdf', parentId: 'D1' });

  it('au PREMIER, « Précédent » ne mène nulle part', () => {
    expect(voisinVers(v, 'a', -1)).toBeNull();
    expect(voisinVers(v, 'a', 1)).toBe('b');
  });

  it('au DERNIER, « Suivant » ne mène nulle part', () => {
    expect(voisinVers(v, 'c', 1)).toBeNull();
    expect(voisinVers(v, 'c', -1)).toBe('b');
  });

  it('au milieu, les deux mènent quelque part', () => {
    expect(voisinVers(v, 'b', -1)).toBe('a');
    expect(voisinVers(v, 'b', 1)).toBe('c');
  });

  it('un identifiant étranger ne mène nulle part — jamais au premier « par défaut »', () => {
    expect(voisinVers(v, 'inconnu', 1)).toBeNull();
    expect(voisinVers(v, 'inconnu', -1)).toBeNull();
  });
});

describe('le compteur', () => {
  it('compte à partir de 1, et dit « — » quand il n’y a rien', () => {
    expect(motCompteur(1, 3)).toBe('1 / 3');
    expect(motCompteur(3, 3)).toBe('3 / 3');
    expect(motCompteur(0, 0)).toBe('—');
    // Une position introuvable ne descend jamais sous 1 : « 0 / 3 » se lirait comme un bogue.
    expect(motCompteur(0, 3)).toBe('1 / 3');
  });

  it('la position se lit dans le tour, à partir de 1', () => {
    const v = [f({ id: 'a' }), f({ id: 'b' })];
    expect(positionDans(v, 'a')).toBe(1);
    expect(positionDans(v, 'b')).toBe(2);
    expect(positionDans(v, 'z')).toBe(0);
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LA MÉMOIRE COURTE — celle qui a fait tomber le verdict de 2 secondes à presque rien.
 *
 * MESURÉ le 29/09/2026 : remonter la chaîne des parents coûtait 1 700 à 2 360 ms (6 à 7 `files.get` EN SÉRIE), et
 * se repayait intégralement au fichier suivant du MÊME dossier, dont les ancêtres sont pourtant les mêmes.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴 la mémoire courte des lectures Drive', () => {
  const reponse = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps });

  it('🔴 la chaîne d’un dossier n’est remontée QU’UNE FOIS, et sert à tous ses fichiers', async () => {
    oublierLeDrive();
    const appels = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('D1')) return reponse({ id: 'D1', name: 'Travaux', parents: ['R'] });
      return reponse({ id: 'R', name: 'GESTION LOCATIVE', parents: [] });
    });
    const a = await chaineDuDossierMemo('a@x.fr', 'JETON', 'D1', { fetch: appels as never });
    const nbPremier = appels.mock.calls.length;
    const b = await chaineDuDossierMemo('a@x.fr', 'JETON', 'D1', { fetch: appels as never });
    expect(a.map((m) => m.nom)).toEqual(['Travaux', 'GESTION LOCATIVE']);
    expect(b).toEqual(a);
    // 🔴 LA PREUVE : le second passage n'a rien demandé à Google.
    expect(appels.mock.calls.length).toBe(nbPremier);
  });

  /**
   * ⚠️ LA CLÉ PORTE LE SUJET. Google applique les droits de la personne au nom de laquelle on agit : une mémoire
   * partagée entre deux collaborateurs ferait voir à l'un ce que l'autre seul peut lire. C'est le genre de fuite
   * qu'un cache introduit sans bruit.
   */
  it('🔒 deux collaborateurs ne partagent PAS la même mémoire', async () => {
    oublierLeDrive();
    const appels = vi.fn().mockResolvedValue(reponse({ id: 'D1', name: 'Travaux', parents: [] }));
    await chaineDuDossierMemo('a@x.fr', 'JETON-A', 'D1', { fetch: appels as never });
    const apresA = appels.mock.calls.length;
    await chaineDuDossierMemo('b@x.fr', 'JETON-B', 'D1', { fetch: appels as never });
    expect(appels.mock.calls.length).toBeGreaterThan(apresA);
  });

  /** ⚠️ Une chaîne TRONQUÉE n'est pas mémorisée : elle dit « je n'ai pas su remonter », et vaut refus. */
  it('une chaîne incomplète n’est jamais retenue', async () => {
    oublierLeDrive();
    const appels = vi.fn().mockImplementation(async (url: string) => (url.includes('D1')
      ? reponse({ id: 'D1', name: 'Travaux', parents: ['R'] })
      : { ok: false, status: 404, json: async () => ({}) }));
    await chaineDuDossierMemo('a@x.fr', 'JETON', 'D1', { fetch: appels as never });
    expect(tailleMemoire().chaines).toBe(0);
  });

  /**
   * ⚠️ LA DURÉE EST COURTE PARCE QUE L'INFORMATION EST DE SÉCURITÉ. Si un dossier est DÉPLACÉ dans « Documents
   * clients scannés », une mémoire trop longue continuerait d'autoriser la lecture de son contenu.
   */
  it('🔒 au-delà d’une minute, tout est redemandé', async () => {
    oublierLeDrive();
    const appels = vi.fn().mockResolvedValue(reponse({ id: 'D1', name: 'Travaux', parents: [] }));
    const t0 = 1_000_000;
    await chaineDuDossierMemo('a@x.fr', 'JETON', 'D1', { fetch: appels as never }, t0);
    const avant = appels.mock.calls.length;
    // Juste avant l'échéance : rien n'est redemandé.
    await chaineDuDossierMemo('a@x.fr', 'JETON', 'D1', { fetch: appels as never }, t0 + MEMOIRE_MS - 1);
    expect(appels.mock.calls.length).toBe(avant);
    // Juste après : tout est redemandé.
    await chaineDuDossierMemo('a@x.fr', 'JETON', 'D1', { fetch: appels as never }, t0 + MEMOIRE_MS + 1);
    expect(appels.mock.calls.length).toBeGreaterThan(avant);
  });

  it('les métadonnées d’un fichier sont mémorisées, et un ÉCHEC ne l’est jamais', async () => {
    oublierLeDrive();
    const ok = vi.fn().mockResolvedValue(reponse({ id: 'F1', name: 'bail.pdf', mimeType: 'application/pdf' }));
    await metadonneesMemo('a@x.fr', 'JETON', 'F1', { fetch: ok as never });
    await metadonneesMemo('a@x.fr', 'JETON', 'F1', { fetch: ok as never });
    expect(ok.mock.calls.length).toBe(1);

    /**
     * 🔴 UN REFUS N'EST PAS RETENU. Mémorisé une minute, il ferait échouer une seconde tentative qui, elle, aurait
     * marché — et l'on chercherait la panne chez nous. Même règle que pour le jeton délégué.
     */
    const ko = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await metadonneesMemo('a@x.fr', 'JETON', 'F2', { fetch: ko as never });
    await metadonneesMemo('a@x.fr', 'JETON', 'F2', { fetch: ko as never });
    expect(ko.mock.calls.length).toBe(2);
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LA POLITIQUE DE SÉCURITÉ DU CONTENU SERVI — DÉFAUT TROUVÉ À L'ÉCRAN LE 29/09/2026.
 *
 * Le cadre du PDF restait NOIR. Les octets étaient bons (3,3 Mo, `%PDF-1.6` en tête, en-têtes justes) : c'est
 * `default-src 'none'` qui s'appliquait au document servi, et le lecteur PDF de Chrome — une visionneuse à part
 * entière — ne pouvait plus charger ses propres ressources.
 *
 * ⚠️ IL NE SE VOYAIT PAS AVANT CE LOT, ET C'EST INSTRUCTIF : l'aperçu passait par un `blob:`, qui ne porte AUCUN
 * en-tête. La politique n'était donc jamais appliquée au document — on croyait l'avoir, on ne l'avait pas.
 *
 * ⚠️ ÉPROUVÉ SUR LE SOURCE : ce qu'on veut garantir est la FORME des en-têtes selon le type, et une exécution
 * demanderait un vrai Drive pour apprendre ce qu'une lecture dit déjà.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴🔴 la politique de sécurité du contenu servi', () => {
  const src = readFileSync('app/(admin)/api/admin/gestion/drive/apercu/route.ts', 'utf8');

  it('🔴 le PDF garde « frame-ancestors », et PERD « default-src none » — sinon il ne s’affiche pas', () => {
    expect(src).toContain("estPdf\n      ? \"frame-ancestors 'self'\"");
  });

  it('🔴 les images et le texte gardent la politique STRICTE : rien n’a besoin d’être chargé pour eux', () => {
    expect(src).toContain(": \"default-src 'none'; img-src data: blob: 'self'; frame-ancestors 'self'\"");
  });

  /** 🔒 `frame-ancestors 'self'` est posé DANS LES DEUX CAS : personne d'autre que nos pages ne peut l'encadrer. */
  it('🔒 personne d’autre que nos pages ne peut encadrer ce contenu', () => {
    const politiques = src.match(/frame-ancestors 'self'/g) ?? [];
    expect(politiques.length).toBeGreaterThanOrEqual(2);
  });

  /**
   * 🔴🔴 ET LE TYPE SERVI RESTE CELUI DE LA LISTE BLANCHE, avec `nosniff` : un `.html` déguisé en PDF sera rendu
   * comme un PDF cassé, jamais exécuté. C'est cette garantie-là qui permet de relâcher la politique du PDF sans
   * rien perdre de réel.
   */
  it('🔴 le type servi vient toujours de la liste blanche, et `nosniff` l’impose', () => {
    expect(src).toContain('typeServi(');
    expect(src).toContain("'X-Content-Type-Options': 'nosniff'");
    expect(src).not.toMatch(/'Content-Type':\s*meta\.valeur\.typeMime/);
  });
});

/**
 * 🔒 LES TROIS PORTES DE L'APERÇU PRONONCENT LE MÊME VERDICT, ET AVANT TOUTE LECTURE.
 *
 * Vérifié sur le vrai Drive le 29/09/2026 : sur un fichier de « Documents clients scannés › 1 actifs › Abdellatif
 * Névine », `info`, `vignette` et les octets rendent tous les trois 403 avec le même motif. Ici on garantit la
 * structure qui le rend vrai — un seul verdict, posé avant les trois.
 */
describe('🔒 les trois portes de l’aperçu passent par le même verdict', () => {
  const src = readFileSync('app/(admin)/api/admin/gestion/drive/apercu/route.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');

  it('un SEUL appel au verdict, placé avant les trois réponses', () => {
    expect((src.match(/verdictJoindreFichier\(/g) ?? [])).toHaveLength(1);
    const i = src.indexOf('verdictJoindreFichier(');
    // ⚠️ On compare aux BRANCHES, pas aux variables : `veutInfo` est lu dans la requête bien avant, et c'est normal.
    for (const porte of ['if (veutInfo)', 'if (veutVignette)', 'ouvrirFluxFichier(']) {
      expect(i, porte).toBeLessThan(src.indexOf(porte));
    }
  });

  /** 🔒 L'adresse signée de la vignette ne sort JAMAIS vers le navigateur : on dit seulement qu'elle existe. */
  it('🔒 l’adresse signée de la vignette ne quitte pas le serveur', () => {
    expect(src).toContain('vignette: meta.valeur.vignette !== null');
    expect(src).not.toMatch(/vignette:\s*meta\.valeur\.vignette\s*[,}]/);
  });
});
