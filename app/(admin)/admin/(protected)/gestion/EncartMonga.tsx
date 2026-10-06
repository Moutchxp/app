'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
/**
 * 🔴 DEPUIS LE MODULE **PUR**, JAMAIS DEPUIS LE DÉPÔT. Ce composant vit dans le navigateur : importer
 * `mongaRepo` le ferait remonter jusqu'à `pg`, donc jusqu'à `dns`, et webpack refuserait de construire TOUTE
 * l'application — page de connexion comprise (incident du 24/09/2026). Le garde `clientBoundary.guard.test.ts`
 * le vérifie. Les TYPES, eux, traversent librement : ils n'existent plus à l'exécution.
 */
import {
  jourFrancais, motCasLotsMonga, motRenommageMonga, renommageAFaire,
} from '../../../../lib/gestion/monga';
import type {
  EncartMonga as DonneesEncart, EvenementCandidatMonga, LotCandidatMonga,
} from '../../../../lib/gestion/mongaRepo';

/**
 * ══ 🔴🔴 LOT MONGA-1, POINT 3 — L'ENCART « INTERVENTION MONGA » EN TÊTE DE LA FENÊTRE « CLASSER » ═══════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (06/10/2026), mot pour mot : « PREMIER MAIL D'UNE RÉFÉRENCE NON RELIÉE : dans la fenêtre
 * « Classer » (même composant), un encart en tête « Intervention Monga MNG-23987 · barre de douche defixer ·
 * 53 avenue des Ternes ». Il propose : les événements OUVERTS des lots candidats (« Relier à cet événement » ; si
 * le nom diffère : « Le nom deviendra « barre de douche defixer » (nom Monga). Ancien nom conservé dans
 * l'historique. ») OU « Créer l'événement « <libellé Monga> » » sur le lot choisi (lot unique présélectionné mais
 * PAS validé ; plusieurs lots : liste avec propriétaire et locataire actuel de chacun ; aucun : moteur de
 * recherche). Un clic valide le lien référence ↔ événement ; le mail et TOUS les autres mails de la même
 * référence se classent alors dans l'événement. « Annuler » quelques secondes après. »
 *
 * ═══ 🔴🔴 POURQUOI UN FICHIER À PART, ALORS QU'ARNO DIT « MÊME COMPOSANT » ══════════════════════════════════════
 *
 * « Même composant » veut dire LA MÊME FENÊTRE — celle que « Classer » ouvre depuis le lot précédent — et non le
 * même fichier : l'encart est MONTÉ par `RattachementsDuFil`, en tête de son dialogue, et n'existe que là.
 * `RattachementsDuFil` fait déjà 1 818 lignes et porte six panneaux ; y verser quatre cents lignes de plus aurait
 * rendu illisible ce qui est déjà le fichier le plus dense de l'écran. C'est la même découpe que
 * `BlocEvenement.tsx`, monté de la même façon, pour la même raison.
 *
 * ═══ 🔴🔴 CE QUE CET ENCART NE FAIT PAS, ET QUI EST LE CŒUR DE LA DÉCISION D'ARNO ═══════════════════════════════
 *
 * ⚠️ IL NE VALIDE RIEN TOUT SEUL. Même quand UN SEUL lot répond à l'adresse — 18 références sur 40 — le lot est
 * COCHÉ et le bouton ATTEND. C'est la décision n° 1 d'Arno, mot pour mot : « premier rattachement d'une
 * référence = TOUJOURS un clic d'Arno, même quand le lot est unique ». Présélectionner fait gagner le temps ;
 * valider d'office aurait rangé du courrier dans le dossier de quelqu'un sans que personne ait regardé.
 *
 * ⚠️ IL NE DÉDUIT JAMAIS LE LOT À PLUSIEURS. 19 références sur 40 donnent plusieurs lots — jusqu'à 76 à la même
 * adresse. L'encart les LISTE, avec le propriétaire et le locataire du jour, parce que c'est par eux qu'on
 * reconnaît un logement parmi 76. Arno demandera à Monga d'ajouter le lot et l'étage ; d'ici là, c'est un choix.
 *
 * ⚠️ IL NE CHANGE AUCUN NOM SANS LE DIRE AVANT. Quand le nom de l'événement diffère du libellé Monga, la phrase
 * d'Arno est affichée À CÔTÉ DU BOUTON, avant le clic — pas après.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Combien de temps l'« Annuler » reste offert. Le même délai que les autres annulations de l'écran. */
export const SECONDES_ANNULER_MONGA = 12;

