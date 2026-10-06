'use client';

import { useCallback, useEffect, useState } from 'react';
import { dateHeureComplete, dateHeureCourte } from '../../../../lib/gestion/ecran';
import { Trombone } from './Trombone';
import { nettoyerObjet } from '../../../../lib/gestion/objet';
import { bulleCapsuleMessage, motCapsule, type CapsuleStatut } from '../../../../lib/gestion/statutClassement';
// 🔴🔴 LOT OPTION-C — le MOT de l'unité comptée, écrit une seule fois pour les deux écrans (module PUR).
import { motMailsRecus } from '../../../../lib/gestion/uniteListe';
/**
 * 🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 8 — les MOTS de l'interrupteur du courrier automatique, écrits une
 * seule fois pour les deux écrans. Module PUR : il porte aussi le prédicat SQL que les deux dépôts appliquent, ce
 * qui est la seule façon de garantir qu'un même courrier est filtré pareil des deux côtés.
 */
import { phraseCourrierAutomatique } from '../../../../lib/gestion/courrierAutomatique';

/**
 * LOT STATUT-PAR-MAIL — LA BOÎTE DE RÉCEPTION DE `gestion@criterimmo.fr`, UN MAIL PAR LIGNE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE N'EST PAS LA FILE DES ÉCHANGES, et c'est tout l'objet de ce lot. Cette colonne montrait une file de
 * CONVERSATIONS à poser sur un événement ; elle montre désormais les derniers MAILS REÇUS, du plus récent au plus
 * ancien — c'est-à-dire ce qu'on ouvre le matin.
 *
 * La différence n'est pas cosmétique : une conversation de douze messages occupait UNE ligne, et ses onze autres
 * mails étaient invisibles. Or le classement se fait MAIL PAR MAIL — chacun porte ses propres rattachements. Une
 * liste d'échanges ne pouvait donc pas dire ce qui restait à classer.
 *
 * 🔴 RIEN N'EST SUPPRIMÉ : la file des échanges sans événement reste à un clic, par son lien, avec ses gestes et son
 * compteur. Les deux répondent à deux questions différentes, et les deux gardent leur place.
 *
 * 🔴 LA CAPSULE EST CELLE DU MAIL : rattaché à un BIEN (logement, propriétaire, locataire), ou non. Jamais
 * l'événement — c'est la confusion que ce lot supprime (fil 803 : trois mails rattachés au lot 445, tous affichés
 * « À classer » parce que l'échange n'avait pas de carte).
 *
 * MOBILE D'ABORD : une seule colonne, cibles de 44 px, rien au survol seul, jetons `--color-svv-*` uniquement.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

interface LigneMail {
  messageId: number;
  filId: number;
  de: string;
  objet: string | null;
  extrait: string | null;
  recuLe: string;
  aPiece: boolean;
  nbPieces: number;
  capsule: CapsuleStatut | null;
  biens: string[];
  /** LOT STATUT-HORS-GESTION — `prospection` | `interne` | `autre`, ou `null` : le motif est facultatif. */
  motifHorsGestion?: string | null;
}

type Filtre = 'tous' | 'a_classer' | 'classes' | 'hors_gestion';

type Etat =
  | { v: 'charge' }
  | {
      v: 'ok'; lignes: LigneMail[]; suivant: { recuLe: string; messageId: string } | null; total: number | null;
      /** La migration 266 est-elle appliquée ? Sinon le filtre « Hors gestion » n'est pas proposé. */
      horsGestion: boolean;
      /**
       * 🔴🔴 POINT 8 — COMBIEN **CETTE** LISTE TAIT, rendu par la route. `null` = on ne sait pas (hors première
       * page, ou serveur plus ancien) : on se tait alors, plutôt que d'annoncer un nombre inventé.
       */
      automatiquesIci: number | null;
    }
  | { v: 'erreur'; message: string };

/**
 * Les filtres rapides, avec leur MOT. Écrits une fois : deux listes finiraient par diverger.
 *
 * ⚠️ AUCUN NE PARLE D'ÉVÉNEMENT, et c'est la règle métier ③ : un mail sans événement n'est pas « à classer ».
 * « À classer » veut dire « rattaché à aucun bien, et pas marqué hors gestion » — rien d'autre.
 */
