'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
/* 🔴 MODULE PUR UNIQUEMENT : ce composant vit dans le navigateur (incident du 24/09/2026). */
import { motEtape, type TypeEtape } from '../../../../lib/gestion/mongaEtape';
/* 🔴 LOT URGENCE-EVENEMENT, POINT 2 — le mot d'un niveau, depuis la SOURCE UNIQUE. Module PUR. */
import { motUrgence } from '../../../../lib/gestion/evenementQualite';
import { FriseAvancement } from './FriseAvancement';
/* 🔴 LOT EVENEMENT-MINIMALISTE, POINT 3 — le MÊME formulaire que la vue de l'événement, jamais une copie. */
import { FormulaireCarte } from './CarteVive';
/**
 * 🔴🔴 LOT URGENCE-EVENEMENT, POINT 3b — LE MÊME SÉLECTEUR QUE LA CARTE, « AU MÊME COMPOSANT » (Arno), et c'est
 * pour cela qu'il vit dans son propre fichier plutôt que dans `CarteVive` : il porte sa feuille avec lui, parce
 * que celle de `CarteVive` vit dans `GestionVue` et n'est pas injectée sur une fiche de bien.
 */
import { SelecteurUrgence } from './SelecteurUrgence';

/**
 * ⚠️ LE TYPE DU DÉTAIL VIENT DU **COMPOSANT**, ET NON DU DÉPÔT — et c'est une garde du dépôt qui l'a imposé.
 * Un premier jet écrivait `import type { CarteDetail } from '.../carteRepo'` : l'épreuve « aucun des deux
 * écrans n'importe un dépôt » l'a refusé. L'import de TYPE est pourtant effacé à la compilation et ne crée
 * aucune arête dans le graphe — mais la garde est TEXTUELLE, et c'est ce qui fait sa force : elle ne demande
 * pas à celui qui la lit de juger si tel import est « vraiment » dangereux. Le prendre ici ne coûte rien et
 * ferme la question.
 */
type DetailEvenement = Parameters<typeof FormulaireCarte>[0]['detail'];

/**
 * ══ 🔴🔴 LOT MONGA-2, POINT 4 — LE BLOC « ÉVÉNEMENTS » DE LA FICHE D'UN BIEN ═════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (06/10/2026), mot pour mot : « Dans la fiche du BIEN, UNIQUEMENT si le bien a au moins un
 * événement : un bloc “Événements” placé juste au-dessus du moteur Historique. Les événements en cours sont
 * dépliés avec leur frise, les clos sont repliés (une ligne : titre, dates, dernière étape). Rien d'autre ne
 * bouge dans la fiche (preuve d'empreintes sur une fiche sans événement : identique). »
 *
 * ═══ 🔴🔴 « UNIQUEMENT SI » EST UNE RÈGLE DE RENDU, PAS UNE PRÉFÉRENCE ══════════════════════════════════════════
 *
 * Ce composant rend `null` — rien, pas même un conteneur vide — tant que la liste est vide OU en cours de
 * lecture. C'est ce qui tient la promesse « rien d'autre ne bouge dans la fiche » : une fiche sans événement
 * doit avoir EXACTEMENT la même empreinte qu'avant ce lot, et un `<section>` vide, même sans texte, déplacerait
 * ce qui suit d'une marge.
 *
 * ⚠️ ET IL NE REND RIEN NON PLUS PENDANT LE CHARGEMENT : afficher « Lecture… » puis disparaître ferait sauter la
 * page à chaque ouverture de fiche, sur l'immense majorité des biens qui n'ont aucun événement.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

interface EvenementDuBien {
  id: number;
  reference: string;
  objet: string;
  etat: string;
  ouvertLe: string;
  traiteLe: string | null;
  clos: boolean;
  nbEtapes: number;
  derniereEtapeType: TypeEtape | null;
  derniereEtapeLe: string | null;
  /** 🔴 LOT EVENEMENT-MINIMALISTE, POINT 1 — les références MNG reliées. Vide = pas suivi par Monga. */
  mongaRefs?: string[];
  /**
   * 🔴🔴 LOT URGENCE-EVENEMENT, POINT 3b — le niveau d'urgence enregistré, qui met en évidence le bon bouton du
   * sélecteur. `null` = aucun ; ABSENT = une réponse antérieure à ce lot, et le sélecteur se lit pareil.
   */
  urgence?: string | null;
}

