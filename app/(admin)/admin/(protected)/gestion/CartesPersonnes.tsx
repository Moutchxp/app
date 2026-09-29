'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContactAffiche, PersonneAnnuaire } from '../../../../lib/gestion/annuaireRepo';
import {
  MOTIF_DERNIER_PROPRIETAIRE, MOTIF_SANS_MIGRATION, manquesDeLaFiche, phraseArchivage, proposerCoupure,
  verifierCoordonnees, type CoordonneeSaisie, type PartDeCoordonnee,
} from '../../../../lib/gestion/annuaireEdition';
// LOT FICHES-RETOUCHES — la nomenclature (Mobile / Fixe / E-mail) et le formatage des numeros.
import {
  TYPES_COORDONNEE, formaterSaisieTelephone, motType, sorteDuType, typeDeLibelle, type TypeCoordonnee,
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
export function Ligne({ libelle, children }: { libelle: string | null; children: React.ReactNode }) {
  return (
    <div className="cp-ligne">
      {libelle === null
        ? <span className="cp-lab cp-lab--vide" aria-hidden="true" />
        : <span className="cp-lab">{libelle}</span>}
      <span className="cp-val">{children}</span>
    </div>
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

/** Les coordonnées d'une sorte, une par ligne, le libellé une seule fois. */
function Coordonnees({ contacts, sorte, onEcrire }: {
  contacts: readonly ContactAffiche[]; sorte: 'telephone' | 'email'; onEcrire?: (email: string) => void;
}) {
  const liste = contacts.filter((c) => c.sorte === sorte);
  const mot = sorte === 'telephone' ? 'Téléphone' : 'E-mail';
  if (liste.length === 0) return <Ligne libelle={mot}><Rien /></Ligne>;
  return (
    <>
      {liste.map((c, i) => (
        <Ligne key={c.id} libelle={i === 0 ? (liste.length > 1 ? `${mot}s` : mot) : null}>
          {sorte === 'telephone'
            /* `tel:` porte la forme canonique (+33…), qui compose partout ; le texte montre ce qui était écrit. */
            ? <a className="cp-lien" href={`tel:${c.valeur}`}>{c.affichage}</a>
            : onEcrire
              ? <button type="button" className="cp-lien" onClick={() => onEcrire(c.valeur)}>{c.affichage}</button>
              : <a className="cp-lien" href={`mailto:${c.valeur}`}>{c.affichage}</a>}
          {/* 🔴 LOT FICHES-RETOUCHES — LA CAPSULE SUIT LA NOMENCLATURE : Mobile / Fixe / E-mail. Les libellés
              importés (« Mobile 1 », « Email 2 ») s'y rangent À L'AFFICHAGE SEULEMENT ; rien n'est réécrit en
              base. Un libellé qu'aucun type ne couvre reste montré tel quel — voir `typeDeLibelle`. */}
          <span className="cp-caps">{typeDeLibelle(c.libelle, c.sorte).mot}</span>
          <Copier valeur={sorte === 'telephone' ? c.affichage : c.valeur}
            quoi={sorte === 'telephone' ? 'ce numéro' : 'cette adresse'} />
          {c.absent && <span className="cp-caps cp-caps--absent">retiré de l’export</span>}
        </Ligne>
      ))}
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
  const adresse = [p.adresse, [p.codePostal, p.commune].filter((x) => x !== null && x !== '').join(' ')]
    .filter((x) => x !== null && x.trim() !== '').join(', ');

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
          <p className="cp-nom">{p.civilite !== null && p.civilite !== '' ? `${p.civilite} ` : ''}{p.nomAffiche}</p>
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
        <Coordonnees contacts={p.contacts} sorte="telephone" onEcrire={gestes.onEcrire} />
        <Coordonnees contacts={p.contacts} sorte="email" onEcrire={gestes.onEcrire} />
        {dessous}
        <Ligne libelle="Note">{p.note ?? <Rien mot="non renseignée" />}</Ligne>
      </div>
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
function FormulaireCarte({ p, onEnregistrer, onAnnuler, refus, creation }: {
  /** `null` en CRÉATION : la même carte, vide. */
  p: PersonneAnnuaire | null;
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
   * ⚠️ LA DIFFÉRENCE TIENT EN TROIS CHOSES, et elles sont toutes ici : le rappel du haut (« Sera ajouté comme
   * co-propriétaire sur les N biens de cette fiche »), le champ DATE, et l'EXIGENCE de complétude — « Enregistrer »
   * reste grisé tant qu'il manque quelque chose, chaque manque étant dit sous son champ.
   */
  creation?: { rappel: string; motDate: string };
}) {
  const [civilite, setCivilite] = useState(p?.civilite ?? '');
  const [prenom, setPrenom] = useState(p?.prenom ?? '');
  const [nom, setNom] = useState(p?.nom ?? '');
  const [qualite, setQualite] = useState(p?.qualite ?? '');
  const [adresse, setAdresse] = useState(p?.adresse ?? '');
  const [codePostal, setCodePostal] = useState(p?.codePostal ?? '');
  const [commune, setCommune] = useState(p?.commune ?? '');
  const [note, setNote] = useState(p?.note ?? '');
  const [date, setDate] = useState('');
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
  const manque = creation === undefined ? {} : manquesDeLaFiche({
    civilite, nom, prenom, adresse, codePostal, commune, coordonnees: saisiesVivantes, date,
  });
  const incomplete = Object.keys(manque).length > 0;

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
      await onEnregistrer({
        civilite, nom, prenom, qualite, adresse, codePostal, commune, note, coordonnees: saisies,
        ...(creation === undefined ? {} : { date }),
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
      <p className="cp-form-titre">{creation === undefined ? 'Modifier la fiche' : 'Nouvelle fiche'}</p>
      {/* 🔴 LE RAPPEL DIT CE QUE LE GESTE VA FAIRE, avant de le faire : « Sera ajouté comme co-propriétaire sur
          les N biens de cette fiche ». Sans lui, on remplit sept champs sans savoir où la personne atterrit. */}
      {creation !== undefined && <p className="cp-rappel">{creation.rappel}</p>}

      <label className="cp-champ">
        <span className="cp-champ-mot">Civilité</span>
        <input className="cp-saisie" value={civilite} onChange={(e) => setCivilite(e.target.value)}
          placeholder="M. / Mme / SCI…" />
        {manqueDe('civilite')}
      </label>
      <label className="cp-champ">
        <span className="cp-champ-mot">Nom</span>
        <input className="cp-saisie" value={nom} onChange={(e) => setNom(e.target.value)} required />
        {manqueDe('nom')}
      </label>
      <label className="cp-champ">
        <span className="cp-champ-mot">Prénom</span>
        <input className="cp-saisie" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
        {manqueDe('prenom')}
      </label>
      <label className="cp-champ">
        <span className="cp-champ-mot">Qualité <span className="cp-facultatif">facultative</span></span>
        <input className="cp-saisie" value={qualite} onChange={(e) => setQualite(e.target.value)}
          placeholder="indivision, gérant, représentant…" />
      </label>
      <label className="cp-champ">
        <span className="cp-champ-mot">Adresse</span>
        <input className="cp-saisie" value={adresse} onChange={(e) => setAdresse(e.target.value)} />
        {manqueDe('adresse')}
      </label>
      <div className="cp-champ cp-champ--duo">
        <label className="cp-duo-part">
          <span className="cp-champ-mot">Code postal</span>
          <input className="cp-saisie" value={codePostal} onChange={(e) => setCodePostal(e.target.value)}
            inputMode="numeric" />
          {manqueDe('codePostal')}
        </label>
        <label className="cp-duo-part">
          <span className="cp-champ-mot">Commune</span>
          <input className="cp-saisie" value={commune} onChange={(e) => setCommune(e.target.value)} />
          {manqueDe('commune')}
        </label>
      </div>
      {creation !== undefined && (
        <label className="cp-champ">
          <span className="cp-champ-mot">{creation.motDate}</span>
          <input className="cp-saisie" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {manqueDe('date')}
        </label>
      )}

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
          title={incomplete ? 'Il reste des champs à renseigner (voir les mentions en rouge).' : undefined}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
      <p className="cp-note-verrou">
        Une valeur enregistrée ici devient <strong>prioritaire</strong> : l’import WIPPIMMO ne l’écrase plus, il
        signale seulement la divergence dans son rapport.
      </p>
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
export function BlocCartes({ titre, id, personnes, gestes, role, motAjouter, dessous, creation }: {
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
  creation: { rappel: string; motDate: string; onCreer: (champs: ChampsSaisis) => Promise<string | null> };
}) {
  const vivantes = personnes.filter((p) => !p.archive);
  const archivees = personnes.filter((p) => p.archive);
  const ordonnees = [...vivantes, ...archivees];
  const [ajout, setAjout] = useState(false);
  const [refusAjout, setRefusAjout] = useState<string | null>(null);
  return (
    <section className="ann-bloc" aria-labelledby={id}>
      <h4 className="ann-bloc-titre" id={id}>
        {titre} <span className="gst-compte">{vivantes.length}</span>
      </h4>
      <Rangee nb={ordonnees.length}>
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
        {/* ══ 🔴🔴 LA TUILE « + AJOUTER », ET LA CARTE VIDE QUI PREND SA PLACE ═══════════════════════════════════
            Arno : « Un clic sur la tuile “+ Ajouter” ouvre, À SA PLACE DANS LA RANGÉE, une carte identique au mode
            Modifier d'un contact existant, mais vide ». La tuile ne mène donc plus à un formulaire posé ailleurs
            dans la page : elle DEVIENT la carte, au bout de la rangée, là où l'on vient de cliquer. */}
        {ajout ? (
          <article className="cp-carte cp-carte--edition">
            <FormulaireCarte p={null} refus={refusAjout} onAnnuler={() => { setAjout(false); setRefusAjout(null); }}
              creation={{ rappel: creation.rappel, motDate: creation.motDate }}
              onEnregistrer={async (champs) => {
                const motif = await creation.onCreer(champs);
                if (motif === null) { setAjout(false); setRefusAjout(null); } else setRefusAjout(motif);
              }} />
          </article>
        ) : (
          <button type="button" className="cp-carte cp-carte--ajout" disabled={!gestes.modifiable}
            title={gestes.modifiable ? undefined : MOTIF_SANS_MIGRATION}
            onClick={() => setAjout(true)}>
            <span className="cp-ajout-plus" aria-hidden="true">+</span>
            <span className="cp-ajout-mot">{motAjouter}</span>
            {!gestes.modifiable && <span className="cp-rien">{MOTIF_SANS_MIGRATION}</span>}
          </button>
        )}
      </Rangee>
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

/* ══ 🔴 L'ALIGNEMENT DES LIGNES — LA DEMANDE EXPRESSE D'ARNO ═══════════════════════════════════════════════════
   UNE LIGNE = UNE GRILLE DE DEUX COLONNES, centree verticalement. Le libelle est donc mecaniquement au milieu de
   sa valeur, meme quand celle-ci porte deux capsules et un bouton. Un dl (dt/dd) ne pouvait pas le faire : ses
   deux colonnes vivent dans des flux separes, et leurs hauteurs ne se repondent pas.
   L'ESPACEMENT EST LE MEME PARTOUT (row-gap unique sur le conteneur) : plus de trou entre TELEPHONE et E-MAIL. */
.cp-lignes{display:flex;flex-direction:column;row-gap:.3rem}
.cp-ligne{display:grid;grid-template-columns:5.6rem minmax(0,1fr);align-items:center;column-gap:.5rem;
  min-height:1.65rem}
.cp-lab{font-size:.72rem;font-weight:600;letter-spacing:.01em;text-transform:uppercase;
  color:var(--color-svv-muted);align-self:center}
.cp-val{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem;min-width:0;
  font-size:.85rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
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
