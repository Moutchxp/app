'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContactAffiche, PersonneAnnuaire } from '../../../../lib/gestion/annuaireRepo';
// 🔴 LOT SUPPRIMER-CARTE — la phrase de confirmation, le motif du refus et le mot du lien : tous dans le module
//   PUR, pour que l'écran et le serveur ne puissent pas dire deux choses différentes.
import {
  MOTIF_DERNIERE_CARTE, motVoirArchivees, nomAvecCivilite, phraseSuppression,
} from '../../../../lib/gestion/personneVivante';
// 🔴 LOT FICHE-SAISIE-UNIFORME — le FORMAT des champs, écrit une seule fois : saisie, enregistrement, affichage.
import {
  CIVILITES, CIVILITE_AUTRE, civiliteDeLaListe, civiliteRetenue, codePostalFormate, communeFormatee,
  communeEnSaisie, ficheFormatee, mentionCreation, nomAfficheFormate, nomEnSaisie, nomFormate,
  prenomEnSaisie, prenomFormate,
} from '../../../../lib/gestion/saisieFiche';
import { ChampAdresseBan, CSS_CHAMP_ADRESSE } from './ChampAdresseBan';
import {
  MOTIF_DERNIER_PROPRIETAIRE, MOTIF_SANS_MIGRATION, manquesDeLaFiche, phraseArchivage, proposerCoupure,
  verifierCoordonnees, type CoordonneeSaisie, type PartDeCoordonnee,
} from '../../../../lib/gestion/annuaireEdition';
/**
 * 🔴🔴 LOT HISTORIQUE-BIEN-7 — LES MOTS ET LES BORNES DES CARTES DE CONTACT VIENNENT DU MODULE PUR.
 *
 * `libelleDuCote` et `LIBELLE_CARTE_AUTO` y vivent depuis le lot 1 ; `CONTACTS_MONTRES`,
 * `motContactsDuCarrousel`, `motAutresContacts` et `roleDeContactPermis` y sont nés avec ce lot. Les recopier ici
 * aurait fait deux vérités — et c'est celle qu'on relit le moins qui se périme.
 */
import {
  CONTACTS_MONTRES, LIBELLE_CARTE_AUTO, libelleDuCote, motAutresContacts, motContactsDuCarrousel,
  MOT_REPLIER_CONTACTS, roleDeContactPermis,
} from '../../../../lib/gestion/partieCategorie';
/** La carte telle que le dépôt la rend. Importée en TYPE : rien de `pg` n'entre dans ce paquet. */
import type { LigneCarte as CarteDeContact } from '../../../../lib/gestion/partieCategorieRepo';
/**
 * 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — LES RÈGLES D'UN CONTACT, DANS LEUR MODULE PUR.
 *
 * `manquesDuContact` est la SEULE chose que ce formulaire change pour un contact (« seuls le NOM et AU MOINS UN
 * E-MAIL sont obligatoires » — Arno). La règle des clients, `manquesDeLaFiche`, n'est pas touchée.
 */
import {
  TITRE_CONTACT_MODIFIER, TITRE_CONTACT_NOUVEAU, coordonneesPourLaBase, manquesDuContact,
} from '../../../../lib/gestion/ficheContact';
// LOT FICHES-RETOUCHES — la nomenclature (Mobile / Fixe / E-mail) et le formatage des numeros.
import {
  TYPES_COORDONNEE, formaterSaisieTelephone, lienAppel, lignesParType, motType, sorteDuType, typeDeLibelle,
  type TypeCoordonnee,
} from '../../../../lib/gestion/telephoneAffichage';

/**
 * ══ 🔴🔴 LOT FICHES-ANNUAIRE, ÉTAPE C — LES PERSONNES EN CARTES, MODIFIABLES SUR PLACE ════════════════════════════
 *
 * Demande d'Arno, mot pour mot : « chaque propriétaire (et chaque locataire sur les fiches bien et locataire) est une
 * CARTE, et les cartes se suivent de gauche à droite. Ordre : Monsieur en premier, Madame en deuxième, puis les
 * autres ; l'ordre se règle à la main dans le mode Modifier. Si les cartes ne tiennent pas en largeur : défilement
 * horizontal dans le bloc (glisser au pavé tactile ou à la souris, flèches ‹ › aux bords, léger fondu indiquant qu'il
 * y a une suite). Largeur de carte fixe et lisible. À la fin de la rangée, une carte “+ Ajouter un propriétaire”. »
 * Et : « “Modifier” (icône crayon) en haut à droite de chaque carte […] “⋯” sur chaque carte : Remplacer, Archiver,
 * Séparer en deux personnes. »
 *
 * ═══ CE QUI VIT ICI, ET POURQUOI PAS DANS `Annuaire.tsx` ══════════════════════════════════════════════════════════
 * La carte est le MÊME objet sur les trois fiches — propriétaire, bien, locataire. Un composant partagé, ou trois
 * copies qui divergent au premier champ ajouté : le choix est vite fait. `Annuaire.tsx` dépasse déjà mille lignes.
 *
 * ═══ 🔴 L'ALIGNEMENT DES LIGNES, DEMANDE EXPRESSE D'ARNO ══════════════════════════════════════════════════════════
 * « des écarts de niveaux partout […] chaque ligne libellé | valeur | capsule | Copier est sur UNE ligne de base
 * commune : alignement vertical centré, même hauteur de ligne, libellé aligné sur la valeur (pas plus haut).
 * Capsules et bouton Copier à la même hauteur, compacts, collés à la valeur. Espacement vertical régulier entre les
 * lignes (plus de trou entre TÉLÉPHONE et E-MAIL). Plusieurs numéros : une ligne chacun, le libellé n'apparaît
 * qu'une fois. »
 *
 * 🔴 D'OÙ UNE GRILLE, ET NON UN `<dl>`. Le `<dl>` du lot précédent posait `<dt>` et `<dd>` dans deux flux
 * indépendants : leurs hauteurs ne pouvaient pas se répondre, et une valeur à deux capsules décalait son libellé
 * vers le haut. Ici, CHAQUE ligne est une grille de deux colonnes, `align-items:center` : le libellé est
 * mécaniquement au milieu de sa valeur, quelle que soit la hauteur de celle-ci. Les lignes d'un même groupe
 * (plusieurs numéros) partagent la même grille, et seules les suivantes ont un libellé vide — l'alignement ne dépend
 * donc pas du nombre de coordonnées.
 *
 * ⚠️ MOBILE D'ABORD (exigence transverse §15) : à 390 px, une carte occupe toute la largeur et la rangée défile —
 * exactement le comportement demandé pour le grand écran, donc rien de spécial à écrire. Cibles ≥ 44 px, et AUCUNE
 * action au seul survol : le crayon et le « ⋯ » sont des boutons, toujours visibles.
 *
 * 🔒 SANS LA MIGRATION 278 (`modifiable` faux), le crayon et le « ⋯ » sont RENDUS DÉSACTIVÉS, avec leur motif en
 * infobulle — jamais absents, ce qui enverrait chercher un bogue, ni actifs, ce qui promettrait un geste impossible.
 */

export type Sujet = 'proprietaire' | 'locataire';

/** Ce que la rangée doit savoir faire : chaque geste part d'ici et remonte au parent, qui recharge la fiche. */
export interface GestesCartes {
  modifiable: boolean;
  /** Enregistre les champs d'une personne. Rend `null` si tout va bien, sinon le motif du refus. */
  onEnregistrer: (sujet: Sujet, id: number, champs: ChampsSaisis) => Promise<string | null>;
  onArchiver: (sujet: Sujet, id: number, archiver: boolean) => Promise<string | null>;
  /**
   * 🔴 LOT SUPPRIMER-CARTE — supprimer la fiche. ABSENT ⇒ l'entrée n'est pas offerte : c'est le cas sans la
   * migration 287, et proposer un geste que la base ne saurait pas garder serait pire qu'une fonction absente.
   */
  onSupprimer?: (sujet: Sujet, id: number) => Promise<string | null>;
  onSeparer: (sujet: Sujet, id: number, o: {
    premier: string; second: string; repartition: { contactId: number; part: PartDeCoordonnee }[];
  }) => Promise<string | null>;
  onOrdonner: (sujet: Sujet, ids: number[]) => Promise<string | null>;
  onAjouter: (sujet: Sujet) => void;
  /** « Remplacer » n'a de sens que sur la fiche d'un BIEN : sans lui, l'entrée du menu n'apparaît pas. */
  onRemplacer?: (sujet: Sujet, id: number) => void;
  onEcrire?: (email: string) => void;
}

export interface ChampsSaisis {
  /** 🔴 LOT FICHES-RETOUCHES-2 — la date du lien, en CRÉATION seulement (« propriétaire depuis », « entré le »). */
  date?: string;
  civilite?: string | null;
  nom?: string;
  prenom?: string | null;
  qualite?: string | null;
  adresse?: string | null;
  codePostal?: string | null;
  commune?: string | null;
  note?: string | null;
  coordonnees?: CoordonneeSaisie[];
}

// ══ ① LA RANGÉE QUI DÉFILE ════════════════════════════════════════════════════════════════════════════════════════

/**
 * ══ 🔴 LA RANGÉE DE CARTES, AVEC SON DÉFILEMENT ═══════════════════════════════════════════════════════════════════
 *
 * 🔴 LES FLÈCHES ET LE FONDU N'APPARAISSENT QUE S'IL Y A UNE SUITE, et disparaissent au bout. Des flèches toujours
 * là, dont une sur deux ne fait rien, apprennent à ne plus les regarder.
 *
 * 🔴 LE GLISSER À LA SOURIS NE CASSE PAS LE CLIC. On ne considère un glissement qu'au-delà de 6 px : sans ce seuil,
 * le moindre frémissement de la main pendant un clic sur « Copier » serait pris pour un défilement, et le clic
 * serait avalé. Le pavé tactile et la molette, eux, défilent nativement — on ne les touche pas.
 *
 * ⚠️ `scrollend` N'EST PAS DISPONIBLE PARTOUT : on écoute `scroll`, qui l'est. Le calcul est une comparaison de
 * trois nombres, pas de quoi s'en priver.
 */
