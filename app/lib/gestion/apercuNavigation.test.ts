import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  lireIntervalle, motCompteur, positionDans, voisinVers, voisinsVisualisables, type VoisinPossible,
} from './apercuDrive';
import {
  MEMOIRE_MS, OCTETS_MAX_FICHIER, OCTETS_MAX_TOTAL, chaineDuDossierMemo, cleOctets, memoriserOctets,
  metadonneesMemo, octetsMemo, oublierLeDrive, tailleMemoire,
} from './driveMemoire';

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

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LOT APERCU-PAGE1 — LES REQUÊTES PARTIELLES, ET POURQUOI ELLES SONT LA CLÉ.
 *
 * CONSTAT D'ARNO après le lot précédent : « c'est presque toujours aussi long, l'application télécharge toutes les
 * pages avant d'afficher le document ». Il avait raison, et ma mesure était fausse : je chronométrais la POSE du
 * cadre (999 ms), pas le moment où la page devient lisible.
 *
 * MESURÉ le 29/09/2026 : le téléchargement COMPLET des quatre PDF d'essai prend 755 à 993 ms — le réseau n'était
 * donc PAS le coupable. À +2 s le cadre natif était encore vide ; le texte n'arrivait qu'entre +3 et +5 s. Le
 * lecteur intégré de Chrome attend le fichier entier, puis décode 29 pages avant d'en peindre une.
 *
 * PDF.js, lui, ne demande que les octets de la page 1 — À CONDITION que la route sache répondre à un `Range`.
 * Sans cela il retombe sur le téléchargement complet, et l'on n'a rien gagné. C'est ce que ces tests tiennent.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴🔴 la route sert des TRANCHES', () => {
  const src = readFileSync('app/(admin)/api/admin/gestion/drive/apercu/route.ts', 'utf8');
  const drive = readFileSync('app/lib/gestion/drive.ts', 'utf8');

  it('elle annonce `Accept-Ranges: bytes` sur le contenu servi', () => {
    expect(src).toContain("'Accept-Ranges': o.tranches === false ? 'none' : 'bytes'");
  });

  it('🔴 le `Range` du navigateur est TRANSMIS à Google, jamais réinterprété', () => {
    expect(src).toContain("request.headers.get('range')");
    // C'est `ouvrirFluxFichier` qui le pose sur l'appel Drive — et seulement lui.
    expect(drive).toContain('entetes.Range = demande');
  });

  it('🔴 une réponse partielle de Google devient un 206, avec son `Content-Range`', () => {
    expect(src).toContain('flux.valeur.statut === 206');
    expect(src).toContain('status: partielle ? 206 : 200');
    expect(src).toContain("{ 'Content-Range': o.intervalle }");
  });

  /**
   * ⚠️ UN EXPORT GOOGLE NE SE DÉCOUPE PAS : il est CALCULÉ à la volée, sans taille connue d'avance, et Google y
   * refuse les `Range`. Annoncer des tranches qu'on ne sait pas servir ferait ÉCHOUER l'aperçu au lieu de le
   * rendre lent — c'est pourquoi on dit « none », et PDF.js lit alors le flux en entier.
   */
  it('🔴 un document Google exporté annonce « none », et ne reçoit aucun `Range`', () => {
    expect(src).toContain('const demande = estExport ? null : request.headers.get');
    expect(src).toContain('tranches: !estExport');
  });

  /**
   * 🔒 LA TRANCHE NE CONTOURNE PAS LA RÈGLE. Le verdict est prononcé AVANT la lecture, une seule fois, pour les
   * quatre réponses — `info`, vignette, flux complet et flux partiel. Une requête `Range` sur un fichier de
   * « Documents clients scannés » repart donc en 403, comme les autres.
   */
  it('🔒 le verdict passe AVANT la lecture de la tranche', () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
    expect(code.indexOf('verdictJoindreFichier(')).toBeLessThan(code.indexOf("request.headers.get('range')"));
    expect(code.indexOf('verdictJoindreFichier(')).toBeLessThan(code.indexOf('ouvrirFluxFichier('));
  });

  /**
   * 🔒 ET LA MÉMOIRE DES OCTETS NON PLUS NE CONTOURNE RIEN. Elle est consultée APRÈS le verdict, jamais avant :
   * un fichier déplacé sous « Documents clients scannés » est refusé à la requête suivante, mémoire pleine ou non.
   * C'est l'inversion de ces deux lignes qui ferait de ce cache une porte dérobée — d'où ce test.
   */
  it('🔒🔒 la mémoire des octets est consultée APRÈS le verdict', () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
    expect(code.indexOf('verdictJoindreFichier(')).toBeLessThan(code.indexOf('octetsMemo('));
    expect(code.indexOf('if (!v.joindre)')).toBeLessThan(code.indexOf('octetsMemo('));
  });

  /** ⚠️ ON NE RETIENT QU'UNE LECTURE ENTIÈRE : une tranche ne dit rien du reste du fichier. */
  /**
   * 🔴 L'AMORÇAGE DU VOISIN TIRE AUSSI SES OCTETS — c'est ce qui rend « Suivant » rapide, maintenant que le
   * serveur sait les garder. Mesuré : un document jamais vu coûtait 1,9 à 2,9 s, un document déjà vu 407 ms.
   *
   * 🔒 ET IL NE SORT PAS DU DOSSIER : les voisins viennent de `voisinsVisualisables`, et chaque octet amorcé
   * repasse par la route, donc par le verdict. Un voisin sous « Documents clients scannés » est refusé comme
   * le reste — l'amorçage n'est qu'une requête ordinaire, faite plus tôt.
   */
  it('🔴 l’amorçage du voisin réchauffe ses OCTETS, pas seulement sa carte d’identité', () => {
    const apercu = readFileSync('app/(admin)/admin/(protected)/gestion/ApercuFichierDrive.tsx', 'utf8');
    const code = apercu.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');
    expect(code).toContain("for (const id of [idSuivant, idPrecedent])");
    expect(code).toContain("adresseApercu(id, 'octets')");
    // ⚠️ Et jamais pour un export Google, qui est recalculé à chaque demande : l'amorcer ferait travailler pour rien.
    expect(code).toContain("if (d.sorte === 'export_pdf') return;");
    expect(code).toContain('AMORCE_TAILLE_MAX');
    /* 🔴 Après la page 1, jamais pendant : le document qu'on est venu voir passe en premier.
       ⚠️ ASSERTION ÉLARGIE LE 29/09/2026 (lot DRIVE-RETOUCHES-1) : la condition porte une clause de plus — on
       n'amorce pas les voisins d'une PIÈCE REÇUE, qui est servie par une autre route et n'a rien à réchauffer
       chez Google. La propriété gardée est la même ; on cesse seulement de figer la fin de la ligne. */
    expect(code).toContain("if (etat.e !== 'pret' || !page1Peinte");
    expect(code).toContain("source === 'piece') return undefined;");
  });

  it('⚠️ seule une lecture complète alimente la mémoire', () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
    expect(code).toContain('if (!estExport && !partielle) {');
    expect(code).toContain('flux.valeur.corps.tee()');
  });
});

