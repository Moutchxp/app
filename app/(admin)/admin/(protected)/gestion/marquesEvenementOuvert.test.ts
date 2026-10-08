// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { LigneVie } from './VieDuBien';
import type { LigneHistorique } from '../../../../lib/gestion/historique';

/**
 * ══ 🔴🔴 LOT RETABLIR-MARQUES-EVENEMENT — LES DEUX MARQUES ORANGE « ÉVÉNEMENT EN COURS » ════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE, ET CE QU'IL PROTÈGE
 *
 * CONSTAT D'ARNO (08/10/2026), fiche du bien 315 : « La ligne ORANGE qui s'affichait juste sous l'en-tête du bien
 * […] a DISPARU. Les petites CAPSULES ORANGE qui marquaient chaque mail compris dans la période d'un événement
 * (“Événement ouvert”) ont DISPARU de la liste des mails. Arno n'a JAMAIS demandé ces retraits. »
 *
 * ═══ 🔴🔴 CE QUE L'ENQUÊTE A TROUVÉ, ET IL FAUT L'ÉCRIRE ICI ════════════════════════════════════════════════════
 *
 * AUCUN RETRAIT N'A EU LIEU. Les quatre fichiers qui portent ces marques — `Annuaire.tsx`, `VieDuBien.tsx`,
 * `HistoriqueDuBien.tsx`, `annuaireRepo.ts` — sont OCTET POUR OCTET ceux du dernier push d'hier (d3277923) : ils
 * n'ont été touchés par aucun des lots du 08/10.
 *
 * CE QUI A CHANGÉ EST LA DONNÉE. Les deux marques sont conditionnées à un événement **OUVERT**, et le seul
 * événement du bien 315 (GES-2026-000001) a été CLOS le **07/10 à 19:07**, à la main, par Arno lui-même — journal
 * `gestion_journal` n° 43977, « état de GES-2026-000001 changé à la main », `en_cours` → `traite`. Les marques
 * disparaissent donc en disant la vérité : il n'y a plus d'événement en cours sur ce bien.
 *
 * ⚠️ C'EST PRÉCISÉMENT POURQUOI CE FICHIER EST UTILE. Une absence qui s'explique par la donnée et une absence
 * causée par un retrait se ressemblent À L'ÉCRAN, et rien ne les distinguait dans la suite. Ces épreuves montent
 * la ligne de mail AVEC un événement ouvert : si quelqu'un retire la capsule, elles rougissent — et si elle
 * disparaît encore parce que tout est clos, elles restent vertes et l'on sait que le code n'y est pour rien.
 *
 * 🔴 LA RÈGLE EST UNIQUE, ET C'EST CE QUI REND LES DEUX MARQUES COHÉRENTES : « un événement NON traité »
 * (`e.etat <> 'traite'`), écrite dans `annuaireRepo` pour le cartouche et reprise AU MOT PRÈS par
 * `historiqueBienRepo` pour les lignes de mail. Deux prédicats auraient fini par afficher la ligne sans les
 * capsules, ou l'inverse.
 *
 * 🔒 Aucun réseau, aucune base, aucun mail ni événement RÉEL : la ligne est fabriquée ici.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ANNUAIRE = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
const VIE = readFileSync('app/(admin)/admin/(protected)/gestion/VieDuBien.tsx', 'utf8');
const HISTO = readFileSync('app/(admin)/admin/(protected)/gestion/HistoriqueDuBien.tsx', 'utf8');
const REPO_ANNUAIRE = readFileSync('app/lib/gestion/annuaireRepo.ts', 'utf8');
const REPO_HISTO = readFileSync('app/lib/gestion/historiqueBienRepo.ts', 'utf8');
const GLOBALS = readFileSync('app/globals.css', 'utf8');

const MAINTENANT = new Date('2026-10-08T12:00:00Z');

/** Un événement de ligne, ouvert ou clos. C'est `ouvert` qui commande la capsule, et lui seul. */
const evt = (id: number, ouvert: boolean) => ({
  id, reference: `GES-2026-00000${id}`, objet: 'Fuite salle de bain',
  etat: ouvert ? 'en_cours' : 'traite', ouvert,
});