function Rangee({ children, nb }: { children: React.ReactNode; nb: number }) {
  const piste = useRef<HTMLDivElement | null>(null);
  const [bords, setBords] = useState<{ gauche: boolean; droite: boolean }>({ gauche: false, droite: false });

  const mesurer = useCallback(() => {
    const el = piste.current;
    if (el === null) return;
    /**
     * ⚠️ 8 px DE TOLÉRANCE, ET C'EST MESURÉ, PAS ARRONDI AU HASARD. Au premier rendu, `scroll-snap-align:start`
     * cale la première carte sur le bord INTÉRIEUR de la piste : avec ses 0,15 rem de marge, le navigateur pose
     * `scrollLeft = 2,5`. Une tolérance de 2 px affichait donc la flèche « ‹ » alors qu'on était tout à gauche —
     * une flèche qui ne fait rien, et qui apprend à ne plus regarder les flèches. 8 px reste cent fois inférieur
     * à une largeur de carte : aucune suite réelle ne passe sous ce seuil.
     */
    setBords({
      gauche: el.scrollLeft > 8,
      droite: el.scrollLeft + el.clientWidth < el.scrollWidth - 8,
    });
  }, []);

  useEffect(() => {
    mesurer();
    const el = piste.current;
    if (el === null) return;
    el.addEventListener('scroll', mesurer, { passive: true });
    window.addEventListener('resize', mesurer);
    return () => { el.removeEventListener('scroll', mesurer); window.removeEventListener('resize', mesurer); };
  }, [mesurer, nb]);

  /** Le glisser à la souris. Les positions vivent dans un ref : les écrire dans l'état relancerait un rendu par pixel. */
  const glisse = useRef<{ actif: boolean; depart: number; gauche: number; bouge: boolean }>(
    { actif: false, depart: 0, gauche: 0, bouge: false });

  const pousser = (sens: -1 | 1): void => {
    const el = piste.current;
    if (el === null) return;
    // On avance d'un peu moins qu'une largeur visible : un chevauchement montre qu'on n'a rien sauté.
    el.scrollBy({ left: sens * Math.max(220, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <div className="cp-rangee">
      {bords.gauche && (
        <button type="button" className="cp-fleche cp-fleche--g" aria-label="Voir les cartes précédentes"
          onClick={() => pousser(-1)}>‹</button>
      )}
      <div ref={piste} className={`cp-piste${bords.droite ? ' cp-piste--suite' : ''}`}
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse' || piste.current === null) return;
          glisse.current = { actif: true, depart: e.clientX, gauche: piste.current.scrollLeft, bouge: false };
        }}
        onPointerMove={(e) => {
          const g = glisse.current;
          if (!g.actif || piste.current === null) return;
          const delta = e.clientX - g.depart;
          if (!g.bouge && Math.abs(delta) < 6) return;
          g.bouge = true;
          piste.current.scrollLeft = g.gauche - delta;
        }}
        onPointerUp={() => { glisse.current.actif = false; }}
        onPointerCancel={() => { glisse.current.actif = false; }}>
        {children}
      </div>
      {bords.droite && (
        <button type="button" className="cp-fleche cp-fleche--d" aria-label="Voir les cartes suivantes"
          onClick={() => pousser(1)}>›</button>
      )}
    </div>
  );
}

// ══ ② UNE LIGNE DE COORDONNÉE, SUR SA LIGNE DE BASE ═══════════════════════════════════════════════════════════════

/**
 * UNE LIGNE `libellé | valeur | capsule | Copier`. Le libellé n'est écrit QUE sur la première d'un groupe.
 *
 * ⚠️ `aria-hidden` SUR LE LIBELLÉ VIDE, et un `<span>` plutôt que rien : la cellule doit exister pour que la grille
 * garde ses deux colonnes. Sans elle, la deuxième ligne d'un groupe glisserait sous le libellé.
 */
export function Ligne({ libelle, children, apres, tronque, infobulle }: {
  libelle: string | null;
  children: React.ReactNode;
  /**
   * ══ 🔴🔴 LOT CONTACT-LIGNES — LA TROISIÈME COLONNE : LE BOUTON « COPIER » ═══════════════════════════════════
   *
   * Arno : « Chaque ligne suit la grille titre | valeur | Copier. Le bouton “Copier” est collé au bord DROIT de
   * la tuile, et tous les “Copier” sont alignés verticalement entre eux. »
   *
   * 🔴 D'OÙ UNE SEULE GRILLE POUR TOUT LE BLOC, et non une grille par ligne. Deux grilles voisines ne partagent
   * pas leurs colonnes : chaque « Copier » se serait posé là où SA ligne le laissait, et la colonne aurait
   * dansé d'une ligne à l'autre. Les trois cellules d'une ligne sont donc des enfants DIRECTS de `.cp-lignes`
   * (d'où le fragment ci-dessous, sans conteneur) : la troisième colonne est alors commune, et tous les boutons
   * s'alignent d'eux-mêmes, au bord droit.
   */
  apres?: React.ReactNode;
  /**
   * 🔴 LA VALEUR NE REVIENT JAMAIS À LA LIGNE. Arno : « Une adresse e-mail trop longue est tronquée avec “…”,
   * l'adresse complète en infobulle, et sa copie reste intacte. Jamais de retour à la ligne qui ferait passer
   * “Copier” dessous. » Réservé aux coordonnées : une adresse postale ou une note, elles, doivent se replier.
   */
  tronque?: boolean;
  /** Le texte complet, en infobulle, quand la valeur est tronquée. */
  infobulle?: string;
}) {
  return (
    <>
      {libelle === null
        ? <span className="cp-lab cp-lab--vide" aria-hidden="true" />
        : <span className="cp-lab">{libelle}</span>}
      <span className={`cp-val${tronque === true ? ' cp-val--tronque' : ''}`} title={infobulle}>{children}</span>
      {/* ⚠️ LA CELLULE EXISTE TOUJOURS, même vide : sans elle, la ligne n'aurait que deux cases et la suivante
          remonterait d'une colonne — la grille se décalerait à partir de la première ligne sans bouton. */}
      <span className="cp-apres">{apres}</span>
    </>
  );
}

/** « non renseigné » — en italique gris, jamais un vide, qui se lirait comme un oubli d'affichage. */
const Rien = ({ mot = 'non renseigné' }: { mot?: string }) => <span className="cp-rien">{mot}</span>;

/**
 * LE BOUTON COPIER, compact et collé à la valeur.
 *
 * ⚠️ LE PRESSE-PAPIERS PEUT REFUSER (navigateur ancien, page non sécurisée) : on le DIT sur le bouton. Un « ✓ »
 * menteur ferait coller autre chose.
 */
function Copier({ valeur, quoi }: { valeur: string; quoi: string }) {
  const [etat, setEtat] = useState<'repos' | 'fait' | 'refus'>('repos');
  useEffect(() => {
    if (etat === 'repos') return;
    const t = setTimeout(() => setEtat('repos'), 1600);
    return () => clearTimeout(t);
  }, [etat]);
  return (
    <button type="button" className="cp-copier" title={`Copier ${quoi}`} aria-label={`Copier ${quoi}`}
      onClick={() => { void (async () => {
        try { await navigator.clipboard.writeText(valeur); setEtat('fait'); } catch { setEtat('refus'); }
      })(); }}>
      {etat === 'fait' ? '✓' : etat === 'refus' ? 'refusé' : 'Copier'}
    </button>
  );
}

/**
 * ══ 🔴🔴 LOT CONTACT-LIGNES — LES COORDONNÉES, UNE PAR LIGNE, LE TYPE DANS LE TITRE ═══════════════════════════════
 *
 * Constat d'Arno : « les petites capsules grises “Mobile” / “E-mail” sont en doublon avec le titre de la ligne ».
 * Elles l'étaient : la ligne disait « TÉLÉPHONE » à gauche, et « Mobile » en capsule juste après la valeur.
 *
 * 🔴 LA CAPSULE DISPARAÎT, LE TITRE PORTE LE TYPE : « MOBILE », « FIXE », « E-MAIL ». La même information, écrite
 * une seule fois, à l'endroit qui lui revient. `lignesParType` (module PUR) regroupe et ne titre que la première
 * ligne de chaque groupe — « le titre n'apparaît qu'une fois, en face du premier ».
 *
 * ⚠️ « RETIRÉ DE L'EXPORT » N'EST PAS UNE CAPSULE DE TYPE et reste à sa place : ce n'est pas un doublon du titre,
 * c'est un ÉTAT de la coordonnée, et le taire ferait appeler un numéro que WIPPIMMO ne donne plus.
 */
function Coordonnees({ contacts, onEcrire }: {
  contacts: readonly ContactAffiche[]; onEcrire?: (email: string) => void;
}) {
  if (contacts.length === 0) {
    return (
      <>
        <Ligne libelle="Téléphone"><Rien /></Ligne>
        <Ligne libelle="E-mail"><Rien /></Ligne>
      </>
    );
  }
  return (
    <>
      {lignesParType(contacts).map(({ contact: c, titre }) => {
      const appeler = c.sorte === 'telephone' ? lienAppel(c.affichage) : null;
      return (
        <Ligne key={c.id} libelle={titre}
          /* 🔴 TRONQUÉE, JAMAIS REPLIÉE : une adresse longue ne doit pas pousser « Copier » à la ligne suivante.
             L'infobulle porte l'adresse ENTIÈRE, et la copie, elle, reste intacte — c'est `c.valeur` qui part au
             presse-papiers, pas ce que l'écran a pu couper. */
          /* ⚠️ UNE COORDONNÉE « RETIRÉE DE L'EXPORT » N'EST PAS TRONQUÉE : sa mention doit rester lisible, et
             c'est le seul endroit où elle s'écrit. Elle est rare (une coordonnée disparue d'un ré-import). */
          /* ⚠️ UNE LIGNE QUI PORTE UNE NOTE N'EST PAS TRONQUÉE : la note se pose SOUS le numéro, la valeur fait
             donc deux hauteurs — et `white-space:nowrap` les aurait mises côte à côte, puis coupées. */
          tronque={!c.absent && c.note === null} infobulle={c.sorte === 'email' ? c.valeur : c.affichage}
          apres={(
            <Copier valeur={c.sorte === 'telephone' ? c.affichage : c.valeur}
              quoi={c.sorte === 'telephone' ? 'ce numéro' : 'cette adresse'} />
          )}>
          {c.sorte === 'telephone'
            /* 🔴 LOT ANNOTATIONS-TEL — LE LIEN PART DE L'AFFICHAGE. Le commentaire d'avant disait « `tel:` porte
               la forme canonique (+33…), qui compose partout » : c'était FAUX pour 16 lignes sur 804, mesurées le
               30/09/2026. Leur `valeur` est un repli de l'import, l'annotation ayant fait échouer la normalisation
               — « 0684711817 » ici, « 06688073220629617981 » (deux numéros collés) ailleurs. `affichage`, lui, a
               été décortiqué et renormalisé ; `lienTelephone` en retire les espaces, et rend `null` si ce n'est
               pas un numéro — auquel cas le texte reste, sans lien qui composerait n'importe quoi. */
            ? (appeler === null
              ? <span>{c.affichage}</span>
              : <a className="cp-lien" href={appeler}>{c.affichage}</a>)
            : onEcrire
              ? <button type="button" className="cp-lien" onClick={() => onEcrire(c.valeur)}>{c.affichage}</button>
              : <a className="cp-lien" href={`mailto:${c.valeur}`}>{c.affichage}</a>}
          {c.absent && <span className="cp-caps cp-caps--absent">retiré de l’export</span>}
          {/* 🔴 LOT ANNOTATIONS-TEL — CE QUI TRAÎNAIT À CÔTÉ DU NUMÉRO, en petite note grise SOUS lui : le nom
              d'une personne, un second numéro, une marque de doute. Il sort du numéro — qui se compose et se
              recopie seul — mais il n'est pas jeté : on ne décide pas à la place d'Arno qu'il ne vaut rien. */}
          {c.note !== null && <span className="cp-note-tel">{c.note}</span>}
        </Ligne>
      );
      })}
    </>
  );
}

// ══ ③ UNE CARTE ═══════════════════════════════════════════════════════════════════════════════════════════════════

type Mode = 'lecture' | 'modifier' | 'separer';

export function CartePersonne({ p, gestes, role, dessous, deplacer }: {
  p: PersonneAnnuaire;
  gestes: GestesCartes;
  /** Le mot de la capsule de rôle : « Propriétaire », « En place », « Parti »… */
  role: string;
  /** Ce que la fiche ajoute sous les coordonnées (les dates d'une occupation, par exemple). */
  dessous?: React.ReactNode;
  /**
   * 🔴 L'ORDRE RÉGLÉ À LA MAIN. `null` quand il n'y a rien à déplacer (une seule carte, ou la migration absente) :
   * une flèche qui ne fait rien apprend à ne plus regarder les flèches.
   */
  deplacer: { gauche: boolean; droite: boolean; onDeplacer: (sens: -1 | 1) => void } | null;
}) {
  const [mode, setMode] = useState<Mode>('lecture');
  const [menu, setMenu] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  /**
   * 🔴🔴 LOT FICHE-SAISIE-UNIFORME — LA MISE EN FORME S'APPLIQUE À L'AFFICHAGE, TOUT DE SUITE.
   *
   * Arno : « Affichage des fiches existantes (import WIPPIMMO) : même mise en forme À L'AFFICHAGE, tout de
   * suite. Écriture en base seulement quand la fiche est enregistrée : pas de réécriture massive. »
   *
   * 🔴 ON MET EN FORME CE QU'ON LIT, SANS RIEN ÉCRIRE. Les 310 fiches importées s'affichent donc au bon format
   * dès ce lot ; la base, elle, n'est touchée que le jour où quelqu'un ouvre la fiche et l'enregistre — c'est-
   * à-dire quand une paire d'yeux a regardé ce qu'elle contient.
   */
  const adresse = [
    p.adresse,
    [codePostalFormate(p.codePostal), communeFormatee(p.commune)].filter((x) => x !== '').join(' '),
  ].filter((x) => x !== null && x.trim() !== '').join(', ');
  const mention = mentionCreation({ creeLe: p.creeLe, importeLe: p.importeLe, wippimmoId: p.cle });

  const fermer = (): void => { setMode('lecture'); setMenu(false); setRefus(null); };

  if (mode === 'modifier') {
    return (
      <article className="cp-carte cp-carte--edition">
        <FormulaireCarte p={p} onAnnuler={fermer} refus={refus}
          onEnregistrer={async (champs) => {
            const motif = await gestes.onEnregistrer(p.sujet, p.id, champs);
            if (motif === null) fermer(); else setRefus(motif);
          }} />
      </article>
    );
  }
  if (mode === 'separer') {
    return (
      <article className="cp-carte cp-carte--edition">
        <EcranSeparer p={p} refus={refus} onAnnuler={fermer}
          onSeparer={async (o) => {
            const motif = await gestes.onSeparer(p.sujet, p.id, o);
            if (motif === null) fermer(); else setRefus(motif);
          }} />
      </article>
    );
  }

  return (
    <article className={`cp-carte${p.archive ? ' cp-carte--archive' : ''}`}>
      <header className="cp-tete">
        <div className="cp-tete-mots">
          <p className="cp-nom">{nomAvecCivilite(p.civilite, nomAfficheFormate(p))}</p>
          <p className="cp-tete-caps">
            <span className="cp-role">{role}</span>
            {p.archive && <span className="cp-caps cp-caps--absent">archivée</span>}
            {p.absent && <span className="cp-caps cp-caps--absent">absente de l’export</span>}
          </p>
        </div>
        <div className="cp-tete-actions">
          {/* 🔴 LE CRAYON EST DÉSACTIVÉ, PAS ABSENT, quand la migration manque : son motif est dans l'infobulle. */}
          <button type="button" className="cp-icone" disabled={!gestes.modifiable}
            title={gestes.modifiable ? 'Modifier les coordonnées' : MOTIF_SANS_MIGRATION}
            aria-label="Modifier" onClick={() => setMode('modifier')}>✎</button>
          <button type="button" className="cp-icone" disabled={!gestes.modifiable}
            title={gestes.modifiable ? 'Autres gestes' : MOTIF_SANS_MIGRATION}
            aria-label="Autres gestes" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>⋯</button>
        </div>
      </header>

      {menu && (
        <MenuCarte p={p} gestes={gestes} onFermer={() => setMenu(false)} deplacer={deplacer}
          onSeparer={() => { setMenu(false); setMode('separer'); }}
          onRefus={setRefus} />
      )}
      {refus !== null && <p className="cp-refus" role="alert">{refus}</p>}

      <div className="cp-lignes">
        <Ligne libelle="Qualité">{p.qualite ?? <Rien mot="non renseignée" />}</Ligne>
        <Ligne libelle="Adresse">{adresse !== '' ? adresse : <Rien mot="non renseignée" />}</Ligne>
        <Coordonnees contacts={p.contacts} onEcrire={gestes.onEcrire} />
        {dessous}
        <Ligne libelle="Note">{p.note ?? <Rien mot="non renseignée" />}</Ligne>
      </div>
      {/* ══ 🔴 LOT FICHE-SAISIE-UNIFORME — « Créée le JJ/MM/AAAA », posée toute seule ════════════════════════
          Arno : « rempli automatiquement à la création et non modifiable. Pour les fiches importées : la date de
          l'import, avec la mention “importée”. » Elle remplace le champ « Propriétaire depuis le », qui exigeait
          une saisie que personne ne lisait.

          ⚠️ RIEN N'EST INVENTÉ QUAND LA DATE MANQUE : la ligne n'apparaît pas. Une date fausse sur une fiche est
          pire qu'une date absente — c'est elle qu'on citera un jour. */}
      {mention !== '' && <p className="cp-naissance">{mention}</p>}
    </article>
  );
}

/**
 * ══ 🔴 LE MENU « ⋯ » — REMPLACER, ARCHIVER, SÉPARER ═══════════════════════════════════════════════════════════════
 *
 * 🔴 « ARCHIVER » DEMANDE CONFIRMATION, ET LA PHRASE DIT CE QUI ARRIVE VRAIMENT : « ses mails, son historique et ses
 * rattachements restent ; elle pourra être restaurée ». Un « Voulez-vous supprimer ? » ferait hésiter sur un geste
 * qui, ici, ne détruit rien.
 *
 * ⚠️ « SÉPARER » N'EST PROPOSÉ QUE SI LE NOM PORTE VISIBLEMENT DEUX PERSONNES (`proposerCoupure`). Le proposer
 * partout inviterait à couper « SCI DU MOULIN » en deux, ce qui n'a pas de sens.
 */
function MenuCarte({ p, gestes, onFermer, onSeparer, onRefus, deplacer }: {
  p: PersonneAnnuaire; gestes: GestesCartes; onFermer: () => void; onSeparer: () => void;
  onRefus: (motif: string | null) => void;
  deplacer: { gauche: boolean; droite: boolean; onDeplacer: (sens: -1 | 1) => void } | null;
}) {
  const [confirme, setConfirme] = useState(false);
  /** 🔴 LOT SUPPRIMER-CARTE — la confirmation de la SUPPRESSION, distincte de celle de l'archivage : deux gestes
   *  différents, deux phrases différentes, et l'une ne doit jamais ouvrir l'autre. */
  const [confirmeSuppression, setConfirmeSuppression] = useState(false);
  const coupure = proposerCoupure(p.nomAffiche);
  return (
    <div className="cp-menu" role="group" aria-label="Autres gestes">
      {/* 🔴 L'ORDRE DES CARTES SE RÈGLE ICI, demande d'Arno : « Monsieur en premier, Madame en deuxième, puis les
          autres ; l'ordre se règle à la main ». Le rang est enregistré : il tient d'une visite à l'autre. */}
      {deplacer !== null && deplacer.gauche && (
        <button type="button" className="cp-menu-item"
          onClick={() => { onFermer(); deplacer.onDeplacer(-1); }}>← Déplacer vers la gauche</button>
      )}
      {deplacer !== null && deplacer.droite && (
        <button type="button" className="cp-menu-item"
          onClick={() => { onFermer(); deplacer.onDeplacer(1); }}>→ Déplacer vers la droite</button>
      )}
      {gestes.onRemplacer !== undefined && (
        <button type="button" className="cp-menu-item"
          onClick={() => { onFermer(); gestes.onRemplacer?.(p.sujet, p.id); }}>
          Remplacer (vente, changement)…
        </button>
      )}
      {coupure.possible && (
        <button type="button" className="cp-menu-item" onClick={onSeparer}>Séparer en deux personnes…</button>
      )}
      {p.archive ? (
        <button type="button" className="cp-menu-item" onClick={() => {
          void (async () => { onRefus(await gestes.onArchiver(p.sujet, p.id, false)); onFermer(); })();
        }}>Restaurer dans l’annuaire</button>
      ) : confirme ? (
        <div className="cp-confirme">
          <p className="cp-confirme-mot">{phraseArchivage(p.nomAffiche)}</p>
          <div className="cp-confirme-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setConfirme(false)}>
              Annuler
            </button>
            <button type="button" className="svv-btn gst-btn" onClick={() => {
              void (async () => { onRefus(await gestes.onArchiver(p.sujet, p.id, true)); onFermer(); })();
            }}>Archiver</button>
          </div>
        </div>
      ) : (
        /* ══ 🔴🔴 LOT FICHES-RETOUCHES-2 — LE DERNIER PROPRIÉTAIRE NE S'ARCHIVE PAS ═════════════════════════════
           Arno : « Il est impossible d'archiver […] le DERNIER propriétaire actif d'un bien. L'action est grisée,
           avec l'infobulle “Un bien doit toujours avoir au moins un propriétaire”. »

           🔴 GRISÉE, ET NON ABSENTE : une entrée qui disparaît fait chercher où elle est passée ; une entrée
           grisée qui dit POURQUOI apprend la règle en une seconde. Le serveur refuse de la même façon, et c'est
           lui qui fait foi — le gris protège de la maladresse, pas d'un appel direct.

           ⚠️ « REMPLACER » RESTE ACTIF juste au-dessus, et c'est voulu : le successeur est créé dans la même
           opération, le bien n'est donc jamais sans propriétaire, pas même une milliseconde. */
        <button type="button" className="cp-menu-item cp-menu-item--attention"
          disabled={p.dernierProprietaire}
          title={p.dernierProprietaire ? MOTIF_DERNIER_PROPRIETAIRE : undefined}
          onClick={() => setConfirme(true)}>
          Archiver (restaurable)…
        </button>
      )}

      {/* ══ 🔴🔴 LOT SUPPRIMER-CARTE — « SUPPRIMER », EN DERNIÈRE POSITION ET EN ROUGE ═══════════════════════
          Arno : « en dernière position, en rouge, à côté de Remplacer / Archiver / Séparer (qui restent) ».

          🔴 EN DERNIER PARCE QUE C'EST LE PLUS DÉFINITIF. Un geste qu'on ne défait pas depuis l'écran ne se met
          pas en tête de menu, où l'on clique sans lire.

          🔴 GRISÉ SUR LA DERNIÈRE CARTE, avec son motif — jamais absent : une entrée qui disparaît fait chercher
          où elle est passée ; une entrée grisée qui dit POURQUOI apprend la règle en une seconde. Le serveur
          refuse de la même façon, dans la transaction, et c'est LUI qui fait foi.

          ⚠️ SANS LA MIGRATION 287, L'ENTRÉE N'EST PAS OFFERTE DU TOUT (`gestes.onSupprimer` absent) : proposer un
          geste que la base ne saurait pas garder serait pire qu'une fonction absente.

          🔴🔴 ET ELLE EST OFFERTE SUR LES ARCHIVÉES AUSSI — corrigé pendant ce lot. La première version la
          réservait aux cartes actives, et les fiches de test d'Arno (« _TEST CLAUDE… »), justement archivées,
          n'étaient alors supprimables par AUCUN geste : le seul endroit où le rebut s'accumule était le seul
          endroit qu'on ne pouvait pas nettoyer. Une archivée n'est par ailleurs jamais le dernier propriétaire
          ACTIF d'un bien — la supprimer ne peut donc pas laisser un lot orphelin. */}
      {gestes.onSupprimer !== undefined && (
        confirmeSuppression ? (
          <div className="cp-confirme">
            <p className="cp-confirme-mot">{phraseSuppression(nomAvecCivilite(p.civilite, p.nomAffiche))}</p>
            <div className="cp-confirme-boutons">
              <button type="button" className="svv-btn svv-btn-outline gst-btn"
                onClick={() => setConfirmeSuppression(false)}>
                Annuler
              </button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => {
                void (async () => { onRefus(await gestes.onSupprimer?.(p.sujet, p.id) ?? null); onFermer(); })();
              }}>Supprimer</button>
            </div>
          </div>
        ) : (
          <button type="button" className="cp-menu-item cp-menu-item--danger"
            disabled={p.dernierProprietaire}
            title={p.dernierProprietaire ? MOTIF_DERNIERE_CARTE : undefined}
            onClick={() => setConfirmeSuppression(true)}>
            Supprimer
          </button>
        )
      )}
    </div>
  );
}

