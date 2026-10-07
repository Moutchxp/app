// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SelecteurFichierDrive } from './SelecteurFichierDrive';

/**
 * 🔴 LOT EDITEUR-PJ — LE SÉLECTEUR DRIVE : PLUSIEURS PIÈCES, SANS QUITTER LA NAVIGATION.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT CORRIGÉ. Un clic sur « Joindre » ajoutait le fichier ET refermait tout. Joindre trois pièces prises
 * dans deux dossiers demandait donc de rouvrir le Drive trois fois et de redescendre treize niveaux deux fois :
 * le geste le plus courant était le plus coûteux.
 *
 * Ce qui est tenu ici :
 *   ① 🔴 la fenêtre RESTE ouverte après un ajout, et le dossier courant ne bouge pas ;
 *   ② 🔴 PAS DE DOUBLON : un fichier déjà ajouté ne peut pas l'être une seconde fois ;
 *   ③ le compteur dit ce qui a été fait — puisque la fermeture ne le dit plus ;
 *   ④ 🔴🔴 sous « Documents clients scannés », « Joindre » N'EXISTE PAS et le motif est écrit ;
 *   ⑤ « Récents » n'existe PAS sans la migration 269 — pas une section vide, qui se lirait comme une panne.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let choisis: unknown[];
let fermetures: number;
let contenu: Record<string, unknown>;
let recents: Record<string, unknown>;
let prioritaires: Record<string, unknown>;
let appels: string[];
/** Ce que `?info=1` rend : le feu vert (avec ou sans vignette), ou un refus avec son motif. */
let apercu: { ok: boolean; vignette?: boolean; message?: string; statut?: number };
/** Ce que la route de création rend, au GET (préparation) puis au POST (création). */
let dossierNeuf: { get: Record<string, unknown>; post: Record<string, unknown>; statut: number };
let urlsCreees: number;
let urlsRevoquees: number;

/**
 * ⚠️ LOT APERCU-RAPIDE — `parentId` FAIT PARTIE DE LA LIGNE, comme dans la vraie réponse : la route demande
 * `parents` à Drive depuis ce lot. C'est lui qui borne « Précédent / Suivant » au dossier du document affiché.
 */