/**
 * ══ 🔴🔴 LA MÉMOIRE COURTE DES OCTETS ══════════════════════════════════════════════════════════════════════════
 *
 * Mesuré le 29/09/2026 depuis la page : la page 1 se TRAME en 46 à 155 ms ; l'ouverture d'un document en coûte
 * 1 050 à 1 400, quelle que soit sa taille. C'est de la latence Google, et on la repayait à chaque réouverture.
 */
describe('🔴🔴 la mémoire courte des octets', () => {
  it('🔴 la clé sépare les collaborateurs, et change avec la taille du fichier', () => {
    expect(cleOctets('a@x.test', 'F1', 100)).not.toBe(cleOctets('b@x.test', 'F1', 100));
    expect(cleOctets('a@x.test', 'F1', 100)).not.toBe(cleOctets('a@x.test', 'F1', 101));
    expect(cleOctets('a@x.test', 'F1', 100)).toBe(cleOctets('a@x.test', 'F1', 100));
  });

  it('🔴 ce qu’on retient, on le retrouve — et cela s’oublie au bout d’une minute', () => {
    oublierLeDrive();
    const t = 1_000_000;
    memoriserOctets('k', new Uint8Array([1, 2, 3]), t);
    expect(octetsMemo('k', t + 1000)?.byteLength).toBe(3);
    expect(octetsMemo('k', t + MEMOIRE_MS + 1)).toBeNull();
  });

  it('⚠️ un document trop gros n’est pas retenu : il chasserait tout le reste', () => {
    oublierLeDrive();
    memoriserOctets('gros', new Uint8Array(OCTETS_MAX_FICHIER + 1));
    expect(octetsMemo('gros')).toBeNull();
    expect(tailleMemoire().octets).toBe(0);
  });

  it('⚠️ le total reste sous son plafond : les plus anciens partent en premier', () => {
    oublierLeDrive();
    const gros = OCTETS_MAX_FICHIER; // 12 Mo : trois tiennent, le quatrième en chasse un.
    for (const k of ['a', 'b', 'c']) memoriserOctets(k, new Uint8Array(gros));
    expect(tailleMemoire().octetsTotal).toBeLessThanOrEqual(OCTETS_MAX_TOTAL);
    expect(octetsMemo('a')).toBeNull();
    expect(octetsMemo('c')?.byteLength).toBe(gros);
    oublierLeDrive();
  });
});