// ══ ④ LE FORMULAIRE D'UNE CARTE ═══════════════════════════════════════════════════════════════════════════════════

/**
 * ══ 🔴 UNE LIGNE DE SAISIE : UN TYPE, ET UNE VALEUR ═══════════════════════════════════════════════════════════════
 *
 * LOT FICHES-RETOUCHES. La ligne portait TROIS cases — sorte, valeur, libellé libre. Arno : « Supprime la 3e case
 * (libellé en texte libre). La 1re case devient le TYPE, avec une liste courte : Mobile, Fixe, E-mail. »
 *
 * 🔴 LE TYPE PORTE LA SORTE ET LE LIBELLÉ À LA FOIS. C'est ce qui rend l'état impossible impossible : il n'existe
 * plus de « Mobile » de sorte e-mail, ni de libellé qui contredise la sorte. Le serveur, lui, reçoit toujours les
 * deux champs qu'il attend — `sorte` et `libelle` —, dérivés du type au moment de l'envoi.
 */
interface LigneSaisie { cle: string; type: TypeCoordonnee; valeur: string }

/**
 * ══ 🔴🔴 MODIFIER SUR PLACE — TOUTES LES COORDONNÉES ══════════════════════════════════════════════════════════════
 *
 * Arno : « édition sur place de toutes les coordonnées. Ajouter, retirer et réordonner des téléphones et des
 * e-mails. Enregistrer / Annuler. » (La consigne d'origine disait « avec libellé (Mobile, Fixe, Pro, Email 1…) » ;
 * elle est RÉÉCRITE par le lot FICHES-RETOUCHES en une LISTE FERMÉE de trois types — le champ libre ne servait
 * qu'à inventer une quatrième façon d'écrire « Mobile », que personne ne retrouverait ensuite.)
 *
 * 🔴 LA LISTE COMPLÈTE PART À CHAQUE ENREGISTREMENT, dans l'ordre affiché. Ajouter, retirer et réordonner sont ainsi
 * le même geste — et l'écran n'a pas à calculer un différentiel, donc pas à se tromper un jour sur l'ordre. Le
 * serveur archive ce qui a disparu de la liste (jamais d'effacement) et réveille ce qui revient.
 *
 * 🔴 LA VÉRIFICATION EST CELLE DU SERVEUR, appelée ici AUSSI (`verifierCoordonnees`, module PUR). Deux appels du même
 * code, pas deux règles : un refus s'affiche avant l'aller-retour, et le serveur refuse quand même si on le contourne.
 *
 * ⚠️ LES ADRESSES INTERNES SONT REFUSÉES par cette même fonction (@sansvisavis.com, @criterimmo.fr) : ce sont NOS
 * adresses, jamais celles d'un propriétaire ou d'un locataire — les accepter ferait rapprocher nos propres mails
 * d'une fiche de client.
 */
