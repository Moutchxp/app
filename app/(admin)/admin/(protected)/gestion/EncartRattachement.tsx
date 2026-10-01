'use client';

import { useState } from 'react';
import { CSS_CHOISIR_CIBLE } from './ChoisirCible';
import { ModifierRattachement } from './ModifierRattachement';
// 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LE MÊME MODULE QUE LA FENÊTRE DE RÉDACTION, à l'extrémité droite du bloc.
import { ChampClassement, CSS_CHAMP_CLASSEMENT } from './ChampClassement';
import { CSS_RATTACHER_EN_ECRIVANT, RattacherEnEcrivant } from './RattacherEnEcrivant';
import { lignePremierBien } from '../../../../lib/gestion/classementBoutons';
import type { CibleBrouillon } from '../../../../lib/gestion/redaction';
// LOT AFFECTATION-PAR-BIEN — la fenêtre de classement complète, partagée : une seule implémentation du geste.
import { ClasserMail } from './ClasserMail';
// LOT CONTACTS-ET-EVENEMENT — le bloc « Événement rattaché », en tête de l'encart.
import { BlocEvenement } from './BlocEvenement';
import type { LienAffiche } from '../../../../lib/gestion/rattachementRepo';
import type { Cible, Statut } from '../../../../lib/gestion/rattachement';

/**
 * LOT RATTACHEMENT-1 — « RATTACHÉ À … », DANS CHAQUE MAIL OUVERT.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'IL RÉPOND, EN UNE LIGNE : « ce mail parle du logement 4 rue X et de son propriétaire ». C'est la question
 * qu'on se pose en classant, et celle à laquelle il faudra répondre pour reconstituer l'historique d'un logement.
 *
 * 🔴 IL MONTRE AUSSI LES PROPOSITIONS, séparément, avec leurs deux gestes. Un candidat qu'on ne voit pas est un
 * candidat qui ne sera jamais arbitré — et la file de tri ne suffit pas : c'est en lisant le mail qu'on tranche.
 *
 * 🔴 TOUT EST RÉVERSIBLE, ET LE BANDEAU LE DIT. « Retirer » ne supprime rien : le lien change d'état, daté et signé,
 * et la mention « Remettre » apparaît. Ce qui se fait d'un clic se défait d'un clic.
 *
 * ⚠️ IL NE S'AFFICHE QU'AVEC QUELQUE CHOSE À DIRE OU À FAIRE. Migration 257 absente, ou réponse en échec : le parent
 * ne lui passe rien et il ne rend rien — surtout pas une erreur rouge au-dessus d'un mail, qui ferait croire que le
 * mail lui-même a un problème. Quand il n'y a ni lien ni candidat, il reste UNE ligne : le bouton « Rattacher à… ».
 * C'est le seul endroit d'où l'on puisse rattacher un mail qu'aucune adresse ne désigne — il ne peut pas disparaître.
 *
 * 🔴 IL NE CHARGE RIEN LUI-MÊME. Les liens lui sont DONNÉS par la conversation, qui les demande UNE FOIS pour tous
 * ses messages (`?messages=1,2,3`). Un échange porte parfois trente mails : trente requêtes se verraient à l'écran.
 * Après un geste, il appelle `onChange` — c'est la conversation qui recharge, une fois, pour tout le monde.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : les types passent par `import type`, effacé à la compilation.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
/**
 * ⚠️ PAS DE PROPRIÉTÉ `evenementQualifie` ICI — elle a existé, et elle a menti. C'était une propriété facultative
 * à `false` par défaut, que la conversation ne passait pas : le bloc « Événement » annonçait donc « mise à jour 268
 * à appliquer » sur une base où elle l'était. `BlocEvenement` demande maintenant la réponse au serveur, avec les
 * données qu'elle conditionne. Ne pas la réintroduire ici : elle retraverserait deux composants pour rien.
 */
