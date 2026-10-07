// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CarteVive } from './CarteVive';
import type { CarteEvenement } from '../../../../lib/gestion/fileRepo';

/**
 * ══ 🔴🔴 LOT CARTE-EVENEMENT-EPUREE — CE QUE LA CARTE D'UN ÉVÉNEMENT MONTRE, ET CE QU'ELLE NE MONTRE PLUS ════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ACCORD D'ARNO (07/10/2026), sur la carte de l'événement « Re: NOTE INFORMATION RESIDENCE DE L'ORNE… »
 * (GES-2026-000001), écran partagé — et sur la MÊME carte en plein écran, puisque c'est le même composant :
 *
 *   ① la RÉFÉRENCE (« GES-2026-000001 ») et l'ÉTAT (« En cours ») quittent la carte. Ils restent ailleurs ;
 *   ② le TYPE (Travaux / Fuite d'eau / Administratif / Litige) prend leur place. Pas de type ⇒ rien ;
 *   ③ la capsule verte MONGA passe JUSTE SOUS la vignette de droite et dit la DERNIÈRE ÉTAPE MONGA ;
 *   ④ l'adresse sous le gros bouton rouge disparaît (doublon de la carte au-dessus) ;
 *   ⑤ « dernier échange il y a N jours » ne s'écrit plus qu'UNE fois ;
 *   ⑥ l'adresse perd le « lot N — » qui la précédait.
 *
 * 🔒 Aucun réseau : `fetch` est doublé. Aucune base. Et aucun mail ni événement RÉEL n'est touché — ce fichier
 * monte le composant sur des cartes fabriquées.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MAINTENANT = new Date('2026-10-07T12:00:00Z');

/** La carte d'Arno, telle que la base la rend : ouverte le 23/09, dernier échange le 30/09, un bien, pas de type. */
const CARTE = (o: Partial<CarteEvenement> = {}): CarteEvenement => ({
  evenementId: 1, reference: 'GES-2026-000001',
  objet: 'Re: NOTE INFORMATION RESIDENCE DE L’ORNE - CHANGEMENT',
  demandeur: 'Sarah MEZIANE', adresseLibre: null, etat: 'en_cours',
  ouvertLe: '2026-09-23T20:23:23Z', dernierEchangeLe: '2026-09-30T10:00:00Z',
  nbFils: 1, nbMailsDeplaces: 0, attend: false,
  derniereEtape: {
    type: 'intervention', titre: null, survenuLe: '2026-10-13T00:00:00Z',
    heureConnue: false, source: 'manuelle', certitude: 'fiable',
  },
  derniereEtapeMonga: null,
  mongaMajLe: null, vuLe: null, mongaRefs: [],
  categorie: null,
  bien: {
    cle: '315', adresse: '67 rue de Normandie', commune: 'COURBEVOIE',
    proprietaire: null, locataire: null,
  },
  nbBiens: 1,
  ...o,
});