const fichier = (id: string, nom: string, dossier = false, parentId: string | null = 'D1') => ({
  id, nom, typeMime: dossier ? 'application/vnd.google-apps.folder' : 'application/pdf',
  tailleOctets: dossier ? null : 2048, modifieLe: null, lien: `https://drive.google.com/${id}`, dossier,
  parentId,
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  /**
   * 🔴 ON VIDE LA MÉMOIRE DE SESSION ENTRE DEUX TESTS (lot DRIVE-RETOUCHES-2). Les dossiers dépliés y sont
   * désormais retenus, d'une ouverture de la fenêtre à l'autre : sans ce nettoyage, un test hériterait de
   * l'arbre du précédent et ne prouverait plus ce qu'il croit prouver — un triangle « déplierait » un dossier
   * déjà ouvert, donc le refermerait.
   */
  try { globalThis.sessionStorage?.clear(); } catch { /* pas de stockage : l'arbre part vide, ce qui convient */ }
  choisis = []; fermetures = 0; appels = [];
  contenu = {
    etat: 'ok', joindreAutorise: true, motifRefus: null,
    fichiers: [fichier('d1', 'Artisans', true), fichier('f1', 'bail.pdf'), fichier('f2', 'devis.pdf')],
  };
  recents = { etat: 'ok', disponible: false, lignes: [] };
  prioritaires = { etat: 'ok', biens: [], dossiers: [] };
  apercu = { ok: true, vignette: true };
  dossierNeuf = {
    get: { etat: 'ok', nom: 'Travaux 2026', chemin: 'Mon Drive › Artisans › Travaux 2026',
      phrase: 'Le dossier sera créé ici : Mon Drive › Artisans › Travaux 2026' },
    post: { etat: 'ok', dossier: { id: 'dn', nom: 'Travaux 2026', lien: null }, journalise: true, message: null },
    statut: 200,
  };
  global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    appels.push(`${init?.method ?? 'GET'} ${u}`);
    if (u.includes('/dossier-du-bien')) return { ok: true, json: async () => prioritaires } as unknown as Response;
    if (u.includes('/pieces-recentes')) return { ok: true, json: async () => recents } as unknown as Response;
    // 🔴 L'APERÇU rend des OCTETS, pas du JSON — sauf quand il refuse, et c'est ce que le test doit pouvoir simuler.
    /**
     * 🔴 LOT APERCU-RAPIDE — L'APERÇU DEMANDE D'ABORD `?info=1`, court, qui porte le verdict et le type. Les OCTETS,
     * eux, ne passent plus par `fetch` : le cadre pointe directement sur la route, pour que le lecteur PDF affiche
     * les premières pages pendant que le reste arrive. C'est pour cela que ce double ne rend plus de `blob`.
     */
    if (u.includes('/drive/apercu')) {
      return apercu.ok
        ? {
          ok: true, status: 200,
          json: async () => ({ etat: 'ok', nom: 'bail.pdf', sorte: 'pdf', vignette: apercu.vignette !== false }),
        } as unknown as Response
        : {
          ok: (apercu.statut ?? 415) < 400, status: apercu.statut ?? 415,
          json: async () => ({ etat: apercu.statut === 403 ? 'refus' : 'sans_apercu', message: apercu.message }),
        } as unknown as Response;
    }
    if (u.includes('/drive/dossier')) {
      const creation = (init?.method ?? 'GET') === 'POST' ? dossierNeuf.post : dossierNeuf.get;
      return {
        ok: dossierNeuf.statut < 400, status: dossierNeuf.statut, json: async () => creation,
      } as unknown as Response;
    }
    if (u.includes('contenu=1')) {
      return { ok: true, json: async () => ({ etat: 'ok', contenuBase64: 'AAAA' }) } as unknown as Response;
    }
    return { ok: true, json: async () => contenu } as unknown as Response;
  }) as unknown as typeof fetch;
  // jsdom n'a pas d'URL d'objet : l'aperçu en crée une pour le cadre, et la révoque à la fermeture.
  urlsCreees = 0; urlsRevoquees = 0;
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => {
    urlsCreees += 1; return `blob:essai/${urlsCreees}`;
  };
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => { urlsRevoquees += 1; };
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const monter = async () => {
  await act(async () => {
    root.render(createElement(SelecteurFichierDrive, {
      onChoisir: (c: unknown) => { choisis.push(c); }, onFermer: () => { fermetures += 1; },
    } as never));
  });
  await calmer();
};
const boutons = () => [...container.querySelectorAll('button')] as HTMLButtonElement[];
const boutonPar = (m: RegExp) => boutons().find((b) => m.test((b.textContent ?? '').trim()));
const cliquer = async (e: Element | null | undefined) => {
  await act(async () => { (e as HTMLElement | undefined)?.click(); }); await calmer();
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT DRIVE-FACON-FINDER — LES AIDES DE CE FICHIER ONT ÉTÉ RÉÉCRITES, ET IL FAUT DIRE POURQUOI.

   Elles cherchaient un bouton dont le TEXTE était « Joindre », « Visualiser » ou « Insérer un lien », dans une
   ligne de classe `.sfd-ligne`. C'était vrai jusqu'au 29/09/2026 ; ce ne l'est plus, et c'est une demande d'Arno :
   « les actions de ligne restent disponibles : au survol de la ligne, à droite, EN ICÔNES DISCRÈTES avec
   infobulle, au lieu des 3 liens rouges permanents ». La liste est désormais celle du Finder — `.sfd-ligne`,
   quatre colonnes, et des gestes en icônes portant leur mot dans `title` et `aria-label`.

   ⚠️ AUCUNE ASSERTION N'A ÉTÉ AFFAIBLIE : ce sont les MÊMES gestes, au même endroit du raisonnement, cherchés par
   le mot qu'ils portent pour le lecteur d'écran plutôt que par le texte qu'ils affichaient.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Une ligne de la liste, par le nom qu'elle affiche. */
const ligneDe = (nom: string) =>
  [...container.querySelectorAll('.sfd-ligne')].find((x) => (x.textContent ?? '').includes(nom));
/** Un geste de ligne, par son infobulle — le mot que porte l'icône. */
const gesteDe = (nom: string, titre: string) =>
  [...(ligneDe(nom)?.querySelectorAll('.sfd-geste') ?? [])]
    .find((b) => (b.getAttribute('title') ?? '') === titre) as HTMLButtonElement | undefined;
const joindreDe = (nom: string) => gesteDe(nom, 'Joindre au message');
const visualiserDe = (nom: string) => gesteDe(nom, 'Visualiser');
const lienDe = (nom: string) => gesteDe(nom, 'Insérer un lien');
/** 🔴 Ouvrir un dossier, c'est un DOUBLE-CLIC — comme dans le Finder. */
const ouvrirDossier = async (nom: string) => {
  await act(async () => {
    ligneDe(nom)?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
  await calmer();
};
/** Une entrée de la barre latérale, par son libellé. */
/**
 * ⚠️ LE LIBELLÉ A CHANGÉ LE 29/09/2026 (lot DRIVE-UNIQUE) : « Récents » est devenu « PIÈCES récentes ».
 * La barre latérale porte désormais DEUX sortes de récents, et les confondre serait un piège : les DOSSIERS où
 * l'on a déjà déposé (pour ranger) et les PIÈCES déjà jointes (pour joindre). Le mot dit maintenant lequel.
 */
const lateraleDe = (m: RegExp) => [...container.querySelectorAll('.sfd-cote-item')]
  .find((b) => m.test(b.textContent ?? '')) as HTMLButtonElement | undefined;
/** 🔴 LA RECHERCHE EST DERRIÈRE LA LOUPE, comme dans le Finder : on l'ouvre avant de taper. */
const ouvrirLoupe = async () => {
  if (container.querySelector('.sfd-saisie') === null) {
    await cliquer(container.querySelector('.sfd-outil[aria-label="Rechercher"]'));
  }
  return container.querySelector('.sfd-saisie') as HTMLInputElement;
};
/** 🔴 « Nouveau dossier » vit dans le menu « ⋯ » de la barre d'outils, comme dans le Finder. */
const ouvrirMenuOutils = async () => {
  await cliquer(container.querySelector('.sfd-outil[aria-label="Autres actions"]'));
};
const entreeNouveauDossier = () =>
  [...container.querySelectorAll('.sfd-menu--outils [role="menuitem"]')]
    .find((b) => /Nouveau dossier/.test(b.textContent ?? '')) as HTMLButtonElement | undefined;
/** Ouvre le menu et rend l'entrée « Nouveau dossier » (définie ou non). */
const nouveauDossier = async () => { await ouvrirMenuOutils(); return entreeNouveauDossier(); };

describe('🔴 ① la fenêtre reste ouverte, et le dossier courant ne bouge pas', () => {
  it('🔴 joindre une pièce NE FERME PAS la fenêtre', async () => {
    await monter();
    await cliquer(joindreDe('bail.pdf'));
    expect(choisis).toHaveLength(1);
    expect(fermetures).toBe(0);
    expect(container.querySelector('.sfd')).not.toBeNull();
  });

  it('🔴 la liste affichée est la MÊME après l’ajout : on n’est pas renvoyé à la racine', async () => {
    await monter();
    const avant = [...container.querySelectorAll('.sfd-ligne')].map((x) => x.textContent);
    await cliquer(joindreDe('bail.pdf'));
    const apres = [...container.querySelectorAll('.sfd-ligne')].map((x) => x.textContent);
    expect(apres).toHaveLength(avant.length);
    expect(container.textContent).toContain('devis.pdf');
  });

  it('on peut en ajouter DEUX de suite, sans rien rouvrir', async () => {
    await monter();
    await cliquer(joindreDe('bail.pdf'));
    await cliquer(joindreDe('devis.pdf'));
    expect(choisis).toHaveLength(2);
    expect(fermetures).toBe(0);
  });

  it('c’est « Terminé » qui ferme, et son mot dit qu’on a fini — pas qu’on renonce', async () => {
    await monter();
    expect(boutonPar(/^Terminé$/)).toBeDefined();
    await cliquer(boutonPar(/^Terminé$/));
    expect(fermetures).toBe(1);
  });

  /**
   * 🔴🔴 LOT ENVOI-ARRIERE-PLAN — ON NE TRANSPORTE PLUS LES OCTETS, SEULEMENT L'IDENTIFIANT.
   *
   * Ce test passait `joint` (le contenu en base64) et `origine`. Ce couple n'existe plus, et c'était le défaut :
   * le navigateur demandait les octets, le serveur les tirait du Drive, les renvoyait, le navigateur les
   * repoussait — trois allers-retours pendant lesquels l'écran était bloqué. Désormais un seul champ, `drive`,
   * et le serveur fait le reste en tâche de fond.
   */
  it('🔴 seul l’IDENTIFIANT Drive est transmis — jamais les octets', async () => {
    await monter();
    await cliquer(joindreDe('bail.pdf'));
    const c = choisis[0] as { drive?: { fichierId: string; nom: string; dossierId: string | null } };
    expect(c.drive?.fichierId).toBe('f1');
    expect(c.drive?.nom).toBe('bail.pdf');
    // À la racine il n'y a pas de dossier courant : on ne l'invente pas.
    expect(c.drive?.dossierId).toBeNull();
    // 🔴 AUCUN CONTENU NE TRANSITE : c'est ce qui rend le clic instantané.
    expect(JSON.stringify(c)).not.toContain('base64');
    expect(JSON.stringify(c)).not.toContain('contenu');
  });

  it('…et il porte le DOSSIER courant dès qu’on est entré quelque part', async () => {
    await monter();
    await ouvrirDossier('Artisans');
    await cliquer(joindreDe('bail.pdf'));
    const c = choisis[0] as { drive?: { dossierId: string | null; dossierNom: string | null } };
    expect(c.drive?.dossierId).toBe('d1');
    expect(c.drive?.dossierNom).toBe('Artisans');
  });

  /**
   * 🔴🔴 LE CONSTAT D'ARNO, MIS SOUS TEST : « après un clic sur Joindre, il faut attendre la fin du
   * téléchargement avant de pouvoir sélectionner une autre pièce ». On vérifie donc qu'un second « Joindre » est
   * cliquable ALORS QUE le premier n'a pas encore rendu sa réponse.
   */
  it('🔴🔴 le « Joindre » suivant est cliquable SANS attendre le précédent', async () => {
    let debloquer: () => void = () => {};
    const enCours = new Promise<void>((r) => { debloquer = r; });
    await act(async () => {
      root.render(createElement(SelecteurFichierDrive, {
        onChoisir: async (c: unknown) => { choisis.push(c); await enCours; },
        onFermer: () => { fermetures += 1; },
      } as never));
    });
    await calmer();

    // Le premier ajout reste EN VOL (sa promesse n'est pas résolue)…
    void joindreDe('bail.pdf')?.click();
    await calmer();
    // …et pourtant le second est là, actif, cliquable.
    const second = joindreDe('devis.pdf');
    expect(second).toBeDefined();
    expect(second?.disabled).toBe(false);
    await cliquer(second);
    expect(choisis).toHaveLength(2);
    debloquer();
  });

  /** 🔴 AUCUN SABLIER : demande d'Arno — « l'utilisateur ne doit jamais voir qu'une pièce se télécharge encore ». */
  it('🔴 aucun « Téléchargement… » ne s’affiche jamais', async () => {
    await monter();
    await cliquer(joindreDe('bail.pdf'));
    expect(container.textContent).not.toContain('Téléchargement');
  });

  /**
   * ⚠️ LA MARQUE EST OPTIMISTE, MAIS ELLE SE RETIRE. Une pièce refusée (dossier interdit, 25 Mo dépassés) qui
   * resterait marquée « ajoutée » ferait croire qu'elle est jointe alors qu'elle ne l'est pas.
   */
  it('🔴 un refus du serveur RETIRE la marque « ajouté » et dit pourquoi', async () => {
    await act(async () => {
      root.render(createElement(SelecteurFichierDrive, {
        onChoisir: async () => { throw new Error('Cette pièce ferait dépasser la limite.'); },
        onFermer: () => {},
      } as never));
    });
    await calmer();
    await cliquer(joindreDe('bail.pdf'));
    expect(container.textContent).toContain('ferait dépasser la limite');
    expect(joindreDe('bail.pdf')).toBeDefined();   // le bouton est revenu : on peut réessayer
  });
});

describe('🔴 ② pas de doublon', () => {
  it('🔴 un fichier déjà ajouté n’a plus de bouton « Joindre », mais une MENTION', async () => {
    await monter();
    await cliquer(joindreDe('bail.pdf'));
    expect(joindreDe('bail.pdf')).toBeUndefined();
    const li = [...container.querySelectorAll('.sfd-ligne')].find((x) => (x.textContent ?? '').includes('bail.pdf'));
    expect(li?.textContent).toContain('ajouté');
    // …et l'autre fichier reste joignable : on ne bloque pas toute la liste.
    expect(joindreDe('devis.pdf')).toBeDefined();
  });

  it('🔴 même en rappelant la fonction, la même pièce n’est pas envoyée deux fois', async () => {
    await monter();
    await cliquer(joindreDe('bail.pdf'));
    await cliquer(joindreDe('bail.pdf'));
    expect(choisis).toHaveLength(1);
  });
});

describe('③ le compteur dit ce qui a été fait', () => {
  it('il part de « aucune », et il compte au singulier puis au pluriel', async () => {
    await monter();
    expect(container.querySelector('.sfd-compteur')?.textContent).toContain('Aucune pièce ajoutée');
    await cliquer(joindreDe('bail.pdf'));
    expect(container.querySelector('.sfd-compteur')?.textContent).toContain('1 pièce ajoutée');
    await cliquer(joindreDe('devis.pdf'));
    expect(container.querySelector('.sfd-compteur')?.textContent).toContain('2 pièces ajoutées');
  });
});

describe('🔴🔴 ④ « Documents clients scannés » : pas de bouton, et le motif est écrit', () => {
  it('aucun « Joindre » n’est offert, et le lien reste — avec la raison', async () => {
    contenu = {
      ...contenu, joindreAutorise: false,
      motifRefus: 'Ce fichier est dans « Documents clients scannés » : son contenu n’est jamais lu.',
    };
    await monter();
    expect(joindreDe('bail.pdf')).toBeUndefined();
    expect(container.querySelector('.sfd-interdit')?.textContent).toContain('Documents clients scannés');
    expect(lienDe('bail.pdf')).toBeDefined();
  });

  /** 🔴 LA RECHERCHE PARCOURT TOUT LE DRIVE : on annonce le régime AVANT le clic, pas après le refus. */
  it('🔴 une recherche annonce que le droit se juge au moment de joindre', async () => {
    contenu = { ...contenu, recherche: true, joindreAutorise: true, motifRefus: null };
    await monter();
    const champ = await ouvrirLoupe();
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      set?.call(champ, 'bail');
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 320)); });
    await calmer();
    expect(container.querySelector('.sfd-interdit')?.textContent).toContain('vérifié au moment de joindre');
    expect(appels.some((u) => u.includes('recherche=bail'))).toBe(true);
  });
});

