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
let appels: string[];

const fichier = (id: string, nom: string, dossier = false) => ({
  id, nom, typeMime: dossier ? 'application/vnd.google-apps.folder' : 'application/pdf',
  tailleOctets: dossier ? null : 2048, modifieLe: null, lien: `https://drive.google.com/${id}`, dossier,
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  choisis = []; fermetures = 0; appels = [];
  contenu = {
    etat: 'ok', joindreAutorise: true, motifRefus: null,
    fichiers: [fichier('d1', 'Artisans', true), fichier('f1', 'bail.pdf'), fichier('f2', 'devis.pdf')],
  };
  recents = { etat: 'ok', disponible: false, lignes: [] };
  global.fetch = vi.fn(async (url: string | URL) => {
    const u = String(url);
    appels.push(u);
    if (u.includes('/pieces-recentes')) return { ok: true, json: async () => recents } as unknown as Response;
    if (u.includes('contenu=1')) {
      return { ok: true, json: async () => ({ etat: 'ok', contenuBase64: 'AAAA' }) } as unknown as Response;
    }
    return { ok: true, json: async () => contenu } as unknown as Response;
  }) as unknown as typeof fetch;
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
const joindreDe = (nom: string) => {
  const li = [...container.querySelectorAll('.sfd-item')].find((x) => (x.textContent ?? '').includes(nom));
  return [...(li?.querySelectorAll('button') ?? [])].find((b) => /^Joindre$/.test((b.textContent ?? '').trim()));
};

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
    const avant = [...container.querySelectorAll('.sfd-item')].map((x) => x.textContent);
    await cliquer(joindreDe('bail.pdf'));
    const apres = [...container.querySelectorAll('.sfd-item')].map((x) => x.textContent);
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
    await cliquer([...container.querySelectorAll('.sfd-dossier')].find((b) => /Artisans/.test(b.textContent ?? '')));
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
    const li = [...container.querySelectorAll('.sfd-item')].find((x) => (x.textContent ?? '').includes('bail.pdf'));
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
    expect(boutonPar(/Insérer un lien/)).toBeDefined();
  });

  /** 🔴 LA RECHERCHE PARCOURT TOUT LE DRIVE : on annonce le régime AVANT le clic, pas après le refus. */
  it('🔴 une recherche annonce que le droit se juge au moment de joindre', async () => {
    contenu = { ...contenu, recherche: true, joindreAutorise: true, motifRefus: null };
    await monter();
    const champ = container.querySelector('.sfd-saisie') as HTMLInputElement;
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
    expect(container.querySelector('.sfd-recents')).toBeNull();
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
    const b = [...(container.querySelector('.sfd-recents')?.querySelectorAll('button') ?? [])][0];
    await cliquer(b);
    expect(choisis).toHaveLength(0);
    expect(appels.some((u) => u.includes('dossier=d9'))).toBe(true);
  });
});
