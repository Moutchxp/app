// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';

/**
 * 🔴🔴 « SUPPRIMER UN PROPRIÉTAIRE » (Arno, 18/10/2026) — le VRAI écran, routes simulées : rien ne part, rien n'est écrit.
 *   ① au départ, une ligne de recherche seulement ; la recherche ne demande QUE des propriétaires (pastille rouge) ;
 *   ② clic → la fiche commune (même composant que la Gestion) et, collés en haut, la recherche puis le GROS BOUTON ;
 *   ③ aucun bien occupé → bouton rouge « Archiver le propriétaire et son historique » → confirmation simple → dernière
 *      question (origine ; mise en vente → par qui, obligatoire) → « Archiver définitivement », seul clic qui écrit ;
 *   ④ au moins un bien occupé → bouton orange → modale des biens occupés (adresse, lot, locataire, entrée), le bien
 *      partagé dit « PAS archivé » → « Confirmer l'archivage du propriétaire et de ses biens » envoie la confirmation ;
 *   ⑤ archivé → « Réactiver le propriétaire et ses biens ».
 */
vi.mock('../gestion/FicheCommune', () => ({
  FicheCommuneLocation: ({ fiche, ouvrir }: { fiche: { sorte: string; id: number }; ouvrir?: (f: { sorte: string; id: number } | null) => void }) =>
    createElement('div', { 'data-fiche-commune': `${fiche.sorte}-${fiche.id}` },
      createElement('button', { type: 'button', 'data-ouvrir-bien': true, onClick: () => ouvrir?.({ sorte: 'lot', id: 40 }) }, 'Ouvrir le bien 40')),
}));
import { EcranArchivageProprietaire } from './ArchivageProprietaire';
import { BlocSortie } from '../gestion/SectionsLocationFiche';
import { EcranSupprimerChoix } from './EcransLocation';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
const ligne = (id: number, titre: string, o: Record<string, unknown> = {}) => ({ id, titre, telephone: null, email: null, adresse: null, detail: null, ancien: false, ...o });
const apercu = (o: Record<string, unknown> = {}) => ({
  sujet: 'proprietaire', id: 7, nom: 'EXEMPLE Claire', sortie: null, biens: [40, 41], partages: [], occupees: [], locatairesArchives: [], locatairesGardes: [], ...o,
});

let container: HTMLDivElement;
let root: Root;
let appels: string[];
let envois: Record<string, unknown>[];
let reponseApercu: () => unknown;
let reponseBiens: () => unknown;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = []; envois = [];
  reponseApercu = () => apercu();
  reponseBiens = () => apercu({ portee: 'biens', biens: [40], lotsChoisis: [40] });
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    appels.push(u);
    if (init?.method === 'POST') {
      envois.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return ok({ biens: 2, locations: 1, locataires: 1 });
    }
    if (u.includes('proprietairesArchivage=')) {
      return ok({ proprietaires: [ligne(7, 'EXEMPLE Claire', { telephone: '06 12 34 56 78', adresse: '14 rue de l’Essai, PARIS' }), ligne(9, 'ANCIEN Paul', { ancien: true })],
        locataires: [], syndics: [], biens: [], tronque: false });
    }
    if (u.includes('apercuArchivage=')) return ok(reponseApercu());
    if (u.includes('biensPourSortie=')) {
      return ok([
        { lotId: 40, adresse: '14 rue de l’Essai, PARIS', lot: '315', nature: 'Appartement', annexes: [{ lotId: 41, libelle: 'Cave n° 3', detachee: true }], locataires: ['MODÈLE Jules'], autresProprietaires: [],
          famille: 'logement', entree: '2024-09-01', derniersLocataires: [], derniereSortie: null },
        { lotId: 50, adresse: '9 rue Partagée, PARIS', lot: null, nature: 'Studio', annexes: [], locataires: [], autresProprietaires: ['COINDIVIS Marc'],
          famille: 'logement', entree: null, derniersLocataires: ['ANCIEN Paul', 'ANCIENNE Zoé'], derniereSortie: '2026-06-30' },
        { lotId: 60, adresse: '2 rue Neuve, PARIS', lot: '12', nature: null, annexes: [], locataires: [], autresProprietaires: [],
          famille: 'parking', entree: null, derniersLocataires: [], derniereSortie: null },
      ]);
    }
    if (u.includes('apercuSortieBiens=')) return ok(reponseBiens());
    return ok({});
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => root.unmount()); container.remove(); document.body.innerHTML = ''; vi.useRealTimers(); });

