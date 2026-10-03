// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RattachementsDuFil } from './RattachementsDuFil';
import {
  MOT_DRIVE_ABSENT, MOT_DRIVE_DU_BIEN, MOT_HISTORIQUE_DU_BIEN,
} from '../../../../lib/gestion/ficheRattachement';

/**
 * ══ 🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 4 — LES DEUX GRANDS BOUTONS, MONTÉS POUR DE VRAI ═══════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « sur chaque carte de bien, à la place de la ligne “Ouvrir le dossier du bien ↗ — dans
 * Google Drive, en lecture”, DEUX boutons rouges allongés côte à côte, remplissant ensemble la largeur de la carte :
 *   a) “Ouvrir le Drive du bien” — ouvre NOTRE outil Drive, positionné directement dans le dossier Drive du bien
 *      (arbre déplié jusqu'à lui). Sous “Documents clients scannés” : consultation seule, aucune écriture possible
 *      (gardes existantes, refus serveur). Si le bien n'a pas de dossier connu : bouton grisé “Dossier Drive non
 *      renseigné”.
 *   b) “Historique du bien” — ouvre la fiche du bien avec son historique (“Vie du bien”), dans l'application. La
 *      flèche retour revient à la fenêtre ou au mail d'origine (règle existante). »
 *
 * ═══ CE QUE CE FICHIER PROTÈGE ════════════════════════════════════════════════════════════════════════════════════
 *   ① les deux boutons sont SUR LA CARTE, tous les deux, et l'ancienne ligne n'y est plus ;
 *   ② sans dossier connu, le premier est ÉTEINT et DIT ce qui manque — il n'ouvre rien ;
 *   ③ avec un dossier, le clic ouvre NOTRE fenêtre Drive, et elle DEMANDE CE DOSSIER-LÀ au serveur ;
 *   ④ « Historique du bien » mène à la fiche du bien, par son identifiant INTERNE — jamais par le n° de lot ;
 *   ⑤ la fenêtre Drive remplace la boîte de dialogue, et la fermer ramène la fenêtre des biens.
 *
 * 🔒 AUCUNE DONNÉE RÉELLE, AUCUNE ÉCRITURE : un fil inventé, des lots inventés, `fetch` simulé.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MAIL = 9001;
/** Le dossier Drive du premier bien. Inventé, et c'est lui qu'on doit retrouver dans la requête de listing. */
const DOSSIER = 'DOSSIER-INVENTE-484';

/**
 * 🔴 DEUX BIENS, ET LA DIFFÉRENCE EST VOULUE : l'un a son dossier Drive, l'autre non. C'est la seule façon
 * d'éprouver les DEUX états du premier bouton dans le même rendu.
 */
const FICHE = {
  filId: 11, objet: 'Devis ascenseur', nbMailsDuFil: 2, horsGestion: false, messageRecentId: MAIL,
  enTete: {
    messageId: MAIL, de: 'personne.inventee@exemple.test', deNom: 'Personne Inventée',
    recuLe: '2026-10-02T09:00:00Z', objet: 'Devis ascenseur',
  },
  disponible: true,
  biens: [
    {
      cle: '484', lotId: 7, adresseComplete: '2 rue Fictive, 92400 VILLE-TEST', numeroLot: '484',
      nature: 'Appartement', typeBien: 'Type 2', surfaceM2: null, statut: 'classe',
      dateMail: '2026-10-02', nbMails: 1, dossierDriveId: DOSSIER, lienIds: [100], personnes: [],
    },
    {
      cle: '902', lotId: 8, adresseComplete: '4 rue Inventée, 92400 VILLE-TEST', numeroLot: '902',
      nature: null, typeBien: null, surfaceM2: null, statut: 'classe',
      dateMail: '2026-10-02', nbMails: 1, dossierDriveId: null, lienIds: [200], personnes: [],
    },
  ],
};
const lien = (id: number) => ({
  id, messageId: MAIL, pieceId: null, cible: { sorte: 'lot', cle: `c${id}`, id },
  libelle: `lien ${id}`, origine: 'manuel', statut: 'confirme', confiance: null, regle: null,
  motif: null, adresses: [], parUnHumain: true, creeLe: null, creePar: null, statutLe: null, statutPar: null,
});
const LIENS = [lien(100), lien(200)];

