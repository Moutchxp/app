'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BoiteMail } from './BoiteMail';
import { PanneauAffecter } from './PanneauAffecter';
import { ColonneMode, type PanneauMobile } from './ColonneMode';
import { Brouillons } from './Brouillons';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import { preparerBrouillon, type VoieRedaction } from '../../../../lib/gestion/redaction';
import type { ActionLigne } from '../../../../lib/gestion/menuLigne';
import { gesteCorbeille, marquerLectureLigne } from './gestesLigne';
import { Conversation } from './Conversation';
import type { Rapport } from './gestesMail';
import { memeEtiquette, type Etiquette } from '../../../../lib/gestion/ecranUrl';

/**
 * LOT 5-FUSION / 5-FUSION-B — LA BOÎTE EN PLEIN ÉCRAN, façon messagerie.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE N'EST PAS UNE SECONDE BOÎTE MAIL. La liste EST `BoiteMail` (lot 5a), avec sa recherche, ses filtres, son
 * interrupteur de courrier automatique et sa pagination par curseur ; la lecture EST `Conversation` (lot 5b), la vue
 * unique du module. Ce fichier ne fait que les DISPOSER et leur dire quelle étiquette regarder. Deux vues du même
 * courrier finiraient par diverger — et c'est toujours celle qu'on regarde le moins qui garde le défaut.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * LOT 5-FUSION-B — LES ÉTIQUETTES ONT DÉMÉNAGÉ DANS LA BARRE DE L'ADMINISTRATION (`ColonneMode`), à la place des liens
 * de modules. La liste et la conversation récupèrent toute la largeur ainsi libérée : deux panneaux côte à côte dès
 * 1000 px, là où il en fallait 1200 quand les étiquettes mangeaient 230 px du contenu.
 *
 * 🔴 UNE ÉTIQUETTE N'EST QU'UN FILTRE. Rien n'est écrit en base, aucune colonne : « Envoyés », « Sans suite » ou une
 * carte se DÉRIVENT à la lecture (voir `boiteRepo`). Changer l'état d'un échange change son étiquette sans qu'aucun
 * code ne s'en occupe.
 *
 * ⚠️ « À CLASSER » N'EST PAS UNE LISTE DE PLUS : c'est le poste de tri LUI-MÊME, passé en `enfantAClasser` par l'écran
 * qui le possède déjà — avec ses gestes, son panneau et son compteur. Le recoder ici aurait donné deux files qui se
 * contredisent au premier changement de règle.
 *
 * MOBILE D'ABORD : sous 768 px il n'y a pas trois colonnes mais TROIS ÉCRANS — les étiquettes, la liste, la
 * conversation — avec un retour explicite à chaque niveau. Cibles ≥ 44 px, aucune interaction au survol seul, jetons
 * `--color-svv-*` uniquement, et l'étiquette ouverte dite par un MOT (`aria-current`) autant que par la forme.
 */

/** Une entrée de la colonne de gauche. `reference` n'est renseignée que pour les cartes (GES-…). */
export interface EtiquetteAffichee {
  etiquette: Etiquette;
  libelle: string;
  /** `null` = on ne sait pas encore (le compte n'est pas revenu). Une étiquette sans nombre vaut mieux qu'un faux. */
  compte: number | null;
  /**
   * LOT 5-BOITE — combien de ces échanges me restent NON LUS. Affiché EN PLUS du total, jamais à sa place : « 3 non
   * lus » sans le total ne dit pas la taille de la boîte, et le total sans les non-lus ne dit pas ce qui m'attend.
   * `null` ou absent = on ne sait pas (migration 250 absente, ou accès sans compte personnel) : on n'affiche rien.
   */
  nonLus?: number | null;
  /** LOT 5-BOITE-2 — le compte est un MINIMUM (Gmail en avait plus que le plafond) : le libellé le dit. */
  nonLusPartiel?: boolean;
  reference?: string;
}

/**
 * Les étiquettes à AFFICHER. 🔴 Pas d'étiquette vide — une colonne remplie de zéros ne renseigne sur rien et fait
 * défiler pour rien. Seule exception, et elle est nécessaire : celle qu'on REGARDE reste listée même à zéro, sinon
 * elle disparaîtrait sous les pieds de celui qui vient de la choisir. PUR.
 */
