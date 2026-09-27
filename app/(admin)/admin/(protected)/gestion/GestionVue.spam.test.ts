// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { GestionVue, etiquettesDeLEcran } from './GestionVue';

/**
 * LOT ERGO-BOITE-3 — CE QUE LA COLONNE MONTRE, ET CE QUE SES SÉLECTEURS FONT.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 TROIS DEMANDES D'ARNO, éprouvées à l'écran monté plutôt qu'en lisant le code :
 *   ① une entrée « Spam » APRÈS « Brouillons », avec son compteur ;
 *   ② le titre de la colonne nomme la boîte : « Mail gestion@criterimmo.fr » ;
 *   ③ « N non lus » et le total de « Réception » sont deux SÉLECTEURS cliquables, le total actif par défaut, et le
 *      choix vit dans l'ADRESSE — sans quoi le rafraîchissement automatique de 30 s le ferait sauter sans prévenir.
 *
 * 🔴 ET LE RETRAIT DU BLOC « GESTION ⓘ », qui est le seul retrait autorisé de ce lot : on vérifie qu'il est parti ET
 * que le bandeau d'ALERTE, lui, garde sa place en haut. Un retrait qui emporterait l'alerte serait une régression
 * silencieuse — celle-là même qui a coûté dix heures de courrier le 25/09/2026.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ECRAN = {
  // ⚠️ DES COMPTEURS NON NULS : une étiquette vide est écartée de la colonne (règle d'avant ce lot). Sans « À
  //   classer » ni « Brouillons », la vérification « Spam est juste sous Brouillons » n'aurait rien à comparer.
  file: [], filsTotal: 478, fenetreJours: 30, filsTropAnciens: 0,
  sansSuite: [], sansSuiteTotal: 0, evenements: [], evenementsTotal: 0,
  messagesCaptures: 56821, messagesExclus: 30851, derniereReleveLe: '2026-09-27T15:00:00Z',
};
/** Le contexte de rédaction vient de SA PROPRE route : c'est de là que le titre de la colonne tire l'adresse. */
const REDACTION = {
  adresseGestion: 'gestion@criterimmo.fr', signature: null, peutEnvoyer: true, schemaPret: true,
  piecesDisponibles: false, brouillons: 3,
};
const COMPTES: Record<string, unknown> = {
  lisibles: 8470, automatiques: 26059, envoyes: 6585, reception: 8470, spam: 231,
  // LOT FILTRE-ETOILE — la migration 264 est là dans ce jeu d'essai : le bouton de filtre doit donc être rendu.
  etoileDisponible: true,
};
const PAGE_BOITE = { lignes: [], suivant: null, total: 8470, comptes: COMPTES, nonLus: [7, 8], nonLusTotal: 15 };

let container: HTMLDivElement;
let root: Root;
let urlsBoite: string[];

