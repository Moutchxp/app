'use client';

import { useCallback, useEffect, useState } from 'react';
import { dateHeureComplete, dateHeureCourte } from '../../../../lib/gestion/ecran';
import { Trombone } from './Trombone';
import { nettoyerObjet } from '../../../../lib/gestion/objet';
import { bulleCapsuleMessage, motCapsule, type CapsuleStatut } from '../../../../lib/gestion/statutClassement';

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

export function BoiteReception({ maintenant, onOuvrir, onPleinEcran, onFileEchanges, compteEchanges }: {
  maintenant: Date;
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

  const charger = useCallback(async (f: Filtre) => {
    setEtat({ v: 'charge' });
    try {
      const res = await fetch(`/api/admin/gestion/reception?filtre=${f}`, { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string; message?: string } & Omit<Etat & { v: 'ok' }, 'v'>;
      if (d.etat !== 'ok') { setEtat({ v: 'erreur', message: d.message ?? 'Lecture impossible.' }); return; }
      setEtat({
        v: 'ok', lignes: d.lignes ?? [], suivant: d.suivant ?? null, total: d.total ?? null,
        horsGestion: d.horsGestion === true,
      });
    } catch {
      setEtat({ v: 'erreur', message: 'La boîte n’a pas répondu.' });
    }
  }, []);

  useEffect(() => { void charger(filtre); }, [charger, filtre]);

  /** « Voir les mails plus anciens » : on AJOUTE à la liste, on ne la remplace pas. */
  const voirPlus = async (): Promise<void> => {
    if (etat.v !== 'ok' || etat.suivant === null || suite) return;
    setSuite(true);
    try {
      const p = new URLSearchParams({ filtre, avant: etat.suivant.recuLe, apres: etat.suivant.messageId });
      const res = await fetch(`/api/admin/gestion/reception?${p}`, { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string } & Omit<Etat & { v: 'ok' }, 'v'>;
      if (d.etat === 'ok') {
        setEtat({
          v: 'ok', lignes: [...etat.lignes, ...(d.lignes ?? [])], suivant: d.suivant ?? null, total: etat.total,
          horsGestion: etat.horsGestion,
        });
      }
    } catch { /* on garde ce qui est déjà affiché : une page de plus qui manque ne doit pas vider la liste */ }
    finally { setSuite(false); }
  };

  return (
    <div className="brc">
      <style>{CSS_BOITE_RECEPTION}</style>

      {/* L'EN-TÊTE DE COLONNE, exactement comme celui des événements : le titre, et « Plein écran » au bout. */}
      <div className="gst-entete-col">
        <h2 className="gst-titre" id="gst-titre-reception">
          Boîte de réception <span className="brc-adresse">gestion@criterimmo.fr</span>
          {etat.v === 'ok' && etat.total !== null && <span className="gst-compte">{etat.total}</span>}
        </h2>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onPleinEcran}>
          Plein écran
        </button>
      </div>

      {/* LES FILTRES RAPIDES — le MOT, jamais une icône seule ; `aria-pressed` dit lequel est actif. */}
      <div className="brc-filtres" role="group" aria-label="Filtrer les mails reçus">
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
      </div>

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

      {etat.v === 'ok' && etat.suivant !== null && (
        <button type="button" className="svv-btn svv-btn-outline gst-btn brc-plus" disabled={suite}
          onClick={() => void voirPlus()}>
          {suite ? 'Chargement…' : 'Voir les mails plus anciens'}
        </button>
      )}

      {/* 🔴 RIEN N'EST SUPPRIMÉ : la file des échanges sans événement reste à un clic, avec son compteur. */}
      <p className="brc-ailleurs">
        <button type="button" className="gst-lien-bouton" onClick={onFileEchanges}>
          File des échanges sans événement{compteEchanges !== null ? ` (${compteEchanges})` : ''}
        </button>
      </p>
    </div>
  );
}

export const CSS_BOITE_RECEPTION = `
.brc{display:flex;flex-direction:column;gap:8px;min-width:0}
.brc-adresse{font-weight:400;font-size:.8rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
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
.brc-capsule--hors_gestion{color:var(--color-svv-muted);border-color:var(--color-svv-line-strong)}
.brc-plus{align-self:flex-start}
.brc-ailleurs{margin:4px 0 0;font-size:.8rem;color:var(--color-svv-muted)}
`;
