'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CurseurBoite, LigneBoite } from '../../../../lib/gestion/boiteRepo';
// 🔴 `rechercheTermes` et NON `rechercheBoite` : le second contient le SQL et tire `pg` → `dns`, que le navigateur
//   n'a pas. L'importer ici a fait tomber TOUTE l'application le 24/09/2026, page de connexion comprise.
import { decouperTermes, normaliser } from '../../../../lib/gestion/rechercheTermes';
import {
  autoImposeParEtiquette, ETIQUETTE_RECEPTION, etiquetteDepuisTexte, texteEtiquette, type Etiquette,
} from '../../../../lib/gestion/ecranUrl';
import { dateHeureComplete, dateHeureCourte } from '../../../../lib/gestion/ecran';
import { corpsLisible } from '../../../../lib/gestion/lisibilite';
import { nettoyerObjet } from '../../../../lib/gestion/objet';

/**
 * LOT 5a — LA BOÎTE MAIL. Le second mode du module : tout le courrier, du plus récent au plus ancien, comme on lit sa
 * messagerie. Le poste de tri (« À classer ») n'est pas touché — les deux répondent à deux questions différentes :
 * « qu'ai-je à traiter ? » et « qu'est-ce qui existe ? ».
 *
 * CE QUE CE LOT NE FAIT PAS, et qu'il ne faut pas chercher ici : la recherche (5c), l'affichage des messages écartés
 * DANS leur échange (5b), la vue conversation dépliable (5b), l'affichage HTML (5d), l'envoi (5e). Un clic ouvre
 * l'échange avec la lecture qui existe AUJOURD'HUI.
 *
 * MOBILE D'ABORD : une ligne = un bouton pleine largeur d'au moins 44 px, l'objet et l'adresse cassent en fin de ligne,
 * aucun débordement horizontal, aucune interaction au survol seul. Couleurs : jetons `--color-svv-*` uniquement, et
 * chaque information portée par un MOT ou une FORME — jamais par la couleur seule.
 */

interface ComptesBoite { lisibles: number; automatiques: number }

/** LOT 5c — ce que le champ de recherche et ses filtres demandent. Vide = on affiche la liste ordinaire. */
export interface Critere { q: string; du: string; au: string; de: string }
export const CRITERE_VIDE: Critere = { q: '', du: '', au: '', de: '' };

/** Y a-t-il quelque chose à chercher ? Un champ vide n'envoie AUCUNE requête. PUR. */
export function critereActif(c: Critere): boolean {
  return decouperTermes(c.q).length > 0 || c.de.trim() !== '' || c.du !== '' || c.au !== '';
}

/**
 * LOT 5c — DÉCOUPE UN EXTRAIT autour des mots trouvés, pour les mettre en évidence. Rend une suite de morceaux dont
 * certains sont marqués : l'écran les rend en GRAISSE, jamais par une couleur seule — une mise en évidence invisible
 * en niveaux de gris ou pour un daltonien ne met rien en évidence.
 *
 * La comparaison se fait sur le texte NORMALISÉ (accents retirés, minuscules) tout en rendant le texte D'ORIGINE :
 * chercher « fenetre » doit souligner « Fenêtre » tel qu'il est écrit. PUR.
 */
export function morceauxMisEnEvidence(texte: string, saisie: string): { t: string; fort: boolean }[] {
  const termes = decouperTermes(saisie).map((x) => x.texte).filter((x) => x.length >= 2);
  if (termes.length === 0) return [{ t: texte, fort: false }];
  // On normalise une COPIE pour chercher, et on découpe l'ORIGINAL aux mêmes positions : les deux ont la même longueur
  //   (`translate` remplace caractère par caractère, il ne change jamais le nombre de lettres).
  const repere = normaliser(texte); // la MÊME normalisation que la base, caractère par caractère
  const marques = new Array<boolean>(texte.length).fill(false);
  for (const t of termes) {
    let i = repere.indexOf(t);
    while (i !== -1) {
      for (let k = i; k < i + t.length; k++) marques[k] = true;
      i = repere.indexOf(t, i + t.length);
    }
  }
  const out: { t: string; fort: boolean }[] = [];
  let debut = 0;
  for (let i = 1; i <= texte.length; i++) {
    if (i === texte.length || marques[i] !== marques[debut]) {
      out.push({ t: texte.slice(debut, i), fort: marques[debut] });
      debut = i;
    }
  }
  return out;
}