describe('🔴 ⑤ « Récents » sans la migration 269', () => {
  it('🔴 la section N’EXISTE PAS — une section vide se lirait comme une panne', async () => {
    recents = { etat: 'ok', disponible: false, lignes: [] };
    await monter();
    // 🔴 SANS LA MIGRATION, l'entrée n'existe pas dans la barre latérale — pas une liste vide.
    expect(lateraleDe(/Pièces récentes/)).toBeUndefined();
    expect(container.textContent).not.toContain('Récents');
    // …et tout le reste marche exactement comme avant.
    expect(joindreDe('bail.pdf')).toBeDefined();
  });

  it('avec la migration, elle s’affiche, le plus récent en premier, et dit ce que le clic fera', async () => {
    recents = {
      etat: 'ok', disponible: true,
      lignes: [
        { sorte: 'drive_dossier', cle: 'd9', libelle: 'MACJ', detail: null, tailleOctets: null },
        { sorte: 'drive_fichier', cle: 'f9', libelle: 'bail signé.pdf', detail: 'application/pdf', tailleOctets: 900 },
      ],
    };
    await monter();
    await cliquer(lateraleDe(/Pièces récentes/));
    const section = container.querySelector('.sfd-recents');
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain('MACJ');
    expect(section?.textContent).toContain('dossier — ouvrir');
    expect(section?.textContent).toContain('fichier — joindre');
  });

  it('un « récent » de type DOSSIER ouvre le dossier ; il ne joint rien', async () => {
    recents = {
      etat: 'ok', disponible: true,
      lignes: [{ sorte: 'drive_dossier', cle: 'd9', libelle: 'MACJ', detail: null, tailleOctets: null }],
    };
    await monter();
    await cliquer(lateraleDe(/Pièces récentes/));
    const b = [...(container.querySelector('.sfd-recents')?.querySelectorAll('button') ?? [])][0];
    await cliquer(b);
    expect(choisis).toHaveLength(0);
    expect(appels.some((u) => u.includes('dossier=d9'))).toBe(true);
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LOT DRIVE-DOSSIER-DU-BIEN — LE DOSSIER DU BIEN, EN PREMIÈRE POSITION.
 *
 * Demande d'Arno : « lorsqu'un mail est déjà relié à un bien, le drive doit nous emmener directement sur le dossier
 * du bien correspondant en proposition prioritaire (1re position) ».
 *
 * Ce qui est protégé ici :
 *   ① 🔴 LA LIGNE EST AU-DESSUS DE « RÉCENTS » — c'est l'entrée la plus sûre, la chercher sous une liste serait
 *      la perdre ;
 *   ② un clic OUVRE le dossier dans la MÊME fenêtre, qui ne se ferme pas ;
 *   ③ 🔴 MAIL SANS BIEN (message neuf sans classement, échange « Hors gestion ») ⇒ AUCUNE ligne, et rien ne change ;
 *   ④ aucune requête n'est même émise quand le mail n'a ni échange ni lot.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴🔴 LOT DRIVE-RACCOURCI-PAR-DESTINATAIRE — les vignettes de bien', () => {
  /**
   * ══ 🔴🔴 POURQUOI CE GROUPE A CHANGÉ DE FORME, ET CE QU'IL TIENT ENCORE ═══════════════════════════════════════
   *
   * Il s'appelait « LOT DRIVE-DOSSIER-DU-BIEN — la ligne prioritaire ». La route rendait alors des `dossiers`,
   * un par dossier de PROPRIÉTAIRE, et deux lots d'un même bailleur se groupaient sur UNE ligne (« 2 biens »)
   * parce qu'ils menaient au même endroit.
   *
   * 🔴 ARNO A RE-SPÉCIFIÉ LA CHOSE le 07/10/2026 : « Elle s'ouvre directement à la RACINE du dossier Drive du
   * bien (celui de “Dossier Drive” sur la fiche bien) […] une VIGNETTE par bien détecté […] Multi-biens : une
   * vignette “Dossier propriétaire — <nom>” en tête, puis une par bien. » Les lignes ne se groupent donc plus :
   * chaque bien a SON dossier, et il n'y a plus de ligne commune à deux logements. Les verdicts qui changent
   * ci-dessous changent pour CELA, et non parce qu'une mesure d'alors était fausse.
   *
   * 🔴 ET LE BIEN NE VIENT PLUS SEULEMENT DU RATTACHEMENT : il vient aussi du DESTINATAIRE. Les règles de
   * priorité se mesurent sur la vraie base (`raccourciDriveRepo.itest.ts`, les dix cas d'Arno) ; leur mise en
   * forme au pur (`raccourciDrive.test.ts`). Ici, on éprouve L'ÉCRAN : ce qu'on voit, et ce qu'un clic fait.
   */
  const vignette = (o: Record<string, unknown> = {}) => ({
    cle: 'bien:421', sorte: 'bien', titre: 'Dossier du bien — GARREAU Gabrielle',
    detail: '28 Avenue Marceau, 92400 Courbevoie — lot 421 · rattaché au mail',
    dossierId: 'd-421', dossierNom: 'lot 421', ...o,
  });
  const monterAvecBien = async (props: Record<string, unknown> = {}) => {
    await act(async () => {
      root.render(createElement(SelecteurFichierDrive, {
        onChoisir: (c: unknown) => { choisis.push(c); }, onFermer: () => { fermetures += 1; },
        filId: 101, ...props,
      } as never));
    });
    await calmer();
  };

  it('🔴 ① la vignette s’affiche, et AU-DESSUS de « Récents »', async () => {
    prioritaires = { etat: 'ok', vignettes: [vignette()] };
    recents = {
      etat: 'ok', disponible: true,
      lignes: [{ sorte: 'drive_dossier', cle: 'd9', libelle: 'MACJ', detail: null, tailleOctets: null }],
    };
    await monterAvecBien();
    const prio = lateraleDe(/Dossier du bien/);
    const rec = lateraleDe(/Pièces récentes/);
    expect(prio).not.toBeNull();
    expect(rec).not.toBeNull();
    /**
     * ⚠️ ON COMPARE LA POSITION DANS LE DOCUMENT, pas dans `innerHTML` : la feuille de style embarquée cite les
     * deux classes bien avant le contenu, et une comparaison de chaînes mesurerait l'ordre du CSS, jamais celui
     * des blocs à l'écran. Le premier jet de ce test s'y est laissé prendre.
     */
    expect(prio!.compareDocumentPosition(rec!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  /**
   * 🔴🔴 ELLE DIT LE NOM, L'ADRESSE, LE LOT **ET LA RAISON** — c'est le modèle qu'Arno a nommé, et la raison est
   * la nouveauté : on doit pouvoir répondre « pourquoi ce bien ? » sans ouvrir la fiche.
   */
  it('🔴🔴 elle NOMME le propriétaire, l’adresse, le lot et la RAISON', async () => {
    prioritaires = { etat: 'ok', vignettes: [vignette()] };
    await monterAvecBien();
    const bloc = lateraleDe(/Dossier du bien/);
    expect(bloc?.textContent).toContain('GARREAU Gabrielle');
    expect(bloc?.textContent).toContain('28 Avenue Marceau');
    expect(bloc?.textContent).toContain('lot 421');
    expect(bloc?.textContent).toContain('rattaché au mail');
  });

  it('🔴 ② un clic OUVRE le dossier du bien, et la fenêtre ne se ferme pas', async () => {
    prioritaires = { etat: 'ok', vignettes: [vignette()] };
    await monterAvecBien();
    await cliquer(lateraleDe(/Dossier du bien/));
    expect(appels.some((u) => u.includes('dossier=d-421'))).toBe(true);
    expect(fermetures).toBe(0);
    expect(container.querySelector('.sfd')).not.toBeNull();
  });

  /**
   * ══ 🔴🔴 VERDICT CHANGÉ — DEUX BIENS DU MÊME PROPRIÉTAIRE FONT MAINTENANT DEUX VIGNETTES ════════════════════
   *
   * Il tenait l'inverse (« UNE ligne, qui dit combien »), et c'était juste tant que les deux lots menaient au
   * MÊME dossier — celui du bailleur. Ils ne mènent plus au même : chaque bien a le sien, et une ligne commune
   * n'ouvrirait plus le bon endroit. La vignette de tête « Dossier propriétaire » reprend, elle, ce que l'ancienne
   * ligne unique disait : « propriétaire de N biens ».
   */
  it('🔴🔴 multi-biens : une vignette « Dossier propriétaire » en tête, puis une par bien', async () => {
    prioritaires = {
      etat: 'ok',
      vignettes: [
        { cle: 'proprietaire:d-p', sorte: 'proprietaire', titre: 'Dossier propriétaire — RD PROMOTION ET CIE',
          detail: 'propriétaire de 2 biens', dossierId: 'd-p', dossierNom: 'RD (335)' },
        vignette({ cle: 'bien:478', detail: '19 Rue Diderot — lot 478 · propriétaire de 2 biens', dossierId: 'd-478' }),
        vignette({ cle: 'bien:479', detail: '19 Rue Diderot — lot 479 · propriétaire de 2 biens', dossierId: 'd-479' }),
      ],
    };
    await monterAvecBien();
    expect(lateraleDe(/Dossier propriétaire/)?.textContent).toContain('propriétaire de 2 biens');
    const lignes = [...container.querySelectorAll('.sfd-cote-item')]
      .filter((b) => /Dossier du bien/.test(b.textContent ?? ''));
    expect(lignes).toHaveLength(2);
    expect(lignes[0].textContent).toContain('lot 478');
    expect(lignes[1].textContent).toContain('lot 479');
  });

  it('deux propriétaires : DEUX vignettes, dans l’ordre rendu par le serveur', async () => {
    prioritaires = {
      etat: 'ok',
      vignettes: [
        vignette({ cle: 'b:1', titre: 'Dossier du bien — ZOLA', detail: 'B1 · locataire', dossierId: 'd-a' }),
        vignette({ cle: 'b:2', titre: 'Dossier du bien — ABEL', detail: 'B2 · locataire', dossierId: 'd-b' }),
      ],
    };
    await monterAvecBien();
    const lignes = [...container.querySelectorAll('.sfd-cote-item')]
      .filter((b) => /Dossier du bien/.test(b.textContent ?? ''));
    expect(lignes).toHaveLength(2);
    expect(lignes[0].textContent).toContain('ZOLA');
    expect(lignes[1].textContent).toContain('ABEL');
  });

  /**
   * ══ 🔴🔴 LA FENÊTRE S'OUVRE DANS LE DOSSIER, SANS QU'ON CLIQUE ══════════════════════════════════════════════
   * « Elle s'ouvre directement à la RACINE du dossier Drive du bien » — c'est la première vignette.
   */
  it('🔴🔴 ③ la fenêtre s’ouvre d’elle-même sur la PREMIÈRE vignette', async () => {
    prioritaires = {
      etat: 'ok',
      vignettes: [
        { cle: 'proprietaire:d-p', sorte: 'proprietaire', titre: 'Dossier propriétaire — X',
          detail: 'propriétaire de 2 biens', dossierId: 'd-p', dossierNom: 'X (1)' },
        vignette({ dossierId: 'd-478' }),
      ],
    };
    await monterAvecBien();
    expect(appels.some((u) => u.includes('dossier=d-p'))).toBe(true);
  });

  /**
   * 🔴 ET LA VIGNETTE ACTIVE EST SURLIGNÉE. Sans ce repère, passer d'un bien à l'autre en un clic laisse sans
   * réponse la seule question qui compte — « lequel je regarde ? » —, surtout chez un bailleur dont les six lots
   * partagent une adresse.
   */
  it('🔴 la vignette du dossier où l’on est est SURLIGNÉE, et elle seule', async () => {
    prioritaires = {
      etat: 'ok',
      vignettes: [vignette({ cle: 'b:1', dossierId: 'd-1' }), vignette({ cle: 'b:2', dossierId: 'd-2' })],
    };
    await monterAvecBien();
    const actives = () => [...container.querySelectorAll('.sfd-cote-item--actif')];
    // L'ouverture automatique a posé la fenêtre sur la première : c'est elle qui porte le repère.
    expect(actives()).toHaveLength(1);
    expect(actives()[0].getAttribute('aria-current')).toBe('true');
    const lignes = [...container.querySelectorAll('.sfd-cote-item')]
      .filter((b) => /Dossier du bien/.test(b.textContent ?? ''));
    await cliquer(lignes[1] as HTMLElement);
    expect(actives()).toHaveLength(1);
  });

  /** 🔴 « Aucune correspondance : comportement actuel inchangé » — demande d'Arno. */
  it('🔴 ④ aucun bien ⇒ AUCUNE vignette, et le reste de la fenêtre est intact', async () => {
    prioritaires = { etat: 'ok', vignettes: [] };
    await monterAvecBien();
    expect(lateraleDe(/Dossier du bien/)).toBeUndefined();
    expect(container.textContent).not.toContain('Dossier du bien');
    // …et tout le reste marche comme avant.
    expect(joindreDe('bail.pdf')).toBeDefined();
    expect(boutonPar(/^Terminé$/)).toBeDefined();
  });

  it('🔴 ⑤ sans échange, sans lot NI destinataire, aucune requête n’est même émise', async () => {
    await monter();
    expect(appels.some((u) => u.includes('/dossier-du-bien'))).toBe(false);
    expect(lateraleDe(/Dossier du bien/)).toBeUndefined();
  });

  it('les lots choisis à l’écriture sont transmis, pour un message neuf sans échange', async () => {
    prioritaires = { etat: 'ok', vignettes: [vignette()] };
    await act(async () => {
      root.render(createElement(SelecteurFichierDrive, {
        onChoisir: () => {}, onFermer: () => {}, filId: null, lots: ['421', '494'],
      } as never));
    });
    await calmer();
    expect(appels.some((u) => u.includes('lots=421%2C494'))).toBe(true);
  });

  /**
   * ══ 🔴🔴 LE CHAMP « À » PART À LA ROUTE — la nouveauté de ce lot ════════════════════════════════════════════
   * Arno : « on prend la PREMIÈRE adresse destinataire (À) qui n'est pas une adresse de l'agence ». L'écran les
   * transmet dans l'ORDRE DE SAISIE ; c'est le serveur qui applique la priorité et écarte les nôtres.
   */
  it('🔴🔴 ⑥ les destinataires sont transmis, dans l’ordre, même sans échange ni lot', async () => {
    prioritaires = { etat: 'ok', vignettes: [vignette()] };
    await act(async () => {
      root.render(createElement(SelecteurFichierDrive, {
        onChoisir: () => {}, onFermer: () => {}, filId: null,
        adressesA: ['premier@client.fr', 'second@client.fr'],
      } as never));
    });
    await calmer();
    expect(appels.some((u) => u.includes('a=premier%40client.fr%2Csecond%40client.fr'))).toBe(true);
  });

  /**
   * ⚠️ ASSERTION RÉÉCRITE LE 29/09/2026 (lot DRIVE-FACON-FINDER), et la raison est un changement de NATURE.
   *
   * Elle exigeait que la ligne DISPARAISSE pendant une recherche : c'était juste tant qu'il s'agissait d'une
   * SUGGESTION posée en tête de liste. Ce n'est plus une suggestion : c'est une entrée de la BARRE LATÉRALE,
   * c'est-à-dire un raccourci permanent. Une barre latérale qui se vide quand on cherche ferait exactement ce
   * qu'Arno reproche à l'ancien navigateur : se comporter autrement que celui de Google.
   */
  it('🔴 elle RESTE pendant une recherche, et un clic ramène au dossier du bien', async () => {
    prioritaires = { etat: 'ok', vignettes: [vignette()] };
    await monterAvecBien();
    expect(lateraleDe(/Dossier du bien/)).toBeDefined();
    const champ = await ouvrirLoupe();
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      set?.call(champ, 'bail');
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 320)); });
    await calmer();
    expect(lateraleDe(/Dossier du bien/)).toBeDefined();
    const avant = appels.length;
    await cliquer(lateraleDe(/Dossier du bien/));
    expect(appels.slice(avant).some((u) => u.includes('dossier=d-421'))).toBe(true);
    expect((container.querySelector('.sfd-saisie') as HTMLInputElement | null)?.value ?? '').toBe('');
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LOT DRIVE-VISUALISER-ET-DOSSIERS — « VISUALISER », ET « + NOUVEAU DOSSIER ».
 *
 * Ce qui est protégé ici :
 *   ① 🔴🔴 « VISUALISER » NE FERME PAS LA NAVIGATION : même dossier, même recherche, même compteur, mêmes
 *      « ✓ ajouté » à la fermeture de l'aperçu. C'est la demande la plus précise d'Arno sur ce lot ;
 *   ② l'ordre des trois liens : Visualiser, puis Joindre, puis Insérer un lien ;
 *   ③ 🔴🔴 sous « Documents clients scannés », « Visualiser » N'EXISTE PAS — comme « Joindre » ;
 *   ④ un format sans aperçu le DIT, et propose quand même de joindre ;
 *   ⑤ 🔴 « + Nouveau dossier » : confirmation avec le CHEMIN COMPLET avant d'écrire, doublon refusé, et bouton
 *      DÉSACTIVÉ AVEC SON MOTIF tant que la migration 272 manque.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴🔴 ① « Visualiser » n’interrompt jamais la navigation', () => {
  /** ⚠️ RÉÉCRITE (lot DRIVE-FACON-FINDER) : « Visualiser » est une icône à infobulle, plus un lien de texte. */
  const visualiserDeIci = (nom: string) => gesteDe(nom, 'Visualiser');

  it('ouvre un aperçu PAR-DESSUS, sans démonter le sélecteur', async () => {
    await monter();
    await cliquer(visualiserDeIci('bail.pdf'));
    expect(container.querySelector('.apd')).not.toBeNull();
    // Le sélecteur est toujours là, entier : c'est CE point qui garantit « on revient au même endroit ».
    expect(container.querySelector('.sfd')).not.toBeNull();
    expect(container.textContent).toContain('devis.pdf');
    expect(fermetures).toBe(0);
  });

  it('🔴 à la fermeture : même dossier, même compteur, mêmes « ✓ ajouté »', async () => {
    await monter();
    // On entre dans un dossier, on joint une pièce — l'état à préserver.
    await ouvrirDossier('Artisans');
    await cliquer(joindreDe('bail.pdf'));
    const arianeAvant = container.querySelector('.sfd-ariane')?.textContent;
    const compteurAvant = container.querySelector('.sfd-compteur')?.textContent;
    const appelsAvant = appels.length;

    await cliquer(visualiserDeIci('devis.pdf'));
    await cliquer(container.querySelector('.apd-croix'));

    expect(container.querySelector('.apd')).toBeNull();
    expect(container.querySelector('.sfd-ariane')?.textContent).toBe(arianeAvant);
    expect(container.querySelector('.sfd-compteur')?.textContent).toBe(compteurAvant);
    expect(joindreDe('bail.pdf')).toBeUndefined();          // toujours marqué « ajouté »
    expect(container.textContent).toContain('ajouté');
    // 🔴 ET AUCUN RECHARGEMENT DU DOSSIER : on n'en était jamais parti. Seul l'aperçu a parlé au serveur.
    expect(appels.slice(appelsAvant).every((u) => u.includes('/drive/apercu'))).toBe(true);
  });

  /** Échap ferme l'APERÇU, et lui seul : une croix qui ferme deux fenêtres serait pire qu'une croix absente. */
  it('🔴 Échap ferme l’aperçu SANS fermer le sélecteur', async () => {
    await monter();
    await cliquer(visualiserDeIci('bail.pdf'));
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await calmer();
    expect(container.querySelector('.apd')).toBeNull();
    expect(container.querySelector('.sfd')).not.toBeNull();
    expect(fermetures).toBe(0);
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * 🔴🔴 LOT APERCU-RAPIDE — CE TEST A ÉTÉ RÉÉCRIT, ET IL FAUT DIRE POURQUOI.
   *
   * Il vérifiait qu'on RÉVOQUAIT le `blob:` de l'aperçu à la fermeture. Ce `blob:` n'existe plus : il imposait de
   * télécharger le fichier ENTIER en mémoire de la page avant d'afficher le premier pixel — jusqu'à 9 secondes pour
   * 2,8 Mo (mesuré le 29/09/2026). Le cadre pointe désormais sur la route, et le lecteur PDF affiche les premières
   * pages pendant que le reste arrive.
   *
   * ⚠️ LA PROPRIÉTÉ PROTÉGÉE EST LA MÊME, EN PLUS FORTE : rien du document ne s'accumule en mémoire de l'onglet.
   * Elle ne se vérifie plus par une révocation, mais par l'ABSENCE de toute URL d'objet.
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  it('🔒 aucun `blob:` n’est créé : les octets traversent, ils ne s’accumulent pas', async () => {
    await monter();
    await cliquer(visualiserDeIci('bail.pdf'));
    expect(urlsCreees).toBe(0);
    /**
     * ⚠️ LOT APERCU-PAGE1 — LE PDF N'EST PLUS DANS UN CADRE : il est lu par NOTRE lecteur, page par page. Le
     * cadre natif attendait le fichier entier puis décodait toutes les pages avant d'en peindre une (2 à 5 s
     * mesurées). La propriété protégée ici est la même, et elle vaut pour les deux : rien du document ne
     * s'accumule en mémoire de l'onglet, et aucune URL d'objet n'est fabriquée.
     */
    expect(container.querySelector('.lpd')).not.toBeNull();
    expect(container.querySelector('.apd-cadre')).toBeNull();
    await cliquer(container.querySelector('.apd-croix'));
    expect(urlsRevoquees).toBe(0);
  });

  /**
   * ⚠️ ASSERTION RÉÉCRITE LE 29/09/2026 (lot DRIVE-FACON-FINDER). Elle lisait le TEXTE de trois liens rouges ;
   * ce sont maintenant trois icônes discrètes, qui n'apparaissent qu'au survol — demande d'Arno. L'ORDRE, lui,
   * n'a pas changé d'un cran, et c'est lui qui dit l'usage : on REGARDE, puis on joint, puis — à défaut — on met
   * un lien. On le cherche donc par le MOT que chaque icône porte pour le lecteur d'écran.
   */
  /**
   * 🔴🔴 ET ILS SONT QUATRE DEPUIS LE 04/10/2026 (lot RENOMMER-PARTOUT-ET-FINITIONS, point 1a) : le crayon ✏️
   * ferme la barre. Il vient en DERNIER, et c'est volontaire — les trois premiers lisent ou citent, le quatrième
   * ÉCRIT dans le Drive. Cette assertion figeait trois gestes et a rougi : c'est elle qui avait vieilli.
   */
  it('② les quatre gestes sont dans l’ordre : Visualiser, Joindre, Insérer un lien, Renommer', async () => {
    await monter();
    const mots = [...(ligneDe('bail.pdf')?.querySelectorAll('.sfd-geste') ?? [])]
      .map((b) => b.getAttribute('title'));
    expect(mots).toEqual(['Visualiser', 'Joindre au message', 'Insérer un lien', 'Renommer']);
    // ⚠️ Et chacune porte AUSSI un libellé accessible nommant le fichier : une icône muette est injouable.
    const labels = [...(ligneDe('bail.pdf')?.querySelectorAll('.sfd-geste') ?? [])]
      .map((b) => b.getAttribute('aria-label'));
    expect(labels.every((l) => (l ?? '').includes('bail.pdf'))).toBe(true);
  });

  it('« Joindre » DANS l’aperçu ajoute la pièce, sans refermer la navigation', async () => {
    await monter();
    await cliquer(visualiserDeIci('bail.pdf'));
    await cliquer([...container.querySelectorAll('.apd button')]
      .find((b) => /Joindre ce fichier/.test(b.textContent ?? '')));
    expect(choisis).toHaveLength(1);
    expect((choisis[0] as { drive?: { fichierId: string } }).drive?.fichierId).toBe('f1');
    // L'aperçu reste ouvert et DIT que c'est ajouté : on peut continuer à regarder.
    expect(container.querySelector('.apd')?.textContent).toContain('ajouté');
    expect(fermetures).toBe(0);
  });

  it('🔴🔴 ③ sous « Documents clients scannés », « Visualiser » N’EXISTE PAS', async () => {
    contenu = {
      ...contenu, joindreAutorise: false,
      motifRefus: 'Ce fichier est dans « Documents clients scannés » : son contenu n’est jamais lu.',
    };
    await monter();
    expect(visualiserDeIci('bail.pdf')).toBeUndefined();
    expect(joindreDe('bail.pdf')).toBeUndefined();
    // Le motif est écrit, et le lien reste : la sortie est dite.
    expect(container.querySelector('.sfd-interdit')?.textContent).toContain('Documents clients scannés');
    expect(lienDe('bail.pdf')).toBeDefined();
  });

  it('④ un refus du serveur s’affiche EN FRANÇAIS dans l’aperçu, jamais en JSON brut', async () => {
    apercu = { ok: false, statut: 415, message: 'Aperçu indisponible pour ce type de fichier.' };
    await monter();
    await cliquer(visualiserDeIci('bail.pdf'));
    expect(container.querySelector('.apd-sans')?.textContent).toContain('Aperçu indisponible');
    expect(container.querySelector('.apd-cadre')).toBeNull();
    // Un FORMAT sans aperçu laisse la sortie ouverte : on peut toujours joindre.
    expect([...container.querySelectorAll('.apd button')]
      .some((b) => /Joindre ce fichier/.test(b.textContent ?? ''))).toBe(true);
  });

  /**
   * 🔴🔴 DÉFAUT TROUVÉ À L'ÉCRAN LE 28/09/2026, sur « 5_trois dernières quittances de loyer.pdf ».
   *
   * Dans des résultats de recherche, l'écran ne connaît pas l'emplacement des fichiers — ils viennent de tout le
   * Drive — donc il affiche les trois liens et c'est le SERVEUR qui tranche au clic. L'aperçu affichait bien le
   * refus (« son contenu n'est jamais lu »)… et proposait « Joindre ce fichier » juste en dessous. Deux lignes qui
   * se contredisent, et un clic que le serveur aurait refusé de toute façon.
   */
  it('🔴🔴 un refus par LA RÈGLE ne propose plus rien — pas même « Joindre »', async () => {
    apercu = {
      ok: false, statut: 403,
      message: 'Ce fichier est dans « Documents clients scannés » : son contenu n’est jamais lu. …',
    };
    await monter();
    await cliquer(visualiserDeIci('bail.pdf'));
    expect(container.querySelector('.apd-sans')?.textContent).toContain('Documents clients scannés');
    expect([...container.querySelectorAll('.apd button')]
      .some((b) => /Joindre ce fichier/.test(b.textContent ?? ''))).toBe(false);
    // …et l'on peut toujours refermer : un cul-de-sac sans porte serait pire que le refus.
    expect([...container.querySelectorAll('.apd button')]
      .some((b) => /Fermer l’aperçu/.test(b.textContent ?? ''))).toBe(true);
  });

  /** Un format hors liste blanche est tranché SANS appeler le serveur : on sait déjà la réponse. */
  it('④ un format sans aperçu le dit sans même interroger le serveur, et propose de joindre', async () => {
    contenu = {
      ...contenu,
      fichiers: [{
        id: 'z', nom: 'archive.zip', typeMime: 'application/zip', tailleOctets: 900,
        modifieLe: null, lien: 'https://drive.google.com/z', dossier: false,
      }],
    };
    await monter();
    const avant = appels.length;
    await cliquer(visualiserDeIci('archive.zip'));
    expect(container.querySelector('.apd-sans')?.textContent).toContain('Aperçu indisponible pour ce type de fichier');
    expect(appels.slice(avant).some((u) => u.includes('/drive/apercu'))).toBe(false);
    expect([...container.querySelectorAll('.apd button')]
      .some((b) => /Joindre ce fichier/.test(b.textContent ?? ''))).toBe(true);
  });
});

describe('🔴 ⑤ « + Nouveau dossier »', () => {
  const avecCreation = { ...{}, creerAutorise: true, motifCreation: null };
  const monterCreable = async () => {
    contenu = { ...contenu, ...avecCreation };
    await monter();
    // On entre dans un dossier : on ne crée pas à la racine du sélecteur, qui n'est pas un endroit du Drive.
    await ouvrirDossier('Artisans');
  };

  it('le bouton n’apparaît pas là où le serveur ne dit rien — le défaut, pour une ÉCRITURE, est « non »', async () => {
    await monter();
    expect(await nouveauDossier()).toBeUndefined();
  });

  /**
   * 🔴 SANS LA MIGRATION 272, LE BOUTON EST MONTRÉ MAIS DÉSACTIVÉ, AVEC SON MOTIF. C'est différent d'une règle qui
   * interdit : la fonction existe et attend quelque chose, et le dire évite qu'on la croie disparue.
   */
  it('🔴 sans la migration 272 : bouton DÉSACTIVÉ, motif écrit, et rien d’autre ne change', async () => {
    contenu = {
      ...contenu, creerAutorise: false,
      motifCreation: 'La création de dossiers attend une mise à jour de la base (272) : …',
    };
    await monter();
    const b = await nouveauDossier();
    expect(b).toBeDefined();
    expect(b?.disabled).toBe(true);
    expect(container.querySelector('.sfd-menu--outils')?.textContent).toContain('272');
    // …et tout le reste du sélecteur marche exactement comme avant.
    expect(joindreDe('bail.pdf')).toBeDefined();
    expect(boutonPar(/^Terminé$/)).toBeDefined();
  });

  /**
   * ══ ⚠️ CES TESTS ONT ÉTÉ RÉÉCRITS LE 29/09/2026 (lot DRIVE-RETOUCHES-1), ET IL FAUT DIRE CE QU'ON PERD ═══════
   *
   * Ils éprouvaient un FORMULAIRE en trois temps : saisir, « Continuer » (qui demandait au serveur le chemin
   * complet), lire ce chemin, puis « Créer ». La confirmation du chemin était la seule protection contre la faute
   * la plus probable : le bon nom, au mauvais endroit.
   *
   * Demande d'Arno : « supprime le formulaire actuel. À la place, “Nouveau dossier” insère immédiatement une ligne
   * de dossier en DERNIÈRE position du dossier affiché […] le nom est directement éditable dans la ligne. »
   *
   * 🔴 LA PROTECTION N'EST PAS ABANDONNÉE, ELLE CHANGE DE FORME : la ligne naît À SA PLACE, dans la liste du
   * dossier où elle sera créée, sous les yeux. On ne LIT plus un chemin, on le VOIT — et le chemin complet reste
   * en infobulle du champ, rendu par le serveur. Les tests ci-dessous vérifient les deux : l'endroit, et l'infobulle.
   */
  const ligneNeuve = () => container.querySelector('.sfd-ligne--neuve');
  const champNeuf = () => container.querySelector('.sfd-neuve-champ') as HTMLInputElement | null;
  const taper = async (v: string) => {
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      set?.call(champNeuf(), v);
      champNeuf()?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await calmer();
  };
  const touchePourLigne = async (key: string) => {
    await act(async () => {
      champNeuf()?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });
    await calmer();
  };

  it('🔴 la ligne naît DANS la liste, en dernière position, déjà éditable et pré-remplie', async () => {
    await monterCreable();
    await cliquer(await nouveauDossier());
    expect(ligneNeuve()).not.toBeNull();
    expect(champNeuf()?.value).toBe('Nouveau dossier');
    // 🔴 ELLE EST LA DERNIÈRE LIGNE : c'est là que le dossier apparaîtra.
    const lignes = [...container.querySelectorAll('.sfd-ligne')];
    expect(lignes[lignes.length - 1]).toBe(ligneNeuve());
    // 🔴 AUCUNE ÉCRITURE : ouvrir la ligne ne crée rien.
    expect(appels.filter((u) => u.startsWith('POST'))).toHaveLength(0);
  });

  /** 🔴 LE CHEMIN COMPLET RESTE, EN INFOBULLE, ET IL VIENT DU SERVEUR — c'est ce qui subsiste de la confirmation. */
  it('🔴🔴 le chemin complet du serveur reste lisible, en infobulle du champ', async () => {
    await monterCreable();
    await cliquer(await nouveauDossier());
    await calmer();
    expect(champNeuf()?.getAttribute('title')).toContain('Mon Drive › Artisans');
  });

  /**
   * 🔴🔴 ON TAPE UN NOM ENTIER, LETTRE PAR LETTRE, ET IL RESTE ENTIER.
   *
   * Défaut vu à l'écran, sur le vrai Drive : le champ est CONTRÔLÉ, donc chaque frappe provoque un rendu, donc
   * rappelle la référence qui sélectionnait le nom proposé. Le texte était resélectionné après CHAQUE lettre, et
   * la suivante l'écrasait : on tapait quarante caractères, il en restait un. Ce test frappe caractère par
   * caractère, comme une main — une saisie en un bloc ne l'aurait jamais attrapé.
   */
  it('🔴🔴 on tape lettre par lettre, et le nom entier reste', async () => {
    await monterCreable();
    await cliquer(await nouveauDossier());
    const mot = 'Travaux 2026';
    for (const lettre of mot) {
      await act(async () => {
        const champ = champNeuf() as HTMLInputElement;
        const debut = champ.selectionStart ?? champ.value.length;
        const fin = champ.selectionEnd ?? champ.value.length;
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        set?.call(champ, champ.value.slice(0, debut) + lettre + champ.value.slice(fin));
        champ.setSelectionRange(debut + 1, debut + 1);
        champ.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await calmer();
    }
    expect(champNeuf()?.value).toBe(mot);
  });

  it('Entrée crée, et la ligne disparaît', async () => {
    await monterCreable();
    await cliquer(await nouveauDossier());
    await taper('Travaux 2026');
    await touchePourLigne('Enter');
    expect(appels.some((u) => u.startsWith('POST') && u.includes('/drive/dossier'))).toBe(true);
    expect(ligneNeuve()).toBeNull();
    expect(container.querySelector('.sfd-creer-fait')?.textContent).toContain('Travaux 2026');
    expect(fermetures).toBe(0);
  });

  /** 🔴 ÉCHAP ABANDONNE : la ligne disparaît, rien n'est créé — et la FENÊTRE, elle, ne se ferme pas. */
  it('🔴 Échap fait disparaître la ligne sans rien créer, et ne ferme pas la fenêtre', async () => {
    await monterCreable();
    await cliquer(await nouveauDossier());
    await touchePourLigne('Escape');
    expect(ligneNeuve()).toBeNull();
    expect(appels.filter((u) => u.startsWith('POST'))).toHaveLength(0);
    expect(fermetures).toBe(0);
  });

  /** ⚠️ UN NOM VIDE EST UN ABANDON, PAS UNE ERREUR : on renonce sans rien dire. */
  it('un nom vide, validé, renonce sans rien créer ni rien reprocher', async () => {
    await monterCreable();
    await cliquer(await nouveauDossier());
    await taper('   ');
    await touchePourLigne('Enter');
    expect(ligneNeuve()).toBeNull();
    expect(appels.filter((u) => u.startsWith('POST'))).toHaveLength(0);
    expect(container.textContent).not.toContain('existe déjà');
  });

  /**
   * 🔴 UN DOUBLON LAISSE LA LIGNE EN ÉDITION, avec le message sous le champ (demande d'Arno). Le refus est
   * prononcé SANS appeler le serveur : les noms voisins sont déjà à l'écran, et faire un aller-retour pour
   * apprendre ce qu'on affiche serait payer une seconde pour un « non » certain.
   */
  it('🔴 un doublon garde la ligne en édition, avec son motif, et n’écrit rien', async () => {
    await monterCreable();
    await cliquer(await nouveauDossier());
    // ⚠️ Le double du serveur rend le MÊME contenu dans chaque dossier : « Artisans » y est donc déjà.
    await taper('Artisans');
    await touchePourLigne('Enter');
    expect(ligneNeuve()).not.toBeNull();
    expect(container.querySelector('.sfd-neuve-erreur')?.textContent).toContain('existe déjà');
    expect(appels.filter((u) => u.startsWith('POST'))).toHaveLength(0);
  });

  /**
   * ⚠️ NAVIGUER REFERME LA LIGNE EN COURS. Un nom tapé pour un dossier qui survivrait à l'entrée dans un autre
   * ferait créer au bon nom, au mauvais endroit — la faute que toute cette fonction cherche à empêcher.
   */
  it('changer de dossier ABANDONNE la ligne en cours', async () => {
    await monterCreable();
    await cliquer(await nouveauDossier());
    await cliquer([...container.querySelectorAll('.sfd-ariane button')][0]);   // retour à « Mon Drive »
    expect(ligneNeuve()).toBeNull();
    expect(appels.filter((u) => u.startsWith('POST'))).toHaveLength(0);
  });

  /** ⚠️ Un dossier créé mais non consigné : on le DIT. Supprimer pour « rattraper » est interdit dans ce lot. */
  it('dit franchement qu’un dossier créé n’a pas pu être consigné', async () => {
    await monterCreable();
    dossierNeuf = {
      ...dossierNeuf,
      post: {
        etat: 'ok', dossier: { id: 'dn', nom: 'Travaux 2026', lien: null }, journalise: false,
        message: 'Le dossier est créé, mais la ligne de journal n’a pas pu être écrite. Signalez-le : …',
      },
    };
    await cliquer(await nouveauDossier());
    await taper('Travaux 2026');
    await touchePourLigne('Enter');
    expect(container.querySelector('.sfd-creer-fait')?.textContent).toContain('journal');
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LOT APERCU-RAPIDE — NAVIGUER DANS L'APERÇU, ET NE PAS ATTENDRE.
 *
 * Ce qui est tenu ici, à l'écran monté pour de vrai :
 *   ① « ◀ Précédent » et « Suivant ▶ », leur compteur, et les flèches du clavier ;
 *   ② les extrémités GRISÉES — on ne boucle pas ;
 *   ③ « Joindre » depuis l'aperçu suit le document AFFICHÉ, et ne ferme pas l'aperçu ;
 *   ④ 🔒 AUCUN préchargement sous « Documents clients scannés » — ni au survol, ni par la navigation.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴 LOT APERCU-RAPIDE — « Précédent / Suivant » dans l’aperçu', () => {
  /** ⚠️ RÉÉCRITE (lot DRIVE-FACON-FINDER) : « Visualiser » est une icône à infobulle, plus un lien de texte. */
  const visualiserDeIci = (nom: string) => gesteDe(nom, 'Visualiser');
  const boutonNav = (m: RegExp) => [...container.querySelectorAll('.apd-nav button')]
    .find((b) => m.test(b.textContent ?? '')) as HTMLButtonElement | undefined;
  const fleche = async (key: string) => {
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });
    await calmer();
  };

  /** Trois PDF et une archive : l'archive doit être sautée, et ne pas compter. */
  const listeMelangee = () => {
    contenu = {
      ...contenu,
      fichiers: [
        fichier('f1', 'bail.pdf'),
        { ...fichier('zz', 'archive.zip'), typeMime: 'application/zip' },
        fichier('f2', 'devis.pdf'),
        fichier('f3', 'quittance.pdf'),
      ],
    };
  };

  it('① le compteur dit la position, et les flèches du clavier changent de document', async () => {
    listeMelangee();
    await monter();
    await cliquer(visualiserDeIci('bail.pdf'));
    expect(container.querySelector('.apd-compteur-n')?.textContent).toBe('1 / 3');
    expect(container.querySelector('.apd-compteur-nom')?.textContent).toBe('bail.pdf');

    await fleche('ArrowRight');
    expect(container.querySelector('.apd-compteur-n')?.textContent).toBe('2 / 3');
    expect(container.querySelector('.apd-compteur-nom')?.textContent).toBe('devis.pdf');

    await fleche('ArrowLeft');
    expect(container.querySelector('.apd-compteur-n')?.textContent).toBe('1 / 3');
  });

  it('① les BOUTONS font la même chose que les flèches', async () => {
    listeMelangee();
    await monter();
    await cliquer(visualiserDeIci('bail.pdf'));
    await cliquer(boutonNav(/Suivant/));
    expect(container.querySelector('.apd-compteur-nom')?.textContent).toBe('devis.pdf');
    await cliquer(boutonNav(/Précédent/));
    expect(container.querySelector('.apd-compteur-nom')?.textContent).toBe('bail.pdf');
  });

  /** 🔴 L'archive n'est ni comptée, ni traversée : « Suivant » passe de devis.pdf à quittance.pdf. */
  it('🔴 les fichiers non visualisables sont SAUTÉS, et ne comptent pas', async () => {
    listeMelangee();
    await monter();
    await cliquer(visualiserDeIci('bail.pdf'));
    await fleche('ArrowRight');
    await fleche('ArrowRight');
    expect(container.querySelector('.apd-compteur-n')?.textContent).toBe('3 / 3');
    expect(container.querySelector('.apd-compteur-nom')?.textContent).toBe('quittance.pdf');
    // Et « archive.zip » n'a jamais été affichée.
    expect(container.querySelector('.apd')?.textContent).not.toContain('archive.zip');
  });

  it('🔴 ② aux extrémités, le bouton correspondant est GRISÉ — on ne boucle pas', async () => {
    listeMelangee();
    await monter();
    await cliquer(visualiserDeIci('bail.pdf'));
    expect(boutonNav(/Précédent/)?.disabled).toBe(true);
    expect(boutonNav(/Suivant/)?.disabled).toBe(false);

    await fleche('ArrowRight');
    await fleche('ArrowRight');
    expect(boutonNav(/Suivant/)?.disabled).toBe(true);
    expect(boutonNav(/Précédent/)?.disabled).toBe(false);
    // Une flèche de plus ne fait RIEN : elle ne ramène pas au premier.
    await fleche('ArrowRight');
    expect(container.querySelector('.apd-compteur-nom')?.textContent).toBe('quittance.pdf');
  });

  /** Un document seul ne mérite pas deux boutons éteints et un « 1 / 1 » qui n'apprend rien. */
  it('la navigation n’apparaît pas quand il n’y a qu’un document', async () => {
    contenu = { ...contenu, fichiers: [fichier('f1', 'bail.pdf')] };
    await monter();
    await cliquer(visualiserDeIci('bail.pdf'));
    expect(container.querySelector('.apd')).not.toBeNull();
    expect(container.querySelector('.apd-nav')).toBeNull();
  });

  it('🔴 ③ « Joindre » depuis l’aperçu suit le document AFFICHÉ, et ne ferme pas l’aperçu', async () => {
    listeMelangee();
    await monter();
    await cliquer(visualiserDeIci('bail.pdf'));
    await fleche('ArrowRight');   // on est sur devis.pdf
    await cliquer([...container.querySelectorAll('.apd button')]
      .find((b) => /Joindre ce fichier/.test(b.textContent ?? '')));
    expect((choisis[0] as { drive?: { fichierId: string; nom: string } }).drive)
      .toMatchObject({ fichierId: 'f2', nom: 'devis.pdf' });
    // L'aperçu reste ouvert et DIT que c'est ajouté ; le sélecteur n'a pas bougé non plus.
    expect(container.querySelector('.apd')).not.toBeNull();
    expect(container.querySelector('.apd-pied')?.textContent).toContain('ajouté');
    expect(fermetures).toBe(0);
  });

  /** ⑤ Le « ✓ ajouté » suit le document affiché : revenir au précédent, non joint, rend le bouton. */
  it('③ le « ✓ ajouté » suit le document, pas la fenêtre', async () => {
    listeMelangee();
    await monter();
    await cliquer(visualiserDeIci('bail.pdf'));
    await fleche('ArrowRight');
    await cliquer([...container.querySelectorAll('.apd button')]
      .find((b) => /Joindre ce fichier/.test(b.textContent ?? '')));
    expect(container.querySelector('.apd-pied')?.textContent).toContain('ajouté');
    await fleche('ArrowLeft');   // retour sur bail.pdf, qui n'est pas joint
    expect([...container.querySelectorAll('.apd button')]
      .some((b) => /Joindre ce fichier/.test(b.textContent ?? ''))).toBe(true);
  });

  /** ⑥ La fermeture ramène la liste EXACTEMENT comme avant — c'est la promesse du lot précédent, toujours tenue. */
  it('la fermeture ramène le même dossier, le même compteur et les mêmes « ✓ ajouté »', async () => {
    listeMelangee();
    await monter();
    await cliquer(joindreDe('bail.pdf'));
    const compteurAvant = container.querySelector('.sfd-compteur')?.textContent;
    await cliquer(visualiserDeIci('devis.pdf'));
    await fleche('ArrowRight');
    await cliquer(container.querySelector('.apd-croix'));
    expect(container.querySelector('.apd')).toBeNull();
    expect(container.querySelector('.sfd-compteur')?.textContent).toBe(compteurAvant);
    expect(joindreDe('bail.pdf')).toBeUndefined();          // toujours marqué « ajouté »
    expect(container.textContent).toContain('devis.pdf');
  });
});

describe('🔒 LOT APERCU-RAPIDE — aucun préchargement là où la lecture est refusée', () => {
  /**
   * 🔒 SOUS « DOCUMENTS CLIENTS SCANNÉS », il n'y a ni lien « Visualiser », ni survol qui amorce quoi que ce soit.
   * La règle est tenue par la route ; ici on vérifie que l'écran ne va même pas frapper à la porte — un
   * préchargement massif sur l'archive serait une lecture de masse, même refusée.
   */
  it('🔒 ni « Visualiser », ni aucun appel d’aperçu au survol', async () => {
    contenu = {
      ...contenu, joindreAutorise: false,
      motifRefus: 'Ce fichier est dans « Documents clients scannés » : son contenu n’est jamais lu.',
    };
    await monter();
    const li = [...container.querySelectorAll('.sfd-ligne')].find((x) => (x.textContent ?? '').includes('bail.pdf'));
    expect([...(li?.querySelectorAll('button') ?? [])]
      .some((b) => /^Visualiser$/.test((b.textContent ?? '').trim()))).toBe(false);

    const avant = appels.length;
    await act(async () => { li?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    await calmer();
    expect(appels.slice(avant).some((u) => u.includes('/drive/apercu'))).toBe(false);
  });

  /** ⚠️ Et un type sans aperçu n'est pas amorcé non plus : on connaît déjà la réponse. */
  it('un format hors liste blanche n’est jamais préchargé', async () => {
    contenu = {
      ...contenu,
      fichiers: [{ ...fichier('zz', 'archive.zip'), typeMime: 'application/zip' }],
    };
    await monter();
    const avant = appels.length;
    const li = container.querySelector('.sfd-ligne');
    await act(async () => { li?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    await calmer();
    expect(appels.slice(avant).some((u) => u.includes('/drive/apercu'))).toBe(false);
  });
});