const FILTRES: readonly { cle: Filtre; mot: string; aide: string; exigeHorsGestion?: boolean }[] = [
  { cle: 'tous', mot: 'Tous', aide: 'Tous les mails reçus' },
  { cle: 'a_classer', mot: 'À classer', aide: 'Mails rattachés à aucun bien, et non marqués « hors gestion »' },
  { cle: 'classes', mot: 'Classés', aide: 'Mails rattachés à au moins un bien' },
  {
    cle: 'hors_gestion', mot: 'Hors gestion', exigeHorsGestion: true,
    aide: 'Mails marqués à la main comme ne concernant aucun bien (prospection, interne, divers)',
  },
];

export function BoiteReception({
  maintenant, onOuvrir, onPleinEcran, onFileEchanges, compteEchanges,
}: {
  maintenant: Date;
  /**
   * ══ 🔴🔴 LOT ACCUEIL-GESTION, POINT 2 — PLUS D'INTERRUPTEUR ICI, ET PLUS D'ÉTAT NON PLUS ═════════════════════
   *
   * ACCORD D'ARNO (06/10/2026) : « sur l'écran partagé, le lien est retiré, et la colonne mail affiche TOUJOURS
   * la Réception SANS courrier automatique, QUEL QUE SOIT l'état choisi en plein écran. En plein écran, le lien
   * et son comportement restent inchangés. »
   *
   * 🔴 LES PROPS `auto` ET `onAuto` SONT PARTIES, et c'est la moitié qui compte. Les garder en les ignorant
   * aurait laissé croire, à la lecture, que cette colonne suit encore l'interrupteur du plein écran — alors
   * qu'elle ne le suit plus. « Quel que soit l'état choisi en plein écran » se tient en ne CONNAISSANT pas cet
   * état, pas en l'ignorant poliment.
   *
   * ⚠️ CE QUI N'EST PAS RETIRÉ : la PHRASE. Elle dit, quand il y a un nombre à dire, combien de mails ne sont pas
   * affichés ici. Arno a accordé le retrait du LIEN ; la phrase renseigne sans rien proposer, et elle reste.
   * (Mesuré de nouveau le 06/10/2026 : zéro message REÇU écarté par une règle — elle ne s'affiche donc pas
   * aujourd'hui. Elle parlera le jour où une règle en écartera un.)
   *
   * ⚠️ LE PLEIN ÉCRAN, LUI, N'EST PAS TOUCHÉ : `BoiteMail` garde son lien, son état et son `?auto=1`.
   */
  /** Ouvre le mail — déplié dans sa conversation, par la règle du lot MESSAGE-CLIQUÉ. */
  onOuvrir: (filId: number, messageId: number) => void;
  /**
   * 🔴 OUVRE LA BOÎTE MAIL EN PLEIN ÉCRAN, SUR « RÉCEPTION ». Demande d'Arno : le bouton avait disparu de cette
   * colonne alors que celle des événements avait gardé le sien. Il revient à la MÊME place, et ouvre TOUJOURS la
   * liste « Réception » — quel que soit l'écran qu'on regardait avant.
   */
  onPleinEcran: () => void;
  /** Mène à la file des échanges sans événement : rien n'est supprimé, elle reste à un clic. */
  onFileEchanges: () => void;
  /** Le compteur de cette file, pour que le lien dise ce qu'il contient. */
  compteEchanges: number | null;
}) {
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [etat, setEtat] = useState<Etat>({ v: 'charge' });
  const [suite, setSuite] = useState(false);

  /**
   * 🔴🔴 LOT ACCUEIL-GESTION, POINT 2 — PLUS DE PARAMÈTRE `?auto=1` DANS CETTE COLONNE.
   *
   * Le lot RENOMMER-PARTOUT-ET-FINITIONS (point 8) l'avait câblé pour que les deux écrans partagent le même
   * interrupteur. Arno retire l'interrupteur d'ici : la question ne se pose plus, et garder un paramètre
   * toujours absent aurait laissé croire qu'elle se pose encore. La route, elle, l'accepte toujours — c'est le
   * PLEIN ÉCRAN qui s'en sert.
   */
  const charger = useCallback(async (f: Filtre) => {
    setEtat({ v: 'charge' });
    try {
      const p = new URLSearchParams({ filtre: f });
      const res = await fetch(`/api/admin/gestion/reception?${p}`, { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string; message?: string } & Omit<Etat & { v: 'ok' }, 'v'>;
      if (d.etat !== 'ok') { setEtat({ v: 'erreur', message: d.message ?? 'Lecture impossible.' }); return; }
      setEtat({
        v: 'ok', lignes: d.lignes ?? [], suivant: d.suivant ?? null, total: d.total ?? null,
        horsGestion: d.horsGestion === true, automatiquesIci: d.automatiquesIci ?? null,
      });
    } catch {
      setEtat({ v: 'erreur', message: 'La boîte n’a pas répondu.' });
    }
  }, []);

  /* 🔴 LOT ACCUEIL-GESTION, POINT 2 — LE FILTRE SEUL RELIT LA LISTE. Cette colonne ne demande JAMAIS le courrier
     automatique : c'est la traduction littérale de « quel que soit l'état choisi en plein écran ». */
  useEffect(() => { void charger(filtre); }, [charger, filtre]);

  /** « Voir les mails plus anciens » : on AJOUTE à la liste, on ne la remplace pas. */
  const voirPlus = async (): Promise<void> => {
    if (etat.v !== 'ok' || etat.suivant === null || suite) return;
    setSuite(true);
    try {
      /* ⚠️ LE DRAPEAU VOYAGE AVEC LA PAGE SUIVANTE. Sans lui, « voir plus » rendrait une page filtrée autrement
         que celle qu'on lit : des mails apparaîtraient ou manqueraient au milieu de la liste, et l'ordre
         chronologique strict qu'Arno demande serait rompu sur l'ensemble. */
      const p = new URLSearchParams({
        /* ⚠️ ET « VOIR PLUS » NON PLUS : la page suivante est filtrée comme celle qu'on lit — sans quoi des
           mails apparaîtraient au milieu de la liste. Ici, les deux sont « sans courrier automatique ». */
        filtre, avant: etat.suivant.recuLe, apres: etat.suivant.messageId,
      });
      const res = await fetch(`/api/admin/gestion/reception?${p}`, { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string } & Omit<Etat & { v: 'ok' }, 'v'>;
      if (d.etat === 'ok') {
        setEtat({
          v: 'ok', lignes: [...etat.lignes, ...(d.lignes ?? [])], suivant: d.suivant ?? null, total: etat.total,
          horsGestion: etat.horsGestion, automatiquesIci: etat.automatiquesIci,
        });
      }
    } catch { /* on garde ce qui est déjà affiché : une page de plus qui manque ne doit pas vider la liste */ }
    finally { setSuite(false); }
  };

  return (
    <div className="brc">
      <style>{CSS_BOITE_RECEPTION}</style>

      {/* ══ 🔴🔴 LOT ACCUEIL-GESTION, POINT 3 — L'EN-TÊTE, EN DEUX RANGÉES, COMME CELUI DES ÉVÉNEMENTS ═══════
          Le TITRE (avec son compteur) sur la première ; les OUTILS sur la seconde — ici les filtres ET « Plein
          écran », là-bas « Plein écran » seul. Les deux colonnes ont donc exactement le même en-tête, et leurs
          listes commencent à la même hauteur. Voir l'encadré de `.gst-tete-partage` dans la feuille de l'écran. */}
      <div className="gst-tete-partage">
      <div className="gst-tete-partage-titre">
        <h2 className="gst-titre" id="gst-titre-reception">
          Boîte de réception <span className="brc-adresse">gestion@criterimmo.fr</span>
          {/* ══ 🔴🔴 LOT OPTION-C — LE COMPTEUR DIT CE QU'IL COMPTE : DES MAILS ════════════════════════════════
              Décision d'Arno (03/10/2026) : « les deux unités restent, et chaque titre dit ce qu'il compte ».
              Cette colonne montre UN MAIL PAR LIGNE (lot STATUT-PAR-MAIL) ; le plein écran, UNE CONVERSATION par
              ligne. Les deux nombres diffèrent donc légitimement — ce que le nombre nu ne disait pas, et qui a
              fait écrire à Arno « j'ai l'impression qu'un mail manque ». Le mot vient de `uniteListe` (module
              PUR), écrit une seule fois pour les deux écrans. */}
          {etat.v === 'ok' && etat.total !== null && (
            <span className="gst-compte">{motMailsRecus(etat.total)}</span>
          )}
          {/* ══ 🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 8 — L'INTERRUPTEUR, À LA MÊME PLACE QU'AU PLEIN
              ÉCRAN : sur la ligne du titre, poussé à droite, en plus petit. Même libellé, mêmes mots, même état.

              ══ 🔴🔴 LOT RECEPTION-COURRIER-AUTO-LIEN — IL REVIENT, SANS CONDITION DE NOMBRE ═══════════════════

              🔴 IL AVAIT DISPARU AVEC LE POINT 6 DU MÊME LOT (« zéro ⇒ ni la phrase, ni le bouton ») : aucun
              message REÇU n'étant écarté par une règle, `automatiquesIci` vaut zéro ici — mesuré de nouveau le
              05/10/2026 : 17 341 reçus, **zéro** écarté. Le lien s'est donc tu sur les deux écrans.

              🔴 ARNO LE REVOIT (05/10/2026) : « remets-le exactement comme avant ». Il revient donc, à la même
              place, avec le même libellé, le même style et le même état partagé.

              ⚠️ LA PHRASE, ELLE, NE PARAÎT QUE SI ELLE A UN NOMBRE À DIRE : « 0 mail n'est pas affiché ici »
              ne s'écrit pas. Le lien revient ; le faux nombre, non.

              ⚠️ UN `span`, PAS UN `p` : ce bloc vit dans un `h2`, et un paragraphe dans un titre est du HTML
              invalide. Le bouton, lui, y est parfaitement légitime. */}
          {/* ══ 🔴🔴 LOT ACCUEIL-GESTION, POINT 2 — LE LIEN EST RETIRÉ D'ICI (accord d'Arno, 06/10/2026) ══════

              Il y était depuis le lot RENOMMER-PARTOUT-ET-FINITIONS (point 8), puis remis au lot
              RECEPTION-COURRIER-AUTO-LIEN. Arno le retire de l'ÉCRAN PARTAGÉ : cette colonne montre désormais la
              Réception sans courrier automatique, toujours, et il n'y a donc plus rien à basculer.

              ⚠️ EN PLEIN ÉCRAN, RIEN NE CHANGE : `BoiteMail` garde le lien, son état et son `?auto=1`. Une
              épreuve de garde l'exige dans un fichier et l'interdit dans l'autre.

              ⚠️ LA PHRASE RESTE, parce qu'elle RENSEIGNE au lieu de proposer : s'il existe des mails reçus
              écartés par une règle, cette colonne le DIT. Elle ne s'affiche pas aujourd'hui (zéro, mesuré).

              ⚠️ UN `span`, PAS UN `p` : ce bloc vit dans un `h2`, et un paragraphe dans un titre est invalide. */}
          {etat.v === 'ok' && etat.automatiquesIci !== null && etat.automatiquesIci !== 0 && (
            <span className="brc-tait">{phraseCourrierAutomatique(etat.automatiquesIci, false, 'mail')}</span>
          )}
        </h2>
      </div>

      {/* LES FILTRES RAPIDES — le MOT, jamais une icône seule ; `aria-pressed` dit lequel est actif.
          🔴 ILS PARTAGENT LA RANGÉE AVEC « Plein écran », qui s'y est déplacé : c'est ce qui donne aux deux
          colonnes un en-tête de même hauteur, sans qu'aucune ne porte de rangée vide. */}
      <div className="brc-filtres gst-tete-partage-outils" role="group" aria-label="Filtrer les mails reçus">
        {/* ⚠️ « Hors gestion » n'apparaît QUE si la migration 266 est appliquée : sans elle, il ne filtrerait
            rien, et une liste vide se lirait « aucun mail hors gestion » — ce qui serait autre chose. */}
        {FILTRES.filter((f) => !f.exigeHorsGestion || (etat.v === 'ok' && etat.horsGestion)).map((f) => (
          <button key={f.cle} type="button"
            className={`brc-filtre${filtre === f.cle ? ' brc-filtre--actif' : ''}`}
            aria-pressed={filtre === f.cle} title={f.aide}
            onClick={() => setFiltre(f.cle)}>
            {f.mot}
          </button>
        ))}
        <button type="button" className="svv-btn svv-btn-outline gst-btn gst-plein" onClick={onPleinEcran}>
          Plein écran
        </button>
      </div>
      </div>

      {/* 🔴 LE CORPS DÉFILE POUR LUI-MÊME, à la MÊME hauteur visible que la colonne des événements (feuille de
          `GestionVue`). Les messages d'état vivent dedans : sinon la colonne se raccourcirait quand la liste est
          vide, et les deux pieds ne seraient plus alignés. */}
      <div className="gst-corps-partage">
      {etat.v === 'charge' && <p className="gst-info" role="status">Lecture de la boîte…</p>}
      {etat.v === 'erreur' && <p className="gst-tronc" role="alert">{etat.message}</p>}
      {etat.v === 'ok' && etat.lignes.length === 0 && (
        <p className="gst-tronc">
          {filtre === 'a_classer' ? 'Aucun mail reçu n’attend d’être classé.'
            : filtre === 'classes' ? 'Aucun mail reçu n’est encore classé.'
              : filtre === 'hors_gestion' ? 'Aucun mail n’est marqué « hors gestion ».'
                : 'Aucun mail reçu.'}
        </p>
      )}

      {etat.v === 'ok' && etat.lignes.length > 0 && (
        <ul className="brc-liste">
          {etat.lignes.map((l) => (
            <li key={l.messageId} className="brc-li">
              {/* UN CLIC OUVRE LE MAIL, déplié dans sa conversation — règle du lot MESSAGE-CLIQUÉ, inchangée. */}
              <button type="button" className="brc-ligne" onClick={() => onOuvrir(l.filId, l.messageId)}>
                <span className="brc-haut">
                  <span className="brc-de">{l.de}</span>
                  <span className="brc-quand" title={dateHeureComplete(l.recuLe)}>
                    {dateHeureCourte(l.recuLe, maintenant)}
                  </span>
                </span>
                <span className="brc-objet">{nettoyerObjet(l.objet ?? '') || '(sans objet)'}</span>
                {l.extrait !== null && <span className="brc-extrait">{l.extrait}</span>}
                <span className="brc-bas">
                  {l.aPiece && (
                    <span className="brc-marque"
                      title={`${l.nbPieces} pièce${l.nbPieces > 1 ? 's' : ''} jointe${l.nbPieces > 1 ? 's' : ''}`}>
                      {/* 🔴 LOT LISTE-PAGINATION — un TRACÉ, pas un emoji : lui seul suit la couleur du texte
                          (voir l'encadré de `Trombone`). Ici la ligne EST un message et le nombre est celui de SES
                          pièces : le cas « noir » de la règle d'Arno, sans second état possible. */}
                      <Trombone /> {l.nbPieces}
                    </span>
                  )}
                  {/* 🔴 LA CAPSULE DU MAIL. `null` = migration 257 absente : aucune capsule, plutôt qu'une rouge
                      qui accuserait tous les mails alors qu'on n'en sait rien. */}
                  {l.capsule !== null && (
                    <span className={`brc-capsule brc-capsule--${l.capsule}`}
                      title={bulleCapsuleMessage(l.capsule, l.biens, l.motifHorsGestion ?? null)}>
                      {motCapsule(l.capsule)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      </div>

      {/* ══ 🔴🔴 LOT ACCUEIL-GESTION, POINT 3 — LE PIED, SUR UNE SEULE RANGÉE ════════════════════════════════
          « Voir les mails plus anciens » et le lien vers la file occupaient DEUX rangées l'une sous l'autre, soit
          88 px que la colonne des événements aurait dû réserver vides pour s'aligner. Côte à côte, le pied fait
          44 px des deux côtés, et les deux colonnes se terminent sur la même ligne.

          🔴 RIEN N'EST SUPPRIMÉ NI MASQUÉ : les deux gestes sont là, avec les mêmes mots et le même compteur. */}
      <div className="gst-pied-partage">
        {etat.v === 'ok' && etat.suivant !== null && (
          <button type="button" className="svv-btn svv-btn-outline gst-btn brc-plus" disabled={suite}
            onClick={() => void voirPlus()}>
            {suite ? 'Chargement…' : 'Voir les mails plus anciens'}
          </button>
        )}
        <button type="button" className="gst-lien-bouton brc-ailleurs" onClick={onFileEchanges}>
          File des échanges sans événement{compteEchanges !== null ? ` (${compteEchanges})` : ''}
        </button>
      </div>
    </div>
  );
}

export const CSS_BOITE_RECEPTION = `
.brc{display:flex;flex-direction:column;gap:8px;min-width:0}
.brc-adresse{font-weight:400;font-size:.8rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
/* ══ 🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 8 — CE QUE LA LISTE NE MONTRE PAS, SUR LA LIGNE DU TITRE ═════
   LE MEME DESSIN QUE .bte-tait DU PLEIN ECRAN, au caractere pres : meme taille, meme graisse, meme couleur,
   meme poussee a droite. Arno demande « meme libelle, meme place » — deux dessins differents pour un meme geste
   donneraient a croire a deux mecanismes, et c'est exactement ce que ce point repare ailleurs.
   ⚠️ margin-left:auto POUSSE A DROITE SANS RIEN DEPLACER : le titre et le compteur ne bougent pas d'un pixel.
   ⚠️ AUCUNE COULEUR EN DUR : le jeton bascule seul en Clair et en Sombre.
   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit (piege TS1005 du depot). */
.brc-tait{margin-left:auto;text-align:right;font-size:.72rem;font-weight:400;line-height:1.35;
  color:var(--color-svv-muted);flex:0 1 auto;min-width:0}
.brc-filtres{display:flex;flex-wrap:wrap;gap:6px}
.brc-filtre{min-height:36px;padding:.25rem .7rem;font:inherit;font-size:.8rem;color:var(--color-svv-ink);
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:999px;cursor:pointer}
.brc-filtre:hover{background:var(--color-svv-field)}
.brc-filtre:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* L'ACTIF se dit par le MOT (aria-pressed) autant que par la forme : jamais la couleur seule. */
.brc-filtre--actif{color:var(--color-svv-surface);background:var(--color-svv-ink);border-color:var(--color-svv-ink)}
.brc-liste{display:flex;flex-direction:column;margin:0;padding:0;list-style:none;
  border-top:1px solid var(--color-svv-line)}
.brc-li{border-bottom:1px solid var(--color-svv-line)}
.brc-ligne{display:flex;flex-direction:column;gap:2px;width:100%;min-height:44px;padding:8px 4px;text-align:left;
  font:inherit;color:inherit;background:none;border:0;cursor:pointer;min-width:0}
.brc-ligne:hover{background:var(--color-svv-field)}
.brc-ligne:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.brc-haut{display:flex;align-items:baseline;gap:8px;min-width:0}
.brc-de{flex:1 1 auto;min-width:0;font-size:.9rem;font-weight:600;color:var(--color-svv-ink);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.brc-quand{flex:0 0 auto;font-size:.78rem;color:var(--color-svv-muted);white-space:nowrap}
.brc-objet{font-size:.88rem;color:var(--color-svv-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.brc-extrait{font-size:.82rem;color:var(--color-svv-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.brc-bas{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:.78rem;color:var(--color-svv-muted)}
.brc-marque{display:inline-flex;align-items:center;gap:.25rem;flex:0 0 auto}
/* MEME GABARIT que la capsule de la liste et celle du mail ouvert : c'est le MEME statut, il doit se reconnaitre
   d'un ecran a l'autre. Le MOT est toujours ecrit — lisible en niveaux de gris et pour un daltonien. */
.brc-capsule{margin-left:auto;padding:.05rem .4rem;border-radius:999px;font-size:.7rem;font-weight:700;
  line-height:1.5;white-space:nowrap;border:1px solid transparent}
.brc-capsule--a_classer{color:var(--color-svv-red);border-color:var(--color-svv-red)}
.brc-capsule--classe{color:var(--color-svv-green-ink);border-color:var(--color-svv-green-ink)}
.brc-capsule--auto{color:var(--color-svv-green-ink);background:var(--color-svv-green-soft)}
/* LOT STATUT-HORS-GESTION — le GRIS : une decision prise, pas un travail en attente. Le MOT est ecrit. */
/* LOT RATTACHER-EN-ECRIVANT — « Interne » : VERT, un etat d'ARRIVEE. Le MOT est toujours ecrit. */
.brc-capsule--interne{color:var(--color-svv-green-ink);background:var(--color-svv-green-soft)}
.brc-capsule--hors_gestion{color:var(--color-svv-muted);border-color:var(--color-svv-line-strong)}
.brc-plus{align-self:flex-start}
.brc-ailleurs{margin:4px 0 0;font-size:.8rem;color:var(--color-svv-muted)}
`;