let container: HTMLDivElement;
let root: Root;
/** Ce que la route du détail rend quand la carte est dépliée. Piloté par le test. */
let biensServis: { cle: string; adresse: string | null; commune: string | null }[];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  biensServis = [{ cle: '315', adresse: '67 rue de Normandie', commune: 'COURBEVOIE' }];
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (/\/evenements\/\d+$/.test(u)) {
      return {
        ok: true, status: 200,
        json: async () => ({
          evenementId: 1, reference: 'GES-2026-000001', objet: 'Re: NOTE INFORMATION',
          demandeurNom: 'Sarah MEZIANE', demandeurEmail: null, adresseLibre: null, etat: 'en_cours',
          ouvertLe: '2026-09-23T20:23:23Z', ouvertPar: 'arno', traiteLe: null, traitePar: null,
          fils: [], mailsDeplaces: [], biens: biensServis,
        }),
      } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
const monter = async (carte: CarteEvenement, partage = false) => {
  await act(async () => {
    root.render(createElement(CarteVive, {
      carte, maintenant: MAINTENANT, partage, onGeste: () => {},
      ...(partage ? { onOuvrirBien: () => {} } : {}),
    } as never));
  });
  await calmer();
};
/** Le texte de la VIGNETTE (le titre repliable), c'est-à-dire la carte telle qu'on la voit fermée. */
const vignette = (): string => container.querySelector('.gst-carte-titre')?.textContent ?? '';
const deplier = async () => {
  const b = [...container.querySelectorAll('button')].find((x) => x.getAttribute('aria-expanded') !== null);
  await act(async () => { b?.click(); }); await calmer();
};

describe('🔴🔴 ① la carte ne porte plus la référence ni l’état', () => {
  it('🔴🔴 ni « GES-2026-000001 », ni « En cours »', async () => {
    await monter(CARTE());
    expect(container.querySelector('.gst-ref')).toBeNull();
    expect(vignette()).not.toContain('GES-2026-000001');
    expect(vignette()).not.toContain('En cours');
  });

  /** ⚠️ ET LES TROIS ÉTATS SONT PARTIS, pas seulement celui de la carte d'Arno. */
  it('⚠️ aucun des trois états ne s’écrit sur la carte', async () => {
    for (const etat of ['a_traiter', 'en_cours', 'traite'] as const) {
      await monter(CARTE({ etat }));
      for (const mot of ['À traiter', 'En cours', 'Traité']) expect(vignette(), etat).not.toContain(mot);
      act(() => { root.unmount(); });
      container.innerHTML = ''; root = createRoot(container);
    }
  });

  /**
   * 🔴 LE COMPTEUR « N échange » RESTE — Arno le demande explicitement. C'est ce qui dit qu'un dossier a du
   * courrier, et il n'a pas de doublon ailleurs sur la carte.
   */
  it('🔴 le compteur « 1 échange » reste', async () => {
    await monter(CARTE());
    expect(vignette()).toContain('1 échange');
  });
});

describe('🔴🔴 ② le TYPE prend leur place', () => {
  it.each([
    ['travaux', 'Travaux'],
    ['fuite_eau', 'Fuite d’eau'],
    ['administratif', 'Administratif'],
    ['litige', 'Litige'],
  ])('🔴 « %s » s’affiche « %s »', async (categorie, mot) => {
    await monter(CARTE({ categorie }));
    expect(container.querySelector('.gst-carte-type')?.textContent).toBe(mot);
  });

  /** 🔴 PAS DE TYPE ⇒ RIEN À CET ENDROIT (Arno). C'est le cas de la carte GES-2026-000001. */
  it('🔴🔴 aucun type renseigné : rien ne s’affiche', async () => {
    await monter(CARTE({ categorie: null }));
    expect(container.querySelector('.gst-carte-type')).toBeNull();
    expect(vignette()).not.toContain('Non précisée');
  });

  /**
   * ⚠️ UNE VALEUR VIDE OU INCONNUE VAUT « PAS DE TYPE ». `motCategorie` rend « Non précisée » pour tout ce
   * qu'il ne reconnaît pas : l'afficher mettrait un type là où il n'y en a pas. C'est `categorieValide` — la
   * même fonction que le formulaire — qui tranche.
   */
  it.each(['', '   ', 'inconnu'])('⚠️ « %s » ne s’affiche pas', async (categorie) => {
    await monter(CARTE({ categorie }));
    expect(container.querySelector('.gst-carte-type')).toBeNull();
    expect(vignette()).not.toContain('Non précisée');
  });
});

describe('🔴🔴 ③ la capsule MONGA, sous la vignette de droite', () => {
  const MONGA = CARTE({
    mongaRefs: ['MNG-23830'],
    derniereEtapeMonga: {
      type: 'devis_recu', titre: null, survenuLe: '2026-10-05T00:00:00Z',
      heureConnue: false, source: 'monga', certitude: 'fiable',
    },
  });

  it('🔴🔴 elle est là, et elle dit la dernière étape Monga', async () => {
    await monter(MONGA);
    const c = container.querySelector('.gst-monga-vignette');
    expect(c).not.toBeNull();
    expect(c?.textContent).toContain('MONGA');
    expect(c?.textContent).toContain('Devis reçu');
  });

  /**
   * 🔴🔴 « JUSTE EN DESSOUS DE LA VIGNETTE DE DROITE » (Arno) : la capsule et la miniature partagent la même
   * colonne, et la capsule vient APRÈS. Une capsule restée dans la ligne de gauche aurait l'air d'un mot de
   * plus sur une ligne déjà chargée.
   */
  it('🔴🔴 elle est dans la colonne de droite, après la miniature', async () => {
    await monter(MONGA);
    const colonne = container.querySelector('.gst-carte-droite');
    expect(colonne).not.toBeNull();
    const enfants = [...(colonne?.children ?? [])].map((e) => e.className);
    expect(enfants[0]).toContain('gst-mini');
    expect(enfants[1]).toContain('gst-monga-vignette');
  });

  /** 🔴 PAS D'ÉVÉNEMENT MONGA ⇒ PAS DE CAPSULE (Arno). C'est le cas ordinaire, et celui de GES-2026-000001. */
  it('🔴🔴 aucune référence MNG : aucune capsule', async () => {
    await monter(CARTE());
    expect(container.querySelector('.gst-monga-vignette')).toBeNull();
  });

  /**
   * ⚠️ SUIVI PAR MONGA MAIS AUCUNE ÉTAPE VENUE DE MONGA : la capsule reste, et se contente de « MONGA » —
   * exactement ce qu'elle disait avant ce lot. On n'invente pas une étape qu'on n'a pas lue.
   */
  it('⚠️ référence MNG sans étape Monga : « MONGA » seul', async () => {
    await monter(CARTE({ mongaRefs: ['MNG-23830'], derniereEtapeMonga: null }));
    const c = container.querySelector('.gst-monga-vignette');
    expect(c?.textContent).toContain('MONGA');
    expect(c?.textContent).toContain('MNG-23830'); // le lecteur d'écran garde la référence
  });

  /**
   * 🔴 LA DERNIÈRE ÉTAPE **MONGA**, ET NON LA DERNIÈRE TOUT COURT. Un dossier dont la dernière carte a été posée
   * à la main n'en est pas moins suivi par Monga : la capsule annonce l'avancement CHEZ MONGA.
   */
  it('🔴 une étape manuelle plus récente ne change pas ce que la capsule annonce', async () => {
    await monter(CARTE({
      mongaRefs: ['MNG-23830'],
      derniereEtape: {
        type: 'intervention', titre: null, survenuLe: '2026-10-13T00:00:00Z',
        heureConnue: false, source: 'manuelle', certitude: 'fiable',
      },
      derniereEtapeMonga: {
        type: 'devis_recu', titre: null, survenuLe: '2026-10-05T00:00:00Z',
        heureConnue: false, source: 'monga', certitude: 'fiable',
      },
    }));
    expect(container.querySelector('.gst-monga-vignette')?.textContent).toContain('Devis reçu');
    /* ⚠️ Et la MINIATURE, elle, montre bien la dernière étape toutes sources confondues. */
    expect(container.querySelector('.gst-mini')?.textContent).toContain('Intervention');
  });
});

describe('🔴🔴 ④ plus d’adresse sous le gros bouton', () => {
  it('🔴🔴 le bouton reste, la ligne d’adresse a disparu', async () => {
    await monter(CARTE(), true);
    await deplier();
    const bouton = [...container.querySelectorAll('button')]
      .find((b) => (b.textContent ?? '').includes('Ouvrir la fiche du bien sur cet événement'));
    expect(bouton).not.toBeUndefined();
    /* 🔴 L'ADRESSE N'APPARAÎT PLUS QU'UNE FOIS SUR TOUTE LA CARTE : celle de la vignette. */
    const occurrences = (container.textContent ?? '').split('67 rue de Normandie').length - 1;
    expect(occurrences).toBe(1);
  });

  /**
   * ⚠️ LA NOTE DU CAS « PLUSIEURS BIENS » N'EST PAS CONCERNÉE : elle ne dit pas une adresse, elle dit combien
   * il y en a — et c'est ce qui explique que le bouton ouvre un choix plutôt qu'une fiche.
   */
  it('⚠️ plusieurs biens : la note qui les compte reste', async () => {
    biensServis = [
      { cle: '315', adresse: '67 rue de Normandie', commune: 'COURBEVOIE' },
      { cle: '421', adresse: '12 rue de Paris', commune: 'PUTEAUX' },
    ];
    await monter(CARTE({ nbBiens: 2 }), true);
    await deplier();
    expect(container.textContent).toContain('2 biens concernés');
  });
});

describe('🔴🔴 ⑤ « dernier échange » ne s’écrit plus qu’une fois', () => {
  it('🔴🔴 une seule occurrence, celle qui accompagne « Ouvert depuis »', async () => {
    await monter(CARTE());
    const texte = vignette();
    expect(texte.split('dernier échange').length - 1).toBe(1);
    /* 🔴 ET C'EST BIEN CELLE-LÀ QUI RESTE : la ligne complète, pas le bout isolé. */
    expect(texte).toContain('Ouvert depuis 13 jours');
    expect(texte).toContain('dernier échange il y a 7 jours');
  });

  /** ⚠️ SANS DATE DE DERNIER ÉCHANGE, la ligne ne dit que l'ouverture — et rien ne se répète. */
  it('⚠️ aucun échange daté : « Ouvert depuis » seul', async () => {
    await monter(CARTE({ dernierEchangeLe: null }));
    expect(vignette()).toContain('Ouvert depuis 13 jours');
    expect(vignette()).not.toContain('dernier échange');
  });
});

describe('🔴🔴 ⑥ l’adresse perd le « lot N — »', () => {
  it('🔴🔴 « 67 rue de Normandie, COURBEVOIE », sans le numéro de lot devant', async () => {
    await monter(CARTE());
    const ligne = container.querySelector('.gst-carte-ligne--adresse')?.textContent ?? '';
    expect(ligne).toContain('67 rue de Normandie, COURBEVOIE');
    expect(ligne).not.toContain('lot 315');
  });

  /**
   * ⚠️ LE LOT RESTE LE SEUL NOM D'UN BIEN SANS ADRESSE : sans lieu à écrire, « lot 315 » demeure. Le taire
   * ferait disparaître la ligne, et avec elle le seul moyen de savoir de quel bien on parle. Arno demande de ne
   * plus le mettre DEVANT une adresse, pas de le supprimer.
   */
  it('⚠️ un bien sans adresse garde « lot 315 »', async () => {
    await monter(CARTE({
      bien: { cle: '315', adresse: null, commune: null, proprietaire: null, locataire: null },
    }));
    expect(container.querySelector('.gst-carte-ligne--adresse')?.textContent).toContain('lot 315');
  });

  /** ⚠️ ET LE « (+ N autres biens) » N'EST PAS TOUCHÉ : il dit ce que la vignette tait. */
  it('⚠️ la mention des autres biens reste', async () => {
    await monter(CARTE({ nbBiens: 3 }));
    expect(container.querySelector('.gst-carte-ligne--adresse')?.textContent)
      .toContain('(+ 2 autres biens)');
  });
});