/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — CE QUE LE FORMULAIRE A VRAIMENT BESOIN DE SAVOIR ═══════════════════════
 *
 * DEMANDE D'ARNO (05/10/2026) : « Réutilise le formulaire “Nouvelle fiche” / “Modifier la fiche” des clients —
 * LE MÊME COMPOSANT, PAS UNE COPIE. »
 *
 * 🔴 ET C'EST CE TYPE QUI REND LA DEMANDE TENABLE. Le formulaire recevait une `PersonneAnnuaire` entière : un
 * sujet, un identifiant, une clé WIPPIMMO, un rang, un état d'archivage, « est-ce le dernier propriétaire »…
 * c'est-à-dire quinze champs dont il ne lit AUCUN. Une carte de contact n'en a pas, et les inventer (`id: 0`,
 * `cle: ''`, `sujet: 'proprietaire'`) aurait fait entrer des valeurs fausses dans un objet que d'autres
 * fonctions savent lire — exactement le genre de mensonge qu'on finit par afficher.
 *
 * 🔴 ON RÉDUIT DONC LE BESOIN À CE QUI EST LU : les neuf champs ci-dessous, et rien de plus. `PersonneAnnuaire`
 * les porte tous, donc AUCUN APPEL CLIENT NE CHANGE — c'est la condition d'Arno (« les cartes CLIENTS ne
 * changent pas d'un pixel »), tenue par le compilateur et non par une relecture.
 */
export interface FicheAEditer {
  civilite: string | null;
  prenom: string | null;
  nom: string;
  qualite: string | null;
  adresse: string | null;
  codePostal: string | null;
  commune: string | null;
  note: string | null;
  /** Les coordonnées, dans l'ordre affiché. `id` ne sert qu'à donner une clé React stable à la ligne. */
  contacts: readonly { id: number; sorte: 'telephone' | 'email'; affichage: string; libelle: string | null }[];
}

export function FormulaireCarte({ p, onEnregistrer, onAnnuler, refus, creation, contact }: {
  /** `null` en CRÉATION : la même carte, vide. */
  p: FicheAEditer | null;
  onEnregistrer: (champs: ChampsSaisis) => Promise<void>;
  onAnnuler: () => void;
  refus: string | null;
  /**
   * ══ 🔴🔴 LOT FICHES-RETOUCHES-2 — LA CARTE D'AJOUT EST LA CARTE « MODIFIER », VIDE ════════════════════════════
   *
   * Arno : « Un clic sur la tuile “+ Ajouter” ouvre, À SA PLACE DANS LA RANGÉE, une carte identique au mode
   * Modifier d'un contact existant, mais vide ». Le formulaire d'avant (Civilité / Nom / date / Créer la fiche)
   * est supprimé : il demandait deux champs, puis obligeait à rouvrir le crayon pour tout le reste — et une fiche
   * à moitié remplie est une fiche qu'on ne finit jamais.
   *
   * 🔴 UN SEUL COMPOSANT POUR LES DEUX MODES, et c'est le cœur de la demande : « identique au mode Modifier ».
   * Deux formulaires jumeaux divergeraient au premier champ ajouté, et l'on se retrouverait à saisir un prénom
   * dans l'un et pas dans l'autre.
   *
   * ⚠️ LA DIFFÉRENCE TIENT EN DEUX CHOSES, et elles sont toutes ici : le rappel du haut (« Sera ajouté comme
   * co-propriétaire sur les N biens de cette fiche ») et l'EXIGENCE de complétude — « Enregistrer » reste grisé
   * tant qu'il manque quelque chose, chaque manque étant dit sous son champ.
   *
   * 🔴 LE CHAMP DATE A DISPARU (lot FICHE-SAISIE-UNIFORME) : il exigeait une saisie qui ne servait à rien, et
   * « Créée le … » la remplace sans rien demander à personne.
   */
  creation?: { rappel: string };
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — LE MÊME FORMULAIRE, POUR UN CONTACT ════════════════════════════════
   *
   * DEMANDE D'ARNO : « Pour un CONTACT, seuls le NOM et AU MOINS UN E-MAIL sont obligatoires ; les autres champs
   * sont facultatifs, sans message rouge. LES RÈGLES DES CLIENTS NE CHANGENT PAS. »
   *
   * 🔴 TROIS CHOSES CHANGENT, ET LES TROIS SONT ICI : le TITRE, l'EXIGENCE (`manquesDuContact` au lieu de
   * `manquesDeLaFiche`) et la CATÉGORIE, que l'appelant rend lui-même. Tout le reste — les huit champs, la liste
   * de coordonnées avec ses ↑↓ et son ✕, la mise en forme sous les doigts, la vérification des coordonnées, le
   * bouton grisé avec son motif — est le code des clients, exécuté tel quel.
   *
   * 🔴 LA CATÉGORIE EST UN MORCEAU DE BALISAGE REÇU, ET NON UNE LISTE ÉCRITE ICI. Seul l'appelant sait quels
   * côtés sont permis là où il est, quelle catégorie a été déduite, et ce qu'un « Tiers indépendant » implique
   * (aucune carte, un rangement global). Une liste écrite dans ce formulaire aurait été une seconde règle de
   * rangement, à côté de celle que le serveur tient déjà.
   *
   * ⚠️ ABSENT ⇒ FICHE DE CLIENT, À LA LETTRE. Un seul `if` sépare les deux mondes, et il est lisible d'un coup
   * d'œil : c'est ce qui garantit qu'on ne touchera pas à la règle des clients en touchant à celle des contacts.
   */
  contact?: {
    /** « Nouveau contact » ou « Modifier ce contact » — les deux mots viennent du module pur. */
    titre: string;
    /** Le choix Propriétaire / Locataire / Tiers indépendant, rendu par l'appelant. */
    categorie?: React.ReactNode;
    /** Ce que l'appelant veut dire sous le titre (« Ranger cette adresse pour ce bien »). */
    rappel?: React.ReactNode;
    /**
     * 🔴 UNE EXIGENCE QUE L'APPELANT SEUL CONNAÎT, et son motif. Non vide ⇒ « Enregistrer » reste grisé, avec ce
     * motif en infobulle — exactement comme pour un champ manquant. C'est le cas de la CATÉGORIE du « + » : le
     * formulaire ne sait pas ce qu'elle veut dire, mais il sait déjà bloquer et dire pourquoi.
     */
    empeche?: string | null;
  };
}) {
  /**
   * ══ 🔴🔴 LOT FICHE-SAISIE-UNIFORME — LA CIVILITÉ EST UNE LISTE, PLUS UN TEXTE LIBRE ══════════════════════
   *
   * ⚠️ UNE FICHE EXISTANTE RETROUVE SA PLACE DANS LA LISTE sans être réécrite : « MME » y devient « Mme », et
   * ce qui ne ressemble à rien de connu tombe dans « Autre » AVEC son texte d'origine intact. Perdre la
   * civilité d'une fiche importée parce qu'elle était écrite autrement serait une régression silencieuse.
   */
  const civiliteInitiale = civiliteDeLaListe(p?.civilite);
  const [civiliteChoix, setCiviliteChoix] = useState(civiliteInitiale.choix);
  const [civiliteLibre, setCiviliteLibre] = useState(civiliteInitiale.libre);
  const [prenom, setPrenom] = useState(prenomFormate(p?.prenom));
  const [nom, setNom] = useState(nomFormate(p?.nom));
  const [qualite, setQualite] = useState(p?.qualite ?? '');
  const [adresse, setAdresse] = useState(p?.adresse ?? '');
  const [codePostal, setCodePostal] = useState(codePostalFormate(p?.codePostal));
  const [commune, setCommune] = useState(communeFormatee(p?.commune));
  const [note, setNote] = useState(p?.note ?? '');
  /**
   * 🔴 « ADRESSE NON VÉRIFIÉE » : vrai dès qu'on a choisi une proposition de la Base Adresse Nationale. Une
   * fiche existante démarre à « non vérifiée » — on ne sait pas d'où venait son adresse, et prétendre le
   * contraire serait affirmer sans savoir. La mention est discrète, et elle n'interdit rien.
   */
  const [adresseVerifiee, setAdresseVerifiee] = useState(false);
  const civilite = civiliteRetenue(civiliteChoix, civiliteLibre);
  /**
   * ⚠️ LE TYPE D'UNE COORDONNÉE EXISTANTE SE DÉDUIT DE SON LIBELLÉ IMPORTÉ (« Mobile 2 » → Mobile), et à défaut de
   * sa SORTE, qui ne ment jamais. Un libellé hors nomenclature retombe sur le type le plus probable de sa sorte
   * plutôt que de laisser la liste vide — mais rien n'est réécrit en base tant qu'on n'enregistre pas.
   */
  /**
   * ⚠️ EN CRÉATION, LA LISTE DÉMARRE AVEC UN TÉLÉPHONE ET UN E-MAIL VIDES — les deux sont obligatoires, et les
   * faire ajouter à la main ferait chercher où cliquer avant même de pouvoir saisir.
   */
  const [lignes, setLignes] = useState<LigneSaisie[]>(() => (p === null
    ? [{ cle: 'n-tel', type: 'mobile' as TypeCoordonnee, valeur: '' },
      { cle: 'n-mail', type: 'email' as TypeCoordonnee, valeur: '' }]
    : p.contacts.map((c) => ({
      cle: `c${c.id}`,
      type: typeDeLibelle(c.libelle, c.sorte).type ?? (c.sorte === 'email' ? 'email' : 'mobile'),
      valeur: c.affichage,
    }))));
  const [local, setLocal] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const bouger = (i: number, sens: -1 | 1): void => {
    setLignes((l) => {
      const j = i + sens;
      if (j < 0 || j >= l.length) return l;
      const copie = [...l];
      [copie[i], copie[j]] = [copie[j], copie[i]];
      return copie;
    });
  };

  /**
   * 🔴 CE QUI MANQUE, CHAMP PAR CHAMP — calculé à CHAQUE rendu, par la fonction PURE partagée. En création
   * seulement : sur une fiche existante, on n'exige rien de plus qu'avant (une fiche importée peut n'avoir ni
   * prénom ni e-mail, et refuser de la modifier pour cette raison rendrait la correction impossible).
   */
  const saisiesVivantes: CoordonneeSaisie[] = lignes.map((l) => ({
    sorte: sorteDuType(l.type), valeur: l.valeur, libelle: motType(l.type),
  }));
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — L'EXIGENCE D'UN CONTACT N'EST PAS CELLE D'UN CLIENT, et c'est la seule
   * ligne où les deux mondes se séparent. Un contact est exigé en création COMME en modification : sa règle ne
   * demande que ce qu'on a forcément (un nom, une adresse e-mail), il n'y a donc rien à relâcher pour pouvoir
   * corriger une carte ancienne. Celle des clients, elle, ne s'applique qu'en création — une fiche importée peut
   * n'avoir ni prénom ni e-mail, et refuser de la modifier pour cette raison rendrait la correction impossible.
   */
  const manque = contact !== undefined
    ? manquesDuContact({ nom, coordonnees: saisiesVivantes })
    : creation === undefined ? {} : manquesDeLaFiche({
      civilite, nom, prenom, adresse, codePostal, commune, coordonnees: saisiesVivantes,
    });
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — `empeche` COMPTE COMME UN MANQUE, et c'est tout ce qu'il fait. Il
   * entre dans la MÊME variable que les champs manquants : le bouton se grise par un seul chemin, et il n'y a
   * donc pas deux façons d'être incomplet (dont une qu'on oublierait de tenir).
   */
  const empeche = (contact?.empeche ?? '').trim();
  const incomplete = Object.keys(manque).length > 0 || empeche !== '';

  const soumettre = (): void => {
    // 🔴 LE TYPE REDEVIENT `sorte` + `libelle` À L'ENVOI : le serveur n'apprend pas un nouveau vocabulaire.
    const saisies = saisiesVivantes.filter((c) => c.valeur.trim() !== '');
    const verdict = verifierCoordonnees(saisies);
    if (!verdict.ok) { setLocal(verdict.motif); return; }
    if (nom.trim() === '') { setLocal('Le nom ne peut pas être vide.'); return; }
    if (incomplete) { setLocal(null); return; }
    setLocal(null);
    setEnvoi(true);
    void (async () => {
      /* 🔴🔴 LA MISE EN FORME EST RÉAPPLIQUÉE À L'ENREGISTREMENT, et pas seulement à la frappe. Un texte collé,
         une valeur d'avant ce lot, une fiche importée qu'on rouvre : tout repasse par la MÊME fonction pure. La
         saisie se met en forme sous les doigts pour qu'on voie ce qui partira ; ici, on s'en assure. */
      await onEnregistrer({
        ...ficheFormatee({ civilite, nom, prenom, adresse, codePostal, commune }),
        qualite, note, coordonnees: saisies,
      });
      setEnvoi(false);
    })();
  };

  /**
   * Le mot qui dit ce qui manque, posé SOUS son champ. Absent quand le champ est rempli.
   *
   * ⚠️ UNE FONCTION QUI REND DU JSX, ET NON UN COMPOSANT DÉFINI DANS LE RENDU. Le compilateur React refuse le
   * second — à raison : un composant recréé à chaque rendu perd son état et remonte tout son sous-arbre. Ici on
   * n'a besoin que d'un bout de balisage, et un appel de fonction le donne sans rien promettre de plus.
   */
  const manqueDe = (champ: string): React.ReactNode => (manque[champ] === undefined
    ? null
    : <span className="cp-manque">{manque[champ]}</span>);

  return (
    <form className="cp-form" onSubmit={(e) => { e.preventDefault(); soumettre(); }}>
      <p className="cp-form-titre">
        {contact?.titre ?? (creation === undefined ? 'Modifier la fiche' : 'Nouvelle fiche')}
      </p>
      {/* 🔴 LE RAPPEL DIT CE QUE LE GESTE VA FAIRE, avant de le faire : « Sera ajouté comme co-propriétaire sur
          les N biens de cette fiche ». Sans lui, on remplit sept champs sans savoir où la personne atterrit. */}
      {creation !== undefined && <p className="cp-rappel">{creation.rappel}</p>}
      {contact?.rappel !== undefined && <p className="cp-rappel">{contact.rappel}</p>}
      {/* 🔴🔴 LA CATÉGORIE EN TÊTE, parce qu'elle décide de TOUT LE RESTE : un « Tiers indépendant » ne reçoit
          aucune carte, et remplir huit champs avant de l'apprendre serait un travail perdu. */}
      {contact?.categorie}

      {/* 🔴 LA CIVILITÉ PILOTE UNE RÈGLE (le prénom n'est pas exigé d'une société) : en texte libre, « S.C.I. »,
          « Sci » et « SCI » étaient trois valeurs, et l'une d'elles finissait par ne pas être reconnue. */}
      <label className="cp-champ">
        <span className="cp-champ-mot">Civilité</span>
        <select className="cp-saisie" value={civiliteChoix} onChange={(e) => setCiviliteChoix(e.target.value)}>
          <option value="">Choisir…</option>
          {CIVILITES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {manqueDe('civilite')}
      </label>
      {/* ⚠️ « AUTRE » GARDE LA PORTE OUVERTE : une liste sans échappatoire oblige à ranger une succession ou un
          office notarial dans une case fausse — ce qui est pire qu'une case vide. */}
      {civiliteChoix === CIVILITE_AUTRE && (
        <label className="cp-champ">
          <span className="cp-champ-mot">Préciser la civilité</span>
          <input className="cp-saisie" value={civiliteLibre} onChange={(e) => setCiviliteLibre(e.target.value)}
            placeholder="Succession, SCP, office notarial…" autoFocus />
        </label>
      )}
      {/* 🔴 LE FORMAT S'APPLIQUE SOUS LES DOIGTS : on voit se former ce qui partira en base. Le faire seulement
          à l'enregistrement ferait « sauter » le texte au moment où l'on croit avoir fini. */}
      <label className="cp-champ">
        <span className="cp-champ-mot">Nom</span>
        <input className="cp-saisie" value={nom} onChange={(e) => setNom(nomEnSaisie(e.target.value))} required />
        {manqueDe('nom')}
      </label>
      <label className="cp-champ">
        <span className="cp-champ-mot">Prénom</span>
        <input className="cp-saisie" value={prenom} onChange={(e) => setPrenom(prenomEnSaisie(e.target.value))} />
        {manqueDe('prenom')}
      </label>
      <label className="cp-champ">
        <span className="cp-champ-mot">Qualité <span className="cp-facultatif">facultative</span></span>
        <input className="cp-saisie" value={qualite} onChange={(e) => setQualite(e.target.value)}
          placeholder="indivision, gérant, représentant…" />
      </label>
      {/* ══ 🔴🔴 L'ADRESSE, AVEC LES PROPOSITIONS DE LA BASE ADRESSE NATIONALE ════════════════════════════════
          Un choix remplit les TROIS champs d'un coup — adresse, code postal, commune (en majuscules). La saisie
          libre reste possible partout : adresse étrangère, lieu-dit, BAN muette. Aucun blocage, jamais. */}
      <div className="cp-champ">
        <label className="cp-champ-mot" htmlFor="cp-adresse">Adresse</label>
        <ChampAdresseBan
          id="cp-adresse"
          valeur={adresse}
          verifiee={adresseVerifiee}
          onChange={(v) => { setAdresse(v); setAdresseVerifiee(false); }}
          onChoisir={(a) => {
            setAdresse(a.voie);
            setCodePostal(a.codePostal);
            setCommune(a.commune);
            setAdresseVerifiee(true);
          }}
          manque={manqueDe('adresse')} />
      </div>
      <div className="cp-champ cp-champ--duo">
        <label className="cp-duo-part">
          <span className="cp-champ-mot">Code postal</span>
          <input className="cp-saisie" value={codePostal} inputMode="numeric" maxLength={5}
            onChange={(e) => setCodePostal(codePostalFormate(e.target.value))} />
          {manqueDe('codePostal')}
        </label>
        <label className="cp-duo-part">
          <span className="cp-champ-mot">Commune</span>
          <input className="cp-saisie" value={commune}
            onChange={(e) => setCommune(communeEnSaisie(e.target.value))} />
          {manqueDe('commune')}
        </label>
      </div>
      {/* ══ 🔴🔴 LE CHAMP « PROPRIÉTAIRE DEPUIS LE » A ÉTÉ RETIRÉ (Arno, 01/10/2026) ══════════════════════════
          Il demandait une date à la création, la refusait tant qu'elle manquait (« La date est obligatoire »), et
          ne servait à rien d'autre : `relation_depuis` n'est lue par aucun écran. Ce qui compte pour l'historique
          des locataires, ce sont les dates d'ENTRÉE et de SORTIE du bail (`gestion_annuaire_occupation`) — elles
          nomment les dossiers Drive et pilotent la vie du bien, et elles ne sont pas touchées.

          🔴 CE QUI LE REMPLACE : « Créée le JJ/MM/AAAA » sur la carte, posée toute seule, non modifiable. */}

      <p className="cp-form-titre cp-form-titre--second">Téléphones et e-mails</p>
      <ul className="cp-coords-edit">
        {lignes.map((l, i) => (
          <li key={l.cle} className="cp-coord-edit">
            {/* 🔴 LE TYPE — trois choix, et rien d'autre. Changer le type d'un téléphone en « E-mail » change AUSSI
                sa sorte : c'est le même objet, et les tenir séparés autorisait des lignes impossibles. */}
            <select className="cp-saisie cp-saisie--type" value={l.type} aria-label="Type de coordonnée"
              onChange={(e) => setLignes((v) => v.map((x, j) => (j === i
                ? { ...x, type: e.target.value as TypeCoordonnee } : x)))}>
              {TYPES_COORDONNEE.map((t) => <option key={t.type} value={t.type}>{t.mot}</option>)}
            </select>
            {/* 🔴 LA VALEUR PREND TOUTE LA LARGEUR LIBÉRÉE : on doit voir le numéro entier, et le plus possible
                d'une adresse e-mail. C'est la demande d'Arno, et c'est la case qu'on relit vraiment.
                ⚠️ LE FORMATAGE PENDANT LA FRAPPE NE S'APPLIQUE QUE SI LE CURSEUR EST AU BOUT. Reformater pendant
                une correction au milieu du champ replacerait le curseur à la fin à chaque touche — le défaut
                classique de ces champs, et celui qui les rend inutilisables. */}
            <input className="cp-saisie cp-saisie--valeur" value={l.valeur} aria-label="Valeur"
              inputMode={l.type === 'email' ? 'email' : 'tel'}
              placeholder={l.type === 'email' ? 'nom@exemple.fr' : '06 12 34 56 78'}
              onChange={(e) => {
                const champ = e.target;
                const auBout = champ.selectionStart === champ.value.length;
                const brut = champ.value;
                const valeur = l.type !== 'email' && auBout ? formaterSaisieTelephone(brut) : brut;
                setLignes((v) => v.map((x, j) => (j === i ? { ...x, valeur } : x)));
              }} />
            <span className="cp-coord-gestes">
              <button type="button" className="cp-icone" aria-label="Monter" title="Monter"
                disabled={i === 0} onClick={() => bouger(i, -1)}>↑</button>
              <button type="button" className="cp-icone" aria-label="Descendre" title="Descendre"
                disabled={i === lignes.length - 1} onClick={() => bouger(i, 1)}>↓</button>
              {/* ⚠️ « RETIRER » N'EFFACE RIEN EN BASE : la coordonnée sort de la liste, et le serveur l'ARCHIVE. */}
              <button type="button" className="cp-icone cp-icone--retirer" aria-label="Retirer" title="Retirer"
                onClick={() => setLignes((v) => v.filter((_, j) => j !== i))}>✕</button>
            </span>
          </li>
        ))}
      </ul>
      {/* 🔴 « + TÉLÉPHONE » AJOUTE UNE LIGNE DE TYPE MOBILE — présélectionné, et la liste laisse choisir « Fixe »
          d'un geste. Demander le type AVANT d'ajouter la ligne aurait mis une question là où il n'y en a pas :
          neuf numéros sur dix sont des mobiles (631 « Mobile » contre 0 « Fixe » dans la base au 29/09/2026).
          « + E-mail » donne directement le type E-mail. */}
      <div className="cp-ajouts">
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setLignes((v) => [...v,
          { cle: `n${Date.now()}${v.length}`, type: 'mobile' as TypeCoordonnee, valeur: '' }])}>
          + Téléphone
        </button>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setLignes((v) => [...v,
          { cle: `n${Date.now()}${v.length}`, type: 'email' as TypeCoordonnee, valeur: '' }])}>
          + E-mail
        </button>
      </div>
      {/* 🔴 LES DEUX MANQUES DE COORDONNÉES sont dits SOUS le bloc qui les porte, comme les autres champs. */}
      {manqueDe('telephone')}
      {manqueDe('email')}

      <label className="cp-champ">
        <span className="cp-champ-mot">Note libre <span className="cp-facultatif">facultative</span></span>
        <textarea className="cp-saisie cp-saisie--note" value={note} rows={3}
          onChange={(e) => setNote(e.target.value)} />
      </label>

      {(local ?? refus) !== null && <p className="cp-refus" role="alert">{local ?? refus}</p>}

      <div className="cp-form-boutons">
        <button type="button" className="svv-btn svv-btn-outline gst-btn cp-bouton" onClick={onAnnuler}>
          Annuler
        </button>
        {/* 🔴 « ENREGISTRER » RESTE GRISÉ TANT QUE LA FICHE EST INCOMPLÈTE — et ce qui bloque est écrit sous
            chaque champ, juste au-dessus : un bouton grisé sans motif est une énigme. */}
        <button type="submit" className="svv-btn gst-btn cp-bouton" disabled={envoi || incomplete}
          title={empeche !== '' ? empeche
            : incomplete ? 'Il reste des champs à renseigner (voir les mentions en rouge).' : undefined}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
      {/* ⚠️ CETTE PHRASE NE VAUT QUE POUR UN CLIENT, et c'est pour ça qu'elle est conditionnée : un contact
          n'existe pas dans WIPPIMMO — il n'a aucun import à primer, et la lui promettre serait faux. */}
      {contact === undefined && (
        <p className="cp-note-verrou">
          Une valeur enregistrée ici devient <strong>prioritaire</strong> : l’import WIPPIMMO ne l’écrase plus, il
          signale seulement la divergence dans son rapport.
        </p>
      )}
    </form>
  );
}

// ══ ⑤ SÉPARER EN DEUX PERSONNES ═══════════════════════════════════════════════════════════════════════════════════

/**
 * ══ 🔴🔴 SÉPARER — ET LA RÉPARTITION VIENT D'ARNO, JAMAIS DE NOUS ═════════════════════════════════════════════════
 *
 * Arno : « pour les fiches qui portent deux noms (“M. et Mme X”, “X et Y” : 116 fiches), l'écran propose les deux
 * noms et laisse Arno répartir chaque téléphone et e-mail entre les deux par cases à cocher. On ne répartit JAMAIS
 * automatiquement. La fiche d'origine est conservée dans l'historique. »
 *
 * 🔴 « JAMAIS AUTOMATIQUEMENT » EST PRIS AU MOT : chaque coordonnée démarre sur « Les deux ». Ce n'est pas une
 * répartition, c'est l'état neutre — rien ne bouge d'une fiche à l'autre tant qu'Arno n'a rien coché. Deviner
 * « le mobile à Monsieur, l'autre à Madame » se tromperait une fois sur trois, et personne ne le verrait avant
 * d'appeler le mauvais numéro.
 *
 * ⚠️ LES DEUX NOMS SONT PROPOSÉS, PAS IMPOSÉS : les champs sont modifiables. `proposerCoupure` partage le nom de
 * famille quand la partie droite est un simple prénom (« AISSAOUI Mohamed et Amina » → « AISSAOUI Amina »), et le
 * dit dans son motif — mais c'est une PROPOSITION, et elle se corrige.
 */
