// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { LigneVie } from './VieDuBien';
import { motEvenementEnCours } from '../../../../lib/gestion/evenementQualite';
import { etatApresCarte } from '../../../../lib/gestion/mongaEtape';
import type { LigneHistorique } from '../../../../lib/gestion/historique';

/**
 * ══ 🔴🔴 LOT MARQUES-EVENEMENT-EN-COURS — LA BANDE ET LES ÉTIQUETTES REVIENNENT APRÈS UNE RÉOUVERTURE ═══════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (08/10/2026) : « Il vient de rouvrir l'événement du bien 315 avec la carte “Réouverture”. La
 * bande orange sous le bloc d'adresse de la fiche bien n'est PAS réapparue. Les mails de la période ne portent
 * aucune marque. »
 *
 * ═══ 🔴🔴 CE QUE LE LOT PRÉCÉDENT A PROUVÉ, ET POURQUOI IL NE SUFFISAIT PAS ═════════════════════════════════════
 *
 * RETABLIR-MARQUES-EVENEMENT (commit `8d5263dc`) avait raison sur le fond : aucun code n'avait été retiré, et
 * `marquesEvenementOuvert.test.ts` le garde. Mais il n'a répondu qu'à la question « le code est-il là ? ». La
 * panne d'aujourd'hui est AILLEURS : le code est là, les données sont bonnes, et pourtant l'écran ne montre rien
 * — parce que RIEN NE RELIT LA FICHE après un geste posé plus bas sur la MÊME page. Poser la carte
 * « Réouverture » dans la frise ne rechargeait que la frise.
 *
 * 🔴 C'EST DONC UN DÉFAUT DE CHAÎNE, ET CE FICHIER ÉPROUVE LA CHAÎNE, maillon par maillon :
 *   ① la route dit si l'état a changé            (`etatEvenement` dans sa réponse) ;
 *   ② la frise le répercute                      (`onEtatEvenement`) ;
 *   ③ le bloc « Événements » le remonte          (`onEtatEvenement`) ;
 *   ④ la fiche relit la fiche ET l'historique    (`recharger` + `signalRelire`) ;
 *   ⑤ l'historique redemande ses DEUX sources    (la liste d'événements ET ses lignes de mail).
 * Un seul maillon qui saute, et la bande reste absente : c'est exactement ce qu'Arno a vu.
 *
 * ⚠️ UNE ÉPREUVE D'ÉCRAN NE PEUT PAS VOIR CE DÉFAUT, et c'est pourquoi il est tenu par le TEXTE des fichiers.
 * Monter l'Annuaire entier (2 500 lignes, une douzaine de requêtes) pour observer un rechargement n'aurait
 * éprouvé que la mécanique de `fetch` simulée. Ce qui a manqué ici est un BRANCHEMENT, et un branchement se lit.
 *
 * 🔒 Aucun réseau, aucune base, aucun mail ni événement RÉEL : la ligne de mail est fabriquée ici.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ANNUAIRE = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
const HISTO = readFileSync('app/(admin)/admin/(protected)/gestion/HistoriqueDuBien.tsx', 'utf8');
const EVTS = readFileSync('app/(admin)/admin/(protected)/gestion/EvenementsDuBien.tsx', 'utf8');
const FRISE = readFileSync('app/(admin)/admin/(protected)/gestion/FriseAvancement.tsx', 'utf8');
const ROUTE = readFileSync('app/(admin)/api/admin/gestion/evenements/[id]/frise/route.ts', 'utf8');
/* 🔴 LOT ETAT-PAR-LA-FRISE — retirer une carte de BORNE change l'état lui aussi : la route des étapes doit
   donc le dire, exactement comme celle de la frise quand on en POSE une. */
const ROUTE_ETAPES = readFileSync('app/(admin)/api/admin/gestion/etapes/[id]/route.ts', 'utf8');
const VIE = readFileSync('app/(admin)/admin/(protected)/gestion/VieDuBien.tsx', 'utf8');
const BOITE = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteMail.tsx', 'utf8');
const CONV = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');
const REPO_HISTO = readFileSync('app/lib/gestion/historiqueRepo.ts', 'utf8');
const REPO_BOITE = readFileSync('app/lib/gestion/boiteRepo.ts', 'utf8');
const REPO_RECH = readFileSync('app/lib/gestion/rechercheBoite.ts', 'utf8');
const REPO_CARTE = readFileSync('app/lib/gestion/carteRepo.ts', 'utf8');

const MAINTENANT = new Date('2026-10-08T12:00:00Z');

const evt = (id: number, ouvert: boolean) => ({
  id, reference: `GES-2026-00000${id}`, objet: 'Fuite salle de bain',
  etat: ouvert ? 'en_cours' : 'traite', ouvert,
});