let container: HTMLDivElement;
let root: Root;
let lectures: string[];
let ecritures: string[];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  lectures = []; ecritures = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if ((init?.method ?? 'GET') !== 'GET') { ecritures.push(u); return { ok: true, json: async () => ({ ok: true }) } as unknown as Response; }
    lectures.push(u);
    if (u.includes('rattachements?fiche=')) {
      return { ok: true, json: async () => ({ etat: 'ok', data: FICHE }) } as unknown as Response;
    }
    if (u.includes('rattachements?fil=')) {
      return { ok: true, json: async () => ({ etat: 'ok', data: LIENS }) } as unknown as Response;
    }
    /**
     * 🔒 LE DOSSIER EST REFUSÉ EN LECTURE, exprès : c'est le cas « Documents clients scannés ». On éprouve ainsi
     * que la fenêtre n'accorde RIEN d'elle-même — elle affiche ce que le serveur répond.
     */
    if (u.includes('drive/fichiers')) {
      return { ok: true, json: async () => ({
        etat: 'ok', fichiers: [], joindreAutorise: false, creerAutorise: false,
        motifRefus: 'Sous « Documents clients scannés » : consultation seule.',
        motifCreation: 'Aucune création dans l’archive.',
        chaine: [{ id: 'RACINE', nom: 'Documents clients scannés' }, { id: DOSSIER, nom: '2 rue Fictive — lot 484' }],
      }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({ etat: 'ok' }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 14; i++) await Promise.resolve(); }); };