interface ReponseBoite {
  lignes: LigneBoite[];
  suivant: CurseurBoite | null;
  total: number | null;
  comptes: ComptesBoite | null;
  /**
   * LOT 5-BOITE — les échanges portant au moins un message reçu NON LU PAR MOI. Rendus par le serveur, calculés pour
   * la personne de la session : le navigateur ne décide pas de ce qui est lu. Absent (migration 250 non appliquée,
   * ou accès sans compte personnel) ⇒ rien n'est en gras, et l'écran est celui d'avant ce lot.
   */
  nonLus?: number[];
  /** Combien d'échanges de la Réception me restent non lus. `null` = on ne sait pas, et on n'affiche alors rien. */
  nonLusTotal?: number | null;
  /** LOT 5c — présent sur une réponse de recherche : `false` quand la migration 237 n'est pas appliquée. */
  pleinTexte?: boolean;
  automatiquesMasques?: number | null;
}

type Etat =
  | { v: 'charge' }
  | {
      v: 'ok'; lignes: LigneBoite[]; suivant: CurseurBoite | null; total: number; comptes: ComptesBoite | null;
      pleinTexte: boolean; automatiquesMasques: number | null;
      nonLus: Set<number>; nonLusTotal: number | null;
    }
  | { v: 'erreur'; m: string };

/**
 * Va chercher une page — de la LISTE, ou des RÉSULTATS quand un critère est posé. Une seule fonction pour les deux :
 * les deux rendent la même forme de ligne, et l'écran ne doit pas avoir deux façons d'afficher la même chose.
 * Rapporte, ne décide pas.
 */
async function chargerPage(
  curseur: CurseurBoite | null, auto: boolean, critere: Critere, etiquette: Etiquette,
): Promise<ReponseBoite | { erreur: string }> {
  const p = new URLSearchParams();
  if (curseur) { p.set('depuis', curseur.dernierLe); p.set('avant', curseur.filId); }
  if (auto) p.set('auto', '1');
  const cherche = critereActif(critere);
  // 🔴 L'ÉTIQUETTE NE VA PAS À LA RECHERCHE, et c'est voulu : le lot 5c promet de chercher dans TOUT le courrier de
  //   gestion. La restreindre à l'étiquette ouverte ferait rater le mail qu'on cherche pour la seule raison qu'on
  //   regardait ailleurs — le défaut le plus pénible qu'une recherche puisse avoir. L'écran le DIT en toutes lettres.
  if (!cherche && etiquette.sorte !== 'reception') p.set('etiquette', texteEtiquette(etiquette));
  if (cherche) {
    if (critere.q.trim() !== '') p.set('q', critere.q);
    if (critere.du !== '') p.set('du', critere.du);
    if (critere.au !== '') p.set('au', critere.au);
    if (critere.de.trim() !== '') p.set('de', critere.de);
  }
  try {
    const url = cherche ? '/api/admin/gestion/boite/recherche' : '/api/admin/gestion/boite';
    const res = await fetch(`${url}?${p.toString()}`, { cache: 'no-store' });
    if (!res.ok) {
      return { erreur: res.status === 403 ? 'Droit retiré : reconnectez-vous.' : 'Lecture impossible.' };
    }
    return (await res.json()) as ReponseBoite;
  } catch {
    return { erreur: 'Lecture impossible : le serveur n’a pas répondu.' };
  }
}

/**
 * L'APERÇU d'une ligne. On retire l'historique cité AVANT de couper : sans ça, un échange de dix réponses afficherait
 * dix fois le même aperçu — celui du tout premier message, recopié en bas de chaque réponse. PUR.
 */
export function apercu(extrait: string | null, max = 140): string {
  if (extrait === null) return '';
  const visible = corpsLisible(extrait).visible.replace(/\s+/g, ' ').trim();
  return visible.length <= max ? visible : `${visible.slice(0, max - 1).trimEnd()}…`;
}