const LIGNE = (evenements: ReturnType<typeof evt>[]): LigneHistorique => ({
  messageId: 1, filId: 1, messageIdRfc: '<a@x>', recuLe: '2026-10-06T08:00:00Z',
  sens: 'recu', de: 'locataire@exemple.test', deNom: 'DUPONT Marie',
  destinataires: [], a: [], cc: [], cci: [],
  /* 🔴 LOT RECHERCHE-MAILS-PAR-ADRESSE — les deux familles d'adresses ajoutées à la ligne. */
  repondreA: [], adressesTexte: [],
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

describe('🔴🔴 ① une OUVERTURE comme une RÉOUVERTURE rendent l’événement « en cours »', () => {
  /**
   * 🔴🔴 LA CARTE « RÉOUVERTURE » POSE BIEN `en_cours`, et c'est la racine de tout : les deux marques ne
   * regardent QUE cela. Si ce verdict changeait, la bande et les capsules disparaîtraient sans qu'aucune épreuve
   * d'écran ne bouge.
   */
  it('🔴🔴 « reouverture » ⇒ en_cours, « cloture » ⇒ traite, le reste ne touche à rien', () => {
    expect(etatApresCarte('reouverture')).toBe('en_cours');
    expect(etatApresCarte('cloture')).toBe('traite');
    expect(etatApresCarte('ouverture')).toBeNull();
    expect(etatApresCarte('devis_recu')).toBeNull();
  });

  /**
   * 🔴 ET LES DEUX MARQUES NE DISTINGUENT PAS LES DEUX CHEMINS, ce qui est le point : un événement rouvert est un
   * événement en cours, point. La ligne de mail porte donc sa capsule après une réouverture exactement comme
   * après une ouverture — c'est le MÊME `ouvert: true`, par construction.
   */
  it('🔴 la capsule du mail ne sait pas, et n’a pas à savoir, d’où vient l’ouverture', async () => {
    await monterLigne(LIGNE([evt(1, true)]));
    expect(container.querySelector('.vdb-capsule--evt')?.textContent).toBe('Événement en cours');
  });
});

describe('🔴🔴 ② LA CHAÎNE DE RELECTURE — le maillon qui manquait', () => {
  /** ① LA ROUTE DIT SI L'ÉTAT A CHANGÉ. Sans cela, le client devrait le DEVINER d'après le type de carte. */
  /**
   * ══ 🔴🔴 LOT ETAT-PAR-LA-FRISE (08/10/2026) — LE SIGNAL EST LE MÊME, SA SOURCE A CHANGÉ ════════════════
   *
   * `etatEvenement` valait `issue.ok ? etatVoulu : null` — l'état VOULU par la carte posée, et le succès de
   * l'écriture qui le rangeait. Il n'y a plus d'écriture : l'état se DÉDUIT des cartes de borne.
   *
   * 🔴 LA ROUTE RELIT DONC L'ÉTAT APRÈS LA CARTE, et ne le DEVINE pas depuis le type posé : une Clôture datée
   * avant une Réouverture déjà présente ne ferme rien. Annoncer « clôturé » dans ce cas aurait fait relire la
   * fiche sur une fausse nouvelle — exactement le genre de petit mensonge que ce lot supprime.
   */
  it('🔴🔴 ① la route de la frise rend `etatEvenement`, relu APRÈS la carte', () => {
    expect(ROUTE).toContain('etatApresCarte(type)');
    expect(ROUTE).toContain('const ouvertApres = apres[0]?.ouvert ?? ouvertAvant;');
    expect(ROUTE).toContain('etatEvenement: change ? etatApresCarteSelonLaFrise(ouvertApres) : null,');
    /* 🔴 ET PLUS AUCUNE ÉCRITURE D'ÉTAT DANS CETTE ROUTE : la carte est la seule. */
    expect(ROUTE).not.toContain('changerEtatEvenement(');
  });

  /**
   * 🔴🔴 ①bis RETIRER UNE CARTE DE BORNE LE DIT AUSSI (Arno, point 2 : « Supprimer la carte Clôture d'un
   * événement clos le ROUVRE »). Sans ce signal, la bande orange ne reviendrait qu'au rechargement suivant —
   * c'est-à-dire le constat d'Arno du lot MARQUES-EVENEMENT-EN-COURS, par la porte d'à côté.
   */
  it('🔴🔴 ①bis la route des étapes annonce le changement d’état après un retrait', () => {
    expect(ROUTE_ETAPES).toContain('const ouvertAvant = borne && evenementId !== null');
    expect(ROUTE_ETAPES).toContain('etatEvenement: change ? etatApresCarteSelonLaFrise(ouvertApres as boolean) : null,');
    /* 🔴 ET LA FRISE LE RÉPERCUTE, par le même chemin que l'ajout. */
    expect(FRISE).toContain("if (d.etat === 'ok' && (d.etatEvenement === 'traite' || d.etatEvenement === 'en_cours')) {");
  });

  /**
   * ② LA FRISE LE RÉPERCUTE. `onFait` ne rechargeait QUE la frise : c'est là que la chaîne s'arrêtait, et c'est
   * la cause exacte du constat d'Arno.
   */
  it('🔴🔴 ② la frise annonce le changement d’état à son parent', () => {
    expect(FRISE).toContain('onEtatEvenement?: () => void');
    expect(FRISE).toContain('if (etatChange === true) onEtatEvenement?.();');
  });

  /** ③ LE BLOC « ÉVÉNEMENTS » LE REMONTE — tout en se rechargeant lui-même, comme avant. */
  it('🔴🔴 ③ le bloc « Événements » remonte le signal, et se recharge toujours', () => {
    expect(EVTS).toContain('onEtatEvenement?: () => void');
    expect(EVTS).toContain('onEtatEvenement={() => { void charger(); onEtatEvenement?.(); }}');
  });

  /**
   * ④ LA FICHE RELIT DEUX CHOSES, ET IL FAUT LES DEUX : la FICHE (d'où vient `evenementsOuverts`, donc la bande)
   * et l'HISTORIQUE (d'où viennent les capsules). N'en relire qu'une laisse l'autre sur l'état d'avant.
   */
  it('🔴🔴 ④ la fiche du bien relit la fiche ET prévient l’historique', () => {
    expect(ANNUAIRE).toContain('onEtatEvenement={() => { setSignalEvenement((n) => n + 1); onEtatEvenement?.(); }}');
    expect(ANNUAIRE).toContain('onEtatEvenement={recharger}');
    expect(ANNUAIRE).toContain('signalRelire={signalEvenement}');
  });

  /**
   * ⑤ L'HISTORIQUE REDEMANDE SES DEUX SOURCES. Sa liste d'événements porte la ligne orange du moteur ; ses
   * LIGNES portent les capsules. Deux requêtes distinctes, deux relectures.
   */
  it('🔴🔴 ⑤ l’historique redemande sa liste d’événements ET ses lignes', () => {
    expect(HISTO).toContain('signalRelire?: number');
    /* La liste d'événements : le signal entre dans les dépendances de son effet. */
    expect(HISTO).toContain('}, [lotCle, signalRelire]);');
    /* Les lignes : le compteur de rechargement avance — celui dont les trois effets de page dépendent. */
    expect(HISTO).toContain('setRechargement((n) => n + 1);');
    /* ⚠️ ET PAS AU PREMIER PASSAGE : sans ce garde, chaque ouverture de fiche doublerait ses requêtes. */
    expect(HISTO).toContain('if (signalVu.current === signalRelire) return;');
  });

  /**
   * 🔴 LE CARTOUCHE N'A PAS BOUGÉ, et c'est volontaire. Arno : « Si l'ancien rendu n'avait pas ces éléments,
   * garde-le à l'identique. » Il dit le NOMBRE, pas les titres — ces deux épreuves rougiraient si quelqu'un le
   * déplaçait, le conditionnait ou le réécrivait.
   */
  it('🔴 la bande reste CELLE D’AVANT : même mot, même condition, même place sous l’en-tête', () => {
    expect(ANNUAIRE).toContain("const mot = nb > 1 ? `${nb} événements en cours` : 'Événement en cours';");
    expect(ANNUAIRE).toContain('if (nb <= 0) return null;');
    /* 🔴 SA PLACE : entre la fin de l'en-tête (le bloc d'adresse) et le premier bloc de la fiche. */
    expect(ANNUAIRE).toMatch(/<\/header>\s*\n\s*\{\/\*\*?[\s\S]{0,400}?<CartoucheEvenement nb=\{f\.evenementsOuverts\}/);
  });
});

describe('🔴🔴 ③ LA CAPSULE ORANGE EST PARTOUT OÙ LA LIGNE D’UN MAIL S’AFFICHE', () => {
  /**
   * 🔴🔴 LES QUATRE ENDROITS NOMMÉS PAR ARNO, et le fait qu'ils lisent TOUS le même mot. C'est l'épreuve qui
   * rougit si l'un des trois nouveaux est retiré — ou si quelqu'un y recopie le mot au lieu de l'appeler.
   */
  it.each([
    ['l’historique du bien (LigneVie)', () => VIE],
    ['la boîte, le plein écran et la recherche (BoiteMail)', () => BOITE],
    ['la conversation', () => CONV],
  ])('🔴🔴 %s affiche la capsule par `motEvenementEnCours`', (_nom, src) => {
    expect(src()).toContain('motEvenementEnCours');
    expect(src()).toMatch(/capsule--evt/);
  });

  /**
   * 🔴 LE MOT N'EST ÉCRIT QU'UNE FOIS. Trois copies auraient divergé au premier changement — c'est le défaut que
   * ce lot répare justement entre la bande (« en cours ») et l'ancienne capsule (« ouvert »).
   */
  it('🔴 le mot vient du module pur, et il compte au-delà de un', () => {
    expect(motEvenementEnCours(0)).toBeNull();
    expect(motEvenementEnCours(-1)).toBeNull();
    expect(motEvenementEnCours(Number.NaN)).toBeNull();
    expect(motEvenementEnCours(1)).toBe('Événement en cours');
    expect(motEvenementEnCours(3)).toBe('3 événements en cours');
  });

  /**
   * 🔴🔴 ET LES TROIS DÉPÔTS POSENT LA MÊME QUESTION À LA MÊME FONCTION. C'est ce qui rend la capsule de la boîte
   * égale à celle de l'historique PAR CONSTRUCTION : les deux voies d'Arno (affectation du fil, fenêtre de
   * l'événement sur le bien du mail) n'existent qu'à un seul endroit du dépôt.
   */
  it.each([
    ['la boîte (réception + plein écran)', () => REPO_BOITE],
    ['la recherche', () => REPO_RECH],
    ['la conversation', () => REPO_CARTE],
  ])('🔴🔴 %s appelle `evenementsOuvertsDesMails`, sans réécrire la règle', (_nom, src) => {
    expect(src()).toContain("import { evenementsOuvertsDesMails } from './historiqueRepo';");
    expect(src()).toContain('await evenementsOuvertsDesMails(');
    /* ⚠️ ET NE RECOPIE NI LA FENÊTRE NI LES DEUX VOIES : aucun SQL d'événement de son côté. */
    expect(src()).not.toContain('gestion_evenement_partie');
  });

  /**
   * 🔴 LA FONCTION PARTAGÉE NE GARDE QUE LES OUVERTS, et c'est pour cela qu'aucun écran n'a de filtre à refaire
   * — donc aucun moyen d'en oublier un. Elle unit les deux voies avant de filtrer.
   */
  it('🔴 `evenementsOuvertsDesMails` unit les deux voies, puis ne garde que les ouverts', () => {
    expect(REPO_HISTO).toContain('export async function evenementsOuvertsDesMails(');
    /* 🔴 LOT ETAT-PAR-LA-FRISE — LES DEUX VOIES SONT CLÉES PAR MESSAGE : deux mails d'un même fil peuvent
       tomber de part et d'autre d'une clôture, et la question « en cours POUR CE MAIL ? » ne se répond donc
       plus à l'échelle du fil. Le verdict — unir, puis ne garder que les ouverts — ne bouge pas. */
    expect(REPO_HISTO).toMatch(/unirEvenements\(parFil\.get\(m\.messageId\) \?\? \[\], parBien\.get\(m\.messageId\) \?\? \[\]\)\s*\n?\s*\.filter\(\(e\) => e\.ouvert\)/);
  });

  /**
   * ⚠️ LA CAPSULE DE LA BOÎTE N'EST PAS ACCROCHÉE À LA VERTE. Un mail peut porter un événement en cours sans
   * rattachement humain (c'est la seconde voie) : la nicher dans le bloc `l.classement &&` l'aurait fait
   * disparaître justement là où elle apprend quelque chose.
   */
  it('⚠️ dans la boîte, la capsule orange ne dépend pas de `l.classement`', () => {
    const bloc = BOITE.slice(BOITE.indexOf('motEvenementEnCours(l.evenementsEnCours'));
    expect(bloc.slice(0, 400)).not.toContain('l.classement');
  });

  /**
   * 🔴 LES TROIS CAPSULES TIRENT LA MÊME PAIRE AMBRE, sans couleur en dur — celle qui porte « événement en
   * cours » dans tout le module. Une quatrième teinte aurait fait dire deux choses à une seule marque.
   */
  it.each([
    ['l’historique du bien', () => VIE, /\.vdb-capsule--evt\{([^}]*)\}/],
    ['la boîte', () => BOITE, /\.bte-capsule--evt\{([^}]*)\}/],
    ['la conversation', () => CONV, /\.cnv-capsule--evt\{([^}]*)\}/],
  ])('🔴 %s : paire ambre, rien en dur', (_nom, src, motif) => {
    const regle = src().match(motif as RegExp);
    expect(regle).not.toBeNull();
    const corps = regle?.[1] ?? '';
    expect(corps).toContain('--color-svv-amber-soft');
    expect(corps).toContain('--color-svv-amber)');
    expect(corps).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});