/**
 * ══ 🔴 LIRE UN EN-TÊTE `Range` ═════════════════════════════════════════════════════════════════════════════════
 * ⚠️ `bytes=-2048` (les N DERNIERS octets) est LA forme que PDF.js emploie pour aller chercher la table d'index,
 * qui vit à la FIN d'un PDF. L'oublier ferait retomber sur le fichier entier à chaque ouverture.
 */
describe('🔴 la tranche demandée, lue', () => {
  it('un début et une fin, la fin INCLUSE', () => {
    expect(lireIntervalle('bytes=0-65535', 3_309_518)).toEqual({ debut: 0, fin: 65535 });
  });

  it('depuis un point jusqu’au bout', () => {
    expect(lireIntervalle('bytes=100-', 1000)).toEqual({ debut: 100, fin: 999 });
  });

  it('🔴 les N DERNIERS octets — la table d’index d’un PDF', () => {
    expect(lireIntervalle('bytes=-2048', 1_000_000)).toEqual({ debut: 997_952, fin: 999_999 });
    // Plus d'octets que le fichier n'en a : c'est le fichier entier, comme le veut la RFC.
    expect(lireIntervalle('bytes=-5000', 1000)).toEqual({ debut: 0, fin: 999 });
  });

  it('une fin au-delà du fichier est ramenée au dernier octet', () => {
    expect(lireIntervalle('bytes=900-99999', 1000)).toEqual({ debut: 900, fin: 999 });
  });

  /** ⚠️ TOUT CE QU'ON NE SAIT PAS SERVIR REND `null` : l'appelant sert alors le fichier ENTIER, jamais une erreur. */
  it('⚠️ ce qu’on ne sait pas servir vaut « pas de tranche »', () => {
    expect(lireIntervalle(null, 1000)).toBeNull();
    expect(lireIntervalle('bytes=0-10, 20-30', 1000)).toBeNull();   // plages multiples
    expect(lireIntervalle('items=0-10', 1000)).toBeNull();          // une autre unité
    expect(lireIntervalle('bytes=-', 1000)).toBeNull();
    expect(lireIntervalle('bytes=2000-', 1000)).toBeNull();         // hors du fichier
    expect(lireIntervalle('bytes=500-100', 1000)).toBeNull();       // à l'envers
    expect(lireIntervalle('bytes=0-100', 0)).toBeNull();            // fichier vide
  });
});

/**
 * 🔴 LE LECTEUR : PAGE 1 D'ABORD, LE RESTE QUAND IL APPROCHE. Éprouvé sur le SOURCE — un rendu PDF réel demande un
 * canvas, un worker et un vrai document, c'est-à-dire un navigateur ; ce qu'on veut garantir ici est la STRUCTURE
 * qui rend la page 1 rapide, et elle se lit.
 */