export function etiquettesVisibles(
  toutes: readonly EtiquetteAffichee[], ouverte: Etiquette,
): EtiquetteAffichee[] {
  return toutes.filter((e) => e.compte === null || e.compte > 0 || memeEtiquette(e.etiquette, ouverte));
}

export function PleinEcranBoite({
  etiquette, etiquettes, onEtiquette, filOuvert, onOuvrir, onFermerFil, maintenant, onGeste, onRetour,
  enfantAClasser, auto, onAuto, redaction = null, onNonLus, corbeilleDisponible = false, peutEcrire = false,
}: {
  etiquette: Etiquette;
  etiquettes: readonly EtiquetteAffichee[];
  onEtiquette: (e: Etiquette) => void;
  filOuvert: number | null;
  onOuvrir: (filId: number) => void;
  onFermerFil: () => void;
  maintenant: Date;
  onGeste: Rapport;
  onRetour: () => void;
  /** Le poste de tri, rendu par l'écran qui le possède. Affiché sous l'étiquette « À classer », et seulement là. */
  enfantAClasser: ReactNode;
  auto: boolean;
  onAuto: (v: boolean) => void;
  /** LOT 5e — droit, schéma, connexion Google, signature, délai. `null` = aucun écran d'écriture. */
  redaction?: ContexteRedactionEcran | null;
  /** LOT 5-BOITE — remonte le nombre d'échanges non lus par la personne connectée, pour l'étiquette « Réception ». */
  onNonLus?: (n: number | null, partiel?: boolean) => void;
  /** LOT 5-BOITE-3 — la migration 251 est-elle là, et peut-on écrire au nom de gestion@ ? Pilote le menu des lignes. */
  corbeilleDisponible?: boolean;
  peutEcrire?: boolean;
}) {
  // Sur téléphone, on arrive sur les ÉTIQUETTES : c'est le sommaire, et on ne tombe pas au milieu d'une liste sans
  //   savoir laquelle. Au montage, donc à chaque entrée en plein écran. Sur grand écran, l'attribut ne change rien.
  const [panneauMobile, setPanneauMobile] = useState<PanneauMobile>('colonne');
  /**
   * LOT 5-GMAIL — LE PARTAGE « CLASSER ». `null` = fermé. Sinon, la voie par laquelle on y entre : « Classer dans
   * une carte » ouvre sur la recherche d'événements, « Créer un événement » sur le formulaire. Les deux voies
   * restent offertes une fois ouvert — c'est le point de départ qui change, pas ce qui est possible.
   */
  const [classement, setClassement] = useState<'nouveau' | 'existant' | null>(null);
  /** Change après un classement réussi → la conversation est remontée et relue, donc sa barre montre la GES-…. */
  const [versionFil, setVersionFil] = useState(0);
  /**
   * LOT 5-BOITE — le DERNIER marquage de lecture, transmis tel quel à la liste.
   *
   * 🔴 IL NE TOUCHE SURTOUT PAS À `versionFil`, qui est la CLÉ de la conversation : s'en servir la remonterait, son
   * effet d'ouverture repartirait, re-marquerait, re-changerait la clé — une boucle sans fin, dont le seul symptôme
   * visible serait un écran qui rame (mesuré en test avant correction).
   *
   * 🔴 ET IL NE FAIT PAS RELIRE LA LISTE : le lot 5-GMAIL garantit qu'ouvrir un échange ne perd ni les pages déjà
   * chargées, ni la recherche en cours. La liste met son gras à jour SUR PLACE, à partir de ce seul objet.
   */
  const [marquage, setMarquage] = useState<{ filId: number; nonLu: boolean; cle: number }>({ filId: 0, nonLu: false, cle: 0 });
  /** LOT 5-BOITE-3 — la voie demandée depuis le menu d'une ligne (Répondre / Répondre à tous / Transférer). */
  const [voieDemandee, setVoieDemandee] = useState<VoieRedaction | null>(null);
  /**
   * LOT 5-BOITE-3 — LE BANDEAU « ANNULER ». Un geste réversible doit se défaire LÀ OÙ IL A ÉTÉ FAIT : renvoyer
   * chercher l'échange dans la corbeille pour le restaurer serait lui faire payer une erreur de clic.
   */
  const [corbeilleFaite, setCorbeilleFaite] = useState<{ filId: number } | null>(null);
  /** Incrémenté après un geste de corbeille : la liste doit être relue, l'échange n'y est plus (ou y revient). */
  const [versionListe, setVersionListe] = useState(0);
  /** LOT 5e — le brouillon d'un NOUVEAU message (hors de tout échange). `null` = on ne rédige pas. */
  const [nouveau, setNouveau] = useState<BrouillonEcran | null>(null);

  /**
   * LA POSITION DE DÉFILEMENT DE LA LISTE, retenue à l'ouverture d'un échange et rendue au retour.
   *
   * 🔴 ET LA LISTE RESTE MONTÉE pendant qu'on lit (elle est seulement masquée) : la démonter lui ferait perdre ses
   * pages chargées par « Voir les échanges plus anciens » et sa recherche en cours, et le retour repartirait de la
   * première page. C'est le défaut classique d'une ouverture « en pleine page », et il ne se voit qu'après avoir
   * fait défiler trois pages.
   */
  const defilement = useRef(0);

  /**
   * LOT 5-BOITE-3 — CE QUE FAIT UNE ENTRÉE DU MENU D'UNE LIGNE.
   *
   * 🔴 LES TROIS VOIES DE RÉDACTION OUVRENT L'ÉCHANGE ET SON ÉDITEUR, sur le dernier message. Ouvrir seulement
   * l'échange obligerait à cliquer une seconde fois — ce n'est pas ce que le menu promet.
   *
   * 🔴 LA CORBEILLE NE DEMANDE AUCUNE CONFIRMATION, et c'est délibéré : le geste est réversible d'un clic, le
   * bandeau « Annuler » reste affiché, et rien n'est supprimé nulle part. Une question posée avant un geste qu'on
   * défait en une seconde apprend surtout à cliquer « oui » sans lire.
   *
   * 🔴 LE LU/NON LU PASSE PAR LA ROUTE EXISTANTE (lot 5-BOITE-2) : c'est celui de Gmail, commun à l'équipe. On ne
   * crée pas un second chemin pour le même geste.
   */
  const agirSurLigne = async (filId: number, action: ActionLigne): Promise<void> => {
    if (action === 'repondre' || action === 'repondre_tous' || action === 'transferer') {
      setVoieDemandee(action);
      onOuvrir(filId);
      return;
    }
    if (action === 'lu' || action === 'non_lu') {
      const r = await marquerLectureLigne(filId, action === 'lu');
      onGeste(r.message);
      if (r.ok) setMarquage((m) => ({ filId, nonLu: action === 'non_lu', cle: m.cle + 1 }));
      return;
    }
    // ── LA CORBEILLE ──
    const versLaCorbeille = action === 'corbeille';
    const r = await gesteCorbeille(filId, versLaCorbeille);
    if (!r.ok) { onGeste(r.message); return; }
    // L'échange quitte (ou rejoint) la liste affichée : elle est relue. C'est le SEUL cas où on la relit —
    //   ailleurs, on met à jour sur place pour ne pas perdre les pages déjà chargées.
    setVersionListe((v) => v + 1);
    if (filOuvert === filId) onFermerFil();
    // Le bandeau porte l'annulation ; une restauration, elle, se dit dans le compte rendu ordinaire.
    setCorbeilleFaite(versLaCorbeille ? { filId } : null);
    if (!versLaCorbeille) onGeste(r.message);
  };

  /** Défaire le dernier « Supprimer », depuis le bandeau. Le même verbe que « Restaurer », pris par l'autre bout. */
  const annulerCorbeille = async (): Promise<void> => {
    const fait = corbeilleFaite;
    if (fait === null) return;
    setCorbeilleFaite(null);
    const r = await gesteCorbeille(fait.filId, false);
    onGeste(r.ok ? 'Échange restauré : il est revenu dans sa boîte.' : r.message);
    if (r.ok) setVersionListe((v) => v + 1);
  };
  useEffect(() => {
    if (filOuvert !== null) return;
    const y = defilement.current;
    if (y <= 0) return;
    // Après la peinture : la liste vient de réapparaître, sa hauteur n'existe pas encore au moment du rendu.
    const t = requestAnimationFrame(() => window.scrollTo(0, y));
    return () => cancelAnimationFrame(t);
  }, [filOuvert]);

  /**
   * CHANGER D'ÉCHANGE REFERME LE PARTAGE : il porte sur CET échange, et le traîner sur le suivant ferait classer le
   * mauvais — le piège exact du panneau d'affectation, corrigé au lot 4c après qu'Arno l'a vu à l'écran.
   *
   * Ajusté PENDANT le rendu, et non dans un effet : c'est le patron que React prescrit pour remettre un état à zéro
   * quand une propriété change. Dans un effet, l'écran afficherait d'abord une image fausse — le partage de l'échange
   * précédent au-dessus du nouveau — avant de se corriger au tour suivant.
   */
  const [filPrecedent, setFilPrecedent] = useState(filOuvert);
  if (filOuvert !== filPrecedent) { setFilPrecedent(filOuvert); setClassement(null); }

  const visibles = etiquettesVisibles(etiquettes, etiquette);
  const ouverte = visibles.find((e) => memeEtiquette(e.etiquette, etiquette));
  const titre = ouverte?.libelle ?? 'Boîte mail';
  const aClasser = etiquette.sorte === 'a_classer';
  // Le nombre d'échanges tenus hors de la file par une règle : il vient de l'étiquette qui les rassemble, pas d'un
  //   second calcul. `null` = pas encore connu — on se tait alors, plutôt que d'annoncer un zéro qu'on n'a pas mesuré.
  const comptesAutomatiques = etiquettes.find((e) => e.etiquette.sorte === 'automatique')?.compte ?? null;

  return (
    <div className="pe">
      <style>{CSS_PLEIN_ECRAN}</style>

      {/* ══ LA COLONNE, POSÉE DANS LA BARRE DE L'ADMINISTRATION ═══════════════════════════════════════════════════ */}
      <ColonneMode actif panneauMobile={panneauMobile} titre="Étiquettes de la boîte">
        {/* LA SORTIE, EN PREMIER ET EN TOUTES LETTRES. Un plein écran sans retour évident est un piège ; celui-ci est
            le premier élément de la colonne, donc la première chose qu'atteignent le clavier et un lecteur d'écran. */}
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onRetour}>← Écran partagé</button>
        {/* LOT 5e — « NOUVEAU MESSAGE », en haut de la colonne. Il n'apparaît que si tout est réuni (base à jour,
            droit d'envoi) : un bouton qui échouerait au clic est pire qu'un bouton absent. */}
        {redaction?.schemaPret && redaction.peutEnvoyer && (
          <button type="button" className="svv-btn svv-btn-primary gst-btn"
            onClick={() => {
              onFermerFil();
              setNouveau({
                ...preparerBrouillon('nouveau', null, { adresseGestion: redaction.adresseGestion, signature: redaction.signature }),
                id: null,
              });
              setPanneauMobile('contenu');
            }}>
            Nouveau message
          </button>
        )}
        <h2 className="cm-titre">Boîte mail</h2>
        <ul className="cm-liste">
          {visibles.map((e) => {
            const active = memeEtiquette(e.etiquette, etiquette);
            return (
              <li key={`${e.etiquette.sorte}-${e.etiquette.evenementId ?? 0}`}>
                <button type="button" className={`cm-entree${active ? ' cm-entree--active' : ''}`}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => { onEtiquette(e.etiquette); setPanneauMobile('contenu'); }}>
                  <span className="cm-nom">
                    {/* La référence d'une carte passe DEVANT son titre : c'est elle qu'on cherche des yeux, et c'est
                        elle qu'on retrouve dans un mail ou dans un échange déjà classé. */}
                    {e.reference && <span className="gst-ref">{e.reference}</span>}
                    <span className="cm-texte">{e.libelle}</span>
                  </span>
                  {/* « 3 non lus · 10 103 » : le mot est écrit, jamais une pastille de couleur seule. */}
                  {typeof e.nonLus === 'number' && e.nonLus > 0 && (
                    <span className="cm-non-lus">
                      {e.nonLusPartiel ? 'au moins ' : ''}{e.nonLus} non lu{e.nonLus > 1 ? 's' : ''}
                    </span>
                  )}
                  {e.compte !== null && <span className="gst-compte">{e.compte}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </ColonneMode>

      {/* Le retour vers les étiquettes n'existe que là où elles ne sont pas visibles, c'est-à-dire sur téléphone. */}
      <button type="button" className="svv-btn svv-btn-outline gst-btn pe-retour-colonne"
        onClick={() => setPanneauMobile('colonne')}>
        ← Étiquettes
      </button>

      <div className={`pe-grille${classement !== null ? ' pe-grille--classer' : ''}`}>
        {/* LA LISTE — pleine largeur par défaut, et MASQUÉE (jamais démontée) pendant qu'on lit un échange. */}
        <section className="pe-liste" aria-label={`Échanges — ${titre}`} hidden={filOuvert !== null}>
          {/* SOUS « À CLASSER », C'EST LE POSTE DE TRI QUI S'AFFICHE, tel qu'il est : mêmes gestes, même panneau,
              même compteur. Sous toutes les autres étiquettes, c'est la boîte du lot 5a, filtrée. */}
          {/* LOT 5e — UN NOUVEAU MESSAGE prend la place de la liste : on écrit, on ne parcourt pas en même temps. */}
          {nouveau !== null ? (
            <Redaction brouillon={nouveau} contexte={redaction as ContexteRedactionEcran}
              onChange={setNouveau}
              onFerme={() => setNouveau(null)}
              onEnvoye={() => setNouveau(null)}
              onGeste={(m) => onGeste(m)} />
          ) : etiquette.sorte === 'brouillons' ? (
            <Brouillons maintenant={maintenant}
              onOuvrir={(f) => onOuvrir(f)}
              onChange={() => onEtiquette(etiquette)} />
          ) : aClasser ? (
            <>
              <h3 className="gst-titre">
                {titre} {ouverte?.compte !== null && ouverte !== undefined && <span className="gst-compte">{ouverte.compte}</span>}
              </h3>
              {/* CE QUE CETTE LISTE NE MONTRE PAS, dit en toutes lettres, avec la sortie — comme partout dans le
                  module depuis le lot 4b. Le poste de tri n'a jamais montré le courrier automatique ; maintenant il
                  DIT où le trouver, au lieu de le taire. */}
              {comptesAutomatiques !== null && comptesAutomatiques > 0 && (
                <p className="gst-tronc">
                  Le poste de tri n’a jamais montré le courrier automatique : {comptesAutomatiques} échange
                  {comptesAutomatiques > 1 ? 's' : ''} rest{comptesAutomatiques > 1 ? 'ent' : 'e'} hors de cette liste.
                  Rien n’est supprimé.{' '}
                  <button type="button" className="gst-lien-bouton"
                    onClick={() => onEtiquette({ sorte: 'automatique', evenementId: null })}>
                    Voir l’étiquette « Courrier automatique »
                  </button>
                </p>
              )}
              {enfantAClasser}
            </>
          ) : (
            <>
            {/* ══ LOT 5-BOITE-3 — LE BANDEAU « ANNULER » ══ Il reste tant qu'on ne fait pas autre chose : un geste
                réversible doit se défaire LÀ OÙ IL A ÉTÉ FAIT. `role="status"` et non `alert` — c'est une
                confirmation, pas un problème, et on n'interrompt pas une lecture d'écran pour ça. */}
            {corbeilleFaite !== null && (
              <p className="pe-corbeille" role="status">
                <span>Échange mis à la corbeille. Rien n’est supprimé : il reste intact dans Gmail.</span>
                <button type="button" className="pe-corbeille-annuler" onClick={() => void annulerCorbeille()}>
                  Annuler
                </button>
              </p>
            )}
            <BoiteMail key={versionListe} etiquette={etiquette} titre={titre} total={ouverte?.compte ?? null} dense
              auto={auto} onAuto={onAuto} filSelectionne={filOuvert} onNonLus={onNonLus} marquage={marquage}
              corbeille={corbeilleDisponible} peutEcrire={peutEcrire} onActionLigne={agirSurLigne}
              onOuvrir={(id) => { defilement.current = window.scrollY; onOuvrir(id); }} />
            </>
          )}
        </section>

        {/* LA CONVERSATION — EN PLEINE PAGE. Elle ne s'ouvre plus « à côté » : elle prend la place de la liste, comme
            dans une messagerie. Le retour se fait par la flèche de sa barre d'actions, ou par « Précédent ». */}
        {filOuvert !== null && (
          <section className="pe-lecture" aria-label="Conversation">
            <Conversation key={`${filOuvert}-${versionFil}`} filId={filOuvert} maintenant={maintenant}
              voieInitiale={voieDemandee}
              onFerme={onFermerFil} barreActions onClassement={(voie) => setClassement(voie)}
              redaction={redaction} onGeste={onGeste}
              // LOT 5-BOITE — ouvrir (ou marquer non lu) change le gras de la liste, qui l'applique sur place.
              onLecture={(id, lu) => setMarquage((m) => ({ filId: id, nonLu: !lu, cle: m.cle + 1 }))} />
          </section>
        )}

        {/* LE PARTAGE « CLASSER » — à DROITE de la conversation sur grand écran, À SA PLACE sur téléphone (un écran
            après l'autre, jamais deux colonnes de 180 px). Le panneau est celui du lot 4b, inchangé : mêmes deux
            voies, même pré-remplissage lu dans le mail, même route, même compteur GES-AAAA-NNNNNN atomique. */}
        {filOuvert !== null && classement !== null && (
          <aside className="pe-classer" aria-label="Classer cet échange">
            <div className="pe-classer-haut">
              <h3 className="gst-titre">Classer cet échange</h3>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setClassement(null)}>
                Fermer
              </button>
            </div>
            <PanneauAffecter filId={filOuvert} voieInitiale={classement}
              onFait={(m) => { setClassement(null); setVersionFil((v) => v + 1); onGeste(m, { rechargerTout: true }); }}
              onAnnuler={() => setClassement(null)} />
          </aside>
        )}
      </div>
    </div>
  );
}

const CSS_PLEIN_ECRAN = `
/* LOT 5-BOITE-3 — le bandeau « Annuler » d'un geste de corbeille. Une CONFIRMATION, pas une alarme : ton neutre,
   aucune couleur d'avertissement, et le geste inverse à portée de doigt (cible de 44 px). */
.pe-corbeille{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 .6rem;padding:10px 12px;
  border:1px solid var(--color-svv-line-strong);border-radius:10px;background:var(--color-svv-field);
  font-size:.85rem;line-height:1.45;color:var(--color-svv-ink)}
.pe-corbeille-annuler{min-height:44px;padding:0 .9rem;border-radius:.5rem;border:1px solid var(--color-svv-line-strong);
  background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:.85rem;font-weight:600;
  cursor:pointer;margin-left:auto}
.pe-corbeille-annuler:hover{border-color:var(--color-svv-ink)}
.pe-corbeille-annuler:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}

.pe{display:flex;flex-direction:column;gap:12px;min-width:0}
/* UNE SEULE COLONNE par défaut : la liste occupe toute la largeur, et l'échange ouvert prend sa place — comme dans
   une messagerie. Plus de volet de lecture ouvert en permanence, qui coupait la liste en deux pour ne rien montrer. */
.pe-grille{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}
.pe-liste{min-width:0}
.pe-lecture{min-width:0}
.pe-classer{min-width:0}
/* SUR TÉLÉPHONE, « classer » est un ÉCRAN DE PLUS, pas une seconde colonne : la conversation s'efface le temps de
   choisir l'événement, et le bouton « Fermer » la ramène. Deux colonnes de 180 px ne sont pas deux colonnes. */
.pe-grille--classer .pe-lecture{display:none}
/* Le retour vers les étiquettes n'existe que là où elles ne sont pas visibles, c'est-à-dire sur téléphone. */
.pe-retour-colonne{align-self:flex-start}
@media (min-width:768px){.pe-retour-colonne{display:none}}
.pe-classer-haut{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.5rem}
.pe-classer-haut .gst-titre{margin:0}
/* Dès 1000 px, « classer » se met À CÔTÉ de la conversation : on voit le mail pendant qu'on choisit sa carte, ce qui
   est exactement ce qu'on a besoin de relire à ce moment-là. */
@media (min-width:1000px){
  .pe-grille--classer{grid-template-columns:minmax(0,1fr) minmax(0,22rem)}
  .pe-grille--classer .pe-lecture{display:block}
}
`;