/** Le nom à afficher pour le correspondant. Jamais vide : une ligne sans nom reste identifiable. PUR. */
export function nomCorrespondant(l: Pick<LigneBoite, 'interlocuteur'>): string {
  const n = (l.interlocuteur ?? '').trim();
  return n === '' ? '(correspondant inconnu)' : n;
}

/**
 * Met en évidence les mots cherchés. En GRAISSE (`<strong>`), donc perceptible en niveaux de gris et pour un
 * daltonien — une mise en évidence portée par la seule couleur n'en est pas une. Le texte reste du TEXTE : il n'est
 * jamais interprété comme du HTML.
 */
export function Evidence({ texte, saisie }: { texte: string; saisie: string }) {
  const morceaux = morceauxMisEnEvidence(texte, saisie);
  if (morceaux.length === 1 && !morceaux[0].fort) return <>{texte}</>;
  return <>{morceaux.map((m, i) => (m.fort ? <strong key={i} className="bte-trouve">{m.t}</strong> : <span key={i}>{m.t}</span>))}</>;
}

export function BoiteMail({
  onOuvrir, etiquette = ETIQUETTE_RECEPTION, titre, total, auto: autoPilote, onAuto, filSelectionne = null,
  dense = false, onNonLus, marquage,
}: {
  onOuvrir: (filId: number) => void;
  /** LOT 5-FUSION — l'étiquette ouverte. Absente = la boîte entière, exactement le comportement du lot 5a. */
  etiquette?: Etiquette;
  /** Titre affiché au-dessus de la liste. Absent = « Boîte mail », comme avant. */
  titre?: string;
  /** Nombre porté par l'étiquette. Sous une étiquette, la colonne de gauche le connaît déjà : on ne le recompte pas. */
  total?: number | null;
  /** Interrupteur du courrier automatique, PILOTÉ par le parent quand il est fourni (sinon il reste interne). */
  auto?: boolean;
  onAuto?: (v: boolean) => void;
  /** L'échange ouvert à côté, pour que la liste dise LEQUEL on lit. */
  filSelectionne?: number | null;
  /**
   * LOT 5-GMAIL — présentation DENSE : sur ordinateur, une ligne par échange (correspondant · objet + début du
   * message · marques · date), comme dans une messagerie. Sur téléphone, RIEN NE CHANGE — la présentation sur
   * plusieurs lignes est conservée, parce que quatre colonnes sur 375 px ne sont pas quatre colonnes.
   */
  dense?: boolean;
  /**
   * LOT 5-BOITE — remonte au parent le nombre d'échanges NON LUS par la personne connectée, pour que l'étiquette
   * « Réception » l'affiche à côté de son total. `null` = on ne sait pas (migration 250 absente, ou accès sans
   * compte personnel) : le parent n'affiche alors rien plutôt qu'un zéro qui aurait l'air d'une bonne nouvelle.
   */
  onNonLus?: (n: number | null) => void;
  /**
   * LOT 5-BOITE — un marquage de lecture qui vient d'avoir lieu AILLEURS (la conversation ouverte à côté).
   *
   * 🔴 LA LISTE N'EST PAS RELUE POUR AUTANT, et c'est une garantie du lot 5-GMAIL qu'on ne casse pas : ouvrir un
   * échange ne doit perdre ni les pages déjà chargées (« voir plus »), ni la recherche en cours, ni la position de
   * défilement. On met donc à jour le gras SUR PLACE, sans un seul aller-retour réseau — le serveur a déjà écrit,
   * l'écran n'a plus qu'à dire la même chose que lui.
   */
  marquage?: { filId: number; nonLu: boolean; cle: number };
}) {
  const [etat, setEtat] = useState<Etat>({ v: 'charge' });
  const [autoInterne, setAutoInterne] = useState(false);
  const [suite, setSuite] = useState(false);
  const [maintenant, setMaintenant] = useState<Date | null>(null);
  // LOT 5c — la SAISIE en cours, et le critère VALIDÉ. Les deux sont distincts à dessein : on ne lance pas une
  //   recherche sur 56 000 messages à chaque frappe, on la lance quand la personne a fini de taper.
  const [saisie, setSaisie] = useState<Critere>(CRITERE_VIDE);
  const [critere, setCritere] = useState<Critere>(CRITERE_VIDE);
  const [filtres, setFiltres] = useState(false);

  const cherche = critereActif(critere);
  // L'interrupteur est PILOTÉ s'il l'est, interne sinon. Et l'étiquette peut l'imposer : voir `autoImposeParEtiquette`.
  //   ⚠️ Pas PENDANT une recherche : celle-ci traverse les étiquettes, donc l'étiquette n'a plus voix au chapitre et
  //   l'interrupteur redevient maître — un bouton qui ne fait rien est pire qu'un bouton absent.
  const impose = cherche ? null : autoImposeParEtiquette(etiquette);
  const auto = impose ?? autoPilote ?? autoInterne;
  const basculerAuto = (v: boolean) => { if (onAuto) onAuto(v); else setAutoInterne(v); };
  // L'étiquette sert de clé de rechargement : changer d'étiquette relit la première page, comme changer de critère.
  const cleEtiquette = texteEtiquette(etiquette);

  // La date de référence n'est posée qu'APRÈS le montage : la calculer au rendu serveur ferait diverger l'hydratation.
  useEffect(() => { setMaintenant(new Date()); }, []);

  const premiere = useCallback(async (avecAuto: boolean, c: Critere, e: Etiquette) => {
    setEtat({ v: 'charge' });
    const r = await chargerPage(null, avecAuto, c, e);
    if ('erreur' in r) { setEtat({ v: 'erreur', m: r.erreur }); return; }
    setEtat({
      v: 'ok', lignes: r.lignes, suivant: r.suivant, total: r.total ?? r.lignes.length, comptes: r.comptes,
      pleinTexte: r.pleinTexte !== false, automatiquesMasques: r.automatiquesMasques ?? null,
      nonLus: new Set(r.nonLus ?? []), nonLusTotal: r.nonLusTotal ?? null,
    });
  }, []);

  // `cleEtiquette` plutôt que l'objet : deux objets égaux mais distincts relanceraient la lecture à chaque rendu.
  useEffect(() => { void premiere(auto, critere, etiquetteDepuisTexte(cleEtiquette)); }, [premiere, auto, critere, cleEtiquette]);

  // LOT 5-BOITE — le gras suit le geste, SUR PLACE. `cle` change à chaque marquage ; le contenu, lui, peut être
  //   identique deux fois de suite (rouvrir le même échange), d'où une clé plutôt qu'une comparaison de valeurs.
  const cleMarquage = marquage?.cle ?? 0;
  useEffect(() => {
    if (!marquage || cleMarquage === 0) return;
    setEtat((e) => {
      if (e.v !== 'ok' || e.nonLus.has(marquage.filId) === marquage.nonLu) return e; // déjà dans cet état : rien à dire
      const nonLus = new Set(e.nonLus);
      if (marquage.nonLu) nonLus.add(marquage.filId); else nonLus.delete(marquage.filId);
      return {
        ...e, nonLus,
        // Le compteur bouge du même geste. Il sera de toute façon recalculé par le serveur au prochain changement
        //   d'étiquette, de filtre ou de recherche : il ne peut donc pas dériver longtemps.
        nonLusTotal: e.nonLusTotal === null ? null : Math.max(0, e.nonLusTotal + (marquage.nonLu ? 1 : -1)),
      };
    });
    // `marquage` est recréé à chaque rendu du parent : seule la CLÉ doit déclencher, sinon on rejouerait sans fin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleMarquage]);

  // Le total remonte au parent chaque fois qu'il change — d'où qu'il vienne : première page, ou marquage sur place.
  const totalNonLus = etat.v === 'ok' ? etat.nonLusTotal : null;
  useEffect(() => { if (onNonLus) onNonLus(totalNonLus); }, [onNonLus, totalNonLus]);

  async function voirPlus() {
    if (etat.v !== 'ok' || etat.suivant === null || suite) return;
    setSuite(true);
    const r = await chargerPage(etat.suivant, auto, critere, etiquette);
    setSuite(false);
    if ('erreur' in r) { setEtat({ v: 'erreur', m: r.erreur }); return; }
    // On CONCATÈNE : « voir plus » allonge la liste, il ne la remplace pas — on ne perd jamais ce qu'on lisait.
    setEtat({
      ...etat, lignes: [...etat.lignes, ...r.lignes], suivant: r.suivant, total: etat.total, comptes: etat.comptes,
      // Les non-lus s'ajoutent comme les lignes : « voir plus » allonge, il ne remplace pas.
      nonLus: new Set([...etat.nonLus, ...(r.nonLus ?? [])]), nonLusTotal: etat.nonLusTotal,
    });
  }

  if (etat.v === 'charge') return <p className="gst-info" role="status">Chargement de la boîte…</p>;
  if (etat.v === 'erreur') {
    return (
      <div>
        <p className="gst-erreur" role="status">{etat.m}</p>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void premiere(auto, critere, etiquette)}>Réessayer</button>
      </div>
    );
  }

  const ref = maintenant ?? new Date();
  return (
    <section aria-labelledby="bte-titre">
      <h2 className="gst-titre" id="bte-titre">
        {cherche ? 'Résultats' : (titre ?? 'Boîte mail')}
        {!cherche && <span className="gst-compte">{total ?? etat.total}</span>}
      </h2>
      {/* La recherche traverse les étiquettes : le dire ÉVITE de croire qu'un mail n'existe pas parce qu'on regardait
          ailleurs. C'est la promesse du lot 5c — chercher dans TOUT le courrier de gestion — et elle tient ici. */}
      {cherche && titre !== undefined && (
        <p className="gst-tronc">La recherche porte sur tout le courrier de gestion, pas seulement sur « {titre} ».</p>
      )}

      {/* ══ LA RECHERCHE ══════════════════════════════════════════════════════════════════════════════════════════
          Un formulaire, donc « Entrée » cherche et le clavier des téléphones affiche « Rechercher ». La recherche ne
          part PAS à chaque frappe : sur 56 000 messages, ce serait une requête par lettre. */}
      <form className="bte-recherche" role="search" onSubmit={(e) => { e.preventDefault(); setCritere(saisie); }}>
        <div className="bte-champ-ligne">
          <input type="search" className="bte-champ" value={saisie.q} placeholder="Chercher dans le courrier"
            aria-label="Chercher dans le courrier"
            onChange={(e) => setSaisie({ ...saisie, q: e.target.value })} />
          <button type="submit" className="svv-btn svv-btn-primary gst-btn">Chercher</button>
        </div>
        <div className="bte-outils">
          <button type="button" className="gst-lien-bouton" aria-expanded={filtres} onClick={() => setFiltres((v) => !v)}>
            {filtres ? 'Masquer les filtres' : 'Filtres (période, expéditeur)'}
          </button>
          {cherche && (
            <button type="button" className="gst-lien-bouton"
              onClick={() => { setSaisie(CRITERE_VIDE); setCritere(CRITERE_VIDE); }}>
              Effacer la recherche
            </button>
          )}
        </div>
        {filtres && (
          <div className="bte-filtres">
            <label className="bte-filtre">
              <span>Du</span>
              <input type="date" className="bte-champ" value={saisie.du} onChange={(e) => setSaisie({ ...saisie, du: e.target.value })} />
            </label>
            <label className="bte-filtre">
              <span>Au</span>
              <input type="date" className="bte-champ" value={saisie.au} onChange={(e) => setSaisie({ ...saisie, au: e.target.value })} />
            </label>
            <label className="bte-filtre">
              <span>Expéditeur</span>
              <input type="text" className="bte-champ" value={saisie.de} placeholder="nom ou adresse"
                onChange={(e) => setSaisie({ ...saisie, de: e.target.value })} />
            </label>
          </div>
        )}
        {/* La recherche marche SANS la migration, en plus lent — et elle le DIT plutôt que de faire semblant. */}
        {cherche && !etat.pleinTexte && (
          <p className="gst-tronc">
            Recherche en mode réduit : elle balaie le courrier au lieu d’utiliser un index, et ne reconnaît pas les
            formes fléchies (« fuites » ne trouvera pas « fuite »). Elle sera complète une fois la mise à jour de la
            base appliquée.
          </p>
        )}
      </form>

      {/* EN RECHERCHE : combien de résultats la règle du courrier automatique écarte. Même phrase, même bouton. */}
      {cherche && etat.automatiquesMasques !== null && etat.automatiquesMasques > 0 && (
        <p className="gst-tronc">
          {etat.automatiquesMasques} résultat{etat.automatiquesMasques > 1 ? 's' : ''}
          {' '}ne contien{etat.automatiquesMasques > 1 ? 'nent' : 't'} que du courrier automatique et
          {' '}{etat.automatiquesMasques > 1 ? 'ne sont pas affichés' : 'n’est pas affiché'} ici. Rien n’est supprimé.
          {' '}
          <button type="button" className="gst-lien-bouton" aria-pressed={auto} onClick={() => basculerAuto(!auto)}>
            Afficher aussi le courrier automatique
          </button>
        </p>
      )}
      {cherche && auto && (
        <p className="gst-tronc">
          Le courrier automatique est inclus dans les résultats.{' '}
          <button type="button" className="gst-lien-bouton" aria-pressed onClick={() => basculerAuto(false)}>
            Masquer le courrier automatique
          </button>
        </p>
      )}

      {/* LÀ OÙ L'ÉTIQUETTE DÉCIDE À LA PLACE DE L'INTERRUPTEUR, on le DIT. L'interrupteur lui-même n'a rien perdu : il
          reste où il a toujours été — sur la boîte entière — et il commande en plus « Envoyés », « Sans suite » et les
          cartes. (L'étiquette « À classer » n'arrive jamais ici : le plein écran y affiche le poste de tri lui-même.) */}
      {!cherche && impose === true && (
        <p className="gst-tronc">
          Cette étiquette ne rassemble QUE les échanges dont aucun message n’est lisible — d’où l’absence
          d’interrupteur ici. Le reste du courrier est sous les autres étiquettes, rien n’est supprimé.
        </p>
      )}

      {/* CE QUE LA LISTE NE MONTRE PAS, dit en toutes lettres — et ramené d'un geste. Jamais un masquage silencieux. */}
      {!cherche && impose === null && etat.comptes !== null && etat.comptes.automatiques > 0 && (
        <p className="gst-tronc">
          {auto
            ? <>Le courrier automatique est inclus : {etat.comptes.automatiques} échange{etat.comptes.automatiques > 1 ? 's' : ''} ne contien{etat.comptes.automatiques > 1 ? 'nent' : 't'} que des messages tenus hors de la file par une règle.</>
            : <>{etat.comptes.automatiques} échange{etat.comptes.automatiques > 1 ? 's' : ''} ne contien{etat.comptes.automatiques > 1 ? 'nent' : 't'} que du courrier automatique et {etat.comptes.automatiques > 1 ? 'ne sont pas affichés' : 'n’est pas affiché'} ici. Rien n’est supprimé.</>}
          {' '}
          <button type="button" className="gst-lien-bouton" aria-pressed={auto} onClick={() => basculerAuto(!auto)}>
            {auto ? 'Masquer le courrier automatique' : 'Afficher aussi le courrier automatique'}
          </button>
        </p>
      )}

      {etat.lignes.length === 0
        ? <p className="gst-vide">{cherche
            ? 'Aucun échange ne correspond à cette recherche.'
            : titre === undefined ? 'Aucun échange dans la boîte.' : `Aucun échange sous « ${titre} ».`}</p>
        : (
          <ul className={`gst-liste bte-liste${dense ? ' bte-liste--dense' : ''}`}>
            {etat.lignes.map((l) => {
              // LOT 5-BOITE — « non lu » = au moins un message REÇU que JE n'ai pas ouvert. Le serveur l'a calculé
              //   pour ma session ; la liste ne fait que l'afficher.
              const nonLu = etat.nonLus.has(l.filId);
              return (
              <li key={l.filId}>
                {/* L'échange OUVERT est marqué — par un mot pour les lecteurs d'écran (`aria-current`) autant que par
                    la forme. Le CONTENU de la ligne est le même dans les deux présentations : c'est la feuille de
                    style qui, sur ordinateur, la remet sur une seule ligne. Aucune information n'est retirée. */}
                {/* 🔴 LE GRAS NE PORTE JAMAIS L'INFORMATION À LUI SEUL. Il se perd en niveaux de gris, sur un écran
                    mal réglé, et n'existe pas du tout pour un lecteur d'écran. La marque « non lu » est donc écrite
                    EN TOUTES LETTRES parmi les autres marques de la ligne, et le bouton l'annonce dans son libellé
                    accessible. Le gras n'est qu'un raccourci pour l'œil. */}
                <button type="button"
                  className={`bte-ligne${filSelectionne === l.filId ? ' bte-ligne--ouverte' : ''}${nonLu ? ' bte-ligne--non-lu' : ''}`}
                  aria-current={filSelectionne === l.filId ? 'true' : undefined}
                  aria-label={nonLu ? `Non lu — ${nomCorrespondant(l)} — ${nettoyerObjet(l.objet) || '(sans objet)'}` : undefined}
                  onClick={() => onOuvrir(l.filId)}>
                  <span className="bte-qui">{nomCorrespondant(l)}</span>
                  <span className="bte-sujet">
                    <span className="bte-objet"><Evidence texte={nettoyerObjet(l.objet) || '(sans objet)'} saisie={critere.q} /></span>
                    {apercu(l.extrait) !== '' && (
                      <span className="bte-apercu">
                        {/* Le tiret ne sépare que sur ORDINATEUR, où l'objet et l'aperçu se suivent sur la même
                            ligne ; sur téléphone ils restent l'un sous l'autre et il n'a rien à séparer. */}
                        <span className="bte-tiret" aria-hidden="true"> — </span>
                        {l.dernierSens === 'envoye' && <span className="bte-vous">Vous : </span>}
                        <Evidence texte={apercu(l.extrait)} saisie={critere.q} />
                      </span>
                    )}
                  </span>
                  <span className="bte-bas">
                    <span>{l.nbMessages} message{l.nbMessages > 1 ? 's' : ''}</span>
                    {/* Chaque marque porte un MOT : elle reste lisible en niveaux de gris et pour un daltonien. */}
                    {l.aPiece && <span className="bte-marque"><span aria-hidden="true">📎</span> pièce jointe</span>}
                    {l.reference && <span className="bte-ref">{l.reference}</span>}
                    {l.sansSuite && <span className="bte-marque">classé sans suite</span>}
                    {l.nbLisibles === 0 && <span className="bte-marque">courrier automatique</span>}
                    {nonLu && <span className="bte-marque bte-marque--non-lu">non lu</span>}
                  </span>
                  {/* LOT 5-DIRECT — la DATE ET L'HEURE de réception, en heure de Paris : « il y a 3 h » ne disait pas
                      si un mail était arrivé à 9 h ou à 14 h. La date complète reste dans l'infobulle. */}
                  <span className="bte-quand" title={dateHeureComplete(l.dernierLe)}>{dateHeureCourte(l.dernierLe, ref)}</span>
                </button>
              </li>
              );
            })}
          </ul>
        )}

      {etat.suivant !== null && (
        <button type="button" className="svv-btn svv-btn-outline gst-btn bte-plus" disabled={suite} onClick={() => void voirPlus()}>
          {suite ? 'Chargement…' : 'Voir les échanges plus anciens'}
        </button>
      )}
      {etat.suivant === null && etat.lignes.length > 0 && (
        <p className="gst-tronc">Vous avez atteint le plus ancien message de la boîte.</p>
      )}

      <style>{CSS_BOITE}</style>
    </section>
  );
}

const CSS_BOITE = `
.bte-liste{display:flex;flex-direction:column;gap:0;border-top:1px solid var(--color-svv-line)}
.bte-ligne{display:flex;flex-direction:column;gap:3px;width:100%;min-height:44px;padding:10px 4px;text-align:left;
  background:none;border:0;border-bottom:1px solid var(--color-svv-line);color:inherit;font:inherit;cursor:pointer}
.bte-ligne:hover,.bte-ligne:focus-visible{background:var(--color-svv-field)}
.bte-ligne:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
/* L'échange ouvert : une BARRE à gauche et un fond, jamais la couleur seule ; aria-current le dit aux lecteurs d'écran. */
.bte-ligne--ouverte{background:var(--color-svv-field);border-left:3px solid var(--color-svv-red);padding-left:8px}
/* ── LOT 5-BOITE — LE GRAS DIT « NON LU », comme dans toute messagerie ──
   Le correspondant était TOUJOURS en gras : le gras ne distinguait donc rien. Il devient le repère du non-lu, et le
   poids par défaut redevient normal — c'est la convention que tout le monde connaît, et elle ne s'apprend pas.
   ⚠️ Le gras ne porte JAMAIS l'information à lui seul : la ligne écrit aussi « non lu » en toutes lettres parmi ses
   marques, et son libellé accessible commence par ce mot. Aucune couleur n'entre dans ce repère. */
.bte-qui{font-weight:500;font-size:.95rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.bte-ligne--non-lu .bte-qui,.bte-ligne--non-lu .bte-objet{font-weight:700}
/* La marque écrite : même forme que « pièce jointe » ou « classé sans suite », donc lisible en niveaux de gris. */
.bte-marque--non-lu{font-weight:700;color:var(--color-svv-ink)}
.bte-quand{font-size:.8rem;color:var(--color-svv-muted);white-space:nowrap}
.bte-objet{font-size:.9rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.bte-apercu{font-size:.85rem;color:var(--color-svv-muted);overflow-wrap:anywhere;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.bte-vous{font-weight:600;color:var(--color-svv-ink)}
.bte-bas{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:.78rem;color:var(--color-svv-muted)}
/* SUR TÉLÉPHONE, l'objet et l'aperçu restent l'un SOUS l'autre : le tiret qui les relie n'a alors rien à relier. */
.bte-sujet{display:contents}
.bte-tiret{display:none}
/* ── LOT 5-GMAIL : UNE LIGNE PAR ÉCHANGE, SUR ORDINATEUR ────────────────────────────────────────────────────────
   Quatre colonnes : correspondant · objet + début du message (tronqué d'un « … ») · marques · date. Le MÊME contenu
   que sur téléphone, à la même place dans le DOM — seule la mise en page change, jamais ce qui est dit.
   Le point de rupture est celui de la barre de l'administration (768 px) : au-dessous, rien ne bouge. */
@media (min-width:768px){
  .bte-liste--dense .bte-ligne{display:grid;align-items:baseline;gap:4px 12px;padding:8px 6px;
    grid-template-columns:minmax(7rem,12rem) minmax(0,1fr) auto auto}
  .bte-liste--dense .bte-sujet{display:block;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  /* display:inline : l'objet et l'aperçu coulent dans la MÊME ligne, et le conteneur tronque les deux d'un coup. */
  .bte-liste--dense .bte-objet,.bte-liste--dense .bte-apercu{display:inline;-webkit-line-clamp:none;overflow:visible}
  .bte-liste--dense .bte-tiret{display:inline;color:var(--color-svv-line-strong)}
  .bte-liste--dense .bte-bas{flex-wrap:nowrap;white-space:nowrap}
  .bte-liste--dense .bte-quand{text-align:right}
}
.bte-marque{display:inline-flex;align-items:center;gap:.25rem}
.bte-ref{font-weight:700;color:var(--color-svv-green-ink)}
.bte-recherche{display:flex;flex-direction:column;gap:8px;margin:0 0 12px}
.bte-champ-ligne{display:flex;flex-wrap:wrap;gap:8px}
/* 16 px MINIMUM : en dessous, iOS zoome à chaque fois qu'on clique dans le champ, et l'écran part de travers. */
.bte-champ{flex:1 1 12rem;min-width:0;min-height:44px;padding:.5rem .7rem;font-size:16px;
  border:1px solid var(--color-svv-line);border-radius:.6rem;background:var(--color-svv-surface);color:var(--color-svv-ink)}
.bte-champ:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.bte-outils{display:flex;flex-wrap:wrap;gap:6px 14px}
.bte-filtres{display:flex;flex-wrap:wrap;gap:8px}
.bte-filtre{display:flex;flex-direction:column;gap:2px;flex:1 1 9rem;min-width:0;font-size:.78rem;color:var(--color-svv-muted)}
.bte-trouve{font-weight:800;text-decoration:underline;text-underline-offset:2px}
.bte-plus{margin-top:12px;width:100%}
@media (min-width:600px){.bte-plus{width:auto}}
`;