type Etat =
  | { v: 'charge' }
  | { v: 'absent' }
  | { v: 'sans_schema' }
  | { v: 'ok'; encart: DonneesEncart }
  | { v: 'erreur'; message: string };

/** Ce qu'un clic vient de faire, et qu'« Annuler » peut défaire. */
interface Fait {
  reference: string;
  mot: string;
}

export function EncartMonga({ messageId, onGeste, onRelie }: {
  messageId: number | null;
  onGeste?: (mot: string) => void;
  /** Appelé après un lien POSÉ ou ANNULÉ : la fenêtre relit ses biens, qui viennent de changer. */
  onRelie?: () => void;
}) {
  const [etat, setEtat] = useState<Etat>({ v: 'charge' });
  const [lotChoisi, setLotChoisi] = useState<string | null>(null);
  const [terme, setTerme] = useState('');
  const [trouves, setTrouves] = useState<LotCandidatMonga[]>([]);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState<Fait | null>(null);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * ⚠️ AUCUN `setState` AVANT LE PREMIER `await` : l'effet qui l'appelle serait sinon une mise à jour
   * SYNCHRONE dans un effet, que le garde React de ce dépôt refuse (cascade de rendus). Le cas « pas de mail »
   * est donc tranché au RENDU, et non ici.
   */
  const charger = useCallback(async (): Promise<void> => {
    if (messageId === null) return;
    try {
      const res = await fetch(`/api/admin/gestion/monga?message=${messageId}`, { cache: 'no-store' });
      const d = (await res.json().catch(() => ({}))) as {
        etat?: string; encart?: DonneesEncart | null; erreur?: string;
      };
      if (d.etat === 'sans_schema') { setEtat({ v: 'sans_schema' }); return; }
      if (d.etat !== 'ok') { setEtat({ v: 'erreur', message: d.erreur ?? 'Lecture impossible.' }); return; }
      if (d.encart === null || d.encart === undefined) { setEtat({ v: 'absent' }); return; }
      setEtat({ v: 'ok', encart: d.encart });
      /**
       * 🔴 LE LOT UNIQUE EST COCHÉ, ET SEULEMENT COCHÉ. `cas === 'unique'` ⇒ on pose la sélection ; le bouton
       * reste un bouton. À plusieurs, on ne coche RIEN : une case déjà cochée au hasard parmi 76 serait validée
       * par inadvertance un jour, et ce jour-là le courrier d'un logement partirait dans le dossier d'un voisin.
       */
      setLotChoisi(d.encart.cas === 'unique' ? (d.encart.lots[0]?.cle ?? null) : null);
    } catch {
      setEtat({ v: 'erreur', message: 'Le serveur n’a pas répondu.' });
    }
  }, [messageId]);

  useEffect(() => { void charger(); }, [charger]);

  /** Le moteur de recherche du cas « aucun lot » — appelé après une petite pause de frappe. */
  useEffect(() => {
    /* ⚠️ ON NE VIDE PAS `trouves` ICI (ce serait un `setState` synchrone dans un effet) : le rendu lit `e.lots`
       dès que le terme redescend sous deux caractères, donc une ancienne recherche ne peut pas rester à
       l'écran. */
    if (terme.trim().length < 2) return undefined;
    let vivant = true;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/admin/gestion/monga?cherche=${encodeURIComponent(terme.trim())}`,
            { cache: 'no-store' });
          const d = (await res.json().catch(() => ({}))) as { etat?: string; lots?: LotCandidatMonga[] };
          if (vivant && d.etat === 'ok') setTrouves(d.lots ?? []);
        } catch { if (vivant) setTrouves([]); }
      })();
    }, 250);
    return () => { vivant = false; clearTimeout(t); };
  }, [terme]);

  /* ⚠️ LA MINUTERIE EST NETTOYÉE AU DÉMONTAGE : la fenêtre se ferme souvent avant la fin des douze secondes. */
  useEffect(() => () => { if (minuterie.current !== null) clearTimeout(minuterie.current); }, []);

  const poser = async (corps: Record<string, unknown>, mot: string, reference: string): Promise<void> => {
    setOccupe(true);
    setErreur(null);
    try {
      const res = await fetch('/api/admin/gestion/monga', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
      });
      const d = (await res.json().catch(() => ({}))) as {
        etat?: string; erreur?: string; renomme?: string | null; classes?: number;
      };
      if (d.etat !== 'ok') { setErreur(d.erreur ?? 'Le lien n’a pas abouti.'); return; }
      const compte = d.classes ?? 0;
      const dit = `${mot}${compte > 1 ? ` · ${compte} mails classés` : compte === 1 ? ' · 1 mail classé' : ''}`
        + `${(d.renomme ?? null) !== null ? ` · nom harmonisé : « ${d.renomme ?? ''} »` : ''}`;
      setFait({ reference, mot: dit });
      onGeste?.(dit);
      onRelie?.();
      await charger();
      if (minuterie.current !== null) clearTimeout(minuterie.current);
      minuterie.current = setTimeout(() => setFait(null), SECONDES_ANNULER_MONGA * 1000);
    } catch {
      setErreur('Le serveur n’a pas répondu.');
    } finally {
      setOccupe(false);
    }
  };

  /**
   * ══ 🔴🔴 L'« ANNULER » DES SECONDES QUI SUIVENT ══════════════════════════════════════════════════════════════
   *
   * 🔴 IL PASSE PAR LA MÊME PORTE QUE « DÉLIER » (`delier: true`), et c'est ce qui le rend exact : il remet le
   * nom d'avant, désactive les affectations et retire les rattachements que le classement — et lui seul — avait
   * posés, reconnus par leur motif. Un second chemin de restauration aurait divergé au premier ajustement.
   *
   * ⚠️ UNE CARTE NÉE DU GESTE RESTE, VIDE, et le message le DIT. Rien n'est supprimé dans ce dépôt ; mieux vaut
   * une carte qu'Arno ferme d'un geste visible qu'une suppression dont personne ne saura qu'elle a eu lieu.
   */
  const annuler = async (): Promise<void> => {
    const f = fait;
    if (f === null) return;
    setFait(null);
    setOccupe(true);
    try {
      const res = await fetch('/api/admin/gestion/monga', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: f.reference, delier: true, motif: 'annulé depuis l’encart Monga' }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        etat?: string; erreur?: string; liensRetires?: number; mailsRemis?: number;
        nomRemis?: string | null; evenementVide?: boolean;
      };
      if (d.etat !== 'ok') { setErreur(d.erreur ?? 'L’annulation n’a pas abouti.'); return; }
      onGeste?.(`Lien ${f.reference} annulé`
        + `${(d.mailsRemis ?? 0) > 0 ? ` · ${d.mailsRemis ?? 0} mail(s) remis` : ''}`
        + `${(d.nomRemis ?? null) !== null ? ` · nom remis : « ${d.nomRemis ?? ''} »` : ''}`
        + `${d.evenementVide === true ? ' · l’événement ne porte plus aucun mail' : ''}`);
      onRelie?.();
      await charger();
    } catch {
      setErreur('Le serveur n’a pas répondu.');
    } finally {
      setOccupe(false);
    }
  };

  /* ⚠️ RIEN DU TOUT quand ce n'est pas un mail Monga, ou que la migration 311 n'est pas là : la fenêtre est
     alors EXACTEMENT celle d'avant ce lot. Un encart vide se lirait comme une panne. */
  if (messageId === null) return null;
  if (etat.v === 'absent' || etat.v === 'sans_schema') return null;
  if (etat.v === 'charge') return null;
  if (etat.v === 'erreur') {
    return (
      <div className="emg">
        <style>{CSS_ENCART_MONGA}</style>
        <p className="emg-tronc" role="alert">{etat.message}</p>
      </div>
    );
  }

  const e = etat.encart;
  const lots = terme.trim().length >= 2 ? trouves : e.lots;

  return (
    <section className="emg" aria-labelledby="emg-titre">
      <style>{CSS_ENCART_MONGA}</style>

      {/* ══ L'EN-TÊTE : la phrase d'Arno, mot pour mot, composée par le module pur ══════════════════════════ */}
      <p className="emg-titre" id="emg-titre">{e.mot}</p>
      <p className="emg-detail">
        {e.derniereEtapeMot !== null && <span className="emg-etape">{e.derniereEtapeMot}</span>}
        <span>{e.nbMails === 1 ? '1 mail' : `${e.nbMails} mails`}</span>
        {e.lienMission !== null && (
          /* ⚠️ `rel="noreferrer"` : on n'annonce pas notre écran interne à Monga. */
          <a className="emg-lien" href={e.lienMission} target="_blank" rel="noreferrer">Vers Mission</a>
        )}
      </p>

      {erreur !== null && <p className="emg-tronc" role="alert">{erreur}</p>}

      {/* ══ APRÈS LE CLIC : ce qui a été fait, et « Annuler » quelques secondes ════════════════════════════ */}
      {fait !== null && (
        <div className="emg-fait" role="status">
          <span className="emg-fait-mot">{fait.mot}</span>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={occupe}
            onClick={() => void annuler()}>
            Annuler
          </button>
        </div>
      )}

      {/* ══ DÉJÀ RELIÉE : l'encart ne propose plus rien, il DIT ════════════════════════════════════════════ */}
      {e.evenementId !== null && (
        <p className="emg-relie">
          Reliée à l’événement
          {' '}
          <strong>{e.evenementNom ?? `n° ${e.evenementId}`}</strong>
          {' '}
          — les mails de cette intervention s’y classent tout seuls.
        </p>
      )}

      {e.evenementId === null && (
        <>
          {/* ══ ① RELIER À UN ÉVÉNEMENT **OUVERT** D'UN LOT CANDIDAT ══════════════════════════════════════ */}
          {e.evenements.length > 0 && (
            <div className="emg-bloc">
              <p className="emg-sous">Relier à un événement déjà ouvert :</p>
              <ul className="emg-liste">
                {e.evenements.map((ev) => (
                  <LigneEvenement key={ev.evenementId} evenement={ev} libelleMonga={e.libelle} occupe={occupe}
                    onRelier={() => void poser(
                      /* 🔴 `messageId` EST TRANSMIS AUSSI QUAND ON RELIE À UN ÉVÉNEMENT EXISTANT : c'est le mail
                         depuis lequel Arno clique, et il doit être classé même s'il dormait à la corbeille. */
                      { reference: e.reference, evenementId: Number(ev.evenementId), messageId },
                      `Intervention ${e.reference} reliée à ${ev.reference}`, e.reference)} />
                ))}
              </ul>
            </div>
          )}

          {/* ══ ② OU CRÉER L'ÉVÉNEMENT « <libellé Monga> » SUR LE LOT CHOISI ══════════════════════════════ */}
          <div className="emg-bloc">
            <p className="emg-sous">
              {e.evenements.length > 0 ? 'Ou créer l’événement' : 'Créer l’événement'}
              {e.libelle !== null && <> « <strong>{e.libelle}</strong> »</>}
              {' '}sur un bien :
            </p>
            <p className="emg-aide">{motCasLotsMonga(e.cas)}</p>

            {/* ⚠️ LE MOTEUR DE RECHERCHE EST TOUJOURS LÀ, et pas seulement dans le cas « aucun lot » : une
                adresse peut être lue de travers, et Arno doit pouvoir chercher sans fermer la fenêtre. Dans le
                cas « aucun », c'est la SEULE voie — et le champ prend alors le focus de lui-même. */}
            <input className="emg-recherche" type="search" value={terme}
              autoFocus={e.cas === 'aucun'}
              placeholder="Chercher un bien : adresse, commune, ou n° de lot"
              aria-label="Chercher un bien" onChange={(ev) => setTerme(ev.target.value)} />

            {lots.length === 0 && (
              <p className="emg-aide">
                {terme.trim().length >= 2 ? 'Aucun bien ne répond à cette recherche.' : ''}
              </p>
            )}
            {lots.length > 0 && (
              <ul className="emg-liste">
                {lots.map((l) => (
                  <li key={l.cle} className="emg-lot">
                    <label className="emg-lot-label">
                      <input type="radio" name="emg-lot" value={l.cle} checked={lotChoisi === l.cle}
                        onChange={() => setLotChoisi(l.cle)} />
                      <span className="emg-lot-nom">{l.libelle}</span>
                    </label>
                    {/* 🔴 LE PROPRIÉTAIRE ET LE LOCATAIRE DU JOUR : c'est par eux qu'on reconnaît un logement
                        parmi 76 à la même adresse (demande d'Arno). « Vacant » est une réponse, pas un trou. */}
                    <span className="emg-lot-gens">
                      {l.proprietaire ?? 'propriétaire inconnu'}
                      {' · '}
                      {l.locataire ?? 'aucun locataire aujourd’hui'}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <button type="button" className="svv-btn gst-btn emg-valider"
              disabled={occupe || lotChoisi === null || e.libelle === null || messageId === null}
              onClick={() => void poser(
                { reference: e.reference, messageId, lotCle: lotChoisi },
                `Événement « ${e.libelle ?? ''} » créé et relié à ${e.reference}`, e.reference)}>
              {e.libelle === null
                ? 'Monga n’a pas écrit de libellé : nommez l’événement à la main'
                : `Créer l’événement « ${e.libelle} »`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * UNE LIGNE « ÉVÉNEMENT OUVERT », avec la phrase du renommage QUAND le nom diffère.
 *
 * 🔴 LA PHRASE EST AFFICHÉE **AVANT** LE CLIC, et elle vient du module pur — le navigateur lit donc exactement
 * le mot que la base journalisera. Deux écritures de la même phrase auraient divergé.
 *
 * ⚠️ AUCUNE PHRASE QUAND LE NOM NE CHANGE PAS : `renommageAFaire` rend `null`, et annoncer un renommage qui
 * n'aura pas lieu ferait hésiter pour rien.
 */
function LigneEvenement({ evenement, libelleMonga, occupe, onRelier }: {
  evenement: EvenementCandidatMonga;
  libelleMonga: string | null;
  occupe: boolean;
  onRelier: () => void;
}) {
  const renomme = libelleMonga === null ? null : renommageAFaire(evenement.objet, libelleMonga);
  return (
    <li className="emg-evt">
      <span className="emg-evt-nom">{evenement.reference} — {evenement.objet}</span>
      <span className="emg-evt-detail">
        ouvert le {jourFrancais(evenement.ouvertLe)}
        {evenement.lots.length > 0 && <> · {evenement.lots.map((c) => `lot ${c}`).join(', ')}</>}
      </span>
      {renomme !== null && (
        <p className="emg-renomme" role="note">{motRenommageMonga(renomme)}</p>
      )}
      <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={occupe} onClick={onRelier}>
        Relier à cet événement
      </button>
    </li>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA FEUILLE. ⚠️ AUCUNE COULEUR EN DUR : rien que les jetons SVAV, comme partout dans cet ecran — c'est ce qui
   fait que le theme Sombre marche sans qu'aucune ligne ne parle de lui.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
export const CSS_ENCART_MONGA = `
.emg{margin:0 0 10px;padding:8px 10px;border:1px solid var(--color-svv-line-strong);border-radius:.6rem;
  background:var(--color-svv-field);min-width:0}
.emg-titre{margin:0;font-size:.9rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.emg-detail{margin:2px 0 0;display:flex;flex-wrap:wrap;gap:.5rem;align-items:baseline;
  font-size:.74rem;color:var(--color-svv-muted)}
.emg-etape{font-weight:700;color:var(--color-svv-ink)}
.emg-lien{color:var(--color-svv-red);text-decoration:underline}
.emg-relie{margin:6px 0 0;font-size:.8rem;color:var(--color-svv-ink)}
.emg-bloc{margin-top:8px;padding-top:8px;border-top:1px solid var(--color-svv-line)}
.emg-sous{margin:0;font-size:.8rem;font-weight:600;color:var(--color-svv-ink)}
.emg-aide{margin:2px 0 0;font-size:.72rem;color:var(--color-svv-muted)}
.emg-liste{margin:6px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
.emg-evt,.emg-lot{display:flex;flex-direction:column;gap:2px;padding:6px 8px;min-width:0;
  border:1px solid var(--color-svv-line);border-radius:.5rem;background:var(--color-svv-surface)}
.emg-evt-nom{font-size:.82rem;font-weight:600;color:var(--color-svv-ink);overflow-wrap:anywhere}
.emg-evt-detail,.emg-lot-gens{font-size:.72rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
/* La phrase du renommage : le MOT porte l'avertissement, la bordure ne fait que l'appuyer. */
.emg-renomme{margin:4px 0;padding:4px 8px;font-size:.74rem;color:var(--color-svv-ink);
  border-left:3px solid var(--color-svv-red);background:var(--color-svv-field);border-radius:.3rem}
.emg-evt button,.emg-valider{align-self:flex-start;margin-top:4px}
.emg-lot-label{display:flex;gap:.4rem;align-items:baseline;min-width:0;cursor:pointer}
.emg-lot-nom{font-size:.82rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.emg-recherche{margin-top:6px;width:100%;max-width:34rem;padding:.35rem .5rem;font-size:.82rem;
  color:var(--color-svv-ink);background:var(--color-svv-surface);
  border:1px solid var(--color-svv-line-strong);border-radius:.4rem}
.emg-fait{margin:6px 0 0;padding:6px 8px;display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;
  border:1px solid var(--color-svv-line-strong);border-radius:.5rem;background:var(--color-svv-surface)}
.emg-fait-mot{font-size:.78rem;color:var(--color-svv-ink)}
.emg-tronc{margin:4px 0 0;font-size:.78rem;color:var(--color-svv-red)}
/* Sous 420 px, les boutons prennent toute la largeur : une cible tactile ne doit jamais etre un timbre-poste. */
@media (max-width:420px){
  .emg-evt button,.emg-valider{align-self:stretch;width:100%}
}
`;