function EcranSeparer({ p, onSeparer, onAnnuler, refus }: {
  p: PersonneAnnuaire;
  onSeparer: (o: { premier: string; second: string;
    repartition: { contactId: number; part: PartDeCoordonnee }[] }) => Promise<void>;
  onAnnuler: () => void;
  refus: string | null;
}) {
  const proposition = proposerCoupure(p.nomAffiche);
  const [premier, setPremier] = useState(proposition.premier);
  const [second, setSecond] = useState(proposition.second);
  const [parts, setParts] = useState<Record<number, PartDeCoordonnee>>(
    () => Object.fromEntries(p.contacts.map((c) => [c.id, 'les_deux' as PartDeCoordonnee])));
  const [envoi, setEnvoi] = useState(false);

  return (
    <form className="cp-form" onSubmit={(e) => {
      e.preventDefault();
      setEnvoi(true);
      void (async () => {
        await onSeparer({
          premier, second,
          repartition: p.contacts.map((c) => ({ contactId: c.id, part: parts[c.id] ?? 'les_deux' })),
        });
        setEnvoi(false);
      })();
    }}>
      <p className="cp-form-titre">Séparer « {p.nomAffiche} » en deux personnes</p>
      <p className="cp-form-mot">
        La fiche actuelle garde le premier nom, ses biens et tout son historique ; la seconde est créée à côté, avec
        le lien qui dit d’où elle vient. <strong>Rien n’est supprimé.</strong>
      </p>
      {proposition.motif !== null && <p className="cp-form-mot cp-form-mot--gris">{proposition.motif}</p>}

      <label className="cp-champ">
        <span className="cp-champ-mot">Première personne</span>
        <input className="cp-saisie" value={premier} onChange={(e) => setPremier(e.target.value)} required />
      </label>
      <label className="cp-champ">
        <span className="cp-champ-mot">Seconde personne</span>
        <input className="cp-saisie" value={second} onChange={(e) => setSecond(e.target.value)} required />
      </label>

      <p className="cp-form-titre cp-form-titre--second">Qui garde quelle coordonnée ?</p>
      {p.contacts.length === 0 ? (
        <p className="cp-form-mot cp-form-mot--gris">Cette fiche ne porte aucune coordonnée à répartir.</p>
      ) : (
        <ul className="cp-repartition">
          {p.contacts.map((c) => (
            <li key={c.id} className="cp-repart-ligne">
              <span className="cp-repart-val">
                {c.affichage}
                {/* La même nomenclature qu'ailleurs : Mobile / Fixe / E-mail. Deux mots pour une même chose
                    d'un écran à l'autre, et l'on croit à deux choses différentes. */}
                <span className="cp-caps">{typeDeLibelle(c.libelle, c.sorte).mot}</span>
              </span>
              <span className="cp-repart-choix">
                {(['premier', 'second', 'les_deux'] as const).map((part) => (
                  <label key={part} className="cp-radio">
                    <input type="radio" name={`part-${c.id}`} value={part}
                      checked={(parts[c.id] ?? 'les_deux') === part}
                      onChange={() => setParts((v) => ({ ...v, [c.id]: part }))} />
                    {part === 'premier' ? 'La première' : part === 'second' ? 'La seconde' : 'Les deux'}
                  </label>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}

      {refus !== null && <p className="cp-refus" role="alert">{refus}</p>}
      <div className="cp-form-boutons">
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onAnnuler}>Annuler</button>
        <button type="submit" className="svv-btn gst-btn" disabled={envoi}>
          {envoi ? 'Séparation…' : 'Séparer en deux fiches'}
        </button>
      </div>
    </form>
  );
}

// ══ ⑥ LE BLOC ENTIER ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * LE BLOC « COORDONNÉES » : son titre, ses cartes côte à côte, et la carte « + Ajouter » au bout de la rangée.
 *
 * ⚠️ LES ARCHIVÉES SONT RANGÉES APRÈS LES VIVANTES, pas cachées : « Restaurer » a besoin de sa cible, et une fiche
 * archivée qui disparaîtrait de l'écran laisserait croire qu'elle a été supprimée — ce qui n'arrive jamais ici.
 */
/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-7 — UNE CARTE DE CONTACT DANS UN CARROUSEL ══════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (05/10/2026) : « le “+” sert à enrichir le carrousel de la partie concernée. Les cartes de
 * contact s'affichent donc dans les carrousels du haut de fiche. […] Une carte de contact a le même gabarit que
 * les cartes clients : nom, badge “CONTACT DU PROPRIÉTAIRE” / “CONTACT DU LOCATAIRE”, e-mail, téléphone avec
 * “Copier”, note, “Créée automatiquement — à vérifier” avec trame orange tant qu'elle n'est pas vérifiée, bouton
 * “Vérifié”, crayon pour modifier, “…” avec “Changer de côté”, “Passer en tiers indépendant” et “Retirer”
 * (statut 'retire', jamais supprimée). »
 *
 * 🔴 CE QUE CE COMPOSANT RÉPARE, ET C'EST MOI QUI L'AVAIS SIGNALÉ À LA FIN DU LOT 6 : les libellés de contact
 * existaient et étaient éprouvés depuis le lot 1, mais AUCUN ÉCRAN NE LES RENDAIT. Une carte créée par le « + »
 * n'était visible que comme capsule dans le bloc du bas — un geste à l'effet invisible.
 *
 * ═══ 🔴 POURQUOI UN COMPOSANT À PART, ET NON UN `CartePersonne` DÉGUISÉ ══════════════════════════════════════════
 *
 * C'est la question qui compte, et la réponse est qu'ils ne portent pas les mêmes objets. `CartePersonne` tient
 * une `PersonneAnnuaire` : une civilité, un prénom, un nom, une adresse postale, une qualité, un rang réglé à la
 * main, un état d'archivage, des coordonnées MULTIPLES, et six gestes (modifier, archiver, restaurer, séparer,
 * remplacer, ordonner). Une carte de contact tient une `LigneCarte` : une adresse e-mail UNIQUE — qui est son
 * identité —, un nom deviné, un téléphone, une note, et trois gestes.
 *
 * Les faire tenir dans un seul composant aurait demandé d'y poser une dizaine de `si c'est un contact alors…` —
 * et c'est exactement par là que les cartes CLIENTS auraient fini par changer d'un pixel, ce qu'Arno interdit en
 * toutes lettres. Le gabarit, lui, EST partagé : les mêmes classes (`cp-carte`, `cp-tete`, `cp-nom`, `cp-role`,
 * `cp-lignes`), les mêmes composants (`Ligne`, `Copier`, `Rien`), la même géométrie. Ce qui se voit est identique ;
 * ce qui se manipule ne l'est pas.
 *
 * ⚠️ AUCUN RÔLE DE CLIENT N'EST POSSIBLE ICI : le badge vient de `libelleDuCote`, et `roleDeContactPermis` (module
 * PUR) refuse « PROPRIÉTAIRE », « LOCATAIRE » et « EN PLACE ». C'est la règle d'Arno — « un contact ne reçoit
 * jamais le badge PROPRIÉTAIRE ni EN PLACE » — tenue par une fonction et non par une relecture.
 *
 * ⚠️ UNE SEULE PORTE D'ÉCRITURE : les trois gestes passent par les rappels que la fiche fournit, qui POSTENT sur
 * `/api/admin/gestion/historique/parties` — la même route que le « + » du bloc du bas. Puis le signal réveille
 * l'autre endroit. Un second chemin d'écriture aurait fini par écrire deux règles différentes.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — UNE CARTE DE CONTACT, TELLE QUE LE FORMULAIRE LA LIT ═══════════════════
 *
 * L'adaptateur entre une carte (identifiée par son adresse E-MAIL) et les neuf champs que le formulaire des
 * clients lit. Il tient UNE décision, et elle mérite son encadré :
 *
 * 🔴 LA LISTE DES COORDONNÉES, QUAND LA CARTE N'EN A PAS, EST AMORCÉE AVEC CE QU'ON SAIT D'ELLE : son téléphone
 * (colonne de la 304) et SON ADRESSE E-MAIL. Sans cet amorçage, ouvrir le crayon sur l'une des 481 cartes
 * d'avant la 306 aurait montré une liste VIDE — donc « il faut au moins une adresse e-mail » en rouge, sur une
 * carte dont l'adresse est précisément ce qu'on connaît le mieux. Et au premier enregistrement, la liste vide
 * aurait remplacé le numéro par rien.
 *
 * ⚠️ MAIS IL N'AJOUTE RIEN À UNE LISTE QUI EXISTE. Si Arno a retiré l'adresse de la capsule de la liste et
 * enregistré, c'est une décision : la remettre à chaque ouverture annulerait son geste en silence.
 */
export function ficheDeContact(c: {
  adresse: string;
  civilite?: string | null; prenom?: string | null; nom?: string | null; qualite?: string | null;
  adressePostale?: string | null; codePostal?: string | null; commune?: string | null; note?: string | null;
  telephone?: string | null;
  coordonnees?: readonly { sorte: 'telephone' | 'email'; libelle: string | null; valeur: string }[];
}): FicheAEditer {
  const liste = c.coordonnees ?? [];
  const amorce: { sorte: 'telephone' | 'email'; libelle: string | null; valeur: string }[] = [];
  if ((c.telephone ?? '').trim() !== '') {
    amorce.push({ sorte: 'telephone', libelle: null, valeur: (c.telephone as string).trim() });
  }
  amorce.push({ sorte: 'email', libelle: 'E-mail', valeur: c.adresse });

  return {
    civilite: c.civilite ?? null,
    prenom: c.prenom ?? null,
    nom: c.nom ?? '',
    qualite: c.qualite ?? null,
    adresse: c.adressePostale ?? null,
    codePostal: c.codePostal ?? null,
    commune: c.commune ?? null,
    note: c.note ?? null,
    contacts: (liste.length > 0 ? liste : amorce).map((x, i) => ({
      id: i, sorte: x.sorte, affichage: x.valeur, libelle: x.libelle,
    })),
  };
}

/**
 * ══ 🔴 LES COORDONNÉES D'UNE CARTE, TELLES QUE `Coordonnees` LES AFFICHE ═════════════════════════════════════════
 *
 * Le composant d'affichage est celui des clients, sans un `if` de plus : il regroupe par type (« MOBILE », « FIXE »,
 * « E-MAIL »), ne titre que la première ligne de chaque groupe, tronque les adresses longues et pose « Copier » au
 * bord droit. Il attend des `ContactAffiche` — on les fabrique donc, au lieu de recopier son balisage.
 *
 * ⚠️ `valeur` ET `affichage` SONT LA MÊME CHAÎNE ICI, et c'est exact : ce qu'un humain a tapé dans le formulaire
 * est ce qu'on affiche ET ce qu'on copie. Chez un client, les deux diffèrent parce que l'import WIPPIMMO a
 * normalisé des numéros décortiqués — un contact n'a pas d'import.
 *
 * ⚠️ `absent` TOUJOURS FAUX, `note`/`typeAnnotation` TOUJOURS `null` : « retiré de l'export » et les annotations
 * de numéro sont des états de l'import WIPPIMMO, et ils n'ont aucun sens pour une carte saisie à la main.
 * Inventer `absent: true` ferait apparaître une capsule « retiré de l'export » sur une carte qui n'y a jamais été.
 */
function coordonneesAffichables(c: CarteDeContact): ContactAffiche[] {
  return ficheDeContact(c).contacts.map((x) => ({
    id: x.id, sorte: x.sorte, valeur: x.affichage, affichage: x.affichage,
    absent: false, note: null, typeAnnotation: null, libelle: x.libelle,
  }));
}

export interface GestesCarteContact {
  /** Vrai quand la migration 304 est là. Faux ⇒ les trois gestes sont désactivés, avec leur motif. */
  modifiable: boolean;
  onVerifier: (id: number) => Promise<string | null>;
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — LE CRAYON REND LA FICHE COMPLÈTE, et non trois champs. Arno : « Le même
   * formulaire complet sert à “Modifier ce contact” (le crayon de la carte). » C'est le MÊME objet que
   * `GestesCartes.onEnregistrer` reçoit pour un client : une seule forme de saisie pour les deux, donc une seule
   * façon de l'envoyer au serveur.
   */
  onModifier: (id: number, champs: ChampsSaisis) => Promise<string | null>;
  onRetirer: (id: number) => Promise<string | null>;
  /** « Changer de côté » et « Passer en tiers indépendant » : un RANGEMENT, par la porte du rangement. */
  onRanger: (adresse: string, categorie: 'proprietaire' | 'locataire' | 'independant') => Promise<string | null>;
  onEcrire?: (email: string) => void;
}

export function CarteContact({ c, gestes }: { c: CarteDeContact; gestes: GestesCarteContact }) {
  const [mode, setMode] = useState<'lecture' | 'modifier'>('lecture');
  const [menu, setMenu] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);

  /**
   * ⚠️ `?? null` : UNE RÉPONSE PLUS ANCIENNE QUE CE LOT NE PORTE PAS `verifieLe`, et `undefined === null` est
   * FAUX — la carte se serait alors crue vérifiée, sans trame orange ni bouton « Vérifié ». C'est exactement ce
   * que l'essai à l'écran a montré, et ce garde le ferme pour de bon.
   */
  const aVerifier = (c.verifieLe ?? null) === null;
  const badge = libelleDuCote(c.cote);
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — LE NOM SE COMPOSE COMME CELUI D'UN CLIENT : « M. ROI Nathan ». Mêmes
   * deux fonctions (`nomAvecCivilite`, `nomAfficheFormate`), donc même résultat sur la même saisie — c'est la
   * demande d'Arno (« les mêmes rubriques qu'une carte client »), et deux compositions auraient fini par écrire
   * le prénom d'un côté et pas de l'autre.
   *
   * ⚠️ L'ADRESSE E-MAIL RESTE LE REPLI, et c'est le cas des 481 cartes de la base : elles n'ont pas de nom.
   */
  const nomCompose = nomAvecCivilite(c.civilite, nomAfficheFormate({
    nom: c.nom ?? '', prenom: c.prenom ?? null, nomAffiche: null,
  })).trim();
  const nomLisible = nomCompose !== '' ? nomCompose : c.adresse;
  /** Même composition que la carte d'un client : « 12 rue des Lilas, 92400 COURBEVOIE ». */
  const adressePostale = [
    c.adressePostale,
    [codePostalFormate(c.codePostal), communeFormatee(c.commune)].filter((x) => x !== '').join(' '),
  ].filter((x) => x !== null && x.trim() !== '').join(', ');

  /**
   * 🔴 LE GARDE DE LA RÈGLE D'ARNO, À L'ENDROIT OÙ LE BADGE S'ÉCRIT. Il ne peut pas se déclencher aujourd'hui
   * (`libelleDuCote` ne rend que les deux libellés de contact), et c'est bien : un garde qui crie déjà ne
   * protège rien. Il protège le jour où quelqu'un passera un rôle de client ici.
   */
  const badgeSur = roleDeContactPermis(badge) ? badge : '';

  const fermer = (): void => { setMode('lecture'); setMenu(false); setRefus(null); };

  if (mode === 'modifier') {
    /**
     * ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — LE CRAYON OUVRE LE FORMULAIRE DES CLIENTS, LE MÊME ════════════════
     *
     * DEMANDE D'ARNO : « Le même formulaire complet sert à “Modifier ce contact” (le crayon de la carte). »
     *
     * 🔴 CE QUI DISPARAÎT ICI EST UN FORMULAIRE DE QUATRE CHAMPS que j'avais écrit au lot 7 (adresse en lecture
     * seule, nom, téléphone, note). Il n'était pas faux — il était INCOMPLET, et c'est précisément le défaut
     * qu'Arno nomme : on saisissait un contact dans un formulaire, et on le corrigeait dans un autre, plus
     * pauvre. Les deux auraient divergé au premier champ ajouté.
     *
     * ⚠️ L'ADRESSE E-MAIL DE LA CARTE N'EST PLUS EN LECTURE SEULE, ET CE N'EST PAS UN OUBLI : elle est devenue
     * une LIGNE de la liste « Téléphones et e-mails », comme chez un client. L'IDENTITÉ de la carte, elle, ne
     * bouge toujours pas — c'est la colonne `adresse`, que le serveur ne modifie jamais (`modifierCarte` ne la
     * nomme pas). Changer la ligne de la liste change donc une COORDONNÉE, pas la carte : la capsule du bloc du
     * bas retrouve sa carte, et le « + » ne réapparaît pas.
     */
    return (
      <article className="cp-carte cp-carte--edition">
        <FormulaireCarte p={ficheDeContact(c)} onAnnuler={fermer} refus={refus}
          contact={{ titre: TITRE_CONTACT_MODIFIER }}
          onEnregistrer={async (champs) => {
            const motif = await gestes.onModifier(c.id, champs);
            if (motif === null) fermer(); else setRefus(motif);
          }} />
      </article>
    );
  }

  return (
    <article className={`cp-carte cp-carte--contact${aVerifier ? ' cp-carte--a-verifier' : ''}`}
      data-carte-contact={c.id}>
      <header className="cp-tete">
        <div className="cp-tete-mots">
          <p className="cp-nom">{nomLisible}</p>
          <p className="cp-tete-caps">
            {/* 🔴 LE BADGE DE CONTACT, ET JAMAIS CELUI D'UN CLIENT : `roleDeContactPermis` le tient. */}
            <span className="cp-role cp-role--contact">{badgeSur}</span>
          </p>
        </div>
        <div className="cp-tete-actions">
          <button type="button" className="cp-icone" disabled={!gestes.modifiable}
            title={gestes.modifiable ? 'Modifier ce contact' : MOTIF_SANS_MIGRATION}
            aria-label="Modifier" onClick={() => setMode('modifier')}>✎</button>
          <button type="button" className="cp-icone" disabled={!gestes.modifiable}
            title={gestes.modifiable ? 'Autres gestes' : MOTIF_SANS_MIGRATION}
            aria-label="Autres gestes" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>⋯</button>
        </div>
      </header>

      {/* ══ 🔴🔴 LE MENU « ⋯ » — TROIS GESTES, ET AUCUN NE SUPPRIME ═══════════════════════════════════════════
          « Changer de côté » et « Passer en tiers indépendant » sont des RANGEMENTS : ils passent par la porte du
          rangement, celle du « + » du bloc du bas. « Retirer » pose un statut `retire` ; rien n'est jamais
          supprimé — règle du module. */}
      {menu && (
        <div className="cp-menu" role="menu">
          <button type="button" role="menuitem" className="cp-menu-ligne"
            onClick={() => { void (async () => {
              const autre = c.cote === 'proprietaire' ? 'locataire' : 'proprietaire';
              const motif = await gestes.onRanger(c.adresse, autre);
              if (motif === null) setMenu(false); else setRefus(motif);
            })(); }}>
            Changer de côté — vers {c.cote === 'proprietaire' ? 'le locataire' : 'le propriétaire'}
          </button>
          <button type="button" role="menuitem" className="cp-menu-ligne"
            onClick={() => { void (async () => {
              const motif = await gestes.onRanger(c.adresse, 'independant');
              if (motif === null) setMenu(false); else setRefus(motif);
            })(); }}>
            Passer en tiers indépendant
          </button>
          <button type="button" role="menuitem" className="cp-menu-ligne cp-menu-ligne--danger"
            onClick={() => { void (async () => {
              const motif = await gestes.onRetirer(c.id);
              if (motif === null) setMenu(false); else setRefus(motif);
            })(); }}>
            Retirer cette carte
          </button>
        </div>
      )}
      {refus !== null && <p className="cp-refus" role="alert">{refus}</p>}

      {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — LES MÊMES RUBRIQUES QU'UNE CARTE CLIENT ══════════════════════
          DEMANDE D'ARNO : « La carte de contact du carrousel montre les mêmes rubriques qu'une carte client
          (QUALITÉ, ADRESSE, MOBILE/E-MAIL avec “Copier”, NOTE), avec le badge CONTACT DU PROPRIÉTAIRE /
          CONTACT DU LOCATAIRE. »

          🔴 MÊME ORDRE, MÊMES MOTS, MÊMES COMPOSANTS que `CartePersonne` : Qualité, Adresse, les coordonnées
          groupées par type, puis la Note. Recopier l'ordre « à peu près » aurait suffi à ce que l'œil sente une
          différence sans pouvoir la nommer — et c'est exactement ce qu'Arno interdit en demandant « le même
          gabarit ».

          ⚠️ L'ADRESSE E-MAIL DE LA CARTE EST **DANS** LES COORDONNÉES, et non sur une ligne à part : c'est
          `ficheDeContact` qui l'y amorce quand la liste est vide (les 481 cartes d'avant la 306). Une ligne
          « E-mail » séparée aurait affiché deux fois la même adresse dès qu'une liste en porte une. */}
      <div className="cp-lignes">
        <Ligne libelle="Qualité">{c.qualite ?? <Rien mot="non renseignée" />}</Ligne>
        <Ligne libelle="Adresse">{adressePostale !== '' ? adressePostale : <Rien mot="non renseignée" />}</Ligne>
        <Coordonnees contacts={coordonneesAffichables(c)} onEcrire={gestes.onEcrire} />
        <Ligne libelle="Note">{(c.note ?? '').trim() !== '' ? c.note : <Rien mot="non renseignée" />}</Ligne>
      </div>

      {/* ══ 🔴🔴 LA TRAME ORANGE ET LE BOUTON « VÉRIFIÉ », TANT QUE PERSONNE N'A REGARDÉ ════════════════════════
          Le mot vient du module PUR (`LIBELLE_CARTE_AUTO`) : l'écran, le script de reprise et les épreuves disent
          la MÊME chose. Et il promet DEUX choses parce que les deux manquent — vérifier que c'est bien le contact
          de cette partie, et compléter le nom ou le numéro. */}
      {aVerifier ? (
        <p className="cp-a-verifier">
          <span className="cp-a-verifier-mot">
            {c.origine === 'auto' ? LIBELLE_CARTE_AUTO : 'À vérifier'}
          </span>
          <button type="button" className="gst-bouton gst-bouton--petit" disabled={!gestes.modifiable}
            title={gestes.modifiable ? undefined : MOTIF_SANS_MIGRATION}
            onClick={() => { void (async () => {
              const motif = await gestes.onVerifier(c.id);
              if (motif !== null) setRefus(motif);
            })(); }}>Vérifié</button>
        </p>
      ) : (
        /* ⚠️ « par QUI » N'EST ÉCRIT QUE SI ON LE SAIT. L'essai à l'écran a affiché « Vérifiée par undefined » :
           la réponse ne portait pas encore ce champ. Elle le porte, et la carte ne l'invente pas pour autant. */
        <p className="cp-naissance">
          Vérifiée{(c.verifiePar ?? '').trim() === '' ? '' : ` par ${(c.verifiePar as string).trim()}`}
        </p>
      )}
    </article>
  );
}

export function BlocCartes({ titre, id, personnes, gestes, role, motAjouter, dessous, creation,
  contacts = [], gestesContact, creationContact }: {
  titre: string;
  id: string;
  personnes: readonly PersonneAnnuaire[];
  gestes: GestesCartes;
  role: string | ((p: PersonneAnnuaire) => string);
  motAjouter: string;
  dessous?: (p: PersonneAnnuaire) => React.ReactNode;
  /**
   * 🔴 LOT FICHES-RETOUCHES-2 — CE QUE LA CARTE VIDE DOIT SAVOIR : la phrase qui dit où la personne atterrit, le
   * mot de son champ date, et le geste qui la crée (il rend `null` si tout va bien, sinon le motif du refus).
   */
  creation: { rappel: string; onCreer: (champs: ChampsSaisis) => Promise<string | null> };
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-7 — LES CARTES DE CONTACT DE CE CÔTÉ ════════════════════════════════════════════
   *
   * DÉCISION D'ARNO : « Carrousel PROPRIÉTAIRE : après les cartes clients, viennent les cartes “CONTACT DU
   * PROPRIÉTAIRE” (actives, non retirées). […] La carte “+ Ajouter un propriétaire” ou “+ Ajouter un occupant”
   * reste en dernier. »
   *
   * ⚠️ VIDE PAR DÉFAUT, DONC AUCUN CHANGEMENT LÀ OÙ PERSONNE N'EN PASSE : la fiche d'un PROPRIÉTAIRE et celle
   * d'un LOCATAIRE montent ce même bloc et n'en passent pas. Leurs carrousels sont, au caractère près, ceux
   * d'avant ce lot — et les empreintes le prouvent.
   */
  contacts?: readonly CarteDeContact[];
  gestesContact?: GestesCarteContact;
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 2 — « AJOUTER UN CONTACT » DEPUIS LE CARROUSEL ═════════════════════════
   *
   * DEMANDE D'ARNO (05/10/2026) : « Les cartes “+ Ajouter un propriétaire” et “+ Ajouter un occupant” deviennent
   * “Ajouter un contact”, avec le MÊME “+” rouge dans un cercle rouge que dans le bloc Parties. Au clic, un petit
   * choix : côté propriétaire, “Propriétaire (client)” ou “Contact du propriétaire” ; côté locataire, “Occupant
   * (client)” ou “Contact du locataire”. Le choix client ouvre EXACTEMENT le formulaire actuel “Nouvelle fiche”
   * (rien ne change pour les clients). Le choix contact ouvre le formulaire de contact du lot 8. AUCUNE
   * FONCTIONNALITÉ PERDUE. »
   *
   * 🔴 ABSENTE ⇒ LA TUILE D'AVANT CE LOT, AU CARACTÈRE PRÈS. Et ce n'est pas un repli prudent : les fiches d'un
   * PROPRIÉTAIRE et d'un LOCATAIRE montent ce même bloc, et un « contact du propriétaire » n'y veut rien dire —
   * une carte de contact se range sur un BIEN (c'est la clé de sa table). Leur offrir le choix aurait proposé un
   * geste que le serveur refuse. C'est la fiche d'un BIEN qui passe cette prop, et elle seule.
   */
  creationContact?: {
    /** « Propriétaire (client) » ou « Occupant (client) » — le mot du client, côté par côté. */
    motClient: string;
    /** « Contact du propriétaire » ou « Contact du locataire ». */
    motContact: string;
    rappel: string;
    onCreer: (champs: ChampsSaisis) => Promise<string | null>;
  };
}) {
  const vivantes = personnes.filter((p) => !p.archive);
  const archivees = personnes.filter((p) => p.archive);
  /**
   * ══ 🔴🔴 LOT SUPPRIMER-CARTE — LES ARCHIVÉES NE SONT PLUS DANS LA RANGÉE ════════════════════════════════
   *
   * DÉFAUT VU SUR LA CAPTURE D'ARNO (fiche proprietaire-146) : la carte archivée « Mme _TEST CLAUDE
   * RETOUCHES2… Camille » s'affichait À CÔTÉ de la carte active, alors que le compteur disait « COORDONNÉES 1 ».
   * Le compteur comptait les vivantes, la rangée montrait les deux : deux vérités côte à côte, et c'est le
   * compteur qu'on croit faux.
   *
   * 🔴 ELLES NE DISPARAISSENT PAS POUR AUTANT : un lien discret les montre, avec « Restaurer ». Les cacher
   * sans rien dire aurait fait croire qu'archiver supprime — exactement ce que ce geste promet de ne pas faire.
   */
  const [voirArchivees, setVoirArchivees] = useState(false);
  const ordonnees = voirArchivees ? [...vivantes, ...archivees] : vivantes;
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 2 — QUATRE TEMPS, ET NON DEUX. `false` (la tuile), `'choix'` (les deux
   * boutons), `'client'` (le formulaire d'avant, intact), `'contact'` (celui du lot 8). Sans le temps `'choix'`,
   * il aurait fallu deux tuiles côte à côte — et la rangée aurait porté deux gestes là où Arno en veut un.
   */
  const [ajout, setAjout] = useState<false | 'choix' | 'client' | 'contact'>(false);
  const [refusAjout, setRefusAjout] = useState<string | null>(null);
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-7 — LE REPLI DES CONTACTS AU-DELÀ DE SIX. Mesuré : le bien 155 porte 55 contacts
   * côté propriétaire. Cinquante-cinq cartes dans une piste horizontale, ce n'est pas un carrousel, c'est un
   * mur — et les cartes CLIENTS, celles qu'on vient voir, s'y retrouvent noyées au bout d'un ruban de six écrans.
   */
  const [tousLesContacts, setTousLesContacts] = useState(false);
  const contactsMontres = tousLesContacts ? contacts : contacts.slice(0, CONTACTS_MONTRES);
  const motAutres = motAutresContacts(contacts.length);
  return (
    <section className="ann-bloc" aria-labelledby={id}>
      {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-7 — DEUX COMPTEURS QUI NE SE MÊLENT PAS ═══════════════════════════════════
          RÈGLE D'ARNO : « Les compteurs “PROPRIÉTAIRE N” et “LOCATAIRE EN PLACE N” ne comptent QUE les clients ;
          les contacts ont leur propre petit compteur (“+ 2 contacts”). »

          🔴 ET IL A RAISON : un carrousel qui annoncerait « PROPRIÉTAIRE 3 » pour un propriétaire et deux
          contacts dirait que ce bien a trois propriétaires. C'est exactement le défaut qu'un compteur doit
          empêcher — et c'est le même qu'au lot SUPPRIMER-CARTE, où le compteur comptait les vivantes pendant
          que la rangée montrait aussi les archivées.

          ⚠️ `vivantes.length` N'A PAS BOUGÉ D'UN CARACTÈRE : les contacts ne l'approchent pas. */}
      <h4 className="ann-bloc-titre" id={id}>
        {titre} <span className="gst-compte">{vivantes.length}</span>
        {motContactsDuCarrousel(contacts.length) !== null && (
          <span className="cp-compte-contacts">{motContactsDuCarrousel(contacts.length)}</span>
        )}
      </h4>
      {/* ⚠️ `nb` COMPTE LES CARTES RÉELLEMENT POSÉES : c'est lui qui décide si la piste défile. L'oublier
          aurait laissé une piste de douze cartes se croire à trois, et les flèches de défilement absentes. */}
      <Rangee nb={ordonnees.length + contactsMontres.length}>
        {ordonnees.map((p, i) => (
          <CartePersonne key={`${p.sujet}-${p.id}`} p={p} gestes={gestes}
            role={typeof role === 'string' ? role : role(p)}
            dessous={dessous?.(p)}
            deplacer={!gestes.modifiable || vivantes.length < 2 || p.archive ? null : {
              gauche: i > 0,
              droite: i < vivantes.length - 1,
              /* 🔴 ON ENVOIE LA LISTE ENTIÈRE DANS SON NOUVEL ORDRE, jamais « échange ces deux rangs » : le serveur
                 renumérote de 1 à N, et deux cartes ne peuvent donc pas se retrouver au même rang — ce qui
                 arriverait fatalement avec des échanges partiels sur une liste dont certains rangs valent 0. */
              onDeplacer: (sens) => {
                const ids = vivantes.map((v) => v.id);
                const j = i + sens;
                if (j < 0 || j >= ids.length) return;
                [ids[i], ids[j]] = [ids[j], ids[i]];
                void gestes.onOrdonner(p.sujet, ids);
              },
            }} />
        ))}
        {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-7 — LES CARTES DE CONTACT, APRÈS LES CLIENTS ════════════════════════════
            DÉCISION D'ARNO : « après les cartes clients, viennent les cartes “CONTACT DU PROPRIÉTAIRE” (actives,
            non retirées). […] La carte “+ Ajouter …” reste en dernier. »

            🔴 L'ORDRE EST CELUI DU JSX, et c'est tout : clients, puis contacts, puis la tuile d'ajout. Aucun tri
            n'est refait ici — le dépôt rend déjà les cartes « non vérifiées d'abord, puis par nom », et un second
            tri aurait donné deux ordres pour une même liste.

            ⚠️ SIX AU PLUS, PUIS UNE CARTE QUI DIT LE RESTE : la borne vit dans le module pur, et la carte de
            dépliage DIT le nombre. Un carrousel qui s'arrêterait à six sans le dire ferait croire que le bien
            n'a que six contacts. */}
        {gestesContact !== undefined && contactsMontres.map((ct) => (
          <CarteContact key={`contact-${ct.id}`} c={ct} gestes={gestesContact} />
        ))}
        {gestesContact !== undefined && motAutres !== null && (
          <button type="button" className="cp-carte cp-carte--plus-contacts"
            aria-expanded={tousLesContacts}
            onClick={() => setTousLesContacts((v) => !v)}>
            <span className="cp-ajout-plus" aria-hidden="true">{tousLesContacts ? '−' : '⋯'}</span>
            <span className="cp-ajout-mot">{tousLesContacts ? MOT_REPLIER_CONTACTS : motAutres}</span>
          </button>
        )}

        {/* ══ 🔴🔴 LA TUILE « + AJOUTER », ET LA CARTE VIDE QUI PREND SA PLACE ═══════════════════════════════════
            Arno : « Un clic sur la tuile “+ Ajouter” ouvre, À SA PLACE DANS LA RANGÉE, une carte identique au mode
            Modifier d'un contact existant, mais vide ». La tuile ne mène donc plus à un formulaire posé ailleurs
            dans la page : elle DEVIENT la carte, au bout de la rangée, là où l'on vient de cliquer.

            ⚠️ ELLE RESTE EN DERNIER, APRÈS LES CONTACTS (demande d'Arno) : c'est la place d'un geste, et un geste
            se trouve au bout de ce qu'on vient de lire. */}
        {ajout === 'client' || ajout === 'contact' ? (
          <article className="cp-carte cp-carte--edition">
            {/* 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 2 — LE CHOIX « CLIENT » OUVRE **EXACTEMENT** LE FORMULAIRE
                D'AVANT : mêmes props, même rappel, même geste. « Rien ne change pour les clients » (Arno), et
                c'est l'appel ci-dessous qui le prouve — il n'a pas changé d'un caractère. */}
            <FormulaireCarte p={ajout === 'client' ? null : ficheDeContact({ adresse: '' })}
              refus={refusAjout} onAnnuler={() => { setAjout(false); setRefusAjout(null); }}
              creation={ajout === 'client' ? { rappel: creation.rappel } : undefined}
              contact={ajout === 'contact' && creationContact !== undefined
                ? { titre: TITRE_CONTACT_NOUVEAU, rappel: creationContact.rappel }
                : undefined}
              onEnregistrer={async (champs) => {
                const poser = ajout === 'contact' && creationContact !== undefined
                  ? creationContact.onCreer
                  : creation.onCreer;
                const motif = await poser(champs);
                if (motif === null) { setAjout(false); setRefusAjout(null); } else setRefusAjout(motif);
              }} />
          </article>
        ) : ajout === 'choix' && creationContact !== undefined ? (
          /* ══ 🔴🔴 LE PETIT CHOIX, À LA PLACE DE LA TUILE ════════════════════════════════════════════════════
             Il prend la place de la tuile dans la rangée, comme la carte vide : c'est là qu'on vient de
             cliquer, et faire apparaître une question ailleurs dans la page obligerait à la chercher. */
          <article className="cp-carte cp-carte--choix" aria-label="Que voulez-vous ajouter ?">
            <p className="cp-choix-titre">Ajouter…</p>
            {/* ⚠️ LES DEUX BOUTONS PORTENT LEUR PROPRE ALLURE, et c'est une CORRECTION trouvée à l'écran : avec
                `svv-btn gst-btn cp-bouton`, le premier choix se rendait SANS fond ni bord — du texte gras au
                milieu d'une carte, qu'on ne lisait pas comme un bouton. Deux choix dont un seul a l'air
                cliquable, c'est un choix qui n'en est pas un. */}
            <button type="button" className="cp-choix-btn cp-choix-btn--premier"
              onClick={() => setAjout('client')}>{creationContact.motClient}</button>
            <button type="button" className="cp-choix-btn"
              onClick={() => setAjout('contact')}>{creationContact.motContact}</button>
            <button type="button" className="gst-lien-bouton"
              onClick={() => setAjout(false)}>Annuler</button>
          </article>
        ) : (
          <button type="button" className="cp-carte cp-carte--ajout" disabled={!gestes.modifiable}
            title={gestes.modifiable ? undefined : MOTIF_SANS_MIGRATION}
            onClick={() => setAjout(creationContact === undefined ? 'client' : 'choix')}>
            {/* 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 2 — LE MÊME « + » ROUGE CERCLÉ QUE DANS LE BLOC PARTIES
                (demande d'Arno), là où la fiche d'un bien offre le choix. Ailleurs — fiche d'un propriétaire,
                fiche d'un locataire —, la tuile garde son « + » et son mot d'avant : il n'y a pas de contact à
                y créer, et changer son allure aurait annoncé un geste qui n'existe pas sur ces écrans. */}
            {creationContact === undefined
              ? <span className="cp-ajout-plus" aria-hidden="true">+</span>
              : <span className="cp-ajout-cercle" aria-hidden="true">+</span>}
            <span className="cp-ajout-mot">
              {creationContact === undefined ? motAjouter : 'Ajouter un contact'}
            </span>
            {!gestes.modifiable && <span className="cp-rien">{MOTIF_SANS_MIGRATION}</span>}
          </button>
        )}
      </Rangee>

      {/* 🔴 LE LIEN DISCRET, SOUS LA RANGÉE (demande d'Arno). Il n'existe que s'il y a quelque chose à montrer :
          « Voir les archivées (0) » ferait chercher ce qui n'est pas là. */}
      {archivees.length > 0 && (
        <p className="cp-archivees">
          <button type="button" className="gst-lien-bouton" aria-expanded={voirArchivees}
            onClick={() => setVoirArchivees((v) => !v)}>
            {voirArchivees ? 'Masquer les archivées' : motVoirArchivees(archivees.length)}
          </button>
        </p>
      )}
    </section>
  );
}

/* ⚠️ AUCUN ACCENT GRAVE DANS CES COMMENTAIRES : ils vivent DANS un litteral gabarit, qu'un seul accent grave
   terminerait — piege consigne DOUZE fois dans ce depot, et douze fois dans un commentaire. */
export const CSS_CARTES = `
/* ══ LA RANGEE QUI DEFILE ══════════════════════════════════════════════════════════════════════════════════════ */
.cp-rangee{position:relative;min-width:0}
/* Le defilement est horizontal, et il s'arrete sur une carte (scroll-snap) : on ne reste jamais a moitie. */
/* ══ 🔴🔴 LOT FICHES-RETOUCHES-2 — TOUTES LES CARTES DE LA RANGEE ONT LA MEME HAUTEUR ═════════════════════════
   Arno : « la plus haute impose sa taille aux autres. Pas de hauteur fixe arbitraire. »
   align-items:stretch (le defaut du flex) fait exactement cela : chaque carte s'etire sur la hauteur de la
   ligne, qui est celle de la plus haute. Une hauteur FIXE, elle, couperait la plus haute ou laisserait un vide
   sous les autres des qu'un proprietaire porte trois telephones.
   AUCUN ACCENT GRAVE DANS CE COMMENTAIRE : il vit DANS un litteral gabarit, qu'un seul accent grave
   terminerait — piege consigne QUATORZE fois dans ce depot, et quatorze fois dans un commentaire. */
.cp-piste{display:flex;align-items:stretch;gap:.6rem;overflow-x:auto;overflow-y:hidden;
  scroll-snap-type:x proximity;padding:.15rem .15rem .5rem;scrollbar-width:thin;
  -webkit-overflow-scrolling:touch}
.cp-piste>*{scroll-snap-align:start}
/* Le FONDU dit qu'il y a une suite. Pose sur la piste, il suit le defilement sans element flottant de plus. */
.cp-piste--suite{mask-image:linear-gradient(to right,#000 0,#000 calc(100% - 2.2rem),transparent 100%);
  -webkit-mask-image:linear-gradient(to right,#000 0,#000 calc(100% - 2.2rem),transparent 100%)}
.cp-fleche{position:absolute;top:50%;transform:translateY(-50%);z-index:2;width:2rem;height:2.6rem;
  display:flex;align-items:center;justify-content:center;font-size:1.3rem;line-height:1;cursor:pointer;
  border:1px solid var(--color-svv-line);border-radius:.5rem;background:var(--color-svv-surface);
  color:var(--color-svv-ink);box-shadow:0 1px 4px rgba(22,32,44,.14)}
.cp-fleche--g{left:-.35rem}
.cp-fleche--d{right:-.35rem}
.cp-fleche:hover{border-color:var(--color-svv-line-strong)}

/* ══ UNE CARTE ═════════════════════════════════════════════════════════════════════════════════════════════════ */
/* LARGEUR FIXE ET LISIBLE, demande d'Arno. Sur telephone, la carte prend la largeur disponible sans jamais
   depasser l'ecran : 100% de la piste moins la gouttiere. */
/* 24rem MESURE A L'ECRAN, pas choisie au hasard : a 22rem, « nathan_roi@yahoo.fr » et son bouton « Copier »
   passaient a la ligne, et la ligne d'e-mail faisait deux hauteurs quand les autres en faisaient une. */
.cp-carte{flex:0 0 auto;width:min(24rem,calc(100vw - 3rem));display:flex;flex-direction:column;gap:.45rem;
  padding:.7rem .8rem;border:1px solid var(--color-svv-line);border-radius:.7rem;
  background:var(--color-svv-surface);box-shadow:0 1px 3px rgba(22,32,44,.07);text-align:left}
.cp-carte--edition{width:min(30rem,calc(100vw - 3rem));border-color:var(--color-svv-line-strong)}
.cp-carte--archive{opacity:.72;border-style:dashed}
/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-7 — LES CARTES DE CONTACT DANS UN CARROUSEL ═════════════════════════════════════════
   DECISION D'ARNO : « Une carte de contact a le MEME GABARIT que les cartes clients ».

   🔴 D'OU AUCUNE GEOMETRIE PROPRE : la carte de contact reutilise .cp-carte telle quelle — meme largeur, meme
   fonte, meme ombre, meme arrondi. Ce qui suit ne change que la TRAME d'une carte qu'il reste a verifier, et le
   ton de son badge. Une carte de contact qui aurait sa propre largeur aurait fait sauter la piste d'une carte a
   l'autre, et c'est exactement ce que « meme gabarit » interdit.

   ⚠️ LES CARTES CLIENTS NE SONT TOUCHEES PAR AUCUNE DE CES REGLES : toutes portent --contact ou --a-verifier,
   que seules les cartes de contact ont. Les empreintes le prouvent au caractere pres. */
.cp-carte--contact{border-left-width:3px;border-left-color:var(--color-svv-line-strong)}
/* LA TRAME ORANGE D'UNE CARTE A VERIFIER — le MEME ton que la carte de creation du bloc du bas, et que la pastille
   orange d'une capsule : ce qui attend un geste se signale pareil partout dans ce module. */
.cp-carte--a-verifier{border-color:var(--color-svv-amber);border-left-color:var(--color-svv-amber);
  background:var(--color-svv-amber-soft)}
/* LE BADGE DE CONTACT : le meme gabarit que .cp-role, un ton qui le distingue d'un client sans crier. */
.cp-role--contact{background:var(--color-svv-surface-raised);color:var(--color-svv-ink);
  border:1px solid var(--color-svv-line-strong)}
/* LE PETIT COMPTEUR DES CONTACTS, a cote de celui du titre — et jamais confondu avec lui : il porte son « + ». */
.cp-compte-contacts{margin-left:.4rem;font-size:.72rem;font-weight:600;color:var(--color-svv-muted)}
/* « Creee automatiquement — a verifier » et son bouton, en bas de la carte, sur une seule ligne qui se replie. */
.cp-a-verifier{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;margin:.1rem 0 0;
  font-size:.72rem;color:var(--color-svv-amber-fort,var(--color-svv-ink))}
.cp-a-verifier-mot{flex:1 1 auto;min-width:0}
/* LA CARTE QUI DEPLIE LE RESTE : la meme tuile que « + Ajouter », pour qu'on la reconnaisse comme un geste. */
.cp-carte--plus-contacts{width:min(14rem,calc(100vw - 3rem));align-items:center;justify-content:center;
  gap:.3rem;border-style:dashed;border-color:var(--color-svv-line-strong);background:var(--color-svv-field);
  font:inherit;cursor:pointer;color:var(--color-svv-muted);text-align:center}
.cp-carte--plus-contacts:hover{color:var(--color-svv-ink);border-color:var(--color-svv-line-strong-hover)}
/* LE MENU « ⋯ » D'UNE CARTE DE CONTACT : la meme forme que celui d'une carte client. */
.cp-menu{display:flex;flex-direction:column;gap:.1rem;padding:.2rem;border-radius:.5rem;
  border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface)}
.cp-menu-ligne{display:block;width:100%;text-align:left;padding:.35rem .5rem;border:0;border-radius:.35rem;
  background:transparent;font:inherit;font-size:.78rem;color:var(--color-svv-ink);cursor:pointer}
.cp-menu-ligne:hover{background:var(--color-svv-field)}
.cp-menu-ligne--danger{color:var(--color-svv-red)}
.cp-menu-ligne:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.cp-tete{display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem;
  padding-bottom:.4rem;border-bottom:1px solid var(--color-svv-line)}
.cp-tete-mots{display:flex;flex-direction:column;gap:.2rem;min-width:0}
.cp-nom{margin:0;font-size:.95rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.cp-tete-caps{margin:0;display:flex;flex-wrap:wrap;gap:.3rem;align-items:center}
.cp-role{display:inline-flex;align-items:center;min-height:1.15rem;padding:.05rem .4rem;border-radius:.6rem;
  font-size:.7rem;font-weight:700;letter-spacing:.02em;text-transform:uppercase;
  background:var(--color-svv-field);color:var(--color-svv-muted)}
.cp-tete-actions{display:flex;gap:.25rem;flex:0 0 auto}
/* Cible tactile >= 44 px en hauteur reelle grace au padding : l'icone reste petite, la zone cliquable non. */
.cp-icone{min-width:2rem;min-height:2rem;display:inline-flex;align-items:center;justify-content:center;
  font-size:.95rem;line-height:1;cursor:pointer;border:1px solid var(--color-svv-line);border-radius:.45rem;
  background:var(--color-svv-surface);color:var(--color-svv-ink);
  transition:background .15s ease,border-color .15s ease,box-shadow .15s ease,transform .15s ease}
/* ══ 🔴 LOT FICHES-RETOUCHES-2 — LE CRAYON ET LE « ⋯ » REAGISSENT AU SURVOL ═══════════════════════════════════
   Fond legerement teinte, bordure plus marquee, legere elevation, transition courte — la demande d'Arno, la meme
   que pour les boutons des cartes de biens. Le focus clavier reste visible, et distinct du survol. */
.cp-icone:hover:not(:disabled){border-color:var(--color-svv-line-strong-hover);background:var(--color-svv-field);
  box-shadow:0 2px 6px rgba(22,32,44,.12);transform:translateY(-1px)}
.cp-icone:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.cp-icone:disabled{opacity:.45;cursor:not-allowed}
@media (prefers-reduced-motion:reduce){
  .cp-icone{transition:none}
  .cp-icone:hover:not(:disabled){transform:none}
}
.cp-icone--retirer{color:var(--color-svv-red)}

/* ══ 🔴🔴 L'ALIGNEMENT DES LIGNES — LA DEMANDE EXPRESSE D'ARNO, TENUE PAR UNE SEULE GRILLE ═════════════════════
   RECRIT LE 30/09/2026 (lot CONTACT-LIGNES). La version d'avant posait UNE GRILLE PAR LIGNE : chaque ligne
   alignait bien son libelle sur sa valeur, mais deux grilles voisines ne partagent pas leurs colonnes — le bouton
   « Copier » se posait donc la ou SA ligne le laissait, et la colonne dansait d'une ligne a l'autre.

   🔴 LE BLOC ENTIER EST MAINTENANT UNE SEULE GRILLE DE TROIS COLONNES : titre | valeur | Copier. Les trois
   cellules d'une ligne sont des enfants DIRECTS de ce conteneur (le composant Ligne rend un fragment, sans
   conteneur intermediaire). La troisieme colonne est alors COMMUNE a toutes les lignes : tous les « Copier »
   s'alignent d'eux-memes, colles au bord droit de la tuile, et la valeur prend tout le milieu.

   L'ESPACEMENT RESTE LE MEME PARTOUT (un seul row-gap), et align-items:center garde le libelle au milieu de sa
   valeur — ce que la version d'avant garantissait deja, et qui ne bouge pas d'un pixel. */
.cp-lignes{display:grid;grid-template-columns:5.6rem minmax(0,1fr) auto;align-items:center;
  row-gap:.3rem;column-gap:.5rem}
.cp-lignes>*{min-height:1.65rem;display:flex;align-items:center}
.cp-lab{font-size:.72rem;font-weight:600;letter-spacing:.01em;text-transform:uppercase;
  color:var(--color-svv-muted);align-self:center}
/* La troisieme colonne est collee a DROITE : c'est elle qui porte « Copier ». Vide, elle ne prend pas de place. */
.cp-apres{justify-content:flex-end}
.cp-val{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem;min-width:0;
  font-size:.85rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
/* ══ 🔴 UNE VALEUR QUI NE REVIENT JAMAIS A LA LIGNE ════════════════════════════════════════════════════════════
   Arno : « Une adresse e-mail trop longue est tronquee avec “…”, l'adresse complete en infobulle, et sa copie
   reste intacte. Jamais de retour a la ligne qui ferait passer “Copier” dessous. »
   Le min-width:0 de la cellule est ce qui AUTORISE la coupure : sans lui, une grille refuse de reduire une case
   sous la largeur de son contenu, et la colonne deborderait au lieu de tronquer. */
.cp-val--tronque{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;overflow-wrap:normal}
.cp-val--tronque>a,.cp-val--tronque>button{display:inline;max-width:100%}
.cp-rien{font-style:italic;color:var(--color-svv-muted);font-size:.82rem}
.cp-lien{padding:0;border:0;background:none;font:inherit;color:var(--color-svv-red);text-decoration:underline;
  text-underline-offset:2px;cursor:pointer;text-align:left}
/* CAPSULE ET BOUTON COPIER A LA MEME HAUTEUR QUE LA VALEUR, compacts et colles : meme min-height, meme
   align-items. Sans hauteur commune, ils flottaient de deux pixels — les « ecarts de niveaux » signales. */
.cp-caps{display:inline-flex;align-items:center;min-height:1.1rem;padding:.02rem .35rem;border-radius:.5rem;
  font-size:.68rem;font-weight:600;background:var(--color-svv-field);color:var(--color-svv-muted);
  white-space:nowrap}
.cp-caps--absent{background:var(--color-svv-amber-soft);color:var(--color-svv-ink)}
.cp-copier{display:inline-flex;align-items:center;min-height:1.35rem;padding:.02rem .4rem;cursor:pointer;
  font-size:.7rem;font-weight:600;border:1px solid var(--color-svv-line);border-radius:.4rem;
  background:var(--color-svv-surface);color:var(--color-svv-muted)}
.cp-copier:hover{border-color:var(--color-svv-line-strong);color:var(--color-svv-ink)}

/* ══ LE MENU ET LES CONFIRMATIONS ══════════════════════════════════════════════════════════════════════════════ */
.cp-menu{display:flex;flex-direction:column;gap:.2rem;padding:.35rem;border:1px solid var(--color-svv-line);
  border-radius:.5rem;background:var(--color-svv-field)}
.cp-menu-item{min-height:2.1rem;padding:.3rem .45rem;text-align:left;cursor:pointer;font-size:.82rem;
  border:0;border-radius:.4rem;background:none;color:var(--color-svv-ink)}
.cp-menu-item:hover{background:var(--color-svv-surface)}
.cp-menu-item--attention{color:var(--color-svv-red);font-weight:600}
/* 🔴 LOT SUPPRIMER-CARTE — VU A L'ECRAN sur la fiche proprietaire-146 : « Archiver » etait bien INERTE sur le
   dernier proprietaire (l'attribut disabled y etait depuis le lot FICHES-RETOUCHES-2), mais il PARAISSAIT actif —
   rouge et vif, comme un geste qu'on peut faire. On cliquait, rien ne se passait, et rien ne disait pourquoi.
   Un bouton inerte doit SE VOIR inerte : c'est la moitie visible de la regle, et elle manquait. */
.cp-menu-item--attention:disabled{color:var(--color-svv-muted);font-weight:400;cursor:not-allowed}
/* 🔴 LOT SUPPRIMER-CARTE — « Supprimer » est le seul rouge PLEIN du menu : c'est le seul geste qui retire la
   fiche de partout. Le mot porte l'information, la couleur ne fait que l'appuyer — il se lit en niveaux de gris
   comme il se lit par un daltonien, regle de tout le module. */
.cp-menu-item--danger{color:var(--color-svv-red);font-weight:700}
.cp-menu-item--danger:hover:not(:disabled){background:var(--color-svv-red-soft)}
.cp-menu-item--danger:disabled{color:var(--color-svv-muted);font-weight:400;cursor:not-allowed}
/* Le lien des archivees : discret, sous la rangee. On ne met pas en avant ce qu'on a rangé. */
.cp-archivees{margin:.4rem 0 0;font-size:.8rem;color:var(--color-svv-muted)}
/* 🔴 LOT FICHE-SAISIE-UNIFORME — « Créée le … » : discrète, en pied de carte. Elle informe, elle ne se saisit
   pas, et elle ne doit jamais concurrencer du regard les coordonnées juste au-dessus. */
.cp-naissance{margin:.45rem 0 0;font-size:.72rem;color:var(--color-svv-muted);font-style:italic}
${CSS_CHAMP_ADRESSE}
.cp-confirme{display:flex;flex-direction:column;gap:.4rem;padding:.35rem}
.cp-confirme-mot{margin:0;font-size:.8rem;color:var(--color-svv-ink)}
.cp-confirme-boutons{display:flex;gap:.4rem;flex-wrap:wrap}
.cp-refus{margin:.1rem 0 0;padding:.35rem .5rem;border-radius:.4rem;font-size:.8rem;
  background:var(--color-svv-red-soft);color:var(--color-svv-ink)}

/* ══ LE FORMULAIRE ═════════════════════════════════════════════════════════════════════════════════════════════ */
.cp-form{display:flex;flex-direction:column;gap:.45rem;min-width:0}
.cp-form-titre{margin:0;font-size:.82rem;font-weight:700;color:var(--color-svv-ink)}
.cp-form-titre--second{margin-top:.35rem;padding-top:.35rem;border-top:1px solid var(--color-svv-line)}
.cp-form-mot{margin:0;font-size:.8rem;color:var(--color-svv-ink)}
.cp-form-mot--gris{color:var(--color-svv-muted)}
.cp-champ{display:flex;flex-direction:column;gap:.15rem}
.cp-champ-mot{font-size:.72rem;font-weight:600;text-transform:uppercase;color:var(--color-svv-muted)}
.cp-champ--duo{flex-direction:row;gap:.5rem;flex-wrap:wrap}
.cp-duo-part{display:flex;flex-direction:column;gap:.15rem;flex:1 1 7rem;min-width:0}
.cp-saisie{min-height:2.4rem;padding:.35rem .5rem;font-size:.85rem;color:var(--color-svv-ink);
  border:1px solid var(--color-svv-line-strong);border-radius:.45rem;background:var(--color-svv-surface);
  min-width:0;width:100%}
.cp-saisie--note{min-height:4rem;resize:vertical}
/* ══ 🔴 LOT FICHES-RETOUCHES — DEUX CASES, ET LA VALEUR PREND TOUTE LA PLACE ═══════════════════════════════════
   La troisieme case (libelle libre) a disparu ; la valeur herite de sa largeur. Le TYPE est calibre sur son plus
   long mot (« E-mail ») et pas un pixel de plus : chaque millimetre rendu ici est un caractere de plus visible
   d'une adresse e-mail, qui est ce qu'on relit vraiment avant d'enregistrer.
   Les fleches et la croix restent A DROITE, hors de la case, comme avant. */
.cp-coords-edit{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.35rem}
.cp-coord-edit{display:grid;grid-template-columns:minmax(0,6rem) minmax(0,1fr);gap:.3rem;align-items:center}
.cp-saisie--valeur{grid-column:2}
.cp-coord-gestes{grid-column:1 / -1;display:flex;gap:.25rem;justify-content:flex-end}
@media (min-width:600px){
  .cp-coord-edit{grid-template-columns:6rem minmax(0,1fr) auto}
  .cp-saisie--valeur{grid-column:auto}
  .cp-coord-gestes{grid-column:auto;justify-content:flex-start}
}
.cp-ajouts{display:flex;gap:.4rem;flex-wrap:wrap}
.cp-form-boutons{display:flex;gap:.45rem;flex-wrap:wrap;margin-top:.25rem}
.cp-note-verrou{margin:.2rem 0 0;font-size:.74rem;color:var(--color-svv-muted)}
/* ══ 🔴 LOT ANNOTATIONS-TEL — LA NOTE SOUS LE NUMERO ══════════════════════════════════════════════════════════
   Petite, grise, sur sa PROPRE ligne (flex-basis:100% force le retour) : elle ne doit ni allonger la ligne du
   numero, ni pousser « Copier » ailleurs. C'est un renseignement de second plan — « M.Moreau », un second
   numero —, jamais une valeur qu'on compose ou qu'on recopie. */
.cp-note-tel{flex:0 0 100%;margin-top:-.1rem;font-size:.72rem;font-style:italic;color:var(--color-svv-muted)}

/* ══ 🔴 CE QUI MANQUE, SOUS SON CHAMP ══════════════════════════════════════════════════════════════════════════
   Un mot, en rouge de la charte, juste sous la case qu'il concerne. « La fiche est incomplete » oblige a chercher
   lequel des huit champs manque ; ceci le montre du doigt. */
.cp-manque{display:block;margin-top:.15rem;font-size:.73rem;color:var(--color-svv-red)}
.cp-facultatif{font-weight:400;text-transform:none;letter-spacing:0;font-style:italic;
  color:var(--color-svv-muted)}
/* Le rappel du haut de la carte d'ajout : ce que le geste va faire, avant qu'on ne remplisse quoi que ce soit. */
.cp-rappel{margin:0;padding:.35rem .5rem;border-radius:.45rem;font-size:.78rem;
  background:var(--color-svv-field);color:var(--color-svv-ink)}

/* ══ SEPARER ═══════════════════════════════════════════════════════════════════════════════════════════════════ */
.cp-repartition{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.4rem}
.cp-repart-ligne{display:flex;flex-direction:column;gap:.25rem;padding:.4rem .5rem;border-radius:.45rem;
  background:var(--color-svv-field)}
.cp-repart-val{display:flex;align-items:center;gap:.35rem;flex-wrap:wrap;font-size:.85rem;
  color:var(--color-svv-ink);overflow-wrap:anywhere}
.cp-repart-choix{display:flex;gap:.6rem;flex-wrap:wrap}
.cp-radio{display:inline-flex;align-items:center;gap:.25rem;min-height:1.8rem;font-size:.78rem;
  color:var(--color-svv-ink);cursor:pointer}

/* ══ LA CARTE « + AJOUTER » ════════════════════════════════════════════════════════════════════════════════════ */
/* La tuile « + Ajouter » s'aligne sur la hauteur de la rangee comme les autres ; son min-height n'est plus
   qu'un plancher pour le cas ou elle serait seule. */
.cp-carte--ajout{align-items:center;justify-content:center;gap:.2rem;cursor:pointer;
  border-style:dashed;border-color:var(--color-svv-line-strong);background:var(--color-svv-field);
  min-height:8rem;text-align:center;transition:background .15s ease,border-color .15s ease,box-shadow .15s ease,
  transform .15s ease}
.cp-carte--ajout:hover:not(:disabled){background:var(--color-svv-surface);
  border-color:var(--color-svv-line-strong-hover);box-shadow:0 2px 6px rgba(22,32,44,.12);
  transform:translateY(-1px)}
.cp-carte--ajout:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
@media (prefers-reduced-motion:reduce){
  .cp-carte--ajout{transition:none}
  .cp-carte--ajout:hover:not(:disabled){transform:none}
}
.cp-carte--ajout:disabled{cursor:not-allowed;opacity:.8}
.cp-ajout-plus{font-size:1.5rem;line-height:1;color:var(--color-svv-red)}
.cp-ajout-mot{font-size:.85rem;font-weight:600;color:var(--color-svv-ink)}
/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-9, POINT 2 — LE MEME « + » ROUGE CERCLE QUE DANS LE BLOC PARTIES ════════════════
   DEMANDE D'ARNO : « avec le MEME “+” rouge dans un cercle rouge que dans le bloc Parties ».
   🔴 LES MEMES VALEURS, REPRISES DU BLOC : bord de 1,5 px, rouge, fond de surface, cercle parfait. Elles sont
   recopiees et non partagees parce que les deux feuilles sont deux litteraux independants (un composant par
   ecran) ; ce qui les tient d'accord est cet encadre, et le garde de CartesPersonnes qui compare les deux.
   ⚠️ 26 px ET NON 22 : la tuile d'ajout est plus grande qu'une capsule, et le meme cercle y paraitrait timide.
   La FORME est identique, l'echelle suit son support — c'est ce qu'on reconnait, pas la taille. */
.cp-ajout-cercle{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;
  border-radius:999px;border:1.5px solid var(--color-svv-red);background:var(--color-svv-surface);
  font-size:1rem;line-height:1;color:var(--color-svv-red)}

/* ══ LE PETIT CHOIX — « Proprietaire (client) » ou « Contact du proprietaire » ════════════════════════════════
   Il prend LA PLACE de la tuile dans la rangee : c'est la qu'on vient de cliquer. Les deux boutons sont pleine
   largeur et empiles, pour qu'au doigt on ne vise pas entre les deux. */
.cp-carte--choix{align-items:stretch;justify-content:center;gap:.5rem;text-align:center}
.cp-choix-titre{margin:0 0 .2rem;font-size:.78rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-muted)}
/* 🔴 DEUX BOUTONS QUI ONT L'AIR DE DEUX BOUTONS — en jetons, donc lisibles dans les deux themes. Le premier
   porte le rouge de la charte (c'est le chemin des CLIENTS, inchange), le second le contour neutre. */
.cp-choix-btn{min-height:44px;padding:.4rem .7rem;border-radius:.5rem;border:1px solid var(--color-svv-line-strong);
  background:var(--color-svv-surface);font:inherit;font-size:.85rem;font-weight:600;color:var(--color-svv-ink);
  cursor:pointer}
.cp-choix-btn:hover{border-color:var(--color-svv-red);color:var(--color-svv-red)}
.cp-choix-btn:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.cp-choix-btn--premier{border-color:var(--color-svv-red);background:var(--color-svv-red);
  color:var(--color-svv-surface)}
.cp-choix-btn--premier:hover{background:var(--color-svv-ink);border-color:var(--color-svv-ink);
  color:var(--color-svv-surface)}

/* ══ THEME SOMBRE — SURFACES GRADUEES, PAS DU NOIR PLAT ════════════════════════════════════════════════════════
   Les tokens de la charte portent deja les bonnes valeurs en sombre : seules les OMBRES et le fondu doivent etre
   repris, parce qu'une ombre noire sur un fond sombre ne se voit pas — c'est le contour clair qui fait le relief. */
.svv-adm-root[data-theme='dark'] .cp-carte,
.svv-adm-root[data-theme='dark'] .cp-fleche{box-shadow:0 1px 3px rgba(0,0,0,.45)}
.svv-adm-root[data-theme='dark'] .cp-icone:hover:not(:disabled){box-shadow:0 2px 8px rgba(0,0,0,.5)}
.svv-adm-root[data-theme='dark'] .cp-carte--ajout:hover:not(:disabled){box-shadow:0 2px 8px rgba(0,0,0,.5)}
@media (prefers-color-scheme:dark){
  .svv-adm-root:not([data-theme='light']) .cp-carte,
  .svv-adm-root:not([data-theme='light']) .cp-fleche{box-shadow:0 1px 3px rgba(0,0,0,.45)}
  .svv-adm-root:not([data-theme='light']) .cp-icone:hover:not(:disabled){box-shadow:0 2px 8px rgba(0,0,0,.5)}
  .svv-adm-root:not([data-theme='light']) .cp-carte--ajout:hover:not(:disabled){box-shadow:0 2px 8px rgba(0,0,0,.5)}
}
`;