describe('🔴 le lecteur PDF rend la page 1 d’abord', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/LecteurPdf.tsx', 'utf8');

  it('🔴 il ne tire PAS le fichier entier en tâche de fond', () => {
    expect(src).toContain('disableAutoFetch: true');
    expect(src).toContain('rangeChunkSize: MORCEAU');
  });

  it('🔴 la page 1 est peinte SANS attendre l’observateur ; les autres l’attendent', () => {
    expect(src).toContain("if (numero === 1) { void peindre(1, el); return undefined; }");
    expect(src).toContain('new IntersectionObserver');
  });

  /**
   * 🔴 C'est le lecteur qui dit quand la vignette peut partir — jamais un minuteur, jamais la pose du cadre.
   *
   * ⚠️ ASSERTION RÉÉCRITE LE 29/09/2026, et la raison mérite d'être lue. Elle exigeait auparavant, mot pour mot,
   * `onPremierePage={() => setPage1Peinte(true)}` côté écran et `onPremierePage?.()` côté lecteur. Elle figeait
   * donc EXACTEMENT LE DÉFAUT qu'il a fallu corriger : une fonction écrite sur place change d'identité à chaque
   * rendu de l'écran, cette identité remontait dans les dépendances du rendu de page, et le lecteur repartait de
   * zéro sans fin — page 1 jamais peinte, toile blanche, plus de trente secondes d'attente à l'écran.
   * Ce qui compte n'est pas la FORME du rappel mais le FAIT : c'est la page 1 peinte, et elle seule, qui lève le
   * drapeau qui retire la vignette.
   */
  it('🔴 la page 1 peinte est ANNONCÉE, et c’est elle qui retire la vignette', () => {
    expect(src).toContain('if (n === 1) rappelPage1.current?.();');
    const apercu = readFileSync('app/(admin)/admin/(protected)/gestion/ApercuFichierDrive.tsx', 'utf8');
    expect(apercu).toMatch(/onPremierePage=\{[A-Za-z0-9_]+\}/);
    expect(apercu).toContain('useCallback(() => setPage1Peinte(true), [])');
    expect(apercu).toContain('etat.vignette && !page1Peinte');
  });

  /**
   * 🔴🔴 LE DÉFAUT DU 29/09/2026, ET LES DEUX CLOUS QUI LE TIENNENT FERMÉ.
   *
   * Symptôme à l'écran : « page 1 / 29 » s'affichait bien (donc le document était lu), mais la page restait
   * blanche indéfiniment, et la console répétait « Cannot use the same canvas during multiple render()
   * operations ». Deux causes, indépendantes, toutes deux nécessaires à corriger :
   *   1. le rappel `onPremierePage` était dans les dépendances du rendu ⇒ boucle sans fin de relances ;
   *   2. deux rendus visaient la même toile ⇒ PDF.js refuse, et la toile restait vide.
   */
  it('🔴🔴 le rappel de page 1 ne fait PLUS repeindre : il est lu par référence', () => {
    // La fonction de rendu ne dépend que du DOCUMENT et du ZOOM — les deux seules choses qui doivent repeindre.
    expect(src).toContain('}, [doc, zoom]);');
    expect(src).toContain('const rappelPage1 = useRef(onPremierePage);');
    // Et nulle part le rappel ne revient dans une liste de dépendances.
    expect(src).not.toMatch(/\[[^\]]*onPremierePage[^\]]*\]\)/);
  });

  it('🔴🔴 un rendu n’écrit jamais sur la toile affichée : il passe par un tampon neuf', () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
    expect(code).toContain("const tampon = document.createElement('canvas')");
    expect(code).toContain('p.render({ canvasContext: ctxTampon, viewport: vue })');
    // L'image n'arrive sur la toile visible qu'une fois le rendu FINI, et seulement s'il n'est pas dépassé.
    expect(code).toContain('ctx.drawImage(tampon, 0, 0);');
    expect(code).not.toContain('p.render({ canvasContext: ctx,');
  });

  /**
   * 🔒 LA CONTREPARTIE D'EXÉCUTER LE PDF CHEZ NOUS. Le worker vient de notre origine, aucune évaluation de code
   * n'est permise, et le JavaScript qu'un PDF peut contenir n'est jamais exécuté (`enableScripting` reste faux).
   */
  it('🔒 worker servi par nous, aucune évaluation, aucun script du PDF', () => {
    expect(src).toContain("pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'");
    expect(src).toContain('isEvalSupported: false');
    expect(src).not.toContain('enableScripting: true');
    expect(src).not.toContain('cdn');
  });

  /**
   * ⚠️ AUCUN BOUTON « IMPRIMER » NI « TÉLÉCHARGER » dans notre barre — demande d'Arno, et le natif en avait deux.
   *
   * ⚠️ ON EXAMINE LE CODE, PAS LA PROSE : l'encadré du fichier EXPLIQUE justement qu'on ne les met pas, et
   * chercher les mots dans le fichier entier ferait échouer le test sur sa propre documentation.
   */
  it('⚠️ la barre n’offre ni impression ni téléchargement', () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
    expect(code).not.toMatch(/[Ii]mprimer|[Tt]élécharger|print\(|download/);
    // Ce qu'elle offre, en revanche : la page, le zoom, et l'ajustement à la largeur.
    expect(code).toContain('Ajuster à la largeur');
  });
});