export function EvenementsDuBien({
  lotCle, onGeste, onOuvrirFil, evenementVise = null,
}: {
  /** La clé WIPPIMMO du lot — la même identité que l'historique juste en dessous. */
  lotCle: string;
  onGeste?: (message: string) => void;
  onOuvrirFil?: (filId: number) => void;
  /**
   * ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 1 — L'ÉVÉNEMENT SUR LEQUEL ON ARRIVE ═════════════════════════════════
   *
   * Arno : le gros bouton de l'écran partagé « ouvre la fiche du bien, défile jusqu'au bloc Événements, déplie
   * cet événement et centre sa frise sur la dernière étape ».
   *
   * 🔴 LE CENTRAGE SUR LA DERNIÈRE ÉTAPE EST DÉJÀ TENU, et il n'y a rien à ajouter : `FriseAvancement` cale sur
   * `cleDOuverture` — la dernière carte réelle — UNE SEULE FOIS à son montage (lot FRISES-REPARATION). Déplier
   * l'événement monte la frise, et la frise se cale. Un second calage écrit ici l'aurait fait deux fois.
   */
  evenementVise?: number | null;
}) {
  const [evenements, setEvenements] = useState<EvenementDuBien[] | null>(null);
  const [deplies, setDeplies] = useState<ReadonlySet<number>>(new Set());
  /**
   * 🔴 LOT EVENEMENT-MINIMALISTE, POINT 3 — L'ÉVÉNEMENT DONT ON MODIFIE LES INFORMATIONS, et son détail chargé.
   * `null` = aucun. Le détail n'est lu qu'AU CLIC sur « Modifier » : une fiche de bien n'a pas à payer une
   * requête par événement pour un formulaire que personne n'ouvrira.
   */
  const [modifie, setModifie] = useState<{ id: number; detail: DetailEvenement } | null>(null);
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/gestion/biens/evenements?bien=${encodeURIComponent(lotCle)}`, { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string; evenements?: EvenementDuBien[] };
      setEvenements(d.etat === 'ok' ? (d.evenements ?? []) : []);
    } catch {
      /* ⚠️ UN ÉCHEC SE TAIT ICI, et c'est délibéré : ce bloc est un PLUS sur la fiche d'un bien. Une bannière
         d'erreur en travers d'une fiche qu'on ouvrait pour autre chose ferait plus de mal que l'absence. */
      setEvenements([]);
    }
  }, [lotCle]);

  useEffect(() => { void charger(); }, [charger]);

  /**
   * ══ 🔴🔴 LOT EVENEMENT-MINIMALISTE, POINT 3 — LES DEUX GESTES RAPATRIÉS DEPUIS L'ÉCRAN PARTAGÉ ═════════════
   *
   * Arno a accordé le retrait du bloc sous la vignette de l'écran partagé, à condition que « tout ce qui est
   * retiré reste disponible sur la fiche du bien : la frise, la proposition “Clôturer cet événement ?” et le
   * “Modifier” des informations de l'événement (ajoute-les dans le bloc Événements de la fiche s'ils n'y sont
   * pas) ». La frise y était déjà ; les deux autres arrivent ici.
   *
   * 🔴 LA MÊME PORTE D'ÉCRITURE QUE LA VUE DE L'ÉVÉNEMENT : `PATCH /evenements/[id]`, celle de
   * `changerEtatEvenement` et de `modifierEvenement`. Même journal, même réversibilité — rouvrir un dossier est
   * un geste normal, pas une réparation.
   */
  const ecrire = useCallback(async (id: number, corps: unknown, succes: string): Promise<void> => {
    if (occupe) return;
    setOccupe(true);
    try {
      const res = await fetch(`/api/admin/gestion/evenements/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
      if (!res.ok || d.ok !== true) { onGeste?.(d.erreur ?? 'Modification impossible.'); return; }
      onGeste?.(succes);
      setModifie(null);
      await charger();
    } catch {
      onGeste?.('Modification impossible : le serveur n’a pas répondu.');
    } finally {
      setOccupe(false);
    }
  }, [occupe, onGeste, charger]);

  /**
   * 🔴 LE DÉTAIL N'EST LU QU'AU CLIC SUR « MODIFIER » — chargement paresseux, comme la carte vivante depuis le
   * lot 4c. Une fiche de bien n'a pas à payer une requête par événement pour un formulaire que personne
   * n'ouvrira.
   */
  const ouvrirModification = useCallback(async (id: number): Promise<void> => {
    try {
      const res = await fetch(`/api/admin/gestion/evenements/${id}`, { cache: 'no-store' });
      if (!res.ok) { onGeste?.('Lecture impossible.'); return; }
      setModifie({ id, detail: (await res.json()) as DetailEvenement });
    } catch {
      onGeste?.('Lecture impossible : le serveur n’a pas répondu.');
    }
  }, [onGeste]);

  /**
   * ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 3 — OUVRIR LA FICHE DU BIEN ÉTEINT L'EFFET ═══════════════════════════
   *
   * Arno : l'effet « mis à jour par Monga » s'éteint quand ce collaborateur « ouvre la fiche du bien concerné
   * (PAR N'IMPORTE QUEL CHEMIN) ». Ce bloc n'existe QUE sur une fiche de bien, et il n'est monté que si le bien
   * a au moins un événement : être ici, c'est avoir ouvert la fiche.
   *
   * 🔴 LA MÊME PORTE QUE LE CLIC SUR UNE VIGNETTE (`POST /evenements/vus`), avec une liste au lieu d'un
   * identifiant. Deux portes auraient écrit deux dates, et l'effet se serait éteint ici sans s'éteindre là.
   *
   * ⚠️ UNE SEULE FOIS PAR LISTE D'ÉVÉNEMENTS, et le verrou est une clé — pas un booléen : la fiche se relit
   * après un changement d'état, et l'on ne veut pas réécrire à chaque relecture. Mais si la LISTE change (un
   * événement nouvellement rattaché), il faut bien le marquer lui aussi.
   *
   * ⚠️ L'ÉCHEC SE TAIT : marquer vu est un geste de confort. Une bannière en travers d'une fiche qu'on ouvrait
   * pour autre chose ferait plus de mal que l'effet qui reste allumé.
   */
  const marques = useRef('');
  useEffect(() => {
    if (evenements === null || evenements.length === 0) return;
    const ids = evenements.map((e) => e.id).sort((a, b) => a - b);
    const cle = ids.join(',');
    if (marques.current === cle) return;
    marques.current = cle;
    void fetch('/api/admin/gestion/evenements/vus', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).catch(() => undefined);
  }, [evenements]);

  /**
   * 🔴 LES EN COURS SONT DÉPLIÉS, LES CLOS REPLIÉS (Arno). Posé une fois, à l'arrivée des données — et non
   * recalculé à chaque rendu, sans quoi replier un événement en cours le rouvrirait aussitôt.
   */
  useEffect(() => {
    if (evenements === null) return;
    /**
     * 🔴 LOT VIGNETTE-EVENEMENT — L'ÉVÉNEMENT VISÉ EST DÉPLIÉ, MÊME S'IL EST CLOS. On vient de cliquer un bouton
     * qui promet de l'ouvrir : le laisser replié parce qu'il est clos tiendrait la lettre de la règle (« les clos
     * restent repliés ») contre son esprit — cette règle vaut pour ce qu'on n'a pas demandé.
     */
    const ouverts = new Set(evenements.filter((e) => !e.clos).map((e) => e.id));
    if (evenementVise !== null && evenements.some((e) => e.id === evenementVise)) ouverts.add(evenementVise);
    setDeplies(ouverts);
  }, [evenements, evenementVise]);

  /**
   * ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 1 — SE POSER SUR L'ÉVÉNEMENT VISÉ ═════════════════════════════════════
   *
   * ⚠️ UNE SEULE FOIS, ET LE VERROU EST ICI. Sans lui, chaque relecture du bloc — un changement d'état, un geste
   * sur la frise — ramènerait la page sur l'événement, et l'on perdrait l'endroit qu'on regardait. Même règle,
   * et même raison, que le calage de la frise (lot FRISES-REPARATION).
   *
   * ⚠️ `block: 'start'` : on veut voir l'événement ET ce qui le suit, pas le centrer au milieu d'un écran dont la
   * moitié haute serait vide.
   *
   * ⚠️ SANS `behavior: 'smooth'`, ET C'EST MESURÉ. Premier jet avec la douceur : le défilement partait de 0 et
   * s'arrêtait à 459 px pour une cible à 1078 — à mi-chemin. Une animation de défilement est pilotée par les
   * images du navigateur, et elle s'interrompt dès que la page cesse d'en produire. Le bouton PROMET d'arriver
   * sur l'événement ; arriver à moitié est pire que d'arriver sec. Même arbitrage que le défilement continu des
   * frises (lot FRISES-REPARATION), et pour la même raison.
   */
  const pose = useRef(false);
  const ancres = useRef(new Map<number, HTMLLIElement | null>());
  useEffect(() => {
    /* ⚠️ ON ATTEND QUE L'ÉVÉNEMENT SOIT DÉPLIÉ : sa frise se monte alors, et la page cesse de bouger sous le
       défilement. Mesuré sans cette garde : on arrivait 30 px trop bas, le titre du bloc rogné. */
    if (pose.current || evenementVise === null || evenements === null || !deplies.has(evenementVise)) return;
    const el = ancres.current.get(evenementVise);
    if (el === null || el === undefined) return;
    pose.current = true;
    el.scrollIntoView({ block: 'start' });
  }, [evenementVise, evenements, deplies]);

  /**
   * ══ 🔴🔴 LOT EVENEMENT-MINIMALISTE, POINT 1 — LES TROIS BOUTONS D'ÉTAT SONT RETIRÉS ═════════════════════════
   *
   * ACCORD D'ARNO (07/10/2026) : « retire les boutons “À traiter / En cours / Traité” (ils ne servent à rien).
   * […] L'état existant en base n'est pas modifié. »
   *
   * 🔴 CE QUI DISPARAÎT EST UNE **PORTE D'ÉCRITURE**, PAS UNE DONNÉE. L'état reste lu à onze endroits, recensés
   * avant le retrait et donnés à Arno : le tri de la liste des événements (`fileRepo`), le texte de la vignette
   * (écran partagé et plein écran), le filtre « Événement ouvert » de l'historique et la capsule de chaque
   * ligne de mail (`historiqueRepo`), le tri du bloc Événements et son `clos` (`historiqueBienRepo`), le
   * cartouche « Événement en cours » de l'annuaire (`annuaireRepo`), les événements proposés au rattachement
   * Monga (`mongaRepo`), le tri de la recherche (`recherche`), la liste des ouverts au classement (`gestes`),
   * et la proposition de clôture (`proposerCloture`). Aucune de ces lectures ne perd sa donnée.
   *
   * ⚠️ ET IL RESTE UNE PORTE D'ÉCRITURE : celle de la vue de l'événement en plein écran (`CarteVive`), qui
   * passe par la même route. L'état ne devient donc pas immuable — il cesse d'être proposé ICI.
   */

  /* 🔴 RIEN DU TOUT : ni pendant la lecture, ni sur un bien sans événement. Voir l'encadré. */
  if (evenements === null || evenements.length === 0) return null;

  return (
    <section className="ann-bloc evb" aria-labelledby="evb-titre">
      <style>{CSS_EVENEMENTS_DU_BIEN}</style>
      <h4 className="ann-bloc-titre" id="evb-titre">
        Événements <span className="gst-compte">{evenements.length}</span>
      </h4>
      <ul className="evb-liste">
        {evenements.map((e) => {
          const ouvert = deplies.has(e.id);
          return (
            <li key={e.id} className={`evb-item${e.clos ? ' evb-item--clos' : ''}`}
              ref={(el) => { ancres.current.set(e.id, el); }}>
              <button
                type="button" className="evb-tete" aria-expanded={ouvert}
                onClick={() => setDeplies((s) => {
                  const n = new Set(s);
                  if (n.has(e.id)) n.delete(e.id); else n.add(e.id);
                  return n;
                })}
              >
                <span className="evb-objet">{e.objet}</span>
                <span className="evb-bas">
                  <span className="evb-ref">{e.reference}</span>
                  <span aria-hidden="true"> · </span>
                  <span>{e.clos ? 'clos' : 'en cours'}</span>
                  <span aria-hidden="true"> · </span>
                  {/* ⚠️ LES DATES SE DÉCOUPENT, elles ne passent pas par `Date` : le fuseau du lecteur ne doit
                      pas décaler le jour d'ouverture d'un dossier. Même règle que dans `frise.ts`. */}
                  <span>ouvert le {jourFr(e.ouvertLe)}</span>
                  {e.traiteLe !== null && <>
                    <span aria-hidden="true"> · </span>
                    <span>clos le {jourFr(e.traiteLe)}</span>
                  </>}
                  {/* 🔴 LA DERNIÈRE ÉTAPE SUR LA LIGNE REPLIÉE — c'est la demande d'Arno pour les clos, et elle
                      sert tout autant sur un en cours qu'on vient de replier. */}
                  {e.derniereEtapeType !== null && <>
                    <span aria-hidden="true"> · </span>
                    <span className="evb-etape">
                      {motEtape(e.derniereEtapeType)}
                      {e.derniereEtapeLe !== null && <> le {jourFr(e.derniereEtapeLe)}</>}
                    </span>
                  </>}
                  {/**
                    * ══ 🔴🔴 LA VIGNETTE « MONGA », AU BOUT DE LA LIGNE (Arno, point 1) ═══════════════════════
                    *
                    * « si l'événement est suivi par Monga (au moins une référence MNG reliée) : une vignette
                    * “MONGA” bien visible, fond vert, texte blanc, avec la référence au survol. »
                    *
                    * 🔴 AU BOUT, c'est-à-dire APRÈS « Intervention le … » : la ligne se lit de gauche à droite
                    * — ce qu'est le dossier, puis où il en est, puis qui le suit.
                    *
                    * ⚠️ LA RÉFÉRENCE N'EST PAS QUE DANS LE SURVOL : elle est aussi lue à voix haute. Un
                    * renseignement qui n'existe qu'au survol n'existe ni au tactile ni au clavier (CLAUDE.md
                    * §15). Le survol est un CONFORT, jamais le seul chemin.
                    *
                    * ⚠️ PLUSIEURS RÉFÉRENCES : elles sont toutes dites, séparées par une virgule. Un événement
                    * peut porter plusieurs interventions — c'est tout l'objet de `gestion_monga_lien`.
                    */}
                  {(e.mongaRefs ?? []).length > 0 && (
                    <span className="evb-monga" title={(e.mongaRefs ?? []).join(', ')}>
                      MONGA
                      <span className="evb-sr"> — suivi par Monga, {(e.mongaRefs ?? []).join(', ')}</span>
                    </span>
                  )}
                </span>
              </button>
              {ouvert && (<>
                {/**
                  * ══ 🔴🔴 LOT URGENCE-EVENEMENT, POINT 3b — LE SÉLECTEUR D'URGENCE, PRÈS DE L'EN-TÊTE ══════════
                  *
                  * ARNO : « Dans la fiche du bien quand un événement est en cours : le même sélecteur, AU MÊME
                  * COMPOSANT, près de l'en-tête de l'événement. »
                  *
                  * 🔴 JUSTE SOUS L'EN-TÊTE, ET NON DEDANS : `evb-tete` EST un `<button>`, et trois boutons dans un
                  * bouton seraient du HTML invalide et injouables au clavier. C'est l'arbitrage que ce module a
                  * déjà pris trois fois (le menu d'un échange, la capsule de type) — on est VOISIN du repli, pas
                  * dedans. « Près de » est donc tenu à la lettre : première chose sous le titre, avant la frise.
                  *
                  * 🔴 LA MÊME PORTE D'ÉCRITURE QUE LA VUE DE L'ÉVÉNEMENT : `ecrire` → `PATCH /evenements/[id]`,
                  * c'est-à-dire `modifierEvenement`. Même garde, même journal, même réversibilité. Deux portes
                  * auraient fini par écrire deux histoires dans le journal.
                  *
                  * ⚠️ `compact` : le bloc « Événements » vit dans une colonne de fiche, plus serrée que la vue de
                  * l'événement. Le pas se réduit, JAMAIS la cible tactile (44 px, exigence transverse §15).
                  */}
                <SelecteurUrgence urgence={e.urgence} occupe={occupe} compact
                  onUrgence={(u) => void ecrire(e.id, { urgence: u },
                    `Événement ${e.reference} — urgence : ${motUrgence(u).toLowerCase()}.`)} />
                <div className="evb-frise">
                  {/**
                    * ══ 🔴🔴 LOT CLOTURE-REOUVERTURE — `onProposerCloture` A ÉTÉ DÉBRANCHÉ ═══════════════════
                    *
                    * Il portait la ligne « Clôturer cet événement ? » de la frise, qui fermait le dossier EN UN
                    * CLIC. ARNO (08/10/2026) : « Retire la ligne ou le bouton qui permettait de fermer un
                    * événement en un seul clic (ailleurs que par la carte Clôture). »
                    *
                    * 🔴 LA FERMETURE N'EST PAS PERDUE, ELLE A CHANGÉ DE GESTE : on pose une carte « Clôture »
                    * dans cette même frise, et c'est la route de la frise qui appelle `changerEtatEvenement` —
                    * la MÊME fonction que cette ligne employait. Même journal, même réversibilité.
                    */}
                  <FriseAvancement
                    evenementId={e.id} compact
                    onGeste={onGeste} onOuvrirFil={onOuvrirFil}
                  />
                  {/**
                    * 🔴 « MODIFIER » LES INFORMATIONS DE L'ÉVÉNEMENT (quoi / qui demande / adresse), rapatrié
                    * ici avec l'accord d'Arno. C'est LE MÊME formulaire que la vue de l'événement — importé, pas
                    * recopié : une copie aurait fini par proposer d'autres champs d'un côté que de l'autre.
                    */}
                  {modifie !== null && modifie.id === e.id
                    ? <FormulaireCarte detail={modifie.detail} occupe={occupe}
                      onValider={(champs) => void ecrire(e.id, champs, `Événement ${e.reference} mis à jour.`)}
                      onAnnuler={() => setModifie(null)} />
                    : (
                      <p className="evb-gestes">
                        <button type="button" className="evb-modifier" disabled={occupe}
                          onClick={() => void ouvrirModification(e.id)}>
                          Modifier les informations de l’événement
                        </button>
                      </p>
                    )}
                </div>
              </>)}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** `2026-09-23T17:02:00+02:00` → `23/09/2026`. PUR, par découpage — jamais un `Date`. */
export function jourFr(iso: string): string {
  const [a, m, j] = iso.slice(0, 10).split('-');
  return j === undefined ? iso : `${j}/${m}/${a}`;
}

/* ⚠️ JETONS `--color-svv-*` UNIQUEMENT, et aucun accent grave : cette feuille vit dans un litteral gabarit. */
const CSS_EVENEMENTS_DU_BIEN = `
.evb-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.evb-item{border:1px solid var(--color-svv-line);border-radius:8px;padding:8px;
  /* ⚠️ DE L'AIR AU-DESSUS QUAND ON ATTERRIT DESSUS (lot VIGNETTE-EVENEMENT) : le gros bouton de l'ecran partage
     amene ici, et un evenement colle au bord haut se lit mal — le titre du bloc passerait sous l'en-tete. */
  scroll-margin-top:72px}
.evb-item--clos{opacity:.85}
.evb-tete{display:flex;flex-direction:column;gap:2px;width:100%;min-height:44px;padding:2px;
  font:inherit;text-align:left;background:none;border:0;cursor:pointer;color:var(--color-svv-ink)}
.evb-tete:hover{background:var(--color-svv-field)}
.evb-tete:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.evb-objet{font-size:.88rem;font-weight:700;overflow-wrap:anywhere}
.evb-bas{font-size:.78rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
.evb-ref{font-weight:700}
.evb-etape{color:var(--color-svv-ink)}
.evb-frise{margin-top:6px;padding-top:6px;border-top:1px solid var(--color-svv-line)}
/* ══ 🔴🔴 LOT EVENEMENT-MINIMALISTE, POINT 1 — LA VIGNETTE « MONGA » ══════════════════════════════════════════
   Arno : « une vignette “MONGA” bien visible, fond vert, texte blanc, avec la reference au survol ».
   ⚠️ LE TEXTE EST BLANC SUR VERT, ET LE JETON DE FOND EST --color-svv-bg : en theme Sombre, « blanc » est le
   fond de la page, et c'est lui qui donne le contraste contre le vert. Ecrire du blanc en dur aurait rendu la
   vignette illisible dans un theme et pas dans l'autre.
   ⚠️ LES REGLES D'ETAT (.evb-etats, .evb-etat) ONT ETE RETIREES AVEC LEURS BOUTONS (accord d'Arno) : une regle
   orpheline finit toujours par etre recablee « parce qu'elle est encore la ». */
/* ══ 🔴 LOT EVENEMENT-MINIMALISTE, POINT 3 — LE « MODIFIER » RAPATRIE DEPUIS L'ECRAN PARTAGE ══════════════════
   Discret : c'est un geste de correction, pas l'action principale du bloc. Cible 44 px (exigence transverse). */
.evb-gestes{margin:8px 0 0}
.evb-modifier{font:inherit;font-size:.78rem;min-height:44px;padding:4px 10px;cursor:pointer;
  color:var(--color-svv-ink);background:var(--color-svv-bg);
  border:1px solid var(--color-svv-line);border-radius:6px}
.evb-modifier:hover:not(:disabled){background:var(--color-svv-field)}
.evb-modifier:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.evb-modifier:disabled{color:var(--color-svv-muted);cursor:default}

.evb-monga{display:inline-block;margin-left:.35rem;padding:1px 7px;border-radius:999px;
  font-size:.68rem;font-weight:700;letter-spacing:.04em;
  color:var(--color-svv-bg);background:var(--color-svv-green)}
.evb-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip-path:inset(50%);white-space:nowrap;border:0}
`;