const monter = async () => {
  await act(async () => {
    root.render(createElement(RattachementsDuFil, {
      filId: 11, titre: 'Devis ascenseur', messageId: MAIL, onFerme: () => {}, onGeste: () => {},
    } as never));
  });
  await calmer();
};
const cliquer = async (e: Element) => {
  await act(async () => { e.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await calmer();
};
const cartes = () => [...container.querySelectorAll('.rdf-item')];
const dialogue = () => container.querySelector('[role="dialog"]')?.textContent ?? '';

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 LES DEUX BOUTONS, SUR CHAQUE CARTE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① deux boutons par carte, et l’ancienne ligne n’y est plus', () => {
  it('🔴🔴 chaque carte porte ses deux boutons, côte à côte', async () => {
    await monter();
    expect(cartes()).toHaveLength(2);
    for (const carte of cartes()) {
      const paire = carte.querySelector('.rdf-raccourcis');
      expect(paire, carte.getAttribute('aria-label') ?? '').not.toBeNull();
      /* 🔴 DEUX, ET DEUX SEULEMENT : un bouton (ou un lien) par chemin, dans le même conteneur. */
      expect(paire?.querySelectorAll('.rdf-raccourci')).toHaveLength(2);
      expect(paire?.textContent).toContain(MOT_HISTORIQUE_DU_BIEN);
    }
  });

  /** 🔴 « À LA PLACE DE » (Arno) : la ligne vers Google Drive a disparu de l'écran, pas seulement du code. */
  it('🔴🔴 « Ouvrir le dossier du bien — dans Google Drive, en lecture » a disparu', async () => {
    await monter();
    expect(dialogue()).not.toContain('Ouvrir le dossier du bien');
    expect(dialogue()).not.toContain('dans Google Drive, en lecture');
    /* ⚠️ ET PLUS AUCUN LIEN SORTANT VERS GOOGLE depuis une carte : c'est tout l'objet du point 4 a). */
    const vers = [...container.querySelectorAll('.rdf-item a')]
      .map((a) => a.getAttribute('href') ?? '');
    expect(vers.filter((h) => h.includes('drive.google.com'))).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 SANS DOSSIER CONNU : LE BOUTON S'ÉTEINT, ET IL LE DIT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② « Dossier Drive non renseigné »', () => {
  it('🔴🔴 le bien sans dossier porte un bouton éteint qui nomme ce qui manque', async () => {
    await monter();
    const sans = cartes()[1];
    const b = [...sans.querySelectorAll('button.rdf-raccourci')]
      .find((x) => (x.textContent ?? '').includes(MOT_DRIVE_ABSENT)) as HTMLButtonElement | undefined;
    expect(b).toBeDefined();
    expect(b?.disabled).toBe(true);
    /* 🔴 LE MOT EST ÉCRIT, et la même phrase sert la bulle et le lecteur d'écran : un bouton gris muet se lit
       comme une panne, alors qu'il s'agit d'une donnée absente de l'annuaire. */
    expect(b?.getAttribute('aria-label') ?? '').toContain('Aucun dossier Drive');
    expect(b?.getAttribute('title') ?? '').toContain('Aucun dossier Drive');
    /* ⚠️ ET IL N'OUVRE RIEN : cliquer un bouton éteint ne doit pas demander de listing. */
    await cliquer(b as Element);
    expect(lectures.some((u) => u.includes('drive/fichiers'))).toBe(false);
  });

  /** 🔴 L'AUTRE CARTE, ELLE, EST ACTIVE : l'extinction est une réponse au cas, pas un état global. */
  it('🔴 le bien qui a son dossier porte un bouton ACTIF', async () => {
    await monter();
    const b = [...cartes()[0].querySelectorAll('button.rdf-raccourci')]
      .find((x) => (x.textContent ?? '').includes(MOT_DRIVE_DU_BIEN)) as HTMLButtonElement | undefined;
    expect(b).toBeDefined();
    expect(b?.disabled).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 LE CLIC OUVRE NOTRE OUTIL DRIVE, SUR CE DOSSIER-LÀ
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ « Ouvrir le Drive du bien »', () => {
  const ouvrir = async () => {
    await monter();
    const b = [...cartes()[0].querySelectorAll('button.rdf-raccourci')]
      .find((x) => (x.textContent ?? '').includes(MOT_DRIVE_DU_BIEN));
    await cliquer(b as Element);
  };

  it('🔴🔴 c’est NOTRE fenêtre Drive, et elle demande LE dossier du bien', async () => {
    await ouvrir();
    /* 🔴 LE MÊME COMPOSANT QUE PARTOUT AILLEURS : `.sfd` est la fenêtre Drive, pas une copie locale. */
    expect(container.querySelector('.sfd')).not.toBeNull();
    /* 🔴🔴 « POSITIONNÉE DIRECTEMENT DANS LE DOSSIER DRIVE DU BIEN » (Arno) : le premier listing porte son
       identifiant. Sans cela la fenêtre s'ouvrirait à la racine, et il faudrait treize clics pour descendre. */
    expect(lectures.some((u) => u.includes(`drive/fichiers?dossier=${DOSSIER}`))).toBe(true);
    /* 🔴 ET L'ARBRE EST DÉPLIÉ JUSQU'À LUI : le fil d'Ariane rendu par le serveur nomme ses parents. */
    expect(container.querySelector('.sfd')?.textContent ?? '').toContain('Documents clients scannés');
  });

  /**
   * 🔴🔴 UNE SEULE BOÎTE DE DIALOGUE À LA FOIS. Deux modales empilées sont injouables au clavier, et un lecteur
   * d'écran ne sait plus laquelle est active : la fenêtre Drive PREND LA PLACE, comme « Modifier ce
   * rattachement… » le fait depuis le lot BARRE-STATUT.
   */
  it('🔴🔴 elle remplace la fenêtre des biens, et la fermer la ramène', async () => {
    await ouvrir();
    expect(cartes()).toHaveLength(0);
    const termine = [...container.querySelectorAll('button')]
      .find((b) => (b.textContent ?? '').trim() === 'Terminé');
    await cliquer(termine as Element);
    expect(cartes()).toHaveLength(2);
    expect(container.querySelector('.sfd')).toBeNull();
  });

  /**
   * 🔒 LA CONSULTATION SEULE SOUS « Documents clients scannés » EST CELLE DU SERVEUR, ET RIEN D'AUTRE. Le faux
   * serveur de ce fichier refuse la lecture du contenu et la création ; l'écran doit le DIRE et ne proposer
   * aucune écriture. On n'éprouve pas ici un drapeau d'écran — il n'y en a pas, et c'est le point.
   */
  it('🔒 le refus de l’archive est affiché, et rien n’est écrit', async () => {
    await ouvrir();
    const sfd = container.querySelector('.sfd')?.textContent ?? '';
    expect(sfd).toContain('consultation seule');
    /* 🔴 AUCUNE ÉCRITURE N'A PARTI : ouvrir un dossier ne crée rien, ne déplace rien, ne dépose rien. */
    expect(ecritures).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ 🔴🔴 « HISTORIQUE DU BIEN » — LA FICHE, PAR SON IDENTIFIANT INTERNE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ④ « Historique du bien »', () => {
  it('🔴🔴 il mène à la fiche du bien, sur « Vie du bien »', async () => {
    await monter();
    const a = [...cartes()[0].querySelectorAll('a.rdf-raccourci')][0] as HTMLAnchorElement;
    expect(a.textContent).toContain(MOT_HISTORIQUE_DU_BIEN);
    expect(a.getAttribute('href')).toBe('/admin/gestion?ecran=annuaire&fiche=lot-7');
  });

  /**
   * 🔴🔴 PAR L'IDENTIFIANT INTERNE, JAMAIS PAR LE N° DE LOT. Le bien de cette carte porte le lot « 484 » et vit
   * sur la ligne nº 7 : confondre les deux ouvrirait la fiche d'un autre bien, et cette carte est faite pour que
   * l'erreur se voie.
   */
  it('🔴🔴 le n° de lot n’apparaît PAS dans l’adresse', async () => {
    await monter();
    const liens = [...container.querySelectorAll('a.rdf-raccourci')].map((a) => a.getAttribute('href') ?? '');
    expect(liens).toEqual(['/admin/gestion?ecran=annuaire&fiche=lot-7', '/admin/gestion?ecran=annuaire&fiche=lot-8']);
    expect(liens.some((h) => h.includes('lot-484'))).toBe(false);
  });

  /**
   * 🔴 UNE NAVIGATION ORDINAIRE, DANS LE MÊME ONGLET. C'est ce qui fait tenir « la flèche retour revient à la
   * fenêtre ou au mail d'origine » : le mail vit dans l'adresse depuis le lot 5-FUSION, donc « Précédent » y
   * ramène. Un `target="_blank"` aurait ouvert un onglet dont la flèche retour ne mène nulle part.
   */
  it('🔴🔴 même onglet : la flèche retour doit pouvoir revenir', async () => {
    await monter();
    for (const a of container.querySelectorAll('a.rdf-raccourci')) {
      expect(a.getAttribute('target')).toBeNull();
    }
  });
});
