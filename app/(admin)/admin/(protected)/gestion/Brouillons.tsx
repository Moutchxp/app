'use client';

import { useEffect, useState } from 'react';
// 🔴 LOT LISTE-PAGINATION — la MÊME barre et la MÊME découpe que les trois autres listes du module.
import { BarrePages, CSS_BARRE_PAGES } from './BarrePages';
import { PAR_PAGE, trancheDePage } from '../../../../lib/gestion/pagination';
import { dateHeureComplete, dateHeureCourte } from '../../../../lib/gestion/ecran';
import { motsJeterBrouillon, type VoieRedaction } from '../../../../lib/gestion/redaction';
import { ordonnerBrouillons, type BrouillonEnregistre } from '../../../../lib/gestion/brouillonReprise';
// 🔴 LOT BANDEAU-ET-BROUILLONS — le titre et l'extrait sont DÉCIDÉS dans le module pur, jamais ici.
import { extraitSaisi, titreBrouillon } from '../../../../lib/gestion/brouillonEnregistrement';

/**
 * LOT 5e — LA LISTE DES BROUILLONS, sous son étiquette.
 *
 * 🔴 UN BROUILLON N'EST JAMAIS SUPPRIMÉ. « Abandonner » le DATE et le retire de cette liste ; il reste en base. Trois
 * paragraphes écrits puis une fenêtre fermée par mégarde, c'est du travail humain : on ne l'efface pas parce que
 * quelqu'un a cliqué trop vite.
 *
 * ⚠️ Un brouillon sans destinataire ni objet n'est pas anonyme pour autant : on affiche alors ce qu'il a — le début du
 * message. Une ligne « (sans objet) · (aucun destinataire) » ne permettrait pas de reconnaître le sien.
 */

/**
 * 🔴 LA LIGNE PORTE DÉSORMAIS TOUT LE BROUILLON. Elle n'en nommait qu'un résumé (objet, corps, destinataires « À »),
 * parce qu'elle ne servait qu'à l'AFFICHER. Depuis qu'un clic le ROUVRE, il lui faut aussi les copies, la mise en
 * forme et la citation : la route les rendait déjà, l'écran les jetait.
 */
export interface BrouillonListe extends BrouillonEnregistre {
  voie: VoieRedaction;
}

const LIBELLE_VOIE: Record<VoieRedaction, string> = {
  repondre: 'Réponse', repondre_tous: 'Réponse à tous', transferer: 'Transfert', nouveau: 'Nouveau message',
  // LOT 5-PJ-ENVOI — dit en toutes lettres : l'original est JOINT, pas recopié. C'est la différence qui compte.
  transferer_piece: 'Transfert en pièce jointe',
};

/**
 * ══ 🔴🔴 LOT BANDEAU-ET-BROUILLONS — `resumerBrouillon` A ÉTÉ RETIRÉE ═══════════════════════════════════════════
 *
 * CE QU'ELLE FAISAIT : à défaut d'objet, elle affichait le début du CORPS. Or un brouillon neuf naît déjà rempli —
 * avec la signature, et rien d'autre. Vu à l'écran le 30/09/2026 : les cinq premières lignes de la liste
 * s'appelaient toutes « Service Gestion 2 rue Mars et Roty, 92800 Puteaux 06 23 53 32 36 01 4… ». Cinq brouillons
 * indiscernables, tous nommés d'après NOTRE PROPRE signature.
 *
 * 🔴 LA RÈGLE D'ARNO LA REMPLACE : le titre est l'OBJET, toujours ; sans objet, « (sans objet) » en gris italique.
 * L'extrait de ce qui a été SAISI descend sur sa propre ligne, sans signature ni citation. Les deux décisions
 * vivent dans le module PUR (`titreBrouillon`, `extraitSaisi`), qui est éprouvé sans écran.
 *
 * ⚠️ RIEN N'EST PERDU DE CE QU'ELLE APPORTAIT : les destinataires, qu'elle servait en dernier recours, sont
 * toujours sur la ligne du bas (« à … »), où ils étaient déjà.
 */