const LIGNE = (evenements: ReturnType<typeof evt>[]): LigneHistorique => ({
  messageId: 1, filId: 1, messageIdRfc: '<a@x>', recuLe: '2026-10-06T08:00:00Z',
  sens: 'recu', de: 'locataire@exemple.test', deNom: 'DUPONT Marie',
  destinataires: [], a: [], cc: [], cci: [],
  objet: 'Problème de chauffe-eau', extrait: 'Bonjour,', pieces: [],
  parCible: { sorte: 'lot', cle: '315', id: null }, cibleLibelle: 'lot 315',
  source: 'rattachement', evenements,
  statut: null, statutDetail: null,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  global.fetch = vi.fn(async () => (
    { ok: true, status: 200, json: async () => ({}) } as unknown as Response
  )) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const monterLigne = async (l: LigneHistorique) => {
  await act(async () => {
    root.render(createElement(LigneVie, { l, maintenant: MAINTENANT, ouvert: false, onBasculer: () => {} }));
  });
  await act(async () => { await Promise.resolve(); });
};

const capsuleEvt = (): HTMLElement | null => container.querySelector('.vdb-capsule--evt');

describe('🔴🔴 ① la capsule orange d’un mail compris dans la période d’un événement', () => {
  /**
   * 🔴🔴 LE CAS QUI COMPTE : un mail dont l'événement est OUVERT porte sa capsule. C'est l'épreuve qui rougira
   * si quelqu'un la retire — et elle seule peut faire la différence avec une base où tout est clos.
   */
  it('🔴🔴 un événement OUVERT met la capsule « Événement en cours » sur le mail', async () => {
    await monterLigne(LIGNE([evt(1, true)]));
    expect(capsuleEvt()).not.toBeNull();
    /**
     * ⚠️ LE MOT A CHANGÉ AU LOT MARQUES-EVENEMENT-EN-COURS, SUR DEMANDE D'ARNO : « Événement ouvert » devient
     * « Événement en cours », celui de la bande de l'en-tête. La MARQUE, elle, est intacte — même place, même
     * classe, même paire de couleurs : ce que ce fichier protège n'a pas bougé d'un cran.
     */
    expect(capsuleEvt()?.textContent).toBe('Événement en cours');
  });

  /** 🔴 PLUSIEURS ÉVÉNEMENTS OUVERTS : la capsule les COMPTE, elle ne se répète pas. */
  it('🔴 deux événements ouverts : « 2 événements en cours »', async () => {
    await monterLigne(LIGNE([evt(1, true), evt(2, true)]));
    expect(capsuleEvt()?.textContent).toBe('2 événements en cours');
    expect(container.querySelectorAll('.vdb-capsule--evt')).toHaveLength(1);
  });

  /**
   * 🔴 UN ÉVÉNEMENT CLOS N'EN MET PAS, et ce n'est pas un retrait : c'est la règle, et c'est elle qui explique
   * l'absence constatée par Arno le 08/10 — GES-2026-000001 a été clos le 07/10 à 19:07.
   */
  it('🔴 un événement CLOS ne met aucune capsule — c’est la règle, pas un retrait', async () => {
    await monterLigne(LIGNE([evt(1, false)]));
    expect(capsuleEvt()).toBeNull();
  });

  /** ⚠️ ET UN MAIL HORS DE TOUTE PÉRIODE N'EN A PAS DAVANTAGE. */
  it('⚠️ aucun événement : aucune capsule', async () => {
    await monterLigne(LIGNE([]));
    expect(capsuleEvt()).toBeNull();
  });

  /**
   * 🔴🔴 ET ELLE EST BIEN SUR LA FICHE DU BIEN. `VieDuBien` n'y est plus monté depuis le lot HISTORIQUE-BIEN-2
   * (accord d'Arno, « deux listings de mails, c'est un de trop »), mais `HistoriqueDuBien` — qui l'a remplacé —
   * rend `LigneVie` pour chacun de ses mails, IMPORTÉE et non recopiée. Si ce lien se défaisait, les capsules
   * disparaîtraient de la fiche sans que rien d'autre ne rougisse.
   */
  it('🔴🔴 le moteur de la fiche du bien rend bien `LigneVie`, importée et non recopiée', () => {
    expect(HISTO).toContain("import { CSS_VIE_DU_BIEN, LigneVie } from './VieDuBien';");
    expect(HISTO).toContain('<LigneVie');
    /* ⚠️ ET SA FEUILLE EST MONTÉE AVEC ELLE : une ligne sans ses règles serait une capsule invisible. */
    expect(HISTO).toContain('CSS_VIE_DU_BIEN');
  });
});

describe('🔴🔴 ② la ligne orange « Événement en cours », sous l’en-tête du bien', () => {
  /**
   * 🔴🔴 LE CARTOUCHE DE LA FICHE. Il n'est pas exporté (fonction locale d'un écran de 2 500 lignes qui ne se
   * monte pas dans une épreuve) : on le tient par son texte, sa condition et son rendu sur la fiche d'un bien.
   */
  it('🔴🔴 `CartoucheEvenement` existe, dit les deux mots, et se tait à zéro', () => {
    expect(ANNUAIRE).toContain('function CartoucheEvenement({ nb, onOuvrir }');
    expect(ANNUAIRE).toContain('if (nb <= 0) return null;');
    expect(ANNUAIRE).toContain("const mot = nb > 1 ? `${nb} événements en cours` : 'Événement en cours';");
  });

  /** 🔴🔴 ET IL EST RENDU SUR LA FICHE D'UN BIEN, avec le compte des événements OUVERTS de ce bien. */
  it('🔴🔴 il est rendu sur la fiche du bien, branché sur `evenementsOuverts`', () => {
    expect(ANNUAIRE).toContain('<CartoucheEvenement nb={f.evenementsOuverts}');
  });

  /**
   * 🔴 LA LIGNE DU MOTEUR, ELLE AUSSI. Elle nomme l'événement en cours sous les réglages de l'historique, et elle
   * suit la même condition — un événement OUVERT.
   */
  it('🔴 le moteur affiche sa ligne « Événement en cours » quand il y en a un', () => {
    expect(HISTO).toContain('const evenementOuvert = evenements.find((e) => e.ouvert) ?? null;');
    expect(HISTO).toContain('<span className="hdb-evt-capsule">Événement en cours</span>');
  });
});

describe('🔴🔴 ③ les trois marques sont ORANGE, et le restent dans les deux thèmes', () => {
  /**
   * 🔴 LA FAMILLE AMBRE DU DÉPÔT (`--color-svv-amber-soft` + `--color-svv-amber`), celle des avertissements.
   * Aucune couleur en dur, et les deux jetons existent en Clair comme en Sombre.
   *
   * ⚠️ C'EST AUSSI POURQUOI LE NIVEAU « Intermédiaire » DU LOT URGENCE-EVENEMENT A SA PROPRE FAMILLE ORANGE :
   * l'ambre portait DÉJÀ « événement en cours » sur cette fiche, et lui donner un second sens aurait fait dire
   * deux choses à une seule couleur.
   */
  it.each([
    ['le cartouche de la fiche', ANNUAIRE, /\.ann-cartouche\{([^}]*)\}/],
    ['la capsule d’un mail', VIE, /\.vdb-capsule--evt\{([^}]*)\}/],
    ['la ligne du moteur', HISTO, /\.hdb-evt-capsule\{([^}]*)\}/],
  ])('🔴 %s tire la paire ambre, et rien en dur', (_nom, src, motif) => {
    const regle = (src as string).match(motif as RegExp);
    expect(regle).not.toBeNull();
    const corps = regle?.[1] ?? '';
    expect(corps).toContain('--color-svv-amber-soft');
    expect(corps).toContain('--color-svv-amber)');
    expect(corps).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it('🔴 et les deux jetons existent en Clair comme en Sombre', () => {
    for (const jeton of ['--color-svv-amber', '--color-svv-amber-soft']) {
      expect((GLOBALS.match(new RegExp(`${jeton}:`, 'g')) ?? []).length, jeton).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('🔴🔴 ④ une seule règle « événement ouvert », pour les deux marques', () => {
  /**
   * 🔴🔴 LE MÊME PRÉDICAT DES DEUX CÔTÉS : « un événement NON traité ». S'ils divergeaient, la fiche pourrait
   * annoncer un événement en cours sans qu'aucun mail ne porte sa capsule — ou l'inverse, ce qui est pire.
   */
  it('🔴🔴 le cartouche et les lignes comptent le même « non traité »', () => {
    /* ① LE CARTOUCHE : le compte EXCLUT les événements traités, en SQL. */
    expect(REPO_ANNUAIRE).toContain("WHERE e.etat <> 'traite'");
    /**
     * ② LES LIGNES DE MAIL : le même fait, dit à l'endroit où il sert — un drapeau `ouvert` par événement, posé
     * sur la MÊME comparaison. Le dépôt de l'historique ne FILTRE pas (il rend aussi les événements clos, pour
     * le sélecteur de période) : il ÉTIQUETTE, et c'est l'écran qui ne garde que les ouverts.
     */
    expect((REPO_HISTO.match(/ouvert: r\.etat !== 'traite',/g) ?? []).length).toBeGreaterThanOrEqual(2);
    /* 🔴 ET LE DÉPÔT DE L'HISTORIQUE LE DIT EN TOUTES LETTRES : c'est le prédicat du cartouche, au mot près. */
    expect(REPO_HISTO).toContain('LE PRÉDICAT EST **CELUI DU CARTOUCHE DE LA FICHE**, AU MOT PRÈS');
    /* ③ ET C'EST L'ÉCRAN QUI NE RETIENT QUE LES OUVERTS, des deux côtés — ligne de mail et ligne du moteur. */
    expect(VIE).toContain('const ouverts = l.evenements.filter((e) => e.ouvert);');
    /* 🔴 ET LE MOT DE LA CAPSULE VIENT DÉSORMAIS DU MODULE PUR, partagé par les QUATRE écrans du lot
       MARQUES-EVENEMENT-EN-COURS — il n'est plus écrit dans le composant. */
    expect(VIE).toContain('motEvenementEnCours(ouverts.length)');
    expect(HISTO).toContain('const evenementOuvert = evenements.find((e) => e.ouvert) ?? null;');
  });
});