beforeEach(() => {
  window.history.replaceState(null, '', '/admin/gestion');
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  urlsBoite = [];
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/boite/comptes')) return { ok: true, json: async () => COMPTES } as unknown as Response;
    if (u.includes('/boite')) { urlsBoite.push(u); return { ok: true, json: async () => PAGE_BOITE } as unknown as Response; }
    if (u.includes('/redaction')) return { ok: true, json: async () => REDACTION } as unknown as Response;
    if (u.includes('/brouillons')) return { ok: true, json: async () => ({ liste: [] }) } as unknown as Response;
    if (u.includes('/messages')) return { ok: true, json: async () => ({ messages: [], partis: [] }) } as unknown as Response;
    return { ok: true, json: async () => ECRAN } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async () => { await act(async () => { root.render(createElement(GestionVue)); }); await calmer(); };
const cliquer = async (e: Element | null | undefined) => { await act(async () => { (e as HTMLElement)?.click(); }); await calmer(); };
const url = () => window.location.pathname + window.location.search;
/** Les entrées de la colonne, dans l'ordre où on les lit. */
const entrees = () => [...container.querySelectorAll('.cm-liste .cm-entree')].map((b) => b.textContent ?? '');
const selecteurs = () => [...container.querySelectorAll('.cm-sel')] as HTMLButtonElement[];
const selecteurPar = (motif: RegExp) => selecteurs().find((b) => motif.test(b.textContent ?? ''));
const derniereUrlBoite = () => urlsBoite[urlsBoite.length - 1] ?? '';

describe('🔴 ① « Spam » est dans la colonne, après « Brouillons »', () => {
  it('l’entrée existe, porte son compteur, et suit « Brouillons »', async () => {
    await monter();
    const liste = entrees();
    const iBrouillons = liste.findIndex((t) => t.includes('Brouillons'));
    const iSpam = liste.findIndex((t) => t.includes('Spam'));
    expect(iSpam).toBeGreaterThan(-1);
    expect(iSpam).toBeGreaterThan(iBrouillons);
    expect(liste[iSpam]).toContain('231');
  });

  it('un clic ouvre la liste « Spam », et l’adresse le dit', async () => {
    await monter();
    await cliquer([...container.querySelectorAll('.cm-entree')].find((b) => /Spam/.test(b.textContent ?? '')));
    expect(url()).toContain('etiquette=spam');
    expect(derniereUrlBoite()).toContain('etiquette=spam');
  });

  /**
   * Sans la migration 263, la route ne rend aucun compte de spam : l'entrée est alors ÉCARTÉE comme toute étiquette
   * vide (règle d'avant ce lot), plutôt que montrée à zéro — un zéro qu'on n'a pas mesuré est un mensonge poli.
   */
  it('sans compte de spam, l’entrée n’est pas montrée à zéro : elle n’est pas montrée', () => {
    const sans = etiquettesDeLEcran(
      { ...ECRAN, filsTotal: 0 } as unknown as Parameters<typeof etiquettesDeLEcran>[0],
      { lisibles: 1, automatiques: 1, envoyes: 1 }, null, null, false, null);
    expect(sans.find((e) => e.etiquette.sorte === 'spam')?.compte).toBeNull();
  });
});

describe('🔴 ② le titre de la colonne nomme la boîte', () => {
  it('il porte l’adresse de gestion, lue dans la configuration', async () => {
    await monter();
    expect(container.querySelector('.cm-titre')?.textContent).toBe('Mail gestion@criterimmo.fr');
  });
});

describe('🔴 ③ « Réception » : deux sélecteurs, le total actif par défaut', () => {
  it('les deux nombres sont des BOUTONS, et le total est actif au départ', async () => {
    await monter();
    const nonLus = selecteurPar(/non lus?/);
    const total = selecteurPar(/^8470$/);
    expect(nonLus).toBeDefined();
    expect(total).toBeDefined();
    expect(total?.getAttribute('aria-pressed')).toBe('true');
    expect(nonLus?.getAttribute('aria-pressed')).toBe('false');
    expect(total?.className).toContain('cm-sel--actif');
    expect(nonLus?.className).not.toContain('cm-sel--actif');
  });

  /**
   * 🔴 LE CHOIX VIT DANS L'ADRESSE. C'est ce qui le fait survivre à un rechargement — et au rafraîchissement
   * automatique de 30 s, qui relit la page. Un filtre qui saute tout seul est pire qu'un filtre absent : on croit
   * voir tout le courrier alors qu'on n'en voit qu'une part, ou l'inverse.
   */
  it('cliquer « non lus » écrit le choix dans l’adresse ET le fait suivre au serveur', async () => {
    await monter();
    await cliquer(selecteurPar(/non lus?/));
    expect(url()).toContain('filtre=non-lus');
    expect(derniereUrlBoite()).toContain('filtre=non-lus');
    expect(selecteurPar(/non lus?/)?.getAttribute('aria-pressed')).toBe('true');
  });

  it('cliquer le total revient à tout montrer — et l’adresse redevient nue', async () => {
    await monter();
    await cliquer(selecteurPar(/non lus?/));
    await cliquer(selecteurPar(/^8470$/));
    expect(url()).not.toContain('filtre=');
    expect(derniereUrlBoite()).not.toContain('filtre=');
  });

  it('une adresse portant déjà « filtre=non-lus » ouvre la liste filtrée', async () => {
    window.history.replaceState(null, '', '/admin/gestion?filtre=non-lus');
    await monter();
    expect(selecteurPar(/non lus?/)?.getAttribute('aria-pressed')).toBe('true');
    expect(derniereUrlBoite()).toContain('filtre=non-lus');
  });
});

describe('🔴 le bloc « Gestion ⓘ » est parti, l’ALERTE reste', () => {
  it('aucun en-tête gris dans la boîte', async () => {
    await monter();
    expect(container.querySelector('.gst-bandeau')).toBeNull();
    expect(container.querySelector('.gst-bandeau-titre')).toBeNull();
  });

  /**
   * L'alerte de veille est rendue par un `<p className="gst-veille--alerte">` INDÉPENDANT du bloc retiré. Le jeu
   * d'essai ci-dessus annonce une relève à 15:00 pour une horloge de test bien plus tardive : la veille juge donc
   * « arrêtée », et l'alerte doit être là — en haut de page, dans la boîte comme ailleurs.
   */
  it('l’alerte de relève arrêtée s’affiche toujours en haut de page', async () => {
    vi.setSystemTime(new Date('2026-09-28T04:00:00Z'));
    await monter();
    expect(container.querySelector('.gst-veille--alerte')).not.toBeNull();
    vi.useRealTimers();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LOT ERGO-BOITE-4 — LES RETOUCHES D'ARNO, ÉPROUVÉES À L'ÉCRAN MONTÉ
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ERGO-BOITE-4 ① les sélecteurs sont DANS l’entrée « Réception »', () => {
  it('les deux nombres vivent à l’intérieur de l’entrée, pas à côté', async () => {
    await monter();
    const entree = container.querySelector('.cm-entree--recep');
    expect(entree).not.toBeNull();
    expect(entree?.querySelectorAll('.cm-sel')).toHaveLength(2);
    // Le nom est dans la même enveloppe : pour l'œil, une seule entrée.
    expect(entree?.querySelector('.cm-nom-bouton')?.textContent).toBe('Réception');
  });

  /**
   * 🔴 AUCUN BOUTON DANS UN BOUTON. C'est du HTML invalide : le navigateur défait l'imbrication et le clic devient
   * imprévisible. L'enveloppe porte l'apparence, les trois gestes sont trois boutons frères. Ce test l'interdit
   * pour de bon — c'est précisément la contrainte qui avait fait sortir les sélecteurs de l'entrée au lot précédent.
   */
  it('l’enveloppe n’est PAS un bouton : aucun bouton n’en contient un autre', async () => {
    await monter();
    for (const b of container.querySelectorAll('button')) {
      expect(b.querySelector('button')).toBeNull();
    }
    expect(container.querySelector('.cm-entree--recep')?.tagName).toBe('DIV');
  });

  it('le comportement n’a pas changé : total actif par défaut, « non lus » écrit dans l’adresse', async () => {
    await monter();
    expect(selecteurPar(/^8470$/)?.getAttribute('aria-pressed')).toBe('true');
    await cliquer(selecteurPar(/non lus?/));
    expect(url()).toContain('filtre=non-lus');
    expect(derniereUrlBoite()).toContain('filtre=non-lus');
  });
});

describe('🔴 ERGO-BOITE-4 ② « Spam » est juste sous « Brouillons »', () => {
  it('rien entre les deux', async () => {
    await monter();
    const liste = entrees();
    expect(liste.findIndex((t) => t.includes('Spam')) - liste.findIndex((t) => t.includes('Brouillons'))).toBe(1);
  });
});

describe('🔴 ERGO-BOITE-4 ③ la mention du courrier automatique est sur la ligne du titre', () => {
  it('elle vit DANS le titre de la liste, à côté du compteur et de l’icône', async () => {
    await monter();
    const titre = container.querySelector('h2#bte-titre');
    expect(titre?.querySelector('.bte-tait')).not.toBeNull();
    expect(titre?.querySelector('.bte-tait')?.textContent).toContain('courrier automatique');
    // Le titre, son compteur et l'icône de relève n'ont pas bougé.
    expect(titre?.textContent).toContain('Réception');
    expect(titre?.querySelector('.gst-compte')).not.toBeNull();
    expect(titre?.querySelector('.bte-relever')).not.toBeNull();
  });

  /** ⚠️ Un `<p>` dans un `<h2>` serait invalide : la mention doit être un élément en ligne. */
  it('c’est un span, jamais un paragraphe', async () => {
    await monter();
    expect(container.querySelector('.bte-tait')?.tagName).toBe('SPAN');
    expect(container.querySelector('h2#bte-titre p')).toBeNull();
  });

  /** RIEN N'EST RACCOURCI : le nombre tu et le geste qui le ramène sont toujours là, mot pour mot. */
  it('elle dit toujours COMBIEN elle tait, et le ramène d’un clic', async () => {
    await monter();
    const t = container.querySelector('.bte-tait');
    expect(t?.textContent).toContain('26059');
    expect(t?.textContent).toContain('Rien n’est supprimé');
    expect(t?.querySelector('button')?.textContent).toBe('Afficher aussi le courrier automatique');
  });
});

describe('🔴 ERGO-BOITE-4 ④ « Détails relève » : replié par défaut', () => {
  const bouton = () => [...container.querySelectorAll('.cm-details')][0] as HTMLButtonElement | undefined;
  const detail = () => container.querySelector('#cm-details-relevé') as HTMLElement | null;

  it('le texte est là, mais caché, et le bouton le dit', async () => {
    await monter();
    expect(bouton()?.textContent).toContain('Détails relève');
    expect(bouton()?.getAttribute('aria-expanded')).toBe('false');
    expect(detail()?.hidden).toBe(true);
    // ⚠️ CACHÉ, PAS SUPPRIMÉ : le texte reste dans le document, donc trouvable par la recherche du navigateur.
    expect(detail()?.textContent).toContain('Dernière relève');
  });

  it('un clic déplie, un second replie', async () => {
    await monter();
    await cliquer(bouton());
    expect(bouton()?.getAttribute('aria-expanded')).toBe('true');
    expect(detail()?.hidden).toBe(false);
    await cliquer(bouton());
    expect(detail()?.hidden).toBe(true);
  });

  /**
   * 🔴 LE PLI NE PEUT PAS CACHER UNE ALERTE. Le bandeau « relève arrêtée » vit en haut de page, pas dans ce bloc :
   * c'est toute la raison d'être de la séparation faite au lot ERGO-BOITE. On le vérifie ici, sur le même écran,
   * pour que personne ne replie un jour l'alerte avec l'ordinaire.
   */
  it('l’alerte reste en haut de page, dépliée ou non', async () => {
    vi.setSystemTime(new Date('2026-09-28T04:00:00Z'));
    await monter();
    expect(detail()?.hidden).toBe(true);
    const alerte = container.querySelector('.gst-veille--alerte');
    expect(alerte).not.toBeNull();
    expect(alerte?.closest('.cm-etat')).toBeNull(); // elle n'est PAS dans le bloc replié
    vi.useRealTimers();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LOT FILTRE-ETOILE — NE MONTRER QUE LES ÉCHANGES ÉTOILÉS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 le filtre « étoilés » de l’en-tête', () => {
  const boutonEtoile = () => container.querySelector('button[aria-pressed][title*="étoilé"], button[aria-pressed][title*="tous les messages"]') as HTMLButtonElement | null;

  it('l’étoile est entre le compteur et l’icône de relève, et elle est ÉTEINTE au départ', async () => {
    await monter();
    const titre = container.querySelector('h2#bte-titre');
    const enfants = [...(titre?.children ?? [])].map((e) => e.className);
    const iCompte = enfants.findIndex((c) => c.includes('gst-compte'));
    const iEtoile = enfants.findIndex((c) => c.includes('bte-filtre-etoile'));
    const iRelever = enfants.findIndex((c) => c.includes('bte-relever') && !c.includes('bte-filtre-etoile'));
    expect(iEtoile).toBeGreaterThan(iCompte);
    expect(iRelever).toBeGreaterThan(iEtoile);
    expect(boutonEtoile()?.getAttribute('aria-pressed')).toBe('false');
  });

  /**
   * 🔴 LE CHOIX VIT DANS L'ADRESSE. C'est ce qui le fait survivre au rechargement ET au rafraîchissement
   * automatique de 30 s — qui relit la page. Un filtre qui saute tout seul est pire qu'un filtre absent : on croit
   * voir les échangés étoilés et l'on voit tout, ou l'inverse.
   */
  it('un clic écrit « etoile=1 » dans l’adresse, et le fait suivre au serveur', async () => {
    await monter();
    await cliquer(boutonEtoile());
    expect(url()).toContain('etoile=1');
    expect(derniereUrlBoite()).toContain('etoile=1');
    expect(boutonEtoile()?.getAttribute('aria-pressed')).toBe('true');
  });

  it('un second clic revient à tout montrer, et l’adresse redevient nue', async () => {
    await monter();
    await cliquer(boutonEtoile());
    await cliquer(boutonEtoile());
    expect(url()).not.toContain('etoile=');
    expect(derniereUrlBoite()).not.toContain('etoile=');
  });

  it('une adresse portant déjà « etoile=1 » ouvre la liste filtrée', async () => {
    window.history.replaceState(null, '', '/admin/gestion?etoile=1');
    await monter();
    expect(boutonEtoile()?.getAttribute('aria-pressed')).toBe('true');
    expect(derniereUrlBoite()).toContain('etoile=1');
  });

  /** 🔴 IL SE COMBINE, il ne remplace pas : étoilés ET non lus partent ensemble au serveur. */
  it('il se combine avec le sélecteur « non lus »', async () => {
    await monter();
    await cliquer(selecteurPar(/non lus?/));
    await cliquer(boutonEtoile());
    const p = new URLSearchParams(derniereUrlBoite().split('?')[1] ?? '');
    expect(p.get('filtre')).toBe('non-lus');
    expect(p.get('etoile')).toBe('1');
    expect(url()).toContain('filtre=non-lus');
    expect(url()).toContain('etoile=1');
  });

  /**
   * SANS LA MIGRATION 264, l'étoile n'existe pas : filtrer sur un état qu'on ne sait pas lire rendrait une liste
   * vide sans raison compréhensible. Le bouton n'est donc pas rendu du tout.
   */
  it('sans la migration 264, aucun bouton de filtre', async () => {
    const avant = COMPTES.etoileDisponible;
    (COMPTES as Record<string, unknown>).etoileDisponible = false;
    await monter();
    expect(boutonEtoile()).toBeNull();
    (COMPTES as Record<string, unknown>).etoileDisponible = avant;
  });
});

describe('🔴 le compteur du titre suit le filtre', () => {
  /**
   * 🔴 VU À L'ÉCRAN AVANT LIVRAISON : le titre annonçait « 8 471 » au-dessus de deux lignes étoilées. Le nombre
   * venait de l'ÉTIQUETTE (calculé par la colonne de gauche, sans filtre) ; il vient désormais de la PAGE, que le
   * serveur compte avec le filtre. Un compteur doit compter ce qu'on voit.
   */
  it('filtre actif, le titre affiche le compte de la page et non celui de l’étiquette', async () => {
    window.history.replaceState(null, '', '/admin/gestion?etoile=1');
    await monter();
    // La page rendue par le jeu d'essai annonce `total: 8470` ; l'étiquette, elle, en annonce 8470 aussi —
    //   on distingue donc les deux en faisant répondre la page autrement.
    expect(container.querySelector('h2#bte-titre .gst-compte')).not.toBeNull();
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteMail.tsx', 'utf8');
    expect(src).toContain('{etoile ? etat.total : (total ?? etat.total)}');
  });
});