export function Brouillons({
  maintenant, onOuvrir, onReprendre, onChange, corbeille = false, signature = null, version = 0,
}: {
  maintenant: Date;
  /**
   * ══ 🔴🔴 LOT BROUILLON-APERCU-SUPPRESSION — LE BATTEMENT QUI FAIT RELIRE LA LISTE ═══════════════════════════════
   *
   * MESURÉ À L'ÉCRAN LE 07/10/2026 : on supprime un brouillon depuis sa fenêtre flottante, le compteur de la
   * colonne passe bien de 15 à 14 — et la LIGNE du brouillon supprimé reste dans cette liste. On croit alors que
   * la suppression n'a pas pris, et l'on recommence sur une ligne qui n'existe plus.
   *
   * 🔴 LA CAUSE : cette liste ne se lisait qu'au MONTAGE (`useEffect` sans dépendance). Elle suit maintenant un
   * battement que l'écran parent incrémente après chaque geste de brouillon — le MÊME que la liste des mails
   * (`versionStatuts`), pour que les deux ne puissent pas diverger.
   *
   * ⚠️ `0` (le défaut) ⇒ EXACTEMENT LE COMPORTEMENT D'AVANT : une seule lecture, au montage.
   */
  version?: number;
  /**
   * 🔴 LOT BANDEAU-ET-BROUILLONS — LA SIGNATURE DE gestion@, pour la retirer de l'extrait. `null` = pas encore
   * chargée : on n'ampute alors rien, et l'extrait peut contenir la signature — mieux vaut cela qu'un extrait
   * amputé de ce qui a été écrit.
   */
  signature?: string | null;
  /**
   * 🔴 LOT LECTURE-HTML-FIL-TROMBONE — LE MÊME GESTE QUE DANS L'ÉDITEUR, DONC LES MÊMES MOTS. Arno : « même règle
   * pour Abandonner et tout autre bouton qui supprime un brouillon ». Ce bouton passe déjà par la même porte
   * (`DELETE /api/admin/gestion/brouillons`), donc par la même corbeille ; il ne le DISAIT pas.
   *
   * `false` (migration 276 absente, ou contexte de rédaction pas encore chargé) ⇒ le mot d'avant, qui ne promet
   * rien : une promesse de retour qu'on ne peut pas tenir est pire que pas de promesse.
   */
  corbeille?: boolean;
  /**
   * Ouvrir l'échange du brouillon, ET le brouillon avec lui.
   *
   * 🔴 LOT BROUILLONS-GMAIL — le brouillon voyage avec l'échange. « Voir la conversation » ouvrait le fil SANS
   * l'éditeur : on arrivait sur la conversation et l'on cherchait le brouillon qu'on venait de cliquer.
   */
  onOuvrir: (filId: number, brouillon: BrouillonListe) => void;
  /**
   * 🔴🔴 ROUVRIR LE BROUILLON LUI-MÊME, DANS L'ÉDITEUR — ce que la liste ne savait pas faire.
   *
   * Elle n'offrait qu'un retour vers la CONVERSATION, et seulement quand il y en avait une : un message neuf,
   * c'est-à-dire la moitié des brouillons, n'était pas même cliquable. Le travail était enregistré et irrécupérable.
   */
  onReprendre: (b: BrouillonListe) => void;
  /** Un brouillon abandonné change le compteur de l'étiquette : l'écran parent le relit. */
  onChange: () => void;
}) {
  /** Les mots du geste, tirés de la MÊME source que l'éditeur : un seul geste ne s'apprend pas deux fois. */
  const mots = motsJeterBrouillon(corbeille);
  const [etat, setEtat] = useState<{ v: 'charge' } | { v: 'ok'; liste: BrouillonListe[]; total: number } | { v: 'erreur' }>({ v: 'charge' });
  /**
   * 🔴 LOT LISTE-PAGINATION — LE RANG DE LA PAGE AFFICHÉE. Arno demande la MÊME pagination sur toutes les listes,
   * celle-ci comprise. Elle se découpe EN MÉMOIRE : la route rend les brouillons en une fois (10 au 30/09/2026),
   * et le total est donc la longueur de la liste — il ne peut pas se tromper. Voir `trancheDePage`.
   */
  const [page, setPage] = useState(0);

  /** Va chercher la liste et RENVOIE le résultat : c'est l'appelant qui décide quoi en faire. Patron du dépôt. */
  const chercher = async (): Promise<{ v: 'ok'; liste: BrouillonListe[]; total: number } | { v: 'erreur' }> => {
    try {
      const res = await fetch('/api/admin/gestion/brouillons', { cache: 'no-store' });
      if (!res.ok) return { v: 'erreur' };
      const d = (await res.json()) as { brouillons?: BrouillonListe[]; total?: number };
      // DU PLUS RÉCEMMENT MODIFIÉ AU PLUS ANCIEN. La base rend déjà cet ordre ; l'écran ne s'en remet pas à elle.
      const liste = ordonnerBrouillons(d.brouillons ?? []);
      /**
       * 🔴 LOT BANDEAU-ET-BROUILLONS — LE TOTAL VIENT DE LA BASE, par la MÊME fonction que la colonne de gauche.
       * Compter les lignes reçues ici redonnerait deux nombres pour une seule chose : la liste est bornée, et les
       * deux écrans ne se rafraîchissent pas au même moment. C'était l'écart « 18 contre 17 ».
       *
       * ⚠️ REPLI SUR LA LONGUEUR quand la route ne rend pas de total (version antérieure servie par un cache) :
       * un nombre approché vaut mieux qu'un titre sans nombre.
       */
      return { v: 'ok', liste, total: typeof d.total === 'number' ? d.total : liste.length };
    } catch { return { v: 'erreur' }; }
  };
  const lire = async () => { setEtat(await chercher()); };

  // Le premier acte de l'effet est un `await` → aucun `setState` synchrone dans son corps, et `annule` empêche
  //   d'écrire dans un composant démonté entre-temps. Même patron que les autres écrans de l'admin.
  useEffect(() => {
    let annule = false;
    void (async () => { const r = await chercher(); if (!annule) setEtat(r); })();
    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- volontaire : `chercher` est recréé à chaque rendu,
    //   le mettre en dépendance relirait la liste en boucle. Seul `version` doit la faire relire.
  }, [version]);

  if (etat.v === 'charge') return <p className="gst-info" role="status">Chargement des brouillons…</p>;
  if (etat.v === 'erreur') {
    return (
      <div>
        <p className="gst-erreur" role="status">Lecture impossible.</p>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void lire()}>Réessayer</button>
      </div>
    );
  }
  if (etat.liste.length === 0) {
    return (
      <>
        <h3 className="gst-titre">Brouillons</h3>
        <p className="gst-vide">Aucun brouillon en cours.</p>
      </>
    );
  }

  /**
   * ⚠️ LA PAGE EST BORNÉE À CE QUI EXISTE ENCORE. Un brouillon envoyé ou jeté pendant qu'on regardait la page 2
   * peut ramener la liste sous 26 lignes : sans ce garde, on resterait sur une page vide, avec un chevron « ‹ »
   * pour seule issue. On recule d'autorité sur la dernière page qui porte quelque chose.
   */
  const dernierePage = Math.max(0, Math.ceil(etat.liste.length / PAR_PAGE) - 1);
  const pageVue = Math.min(page, dernierePage);
  const affiches = trancheDePage(etat.liste, pageVue);
  const barre = (ou: 'haut' | 'bas') => (
    <BarrePages ou={ou} page={pageVue} lignes={affiches.length} total={etat.liste.length}
      /* 🔴 LA SUITE SE SAIT ICI SANS RIEN DEMANDER : la liste entière est là, on compte ce qui reste après. */
      suite={(pageVue + 1) * PAR_PAGE < etat.liste.length} nom="les brouillons"
      onPage={(v) => setPage(Math.max(0, Math.min(v, dernierePage)))} />
  );

  return (
    <>
      <style>{CSS_BARRE_PAGES}</style>
      <style>{CSS_BROUILLONS}</style>
      <h3 className="gst-titre">Brouillons <span className="gst-compte">{etat.total}</span></h3>
      {barre('haut')}
      <ul className="gst-liste">
        {affiches.map((b) => (
          <li key={b.id} className="gst-item">
            <div className="gst-item-haut">
              {/* 🔴🔴 LE CLIC ROUVRE LE BROUILLON, TOUJOURS. Il ne rouvrait que la CONVERSATION, et seulement quand
                  il y en avait une — un message neuf n'était pas cliquable du tout. On revient sur son texte, ses
                  destinataires, sa mise en forme et ses pièces, dans l'éditeur ordinaire. */}
              {/* 🔴 LE TITRE EST L'OBJET. Sans objet, le mot de l'absence — en gris italique, pour qu'il ne se
                  lise pas comme un nom de message. Le bouton reste le même : un clic rouvre le brouillon. */}
              <button type="button" className="gst-objet gst-objet-bouton"
                onClick={() => onReprendre(b)}>
                {(() => {
                  const t = titreBrouillon(b.objet);
                  return t.sansObjet ? <span className="bro-sans-objet">{t.texte}</span> : t.texte;
                })()}
              </button>
            </div>
            {/* ⚠️ RIEN DU TOUT QUAND RIEN N'A ÉTÉ SAISI, et c'est la vérité exacte : une ligne vide vaut mieux
                qu'un extrait de signature, qui faisait passer notre adresse pour le message de quelqu'un. */}
            {extraitSaisi(b.corps, signature) !== '' && (
              <p className="bro-extrait">{extraitSaisi(b.corps, signature)}</p>
            )}
            <div className="gst-item-bas">
              <span>{LIBELLE_VOIE[b.voie]}</span>
              <span className="gst-sep" aria-hidden="true">·</span>
              <span title={dateHeureComplete(b.majLe)}>{dateHeureCourte(b.majLe, maintenant)}</span>
              {b.a.length > 0 && <><span className="gst-sep" aria-hidden="true">·</span><span>à {b.a.join(', ')}</span></>}
              {b.filId === null && <><span className="gst-sep" aria-hidden="true">·</span><span>hors échange</span></>}
            </div>
            <div className="gst-actions">
              {/* ⚠️ RIEN N'EST RETIRÉ : le retour vers la CONVERSATION — ce que faisait le clic sur l'objet — garde
                  sa place, sous son propre mot. Il ne pouvait pas rester sur l'objet, qui rouvre maintenant le
                  brouillon ; le supprimer aurait fait perdre un chemin qui existait. */}
              {b.filId !== null && (
                <button type="button" className="svv-btn svv-btn-outline gst-btn"
                  onClick={() => onOuvrir(b.filId as number, b)}>Voir la conversation</button>
              )}
              {/* « Abandonner », et non « Supprimer » : le mot dit ce qui se passe vraiment — le brouillon est daté,
                  il quitte la liste, il reste en base. Appeler cela « supprimer » serait un mensonge.
                  🔴 ET DEPUIS LE LOT LECTURE-HTML-FIL-TROMBONE, il va à la CORBEILLE, d'où il revient : le mot le
                  dit aussi, et c'est le même que dans l'éditeur — un seul geste ne s'apprend pas deux fois. */}
              <button type="button" className="svv-btn svv-btn-outline gst-btn"
                onClick={() => void (async () => {
                  try {
                    await fetch(`/api/admin/gestion/brouillons?id=${b.id}`, { method: 'DELETE' });
                  } finally { await lire(); onChange(); }
                })()}>
                {mots.infobulle}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {barre('bas')}
      {/* 🔴 LA NOTE DIT OÙ IL EST ALLÉ, pas seulement qu'il n'est pas perdu : « conservé en base » ne dit pas où
          le retrouver, et c'est la seule chose qu'on veut savoir après avoir cliqué. */}
      <p className="gst-note">
        {corbeille
          ? 'Un brouillon mis à la corbeille n’est pas supprimé : il attend dans « Corbeille », d’où « Réintégrer » le ramène ici.'
          : 'Un brouillon abandonné n’est pas supprimé : il est daté et conservé en base.'}
      </p>
    </>
  );
}

/* ══ 🔴 LOT BANDEAU-ET-BROUILLONS — LES DEUX SEULES CLASSES DE CETTE LISTE ═══════════════════════════════════════
   Aucune couleur en dur : uniquement des jetons de la charte, comme partout dans le module.
   ⚠️ PAS UN SEUL ACCENT GRAVE DANS CE BLOC (piege connu du depot : un accent grave dans un commentaire ferme le
   gabarit et casse la compilation avec une erreur qui ne parle pas du commentaire). */
export const CSS_BROUILLONS = `
/* Le mot de l'absence se lit COMME une absence : gris, italique. Il ne doit pas passer pour un nom de message. */
.bro-sans-objet{color:var(--color-svv-muted);font-style:italic;font-weight:400}
/* L'extrait de ce qui a ete saisi : une seule ligne, discrete, coupee proprement si elle deborde. */
.bro-extrait{margin:2px 0 0;font-size:.82rem;color:var(--color-svv-muted);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
`;