async function calmer(): Promise<void> { for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); }); }
async function taper(texte: string): Promise<void> {
  const input = container.querySelector('input[type="search"]') as HTMLInputElement;
  vi.useFakeTimers();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, texte);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { vi.advanceTimersByTime(250); });
  vi.useRealTimers();
  await calmer();
}
async function cliquer(el: Element | null): Promise<void> {
  if (el === null) throw new Error('élément absent');
  await act(async () => { (el as HTMLElement).click(); });
  await calmer();
}
async function ouvrirClaire(): Promise<void> {
  await act(async () => { root.render(createElement(EcranArchivageProprietaire, { refusFiche: null })); });
  await taper('exemple');
  await cliquer(container.querySelector('[data-index="0"]'));
}
const bouton = () => container.querySelector('[data-bouton-archivage] .arc-gros') as HTMLButtonElement | null;

describe('🔴 « Supprimer un propriétaire »', () => {
  it('① au départ : la ligne de recherche seule ; la recherche ne vise QUE les propriétaires (pastille rouge, anciens en bas)', async () => {
    await act(async () => { root.render(createElement(EcranArchivageProprietaire, { refusFiche: null })); });
    expect(container.querySelectorAll('input[type="search"]')).toHaveLength(1);
    expect(container.querySelector('[data-bouton-archivage]')).toBeNull();
    expect(container.querySelector('[data-fiche-commune]')).toBeNull();
    await taper('exemple');
    expect(appels.some((u) => u.includes('proprietairesArchivage=exemple'))).toBe(true);
    expect(appels.some((u) => /[?&]q=/.test(u))).toBe(false);
    const types = [...container.querySelectorAll('.loc-res-type')].map((x) => [x.className, x.textContent]);
    expect(types).toEqual([['loc-res-type loc-res-type--proprietaires', 'Propriétaire'], ['loc-res-type loc-res-type--ancien', 'Ancien · Propriétaire']]);
  });

  it('② clic : la fiche commune sous la recherche et le gros bouton, tous deux dans le bandeau collant ; navigation vers un bien', async () => {
    await ouvrirClaire();
    expect(container.querySelector('[data-fiche-commune]')?.getAttribute('data-fiche-commune')).toBe('proprietaire-7');
    const collant = container.querySelector('[data-collant]');
    expect(collant?.querySelector('input[type="search"]')).not.toBeNull();
    expect(collant?.querySelector('[data-bouton-archivage]')).not.toBeNull();
    expect(collant?.contains(container.querySelector('[data-fiche-commune]'))).toBe(false);
    await cliquer(container.querySelector('[data-ouvrir-bien]'));
    expect(container.querySelector('[data-fiche-commune]')?.getAttribute('data-fiche-commune')).toBe('lot-40');
    // Le bouton reste celui du propriétaire ; un lien ramène à sa fiche.
    expect(bouton()?.textContent).toBe('Archiver le propriétaire et son historique');
    await cliquer([...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Revenir à la fiche du propriétaire')) ?? null);
    expect(container.querySelector('[data-fiche-commune]')?.getAttribute('data-fiche-commune')).toBe('proprietaire-7');
  });

  it('③ aucun bien occupé : ROUGE → confirmation simple → DERNIÈRE QUESTION (rien n’est écrit) → « Archiver définitivement »', async () => {
    await ouvrirClaire();
    expect(bouton()?.className).toBe('arc-gros arc-gros--archiver');
    await cliquer(bouton());
    expect(container.querySelector('[data-modale-archivage]')).toBeNull();
    await cliquer(container.querySelector('[data-confirmer-archivage]'));
    // L'étape finale, DANS le même panneau : rien n'est parti.
    expect(envois).toEqual([]);
    const q = container.querySelector('[data-question-origine]');
    expect(q?.textContent).toContain('Quelle est l’origine de l’archivage de ce propriétaire ?');
    expect([...(q?.querySelectorAll('[data-origine]') ?? [])].map((b) => b.textContent)).toEqual([
      'Récupéré par le propriétaire / sa famille', 'Mise en vente', 'Propriétaire mécontent', 'Décès / succession', 'Litige']);
    const final = () => container.querySelector('[data-archiver-definitivement]') as HTMLButtonElement;
    expect(final().disabled).toBe(true);
    // Mise en vente : la sous-question est obligatoire.
    await cliquer(container.querySelector('[data-origine="mise_en_vente"]'));
    expect(container.querySelectorAll('[data-sous-origine]')).toHaveLength(4);
    expect(final().disabled).toBe(true);
    await cliquer(container.querySelector('[data-sous-origine="autre_agence"]'));
    expect(final().disabled).toBe(false);
    // Un autre choix efface la sous-question ; un seul choix à la fois.
    await cliquer(container.querySelector('[data-origine="litige"]'));
    expect(container.querySelector('[data-sous-question]')).toBeNull();
    expect([...container.querySelectorAll('[data-origine][aria-checked="true"]')].map((b) => b.getAttribute('data-origine'))).toEqual(['litige']);
    // « Retour » revient à la confirmation, sans rien écrire.
    await cliquer([...container.querySelectorAll('button')].find((b) => b.textContent === 'Retour') ?? null);
    expect(container.querySelector('[data-question-origine]')).toBeNull();
    expect(envois).toEqual([]);
    await cliquer(container.querySelector('[data-confirmer-archivage]'));
    await cliquer(container.querySelector('[data-origine="mise_en_vente"]'));
    await cliquer(container.querySelector('[data-sous-origine="autre_agence"]'));
    await cliquer(final());
    expect(envois).toEqual([{ action: 'sortir', sujet: 'proprietaire', id: 7, origine: { origine: 'mise_en_vente', sousOrigine: 'autre_agence', precision: null } }]);
    expect(container.textContent).toContain('EXEMPLE Claire est archivé');
  });

  it('④ un bien occupé : ORANGE → modale des biens occupés → « Confirmer… » → la question DANS LA MÊME MODALE → envoi', async () => {
    reponseApercu = () => apercu({
      occupees: [{ occupationId: 3, lotId: 40, adresse: '14 rue de l’Essai, PARIS', lot: '315', locataireId: 2, locataire: 'MODÈLE Jules', entree: '2024-09-01' }],
      partages: [{ lotId: 50, adresse: '9 rue Partagée, PARIS', lot: null, autres: ['COINDIVIS Marc'], occupe: false }],
    });
    await ouvrirClaire();
    expect(bouton()?.className).toBe('arc-gros arc-gros--alerte');
    expect(bouton()?.textContent).toContain('Attention, au moins un bien est actuellement occupé par un locataire');
    await cliquer(bouton());
    const modale = document.querySelector('[data-modale-archivage]');
    expect(modale).not.toBeNull();
    const occ = modale?.querySelector('[data-occupation="3"]');
    expect(occ?.textContent).toContain('14 rue de l’Essai, PARIS · lot 315');
    expect(occ?.textContent).toContain('MODÈLE Jules');
    expect(occ?.textContent).toContain('entré(e) le 01/09/2024');
    expect(modale?.querySelector('[data-biens-partages]')?.textContent).toContain('n’est PAS archivé');
    expect(modale?.querySelector('[data-biens-partages]')?.textContent).toContain('COINDIVIS Marc');
    expect(modale?.querySelector('[data-confirmer-archivage]')?.textContent).toBe('Confirmer l’archivage du propriétaire et de ses biens');
    await cliquer(modale?.querySelector('[data-confirmer-archivage]') ?? null);
    // Même modale (une seule), étape finale ; rien n'est parti.
    expect(document.querySelectorAll('[data-modale-archivage]')).toHaveLength(1);
    expect(document.querySelector('[data-modale-archivage] [data-question-origine]')).not.toBeNull();
    expect(envois).toEqual([]);
    const final = () => document.querySelector('[data-archiver-definitivement]') as HTMLButtonElement;
    expect(final().disabled).toBe(true);
    // « Retour » revient à la liste des biens occupés.
    await cliquer([...document.querySelectorAll('[data-modale-archivage] button')].find((b) => b.textContent === 'Retour') ?? null);
    expect(document.querySelector('[data-modale-archivage] [data-occupation="3"]')).not.toBeNull();
    await cliquer(document.querySelector('[data-confirmer-archivage]'));
    await cliquer(document.querySelector('[data-origine="deces_succession"]'));
    await cliquer(final());
    expect(envois).toEqual([{ action: 'sortir', sujet: 'proprietaire', id: 7, confirmeOccupation: true, origine: { origine: 'deces_succession', sousOrigine: null, precision: null } }]);
  });

  it('⑤ archivé : l’état daté et « Réactiver le propriétaire et ses biens »', async () => {
    reponseApercu = () => apercu({ sortie: { le: '2026-10-18T10:00:00Z', par: 'Arno', origine: 'Mise en vente par une autre agence' }, biens: [] });
    await ouvrirClaire();
    expect(container.querySelector('[data-archive]')?.textContent).toContain('Archivé le 18/10/2026 par Arno — Mise en vente par une autre agence');
    expect(bouton()?.textContent).toBe('Réactiver le propriétaire et ses biens');
    await cliquer(bouton());
    expect(envois).toEqual([{ action: 'reactiver', sujet: 'proprietaire', id: 7 }]);
  });

  it('sans le droit Gestion : la fiche commune n’est pas montée, le motif est dit', async () => {
    await act(async () => { root.render(createElement(EcranArchivageProprietaire, { refusFiche: 'Droit « Gestion » requis.' })); });
    await taper('exemple');
    await cliquer(container.querySelector('[data-index="0"]'));
    expect(container.querySelector('[data-fiche-commune]')).toBeNull();
    expect(container.textContent).toContain('Droit « Gestion » requis.');
  });

  it('fiche commune : sortir un propriétaire passe aussi par la dernière question ; l’origine s’affiche une fois archivé', async () => {
    const apres = vi.fn();
    await act(async () => { root.render(createElement(BlocSortie, { sujet: 'proprietaire', id: 7, sortie: null, apres, explication: 'Le propriétaire sort avec ses biens.' })); });
    await cliquer([...container.querySelectorAll('button')].find((b) => b.textContent === 'Sortir du portefeuille…') ?? null);
    expect(appels.some((u) => u.includes('apercuArchivage=7&sujet=proprietaire'))).toBe(true);
    await cliquer([...container.querySelectorAll('button')].find((b) => b.textContent === 'Confirmer la sortie') ?? null);
    expect(envois).toEqual([]);
    expect(container.querySelector('[data-question-origine]')).not.toBeNull();
    await cliquer(container.querySelector('[data-origine="recupere_proprietaire"]'));
    await cliquer(container.querySelector('[data-archiver-definitivement]'));
    expect(envois).toEqual([{ action: 'sortir', sujet: 'proprietaire', id: 7, origine: { origine: 'recupere_proprietaire', sousOrigine: null, precision: null } }]);
    expect(apres).toHaveBeenCalled();
    await act(async () => { root.render(createElement(BlocSortie, { sujet: 'proprietaire', id: 7, sortie: { le: '2026-10-18T10:00:00Z', par: 'Arno', origine: 'Litige' }, apres, explication: '' })); });
    expect(container.querySelector('[data-origine-archivage]')?.textContent).toContain('Archivé le 18/10/2026 par Arno — Litige');
  });

  it('écran intermédiaire : deux gros boutons (3D), TOUS DEUX rouges — tout le propriétaire / un des biens (mode « biens »)', async () => {
    await act(async () => { root.render(createElement(EcranSupprimerChoix)); });
    const liens = [...container.querySelectorAll('.loc-gros-boutons--3d a.loc-gros-bouton')];
    expect(liens.map((a) => [a.getAttribute('href'), a.firstChild?.textContent, a.classList.contains('loc-gros-bouton--plein')])).toEqual([
      ['/admin/location/proprietaires/archiver', 'Supprimer un propriétaire et tous ses biens', true],
      ['/admin/location/proprietaires/archiver?mode=biens', 'Supprimer un des biens d’un propriétaire', true],
    ]);
  });

  describe('mode « biens »', () => {
    const ouvrirBiens = async () => {
      await act(async () => { root.render(createElement(EcranArchivageProprietaire, { refusFiche: null, mode: 'biens' })); });
      await taper('exemple');
      await cliquer(container.querySelector('[data-index="0"]'));
    };
    const gros = () => container.querySelector('[data-bouton-sortie-biens] .arc-gros') as HTMLButtonElement;
    const choisir = (id: number) => cliquer(container.querySelector(`[data-choisir="${id}"]`));

    it('tous les biens affichés ; « Sortir de la gestion » sélectionne / désélectionne ; le gros bouton compte (grisé à zéro)', async () => {
      await ouvrirBiens();
      expect([...container.querySelectorAll('[data-bien]')].map((b) => b.getAttribute('data-bien'))).toEqual(['40', '50', '60']);
      expect(container.querySelector('[data-bien="40"]')?.textContent).toContain('Cave n° 3 (détachée)');
      expect(container.querySelector('[data-bien="50"]')?.textContent).toContain('le bien sortira pour tous');
      expect(gros().textContent).toBe('Sortir 0 bien de la gestion');
      expect(gros().disabled).toBe(true);
      await choisir(40);
      const b = container.querySelector('[data-choisir="40"]') as HTMLButtonElement;
      expect([b.getAttribute('aria-pressed'), b.textContent]).toEqual(['true', '✓ Sortir de la gestion']);
      expect(gros().textContent).toBe('Sortir 1 bien de la gestion');
      expect(gros().disabled).toBe(false);
      await choisir(40);
      expect(b.getAttribute('aria-pressed')).toBe('false');
      expect(gros().disabled).toBe(true);
      expect(envois).toEqual([]);
    });

    it('cartes au format unique : adresse · type · occupation · bouton en bas ; loué en vert + entrée ; vacant en rouge + dernier(s) locataire(s) en violet ; jamais loué', async () => {
      await ouvrirBiens();
      for (const id of ['40', '50', '60']) {
        const c = container.querySelector(`[data-bien="${id}"]`) as HTMLElement;
        expect([...c.children].map((x) => x.className.split(' ')[0]).filter((x) => x !== 'arc-bien-plus'))
          .toEqual(['arc-bien-adresse', 'arc-bien-type', 'arc-bien-occupation', 'arc-choisir']);
        expect(c.lastElementChild?.getAttribute('data-choisir')).toBe(id);
      }
      const loue = container.querySelector('[data-bien="40"] .arc-bien-occupation');
      expect(loue?.querySelector('[data-en-place]')?.textContent).toBe('MODÈLE Jules');
      expect(loue?.textContent).toContain('Loué à MODÈLE Jules');
      expect(loue?.textContent).toContain('Entré(e) dans les lieux le 01/09/2024');
      const vacant = container.querySelector('[data-bien="50"] .arc-bien-occupation');
      expect(vacant?.querySelector('[data-vacant]')?.textContent).toBe('Logement vacant');
      expect(vacant?.querySelector('[data-dernier]')?.textContent).toBe('ANCIEN Paul, ANCIENNE Zoé');
      expect(vacant?.textContent).toContain('Dernier locataire : ANCIEN Paul, ANCIENNE Zoé');
      expect(vacant?.querySelector('[data-sortie-le]')?.textContent).toBe('Sorti(e) le 30/06/2026');
      const jamais = container.querySelector('[data-bien="60"] .arc-bien-occupation');
      expect(jamais?.querySelector('[data-vacant]')?.textContent).toBe('Parking vacant');
      expect(jamais?.querySelector('[data-jamais-loue]')?.textContent).toBe('Aucun locataire connu');
      // Hauteur égale et boutons alignés en bas : la règle CSS (mesurée au banc dans un vrai navigateur).
      const css = readFileSync('app/(admin)/admin/(protected)/location/ArchivageProprietaire.tsx', 'utf8');
      expect(css).toContain('.arc-biens-liste{align-items:stretch}');
      expect(css).toContain('height:100%;box-sizing:border-box}');
      expect(css).toContain('.arc-bien-carte .arc-choisir{margin-top:auto}');
      expect(css).toContain('-webkit-line-clamp:2');
      expect(css).toContain('.arc-surligne--en-place{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}');
      expect(css).toContain('.arc-surligne--ancien{background:var(--color-svv-violet-soft);color:var(--color-svv-violet)}');
    });

    it('un bien occupé : la fenêtre d’alerte LIMITÉE à la sélection → « Confirmer la sortie de ces biens » → origine « …de ces biens » → envoi', async () => {
      reponseBiens = () => apercu({ portee: 'biens', biens: [40, 41], lotsChoisis: [40],
        occupees: [{ occupationId: 3, lotId: 40, adresse: '14 rue de l’Essai, PARIS', lot: '315', locataireId: 2, locataire: 'MODÈLE Jules', entree: '2024-09-01' }] });
      await ouvrirBiens();
      await choisir(40);
      await cliquer(gros());
      expect(appels.some((u) => u.includes('apercuSortieBiens=7&lots=40'))).toBe(true);
      const m = document.querySelector('[data-modale-archivage]');
      expect(m?.querySelector('#arc-titre')?.textContent).toBe('Attention, au moins un bien sélectionné est actuellement occupé par un locataire');
      expect([...(m?.querySelectorAll('[data-occupation]') ?? [])].map((x) => x.getAttribute('data-occupation'))).toEqual(['3']);
      await cliquer([...(m?.querySelectorAll('button') ?? [])].find((x) => x.textContent === 'Confirmer la sortie de ces biens') ?? null);
      expect(document.querySelector('[data-question-origine]')?.textContent).toContain('Quelle est l’origine de la sortie de ces biens ?');
      const fin = () => document.querySelector('[data-archiver-definitivement]') as HTMLButtonElement;
      expect([fin().textContent, fin().disabled]).toEqual(['Sortir définitivement', true]);
      expect(envois).toEqual([]);
      await cliquer(document.querySelector('[data-origine="litige"]'));
      await cliquer(fin());
      expect(envois).toEqual([{ action: 'sortir-biens', proprietaireId: 7, lotIds: [40], origine: { origine: 'litige', sousOrigine: null, precision: null }, confirmeOccupation: true }]);
    });

    it('aucun bien occupé : confirmation simple, bien partagé signalé (il sort pour tous), puis origine → envoi', async () => {
      reponseBiens = () => apercu({ portee: 'biens', biens: [50], lotsChoisis: [50],
        partages: [{ lotId: 50, adresse: '9 rue Partagée, PARIS', lot: null, autres: ['COINDIVIS Marc'], occupe: false }] });
      await ouvrirBiens();
      await choisir(50);
      await cliquer(gros());
      expect(document.querySelector('[data-modale-archivage]')).toBeNull();
      expect(container.querySelector('[data-biens-partages]')?.textContent).toContain('le bien sort pour tous');
      await cliquer(container.querySelector('[data-confirmer-archivage]'));
      expect(container.querySelector('[data-question-origine]')?.textContent).toContain('de ces biens');
      expect(envois).toEqual([]);
      await cliquer(container.querySelector('[data-origine="mise_en_vente"]'));
      expect((container.querySelector('[data-archiver-definitivement]') as HTMLButtonElement).disabled).toBe(true);
      await cliquer(container.querySelector('[data-sous-origine="lui_meme"]'));
      await cliquer(container.querySelector('[data-archiver-definitivement]'));
      expect(envois).toEqual([{ action: 'sortir-biens', proprietaireId: 7, lotIds: [50], origine: { origine: 'mise_en_vente', sousOrigine: 'lui_meme', precision: null } }]);
    });

    it('TOUS les biens choisis : bandeau, puis exactement le parcours de l’archivage du propriétaire', async () => {
      await ouvrirBiens();
      await choisir(40); await choisir(50); await choisir(60);
      expect(container.querySelector('[data-tous-les-biens]')?.textContent).toBe('Tous les biens de ce propriétaire sont sélectionnés : le propriétaire sortira lui aussi de la gestion et sera archivé');
      await cliquer(gros());
      expect(appels.some((u) => u.includes('apercuSortieBiens='))).toBe(false);
      expect(container.querySelector('.arc-confirmation')?.textContent).toContain('Archiver EXEMPLE Claire et son historique ?');
      await cliquer(container.querySelector('[data-confirmer-archivage]'));
      expect(container.querySelector('[data-question-origine]')?.textContent).toContain('Quelle est l’origine de l’archivage de ce propriétaire ?');
      expect(container.querySelector('[data-archiver-definitivement]')?.textContent).toBe('Archiver définitivement');
      await cliquer(container.querySelector('[data-origine="deces_succession"]'));
      await cliquer(container.querySelector('[data-archiver-definitivement]'));
      expect(envois).toEqual([{ action: 'sortir-biens', proprietaireId: 7, lotIds: [40, 50, 60], origine: { origine: 'deces_succession', sousOrigine: null, precision: null } }]);
    });
  });
});
