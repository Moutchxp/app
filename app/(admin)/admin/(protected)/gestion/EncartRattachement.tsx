'use client';

import { useState } from 'react';
import { CSS_CHOISIR_CIBLE } from './ChoisirCible';
// LOT BIEN-RATTACHE — le menu fusionné : propositions + recherche libre + une seule validation.
import { MenuRattachementBien } from './MenuRattachementBien';
import { ModifierRattachement } from './ModifierRattachement';
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
export function EncartRattachement({ messageId, filId, liens, onChange, onGeste, onHistorique }: {
  messageId: number;
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
  const [ajout, setAjout] = useState(false);
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

  const vivants = liens.filter((l) => l.statut === 'confirme');
  const candidats = liens.filter((l) => l.statut === 'propose');
  /**
   * 🔴 LOT AFFECTATION-PAR-BIEN — les propositions qui visent un BIEN (logement) ou un PROPRIÉTAIRE sont rendues
   * par le bloc des biens : c'est LUI qui traduit une ancienne proposition « propriétaire » en la liste de ses
   * biens. Les autres — une carte proposée — gardent le rendu d'avant, mot pour mot.
   */
  const candidatsHorsBien = candidats.filter(
    (l) => l.cible.sorte !== 'lot' && l.cible.sorte !== 'proprietaire');
  const remettables = [...defaits.values()].filter((l) => !liens.some((x) => x.id === l.id));

  return (
    <div className="ert" role="group" aria-label="Rattachements de ce mail">
      <style>{CSS_ENCART_RATTACHEMENT}</style>
      <style>{CSS_CHOISIR_CIBLE}</style>

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
      <div className="ert-tete">
        <span className="ert-titre">Bien(s) rattaché(s) :</span>
        {vivants.length === 0 && <span className="ert-vide">rien pour l’instant</span>}

      {vivants.length > 0 && (
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
        </ul>
      )}

      {/* LE BOUTON D'AJOUT VIT DANS LA MÊME LIGNE, à la suite des gestes du lien : c'est la fin de la même phrase.
          Quand le sélecteur est ouvert, il prend la largeur entière — on ne cherche pas à le comprimer. */}
      {/* 🔴 LOT BIEN-RATTACHE — UNE SEULE ENTRÉE. Il y avait deux portes pour la même question : ce lien, et le
          bloc des propositions ouvert en permanence. On cochait dans l'un, on validait dans l'autre. */}
      {!ajout && (
        <button type="button" className="gst-lien-bouton ert-ajouter" disabled={occupe}
          onClick={() => setAjout(true)}>
          Rattacher à un bien
        </button>
      )}
      </div>

      {/* ══ 🔴 LOT BIEN-RATTACHE — LE MENU S'OUVRE JUSTE SOUS SA LIGNE ═══════════════════════════════════════
          Il porte les DEUX zones — les propositions de l'automatisation, puis la recherche libre — et UNE seule
          validation. Il est le VOISIN IMMÉDIAT de la ligne qui l'appelle : un panneau qui s'ouvre en bas de page
          apparaît hors du regard, parfois hors de l'écran. */}
      {ajout && (
        <MenuRattachementBien messageId={messageId} filId={filId ?? null}
          onFerme={() => setAjout(false)}
          onGeste={onGeste}
          onChange={onChange}
          onHorsGestion={() => { setAjout(false); setClasser(true); }} />
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
      {!ajout && candidats.length > 0 && (
        <p className="ert-motif ert-propositions">
          {candidats.length === 1
            ? 'Une proposition de l’automatisation à trancher.'
            : `${candidats.length} propositions de l’automatisation à trancher.`}
        </p>
      )}

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

/** Le mot de la sorte, écrit en toutes lettres. PUR. */
export function motSorte(s: 'lot' | 'proprietaire' | 'evenement'): string {
  if (s === 'lot') return 'Logement';
  if (s === 'proprietaire') return 'Propriétaire';
  return 'Événement';
}

export const CSS_ENCART_RATTACHEMENT = `
/* Un encart de RENSEIGNEMENT, jamais une alerte. La sorte est écrite, l'origine aussi : rien ne tient à une couleur.
   Mobile d'abord : chaque ligne s'enroule, les boutons font au moins 44 px de haut. */
/* ══ LOT FIL-LECTURE-2 — COMPACT : les blancs partent, rien d'autre ══════════════════════════════════════════════
   Marges intérieures réduites (10/12 px puis 6/10), plus d'espace entre les blocs empilés, et surtout la tête, la
   liste et le bouton d'ajout sur une SEULE rangée souple. Les tailles de texte, elles, ne bougent pas : on gagne
   sur le vide, jamais sur la lisibilité. */
.ert{display:flex;flex-direction:column;gap:.2rem;margin:.5rem 0;padding:6px 10px;border-radius:10px;
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
/* LOT BIEN-RATTACHE — la mention qui dit qu'il y a quelque chose a ouvrir. Sans elle, l'automatisation
   travaillerait pour personne : on ne saurait pas qu'un menu porte des propositions. */
.ert-propositions{margin:.2rem 0 0;font-weight:600;color:var(--color-svv-ink)}
/* 🔴 LA CIBLE TACTILE : on ne descend pas sous 44 px de HAUTEUR TOTALE, on la répartit autrement. Les trois liens
   (« Modifier », « Retirer », « + Rattacher à… ») gardaient chacun 44 px de hauteur propre, ce qui empilait trois
   pavés dans un encart qui doit tenir sur une ligne. Ils gardent une hauteur confortable et un padding horizontal
   qui élargit la zone cliquable — la surface reste atteignable au doigt, la hauteur ne triple plus. */
.ert .gst-lien-bouton{min-height:32px;padding:0 .2rem}
@media (pointer:coarse){.ert .gst-lien-bouton{min-height:38px;padding:0 .35rem}}
`;