export function EncartRattachement({
  messageId, filId, liens, interne = null, horsGestion = false, onInterne, onHorsGestion,
  onChange, onGeste, onHistorique,
}: {
  messageId: number;
  /**
   * ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — CE QUI MANQUAIT POUR QUE LES DEUX CASES AIENT UN SENS ═══════════════
   *
   * Le bloc ne connaissait que les RATTACHEMENTS. Or « Classer ce mail » a trois réponses vertes, et deux
   * d'entre elles ne vivent pas dans `gestion_rattachement` : « Interne » porte sur l'ÉCHANGE (migration 281),
   * « Hors gestion » sur LE MESSAGE (migration 266). Sans elles, le bloc aurait montré deux boutons rouges et
   * blancs au-dessus d'un mail déjà classé — c'est-à-dire proposé de refaire un geste déjà fait.
   *
   * `interne` : `null` = on ne sait pas (migration 281 absente, ou lecture en échec). Les deux cases
   * fonctionnent quand même pour « Rattacher » ; la case blanche est GRISÉE avec son motif.
   */
  interne?: boolean | null;
  /** Ce MAIL porte-t-il une marque « hors gestion » vivante ? */
  horsGestion?: boolean;
  /** Pose (`true`) ou retire (`false`) la marque « interne » de l'ÉCHANGE. Absent ⇒ la case blanche est inerte. */
  onInterne?: (actif: boolean) => void | Promise<void>;
  /** Retire la marque « hors gestion » de ce mail (`false`). Absent ⇒ la case verte ne se défait pas d'ici. */
  onHorsGestion?: (actif: boolean) => void | Promise<void>;
  /** L'échange de ce mail, pour la portée « toute la conversation » du bloc « Événement rattaché ». */
  filId?: number | null;
  /** Les liens vivants de CE mail, chargés par la conversation. `null` = migration 257 absente ou lecture en échec. */
  liens: readonly LienAffiche[] | null;
  /** Recharge les liens de toute la conversation. Appelé après chaque geste réussi. */
  onChange: () => void | Promise<void>;
  /** Prévient l'écran parent qu'un geste a eu lieu, pour son compte rendu. */
  onGeste?: (message: string) => void;
  /**
   * LOT RATTACHEMENT-2 — ouvre TOUT l'historique de cette cible. Absent = l'étiquette reste du texte : c'est le cas
   * d'une conversation rendue DANS une carte, où l'on ne veut pas quitter la carte d'un clic involontaire.
   */
  onHistorique?: (cible: Cible) => void;
}) {
  /**
   * 🔴 LOT CLASSER-SUR-CHAQUE-MAIL — `ajout` OUVRE DÉSORMAIS LA MODALE « Rattacher ce mail à… », la même que la
   * fenêtre de rédaction. Il ouvrait le panneau en ligne `MenuRattachementBien`, dont le lien rouge d'appel a
   * été supprimé sur demande d'Arno. Ce panneau n'est PAS mort : il reste la fenêtre « Visualiser / Modifier »
   * de l'en-tête (`RattachementsDuFil`), et ce qu'il portait de plus — la portée et « Hors gestion, ou classer
   * par pièce… » — est repris au pied de la modale (voir `piedSupplementaire`).
   */
  const [ajout, setAjout] = useState(false);
  /** 🔴 « voir plus » : la ligne de gauche est repliée sur le PREMIER bien, et se déplie sur demande. */
  const [deplie, setDeplie] = useState(false);
  /** La portée du rattachement, reprise du panneau d'avant : « ce mail » ou « toute la conversation ». */
  const [portee, setPortee] = useState<'mail' | 'conversation'>('mail');
  /** LOT FIL-LECTURE-2 — le rattachement dont on a ouvert la fenêtre « Modifier ». `null` = aucune fenêtre. */
  const [modifie, setModifie] = useState<LienAffiche | null>(null);
  const [occupe, setOccupe] = useState(false);
  /** LOT AFFECTATION-PAR-BIEN — la fenêtre complète (portée, hors gestion, pièces), ouverte depuis le bloc. */
  const [classer, setClasser] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  /** Les liens défaits pendant cette visite : on garde le bouton « Remettre » sous la main, sans recharger. */
  const [defaits, setDefaits] = useState<Map<number, LienAffiche>>(new Map());

  const agir = async (corps: Record<string, unknown>, methode: 'POST' | 'PATCH', dit: string): Promise<boolean> => {
    setOccupe(true);
    setErreur(null);
    try {
      const res = await fetch('/api/admin/gestion/rattachements', {
        method: methode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const d = (await res.json()) as { ok?: boolean; erreur?: string };
      if (!res.ok || d.ok !== true) { setErreur(d.erreur ?? 'Le geste n’a pas abouti.'); return false; }
      onGeste?.(dit);
      await onChange();
      return true;
    } catch {
      setErreur('Le serveur n’a pas répondu.');
      return false;
    } finally {
      setOccupe(false);
    }
  };

  const changer = async (lien: LienAffiche, statut: Statut, dit: string): Promise<void> => {
    const fait = await agir({ lienId: lien.id, statut }, 'PATCH', dit);
    if (!fait) return;
    setDefaits((m) => {
      const n = new Map(m);
      if (statut === 'retire' || statut === 'rejete') n.set(lien.id, lien); else n.delete(lien.id);
      return n;
    });
  };

  if (liens === null) return null;

  /**
   * ══ 🔴🔴 LOT FICHE-RATTACHEMENT — UN NOM DE PERSONNE N'EST JAMAIS PRÉSENTÉ COMME UN BIEN RATTACHÉ ════════════
   *
   * LE DÉFAUT EXACT, vu par Arno le 28/09/2026 au soir sur le mail « modification adresse mail » d'Isabelle MENN :
   * sous le titre « BIEN(S) RATTACHÉ(S) : », l'encart affichait « PROPRIÉTAIRE BALIABINE épouse MENN Isabelle
   * (234) — automatique ». Un nom de personne, annoncé comme un bien. On cherchait le logement dans la phrase.
   *
   * 🔴 LE TITRE DIT DES BIENS : IL N'Y AURA DONC QUE DES BIENS DESSOUS. Plus aucune voie ne crée de lien
   * « personne » (le moteur, les deux routes, et la base avec la migration 273), mais 17 en sont nés le 28/09 au
   * soir par un processus qui tournait avec l'ancien code — et rien n'interdit qu'un cas semblable ressurgisse
   * d'une vieille ligne. S'il en reste un, il est montré À PART, avec ce qu'il est et le geste pour le corriger.
   *
   * ⚠️ IL EST MONTRÉ, PAS CACHÉ. Le masquer laisserait un mail classé sous une personne sans que personne ne le
   * voie ni ne puisse le reprendre — c'est-à-dire exactement le défaut, en pire : silencieux.
   */
  const confirmes = liens.filter((l) => l.statut === 'confirme');
  const vivants = confirmes.filter((l) => l.cible.sorte !== 'proprietaire' && l.cible.sorte !== 'locataire');
  const ancienModele = confirmes.filter((l) => l.cible.sorte === 'proprietaire' || l.cible.sorte === 'locataire');
  const candidats = liens.filter((l) => l.statut === 'propose');
  /**
   * 🔴 LOT AFFECTATION-PAR-BIEN — les propositions qui visent un BIEN (logement) ou un PROPRIÉTAIRE sont rendues
   * par le bloc des biens : c'est LUI qui traduit une ancienne proposition « propriétaire » en la liste de ses
   * biens. Les autres — une carte proposée — gardent le rendu d'avant, mot pour mot.
   */
  const candidatsHorsBien = candidats.filter(
    (l) => l.cible.sorte !== 'lot' && l.cible.sorte !== 'proprietaire');
  const remettables = [...defaits.values()].filter((l) => !liens.some((x) => x.id === l.id));

  /* ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LE MÊME MODULE « RATTACHER / INTERNE » QU'À LA RÉDACTION ═══════════
     Demande d'Arno : « Dans le bloc gris au-dessus de chaque mail […] place à l'extrémité DROITE le même
     composant que dans la fenêtre de rédaction […]. Mail non rattaché (À classer) → deux boutons. Mail
     rattaché / Interne / Hors gestion → case verte correspondante. » */

  /** Les BIENS (logements) rattachés, traduits dans la forme que `ChampClassement` et la modale emploient. */
  const biensRattaches: CibleBrouillon[] = vivants
    .filter((l) => l.cible.sorte === 'lot')
    .map((l) => ({
      sorte: 'lot' as const, cle: l.cible.cle, id: l.cible.id, libelle: l.libelle,
      // ⚠️ `?? undefined` : la catégorie est absente quand l'annuaire ne l'a pas dite. Le module pur la compte
      //   alors comme « logement » — à un seul endroit, jamais ici.
      ...(l.categorie !== null ? { categorie: l.categorie } : {}),
    }));

  /**
   * ══ 🔴🔴 VALIDER LA MODALE : ON POSE CE QUI MANQUE, ON RETIRE CE QUI N'EST PLUS COCHÉ ════════════════════════
   *
   * Demande d'Arno (point 5) : « À 0, le bouton reste actif et s'intitule “Valider — aucun bien” : valider
   * retire tous les rattachements et ramène les deux boutons rouge et blanc. »
   *
   * 🔴 UN DIFF, ET NON UNE RÉÉCRITURE. On ne retire pas tout pour tout reposer : un lien reposé perdrait sa date
   * de création, son auteur et son motif d'origine — tout ce qui permet de dire, six mois plus tard, d'où vient
   * un rattachement. On ne touche QUE ce qui change.
   *
   * ⚠️ LES GESTES PASSENT PAR LES ROUTES EXISTANTES (`agir`), jamais par une seconde écriture : « Retirer » écrit
   * `retire` sur le lien, il ne supprime rien. Tout reste daté et signé, et remettable.
   *
   * ⚠️ LA PORTÉE « TOUTE LA CONVERSATION » NE VAUT QUE POUR CE QU'ON AJOUTE. Retirer en masse sur un échange
   * entier depuis cette fenêtre défer_ait des classements qu'on n'a pas regardés ; le retrait reste donc sur le
   * mail ouvert, qui est le geste le plus étroit et le moins regrettable.
   */
  const appliquerCibles = async (choisies: readonly CibleBrouillon[]): Promise<void> => {
    const voulues = new Set(choisies.filter((c) => c.sorte === 'lot').map((c) => c.cle ?? ''));
    const presentes = new Set(biensRattaches.map((c) => c.cle ?? ''));
    const aPoser = [...voulues].filter((c) => !presentes.has(c));
    const aRetirer = vivants.filter((l) => l.cible.sorte === 'lot' && !voulues.has(l.cible.cle ?? ''));

    let mails: number[] = [messageId];
    if (portee === 'conversation' && filId != null && aPoser.length > 0) {
      try {
        const res = await fetch(`/api/admin/gestion/classement?fil=${filId}&portee=1`, { cache: 'no-store' });
        const d = (await res.json()) as { etat?: string; mails?: number[] };
        if (d.etat === 'ok') mails = [...new Set([messageId, ...(d.mails ?? [])])];
      } catch { /* on retombe sur le mail ouvert : le geste le plus étroit est le moins regrettable */ }
    }

    for (const l of aRetirer) {
      await agir({ lienId: l.id, statut: 'retire' }, 'PATCH', `Rattachement retiré : ${l.libelle}`);
    }
    for (const m of mails) {
      for (const cle of aPoser) {
        await agir({
          messageId: m, cible: { sorte: 'lot', cle },
          motif: portee === 'conversation' ? 'rattaché à la main (toute la conversation)' : 'rattaché à la main',
        }, 'POST', 'Rattachement posé.');
      }
    }
    if (aPoser.length === 0 && aRetirer.length === 0) await onChange();
    setAjout(false);
  };

  /**
   * 🔴 « RÉINITIALISER » / LE CLIC SUR LA CASE VERTE — un seul geste, trois défaits selon l'état courant.
   * Demande d'Arno : « Pour un mail reçu, le statut repasse à “À classer” tant qu'un nouveau choix n'est pas
   * fait. » C'est exactement ce que fait chacun des trois : il RETIRE, il ne remplace pas.
   */
  const reinitialiser = async (): Promise<void> => {
    if (biensRattaches.length > 0) { await appliquerCibles([]); return; }
    if (interne === true) { await onInterne?.(false); return; }
    if (horsGestion) await onHorsGestion?.(false);
  };

  /** Ce que la ligne de gauche montre d'abord : le premier bien, en entier, et « voir plus » s'il faut. */
  const ligne = lignePremierBien(vivants.map((l) => l.libelle));

  return (
    <div className="ert" role="group" aria-label="Rattachements de ce mail">
      <style>{CSS_ENCART_RATTACHEMENT}</style>
      <style>{CSS_CHOISIR_CIBLE}</style>
      {/* 🔴 LOT CLASSER-SUR-CHAQUE-MAIL — les deux feuilles du module de classement : ce bloc vit AILLEURS que
          la fenêtre de rédaction, et ne peut compter sur aucune feuille montée par elle. */}
      <style>{CSS_CHAMP_CLASSEMENT}</style>
      <style>{CSS_RATTACHER_EN_ECRIVANT}</style>

      {/* ══ LOT FIL-LECTURE-2 — TOUT SUR UNE LIGNE QUAND ÇA TIENT ═════════════════════════════════════════════
          « RATTACHÉ À · PROPRIÉTAIRE DENIS Philippe · automatique · Modifier · Retirer · + Rattacher à… ». Le
          titre, la liste et le bouton d'ajout étaient trois blocs empilés, séparés par des marges : six lignes de
          hauteur pour une information qui en tient une. Ils sont maintenant dans le MÊME conteneur souple, qui ne
          passe à la ligne que si la largeur ne suffit pas. Rien n'est retiré — seuls les blancs le sont. */}
      {/* ══ 🔴 LOT CONTACTS-ET-EVENEMENT — LE BLOC « ÉVÉNEMENT RATTACHÉ », EN TÊTE ════════════════════════════
          L'événement est FACULTATIF et ne change jamais la capsule de statut (qui dépend du bien) : « aucun » est
          une réponse normale. Lier, créer et délier sont ici, et leurs panneaux s'ouvrent JUSTE SOUS la ligne. */}
      <BlocEvenement messageId={messageId} filId={filId ?? null}
        biens={vivants
          .filter((l) => l.cible.sorte === 'lot' && l.cible.cle !== null)
          .map((l) => ({ cle: l.cible.cle as string, libelle: l.libelle, parties: [] }))}
        onGeste={onGeste}
        onChange={onChange} />

      {/* 🔴 LOT CONTACTS-ET-EVENEMENT — « Bien(s) classé(s) : ». Ils étaient sous « Bien(s) rattaché(s) », qui est
          devenu le bloc de l'ÉVÉNEMENT ci-dessus. RIEN N'EST PERDU : ils restent visibles, en tête des
          propositions, avec « Modifier » et « Retirer » comme avant, et la recherche manuelle juste en dessous. */}
      {/* ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — DEUX COLONNES : CE QUI EST, À GAUCHE ; CE QU'ON FAIT, À DROITE ══
          Demande d'Arno : le module de classement va « à l'extrémité DROITE » du bloc, « à la hauteur du bloc ».
          La ligne de gauche garde ce qu'elle disait — titre, biens, « Modifier », « Retirer », propositions —
          et gagne l'adresse COMPLÈTE du premier bien avec son « voir plus ». */}
      <div className="ert-rangee">
      <div className="ert-tete">
        <span className="ert-titre">Bien(s) rattaché(s) :</span>
        {vivants.length === 0 && <span className="ert-vide">rien pour l’instant</span>}

      {/* ══ 🔴🔴 LA LIGNE REPLIÉE : LE PREMIER BIEN, EN ENTIER ═══════════════════════════════════════════════
          Demande d'Arno (point 3) : « Affiche l'adresse complète du PREMIER bien (adresse — type — lot N). S'il
          y a plusieurs biens, ou si l'adresse est tronquée : un petit lien “voir plus” au bout. »

          🔴 CE QU'ELLE REMPLACE : la liste de TOUS les biens, chacun avec ses deux gestes, empilés au-dessus de
          chaque mail. Deux biens suffisaient à faire trois lignes ; cinq en faisaient six. On montre le premier,
          et le reste se déplie — rien n'est caché, tout est à un clic.

          ⚠️ LA DÉCISION « voir plus » VIENT DU MODULE PUR (`lignePremierBien`) : l'écran place et peint. */}
      {vivants.length > 0 && !deplie && (
        <span className="ert-premier">
          <span className="ert-sorte">{motSorte(vivants[0].cible.sorte)}</span>
          {onHistorique
            ? (
              <button type="button" className="ert-lien ert-lien--coupe"
                onClick={() => onHistorique(vivants[0].cible)}
                title={`Tout l’historique — ${ligne.premier}`}>
                {ligne.premier}
              </button>
            )
            : <span className="ert-nom ert-lien--coupe">{ligne.premier}</span>}
          <span className="ert-source">{vivants[0].parUnHumain ? 'à la main' : 'automatique'}</span>
          <button type="button" className="gst-lien-bouton" disabled={occupe}
            onClick={() => setModifie(vivants[0])}>
            Modifier
          </button>
          <button type="button" className="gst-lien-bouton" disabled={occupe}
            onClick={() => void changer(vivants[0], 'retire', `Rattachement retiré : ${vivants[0].libelle}`)}>
            Retirer
          </button>
          {ligne.voirPlus && (
            <button type="button" className="gst-lien-bouton ert-voir" onClick={() => setDeplie(true)}>
              {ligne.total > 1 ? `voir plus (${ligne.total})` : 'voir plus'}
            </button>
          )}
        </span>
      )}

      {/* ══ DÉPLIÉ : « l'adresse complète du premier bien puis tous les autres, une ligne chacun » (Arno) ════ */}
      {vivants.length > 0 && deplie && (
        <ul className="ert-liste">
          {vivants.map((l) => (
            <li key={l.id} className="ert-ligne">
              <span className="ert-sorte">{motSorte(l.cible.sorte)}</span>
              {/* LOT RATTACHEMENT-2 — L'ÉTIQUETTE EST LE POINT D'ENTRÉE de l'historique : un clic, et l'on voit tout
                  ce qui s'est dit à propos de ce logement. C'est le chemin le plus court depuis un mail qu'on lit. */}
              {onHistorique
                ? (
                  <button type="button" className="ert-lien" onClick={() => onHistorique(l.cible)}
                    title={`Tout l’historique — ${l.libelle}`}>
                    {l.libelle}
                  </button>
                )
                : <span className="ert-nom">{l.libelle}</span>}
              {/* D'OÙ VIENT LE LIEN, écrit : le moteur peut se tromper, une personne engage sa décision. */}
              <span className="ert-source">{l.parUnHumain ? 'à la main' : 'automatique'}</span>
              {l.pieceId !== null && <span className="ert-source">cette pièce seulement</span>}
              {/* LOT FIL-LECTURE-2 — « Modifier » AVANT « Retirer », et de la même couleur : ce sont les deux
                  gestes qui touchent ce lien, et changer de cible est presque toujours ce qu'on veut faire quand
                  on est tenté de retirer. La fenêtre ne modifie rien tant qu'on n'a pas validé. */}
              <button type="button" className="gst-lien-bouton" disabled={occupe}
                onClick={() => setModifie(l)}>
                Modifier
              </button>
              <button type="button" className="gst-lien-bouton" disabled={occupe}
                onClick={() => void changer(l, 'retire', `Rattachement retiré : ${l.libelle}`)}>
                Retirer
              </button>
            </li>
          ))}
          <li className="ert-ligne">
            <button type="button" className="gst-lien-bouton ert-voir" onClick={() => setDeplie(false)}>
              voir moins
            </button>
          </li>
        </ul>
      )}

      {/* ⚠️ LE LIEN ROUGE « Rattacher à un bien » A ÉTÉ SUPPRIMÉ (demande d'Arno) : les deux cases, à droite,
          prennent sa place physique ET sa fonction. Le panneau qu'il ouvrait n'est pas mort pour autant — il
          reste la fenêtre « Visualiser / Modifier » de l'en-tête, et ce qu'il portait de plus (la portée,
          « Hors gestion, ou classer par pièce… ») est repris au pied de la modale. */}
      {/* ══ 🔴 LOT LISTE-PAGINATION — LA MENTION DES PROPOSITIONS FINIT LA LIGNE DES BIENS ════════════════════
          Demande d'Arno : « la 3e ligne passe au bout de la 2e, sur la même ligne ». Elle occupait un paragraphe
          à elle seule sous l'encart — une ligne entière pour six mots, sur un bloc qu'on lit au-dessus de CHAQUE
          mail. Elle se lit désormais à la suite : « BIEN(S) RATTACHÉ(S) : rien pour l'instant · Rattacher à un
          bien · 2 propositions de l'automatisation à trancher ».

          🔴 ELLE EST DANS LA MÊME RANGÉE SOUPLE (`ert-tete`) que le titre, les biens et le bouton : si la largeur
          ne suffit pas, elle passe à la ligne D'ELLE-MÊME (`flex-wrap`), sans rien tronquer. On gagne une ligne
          quand il y a la place, et on n'en perd aucune quand il n'y en a pas.

          ⚠️ UN `span`, PLUS UN `p` : un paragraphe force un retour à la ligne quelle que soit la place, c'est
          même sa définition. C'est lui qui coûtait la ligne, pas la marge.

          ⚠️ LE SÉPARATEUR « · » EST DÉCORATIF (`aria-hidden`) : il sépare pour l'œil. Un lecteur d'écran, lui,
          enchaîne déjà les éléments de la rangée sans avoir besoin d'entendre « point médian ». */}
      {!ajout && candidats.length > 0 && (
        <>
          <span className="ert-separateur" aria-hidden="true">·</span>
          <span className="ert-motif ert-propositions">
            {candidats.length === 1
              ? 'Une proposition de l’automatisation à trancher.'
              : `${candidats.length} propositions de l’automatisation à trancher.`}
          </span>
        </>
      )}
      </div>

      {/* ══ 🔴🔴 À L'EXTRÉMITÉ DROITE : LE MÊME MODULE QUE LA FENÊTRE DE RÉDACTION ══════════════════════════
          Mêmes états, mêmes mots, même animation « D — Élastique ». Seule la place change (version compacte,
          à la hauteur du bloc) — et c'est bien le MÊME composant : deux implémentations du même geste
          finiraient par deux comportements, c'est la règle du module depuis « Hors gestion ». */}
      <ChampClassement compact
        cibles={biensRattaches}
        interne={interne === true}
        horsGestion={horsGestion}
        /* 🔴 « Rattacher » ouvre la modale — et la case verte « Rattaché » la rouvre, cochée (demande d'Arno). */
        onRattacher={() => setAjout(true)}
        /* ⚠️ GRISÉE SI L'ON NE SAIT PAS : `interne === null` veut dire migration 281 absente, ou lecture en
           échec. Proposer un geste dont on sait qu'il ne pourra pas aboutir serait pire que l'absence. */
        interneDisponible={interne !== null && onInterne !== undefined}
        onInterne={() => { void onInterne?.(true); }}
        onReinitialiser={() => { void reinitialiser(); }} />
      </div>

      {/* ══ 🔴🔴 UN RESTE D'ANCIEN MODÈLE : DIT POUR CE QU'IL EST, ET JAMAIS SOUS LE TITRE DES BIENS ═════════
          Il porte les mêmes gestes qu'avant — « Modifier » mène au sélecteur de bien, « Retirer » l'enlève — mais
          la phrase ne laisse plus croire que cette personne EST le bien du mail. */}
      {ancienModele.length > 0 && (
        <>
          <p className="ert-sous-titre ert-ancien-titre">
            Rattachement d’avant la règle « bien » — à reprendre
          </p>
          <ul className="ert-liste">
            {ancienModele.map((l) => (
              <li key={l.id} className="ert-ligne ert-ligne--ancien">
                <span className="ert-sorte">{motSorte(l.cible.sorte)}</span>
                <span className="ert-nom">{l.libelle}</span>
                <span className="ert-motif">
                  ce mail est rangé sous une PERSONNE ; un mail se classe dans un BIEN — choisissez le logement
                </span>
                <button type="button" className="gst-lien-bouton" disabled={occupe}
                  onClick={() => setModifie(l)}>
                  Modifier
                </button>
                <button type="button" className="gst-lien-bouton" disabled={occupe}
                  onClick={() => void changer(l, 'retire', `Rattachement retiré : ${l.libelle}`)}>
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LA MÊME MODALE QUE LA RÉDACTION ══════════════════════════════
          Demande d'Arno (point 4) : « la modale “Rattacher ce mail à…” s'ouvre avec les biens actuellement
          rattachés COCHÉS, plus les propositions et le moteur de recherche. On ajoute ou on décoche librement. »

          🔴 ELLE REMPLACE LE PANNEAU EN LIGNE (`MenuRattachementBien`), qui ouvrait les mêmes zones mais sous
          une autre forme et avec une autre validation. Une seule fenêtre pour un seul geste, des deux côtés de
          l'application : c'est tout l'objet de ce lot.

          ⚠️ CE QUE LE PANNEAU PORTAIT DE PLUS EST REPRIS AU PIED, pas perdu : la portée (« ce mail » / « toute
          la conversation ») et « Hors gestion, ou classer par pièce… ». */}
      {ajout && (
        <RattacherEnEcrivant
          messageId={messageId}
          destinataires={[]}
          cibles={biensRattaches}
          onChange={(c) => { void appliquerCibles(c); }}
          onFerme={() => setAjout(false)}
          piedSupplementaire={(
            <>
              <fieldset className="ert-portee">
                <legend className="ert-portee-titre">Portée de ce qu’on AJOUTE</legend>
                <label className="ert-choix">
                  <input type="radio" name="ert-portee" checked={portee === 'mail'}
                    onChange={() => setPortee('mail')} />
                  <span>Ce mail uniquement</span>
                </label>
                <label className={`ert-choix${filId == null ? ' ert-choix--inactif' : ''}`}>
                  <input type="radio" name="ert-portee" checked={portee === 'conversation'}
                    disabled={filId == null} onChange={() => setPortee('conversation')} />
                  <span>Toute la conversation{filId == null ? ' — échange inconnu' : ''}</span>
                </label>
                {/* ⚠️ ON LE DIT : le RETRAIT ne suit pas la portée. Défaire en masse des classements qu'on n'a
                    pas regardés serait le contraire d'un geste prudent. */}
                <p className="ert-portee-note">
                  Ce qu’on décoche n’est retiré que de CE mail.
                </p>
              </fieldset>
              <button type="button" className="gst-lien-bouton"
                onClick={() => { setAjout(false); setClasser(true); }}>
                Hors gestion, ou classer par pièce…
              </button>
            </>
          )} />
      )}

      {/* ══ 🔴 LOT AFFECTATION-PAR-BIEN — LES PROPOSITIONS SONT DES BIENS, TOUJOURS ══════════════════════════
          Demande d'Arno, sur un cas réel : « Contestation de la retenue de 450 € sur dépôt de garantie » proposait
          « PROPRIÉTAIRE MARTY Jean-François (310) ». Un propriétaire n'est pas un dossier — c'est une PARTIE d'un
          dossier. Le bloc présente donc des BIENS (adresse + lot), chacun avec son propriétaire et son locataire À
          LA DATE DU MAIL, son motif en clair, et une case à cocher.

          🔴 LES PROPOSITIONS ANCIENNES DE TYPE PROPRIÉTAIRE SONT MONTRÉES COMME LA LISTE DE LEURS BIENS, et RIEN
          n'est réécrit en base tant que personne n'a validé : une ligne ancienne n'est pas fausse, elle est écrite
          dans un vocabulaire qu'on n'emploie plus. */}
      {/* 🔴 LOT BIEN-RATTACHE — LES PROPOSITIONS SONT DANS LE MENU, PLUS À L'ÉCRAN EN PERMANENCE. Demande
          d'Arno : une seule entrée. Quand il y en a, la ligne le DIT — sinon on ne saurait pas qu'il y a
          quelque chose à ouvrir, et l'automatisation travaillerait pour personne. */}
      {/* 🔴 LOT LISTE-PAGINATION — CETTE MENTION A ÉTÉ DÉPLACÉE au bout de la ligne « Bien(s) rattaché(s) », dans
          `ert-tete` (voir son encadré). Elle n'est pas retirée : elle est REMONTÉE, et c'est ce qui fait gagner la
          ligne qu'Arno demande. Rien n'est affiché deux fois — il n'en reste aucune copie ici. */}

      {/* Les propositions qui ne sont PAS des biens (une carte proposée) gardent leurs deux gestes, inchangés :
          rien n'est retiré, et ce bloc-ci ne sait rien des événements. */}
      {candidatsHorsBien.length > 0 && (
        <>
          <p className="ert-sous-titre">
            {candidatsHorsBien.length === 1 ? 'Une autre proposition' : `${candidatsHorsBien.length} autres propositions`}
          </p>
          <ul className="ert-liste">
            {candidatsHorsBien.map((l) => (
              <li key={l.id} className="ert-ligne ert-ligne--propose">
                <span className="ert-sorte">{motSorte(l.cible.sorte)}</span>
                <span className="ert-nom">{l.libelle}</span>
                {/* POURQUOI ce candidat : sans le motif, on ne peut pas trancher sans rouvrir le code. */}
                {l.motif && <span className="ert-motif">{l.motif}</span>}
                <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={occupe}
                  onClick={() => void changer(l, 'confirme', `Rattachement confirmé : ${l.libelle}`)}>
                  Confirmer
                </button>
                <button type="button" className="gst-lien-bouton" disabled={occupe}
                  onClick={() => void changer(l, 'rejete', `Proposition rejetée : ${l.libelle}`)}>
                  Rejeter
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* CE QU'ON VIENT DE DÉFAIRE, remis d'un clic. Rien n'a été supprimé : c'est le même lien qui revient. */}
      {remettables.length > 0 && (
        <ul className="ert-liste ert-liste--defaits">
          {remettables.map((l) => (
            <li key={l.id} className="ert-ligne">
              <span className="ert-defait">Retiré · {l.libelle}</span>
              <button type="button" className="gst-lien-bouton" disabled={occupe}
                onClick={() => void changer(l, l.statut === 'propose' ? 'propose' : 'confirme',
                  `Rattachement remis : ${l.libelle}`)}>
                Remettre
              </button>
            </li>
          ))}
        </ul>
      )}

      {erreur !== null && <p className="gst-tronc" role="alert">{erreur}</p>}

      {/* LOT AFFECTATION-PAR-BIEN — « Hors gestion » et les cas fins (portée, pièces) passent par LA fenêtre de
          classement, jamais par une seconde implémentation : deux chemins finiraient par deux comportements. */}
      {classer && (
        <ClasserMail messageId={messageId} filId={null}
          onFerme={() => setClasser(false)}
          onGeste={onGeste}
          onFait={async () => { await onChange(); }} />
      )}

      {modifie !== null && (
        <ModifierRattachement lien={modifie} messageId={messageId}
          onGeste={onGeste}
          onAnnuler={() => setModifie(null)}
          onFait={async () => { setModifie(null); await onChange(); }} />
      )}
    </div>
  );
}

/**
 * Le mot de la sorte, écrit en toutes lettres. PUR.
 *
 * ⚠️ « Propriétaire » et « Locataire » RESTENT ICI, alors qu'on n'en écrit plus : 19 555 lignes historiques les
 * portent, et elles doivent rester LISIBLES. Ce qui a changé, c'est l'endroit où elles s'affichent — jamais sous
 * le titre « Bien(s) rattaché(s) ».
 */
export function motSorte(s: 'lot' | 'proprietaire' | 'locataire' | 'evenement'): string {
  if (s === 'lot') return 'Logement';
  if (s === 'proprietaire') return 'Propriétaire';
  if (s === 'locataire') return 'Locataire';
  return 'Événement';
}

export const CSS_ENCART_RATTACHEMENT = `
/* Un encart de RENSEIGNEMENT, jamais une alerte. La sorte est écrite, l'origine aussi : rien ne tient à une couleur.
   Mobile d'abord : chaque ligne s'enroule, les boutons font au moins 44 px de haut. */
/* ══ LOT FIL-LECTURE-2 — COMPACT : les blancs partent, rien d'autre ══════════════════════════════════════════════
   Marges intérieures réduites (10/12 px puis 6/10), plus d'espace entre les blocs empilés, et surtout la tête, la
   liste et le bouton d'ajout sur une SEULE rangée souple. Les tailles de texte, elles, ne bougent pas : on gagne
   sur le vide, jamais sur la lisibilité. */
/* 🔴 LOT LISTE-PAGINATION — MARGES VERTICALES RESSERRÉES (demande d'Arno : « réduis aussi les marges verticales
   du bloc »). L'espace entre blocs empilés passe de .2rem à .1rem, la marge extérieure de .5rem à .3rem et le
   rembourrage haut/bas de 6 px à 4 px. Les tailles de texte ne bougent pas : on gagne sur le vide, jamais sur la
   lisibilité — c'est la règle déjà écrite au-dessus, et ce lot ne fait que la pousser d'un cran. */
.ert{display:flex;flex-direction:column;gap:.1rem;margin:.3rem 0;padding:4px 10px;border-radius:10px;
  border:1px solid var(--color-svv-line);background:var(--color-svv-field);overflow-wrap:anywhere}
/* La rangée unique : titre, liste et bouton d'ajout s'y suivent, et n'enroulent que si la largeur manque. */
.ert-tete{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem .5rem}
.ert-tete>.ert-liste{flex:1 1 auto;min-width:0}
.ert-titre{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;color:var(--color-svv-muted)}
.ert-vide{font-size:.8rem;font-style:italic;color:var(--color-svv-muted)}
.ert-sous-titre{margin:.3rem 0 0;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;
  color:var(--color-svv-muted)}
.ert-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0}
.ert-ligne{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem;font-size:.85rem;color:var(--color-svv-ink);
  line-height:1.4;padding:0}
.ert-ligne--propose{padding:4px 6px;border-radius:8px;border:1px dashed var(--color-svv-line)}
/* 🔴🔴 UN RESTE D'ANCIEN MODÈLE. Le liseré rouge le distingue du reste — mais ce sont les MOTS du titre et du
   motif qui portent l'information, jamais la couleur seule : la règle du module depuis la première capsule. */
.ert-ancien-titre{color:var(--color-svv-red)}
.ert-ligne--ancien{padding:4px 6px;border-radius:0 8px 8px 0;border-left:3px solid var(--color-svv-red);
  background:var(--color-svv-field)}
.ert-liste--defaits{opacity:.75}
.ert-sorte{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;
  color:var(--color-svv-muted);flex:0 0 auto}
.ert-nom{font-weight:700}
.ert-lien{background:none;border:0;padding:0;margin:0;font:inherit;font-size:.85rem;font-weight:700;
  color:var(--color-svv-ink);text-decoration:underline;text-underline-offset:3px;cursor:pointer;min-height:32px;
  text-align:left;overflow-wrap:anywhere}
@media (pointer:coarse){.ert-lien{min-height:38px}}
.ert-lien:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.ert-source,.ert-motif{font-size:.74rem;color:var(--color-svv-muted)}
.ert-motif{font-style:italic}
.ert-defait{font-size:.8rem;font-style:italic;color:var(--color-svv-muted)}
.ert-ajouter{align-self:baseline;flex:0 0 auto}

/* ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — DEUX COLONNES : CE QUI EST, PUIS CE QU'ON FAIT ════════════════════════
   « place a l'extremite DROITE le meme composant que dans la fenetre de redaction […] a la hauteur du bloc »
   (Arno). La gauche prend toute la place restante et peut s'enrouler ; la droite garde sa largeur.
   ⚠️ align-items:center : le module de classement est CENTRE sur la hauteur du bloc, pas colle en haut —
   c'est ce que veut dire « a la hauteur du bloc » quand la gauche passe sur deux lignes.
   ⚠️ Sous 560 px, les deux colonnes s'empilent : deux cases de 38 px cote a cote avec une adresse complete
   deviennent illisibles sur un telephone. */
.ert-rangee{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem .8rem;min-width:0}
.ert-rangee>.ert-tete{flex:1 1 320px;min-width:0}
@media (max-width:560px){
  .ert-rangee{flex-direction:column;align-items:stretch}
}

/* ══ LA LIGNE REPLIEE : le PREMIER bien, en entier, et « voir plus » au bout ═════════════════════════════════
   ⚠️ LE LIBELLE NE DEBORDE PAS, il se COUPE avec des points de suspension : une adresse complete peut faire
   80 caracteres, et la faire passer a la ligne repousserait le module de classement hors de la rangee. Le
   texte entier reste accessible — c'est tout l'objet de « voir plus », et l'infobulle le porte aussi. */
.ert-premier{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem;min-width:0;flex:1 1 auto}
.ert-lien--coupe{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;min-width:0}
.ert-voir{font-weight:600;white-space:nowrap}

/* La portee, reprise au pied de la modale. Meme forme que celle du panneau qu'elle remplace. */
.ert-portee{margin:0 0 .5rem;padding:6px 10px;border:1px solid var(--color-svv-line);border-radius:.6rem;
  min-width:0}
.ert-portee-titre{font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-muted)}
.ert-choix{display:flex;align-items:center;gap:.5rem;min-height:32px;font-size:.85rem;color:var(--color-svv-ink);
  cursor:pointer}
.ert-choix--inactif{color:var(--color-svv-muted);cursor:default}
.ert-portee-note{margin:.2rem 0 0;font-size:.74rem;font-style:italic;color:var(--color-svv-muted)}
/* LOT BIEN-RATTACHE — la mention qui dit qu'il y a quelque chose a ouvrir. Sans elle, l'automatisation
   travaillerait pour personne : on ne saurait pas qu'un menu porte des propositions.
   🔴 LOT LISTE-PAGINATION — elle vit maintenant DANS la rangee ert-tete, au bout de la ligne des biens : plus de
   marge haute (elle creait le decrochage), et flex 0 1 auto pour qu'elle passe a la ligne d'elle-meme quand la
   largeur ne suffit pas, au lieu de comprimer ses voisines.
   (Aucun accent grave dans ce commentaire : il vit DANS un litteral de gabarit, qu'un seul accent grave
    terminerait — piege consigne plusieurs fois dans ce depot.) */
.ert-propositions{margin:0;font-weight:600;color:var(--color-svv-ink);flex:0 1 auto}
/* Le point median qui separe les trois morceaux de la ligne. Purement decoratif : aria-hidden cote balise. */
.ert-separateur{flex:0 0 auto;font-size:.74rem;color:var(--color-svv-muted)}
/* 🔴 LA CIBLE TACTILE : on ne descend pas sous 44 px de HAUTEUR TOTALE, on la répartit autrement. Les trois liens
   (« Modifier », « Retirer », « + Rattacher à… ») gardaient chacun 44 px de hauteur propre, ce qui empilait trois
   pavés dans un encart qui doit tenir sur une ligne. Ils gardent une hauteur confortable et un padding horizontal
   qui élargit la zone cliquable — la surface reste atteignable au doigt, la hauteur ne triple plus. */
.ert .gst-lien-bouton{min-height:32px;padding:0 .2rem}
@media (pointer:coarse){.ert .gst-lien-bouton{min-height:38px;padding:0 .35rem}}
`;
