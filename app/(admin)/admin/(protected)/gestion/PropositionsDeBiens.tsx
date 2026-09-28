'use client';

import { useCallback, useEffect, useState } from 'react';
import { planClassement } from '../../../../lib/gestion/gesteClassement';
import type { ContexteClassement } from '../../../../lib/gestion/classementBien';

/**
 * 🔴 LOT AFFECTATION-PAR-BIEN — « UNE PROPOSITION À TRANCHER » : DES BIENS, ET RIEN QUE DES BIENS.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QU'ON CORRIGE, sur un cas réel vu par Arno le 28/09/2026 : le mail « Contestation de la retenue de 450 €
 * sur dépôt de garantie » (Comptabilité ADHOC) proposait « PROPRIÉTAIRE MARTY Jean-François (310) ». Ce n'est pas
 * une réponse : on ne range pas un litige de dépôt de garantie « chez un propriétaire », on le range dans LE
 * LOGEMENT dont le dépôt est contesté. Un propriétaire n'est pas un dossier — c'est une PARTIE d'un dossier.
 *
 * 🔴 CHAQUE LIGNE EST UN BIEN, avec sous lui son PROPRIÉTAIRE et son LOCATAIRE À LA DATE DU MAIL (« vacant » quand
 * il n'y en a pas), et son MOTIF en clair. Le couple n'est jamais saisi : il est dérivé de la base d'occupations,
 * donc il ne peut pas se tromper de période.
 *
 * 🔴 LES PROPOSITIONS ANCIENNES DE TYPE PROPRIÉTAIRE SONT MONTRÉES COMME LA LISTE DE LEURS BIENS, et RIEN n'est
 * réécrit en base tant que personne n'a validé. Une ligne ancienne n'est pas fausse : elle est seulement écrite
 * dans un vocabulaire qu'on n'emploie plus.
 *
 * 🔴 VALIDATION OBLIGATOIRE, et c'est le SEUL moment où la base bouge. Cocher, décocher, changer d'avis, replier :
 * aucune écriture. Le plan de ce qui sera fait est calculé par un module PUR (`planClassement`), le même que celui
 * de la fenêtre de classement — deux implémentations donneraient un jour deux comportements.
 *
 * ⚠️ IL NE CHARGE QU'UNE FOIS, ET SEULEMENT QUAND IL Y A QUELQUE CHOSE À TRANCHER : l'encart n'est rendu que pour
 * un message OUVERT, et l'appelant ne le monte que si ce message porte des propositions.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : le type passe par `import type`, effacé à la compilation.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function PropositionsDeBiens({ messageId, occupe, onChange, onGeste, onClasser }: {
  messageId: number;
  /** Un geste est déjà en cours dans l'encart : on n'en lance pas un second par-dessus. */
  occupe: boolean;
  onChange: () => void | Promise<void>;
  onGeste?: (message: string) => void;
  /** Ouvre LA fenêtre de classement (portée, hors gestion, pièces par bien). */
  onClasser: () => void;
}) {
  const [etat, setEtat] = useState<
    { v: 'charge' } | { v: 'ok'; contexte: ContexteClassement } | { v: 'rien' }
  >({ v: 'charge' });
  const [coches, setCoches] = useState<string[] | null>(null);
  const [envoi, setEnvoi] = useState<{ en_cours: boolean; erreur: string | null }>(
    { en_cours: false, erreur: null });

  const charger = useCallback(async () => {
    setEtat({ v: 'charge' });
    try {
      const res = await fetch(`/api/admin/gestion/classement?message=${messageId}`, { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string; contexte?: ContexteClassement };
      /**
       * ⚠️ `(d.contexte.biens ?? [])` ET NON `d.contexte.biens` : une réponse plus ancienne que ce lot ne porte pas
       * les mêmes champs, et `undefined.length` ferait tomber le bandeau au-dessus du mail. On ne rend alors rien.
       */
      if (d.etat !== 'ok' || !d.contexte || !d.contexte.disponible || (d.contexte.biens ?? []).length === 0) {
        setEtat({ v: 'rien' });
        return;
      }
      setEtat({ v: 'ok', contexte: d.contexte });
      /**
       * 🔴 LA PRÉ-COCHE VIENT DU MOTEUR, ET D'ELLE SEULE — jamais d'une règle réécrite ici. Elle n'est posée QU'UNE
       * FOIS : si on la recalculait, décocher un bien le recocherait aussitôt.
       */
      setCoches((d.contexte.biens ?? []).filter((b) => b.recommande).map((b) => b.cle));
    } catch {
      // Silence volontaire : une erreur rouge au-dessus d'un mail ferait croire que le mail a un problème.
      setEtat({ v: 'rien' });
    }
  }, [messageId]);

  useEffect(() => { void charger(); }, [charger]);

  if (etat.v === 'charge') return <p className="gst-info" role="status">Lecture des biens possibles…</p>;
  if (etat.v === 'rien') return null;

  const { contexte } = etat;
  const selection = coches ?? [];
  /** Le plan, recalculé à chaque coche. C'est LUI qui écrit la phrase, jamais un compte fait à la main. */
  const plan = planClassement({
    messageId, portee: 'mail', mailsSansManuel: [messageId], selection,
    existants: [], // ce bloc ne retire rien : il POSE ce qu'on coche. Retirer se fait dans la liste du dessus.
  });
  const aFaire = plan.aPoser.length > 0;

  const basculer = (cle: string) => setCoches((c) => {
    const l = c ?? [];
    return l.includes(cle) ? l.filter((x) => x !== cle) : [...l, cle];
  });

  /** LA VALIDATION — un appel après l'autre, et on compte les échecs plutôt que de s'arrêter au premier. */
  const valider = async () => {
    if (!aFaire) return;
    setEnvoi({ en_cours: true, erreur: null });
    let faits = 0;
    const ratés: string[] = [];
    for (const p of plan.aPoser) {
      try {
        const res = await fetch('/api/admin/gestion/rattachements', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageId: p.messageId, cible: { sorte: 'lot', cle: p.cle }, motif: 'proposition validée à la main',
          }),
        });
        if (res.ok) faits += 1; else ratés.push(p.cle);
      } catch { ratés.push(p.cle); }
    }
    setEnvoi({
      en_cours: false,
      erreur: ratés.length === 0 ? null : `${faits} rattachement(s) posé(s), ${ratés.length} en échec.`,
    });
    if (ratés.length === 0) {
      onGeste?.(plan.resume);
      await onChange();
    }
  };

  const nb = contexte.biens.length;
  return (
    <>
      <style>{CSS_PROPOSITIONS_BIENS}</style>
      <p className="ert-sous-titre">
        {nb === 1 ? 'Une proposition à trancher' : `${nb} propositions à trancher`}
        {/* CE QUE LE MOTEUR CONCLUT, en une ligne : on doit pouvoir juger la proposition sans rouvrir le code. */}
        {contexte.examen && <span className="pdb-examen"> — {contexte.examen.motif}</span>}
      </p>

      <ul className="pdb-liste">
        {contexte.biens.map((b) => {
          const proprio = b.parties.find((p) => p.role === 'proprietaire');
          const locataires = b.parties.filter((p) => p.role === 'locataire');
          return (
            <li key={b.cle} className="pdb-item">
              <label className="pdb-tete">
                <input type="checkbox" checked={selection.includes(b.cle)} disabled={occupe || envoi.en_cours}
                  onChange={() => basculer(b.cle)} />
                <span className="pdb-nom">{b.libelle}</span>
                <span className={`pdb-certitude${b.certitude === 'quasi_certaine' ? ' pdb-certitude--sure' : ''}`}>
                  {b.certitude === 'quasi_certaine' ? 'Quasi certain' : 'À trancher'}
                </span>
                {b.dejaRattache && <span className="pdb-certitude">déjà rattaché</span>}
              </label>
              {/* 🔴 LE COUPLE DU BIEN, DÉRIVÉ DE LA DATE DU MAIL. « vacant » est une réponse : un blanc n'en est pas une. */}
              <p className="pdb-parties">
                <span className="pdb-role">Propriétaire :</span> {proprio?.nom ?? '(inconnu)'}
                <span className="pdb-sep" aria-hidden="true"> · </span>
                <span className="pdb-role">Locataire :</span>{' '}
                {locataires.length === 0
                  ? 'vacant à la date du mail'
                  : locataires.map((l) => l.nom).join(', ')}
              </p>
              <p className="pdb-motif">{b.motif}</p>
            </li>
          );
        })}
      </ul>

      <div className="pdb-boutons">
        <button type="button" className="svv-btn svv-btn-primary gst-btn"
          disabled={occupe || envoi.en_cours || !aFaire} onClick={() => void valider()}>
          {envoi.en_cours ? 'Enregistrement…' : 'Valider'}
        </button>
        {/* « Hors gestion » et les cas fins passent par LA fenêtre de classement — une seule implémentation. */}
        <button type="button" className="gst-lien-bouton" disabled={occupe || envoi.en_cours} onClick={onClasser}>
          Hors gestion, ou classer autrement…
        </button>
        <span className="pdb-resume" role="status">
          {aFaire ? plan.resume : 'Aucun bien coché : rien ne sera classé.'}
        </span>
      </div>

      {envoi.erreur !== null && <p className="gst-tronc" role="alert">{envoi.erreur}</p>}
    </>
  );
}

export const CSS_PROPOSITIONS_BIENS = `
.pdb-examen{font-weight:400;color:var(--color-svv-muted)}
.pdb-liste{display:flex;flex-direction:column;gap:6px;margin:4px 0 8px;padding:0;list-style:none}
.pdb-item{padding:8px 10px;border:1px solid var(--color-svv-line);border-radius:.6rem;
  background:var(--color-svv-surface);min-width:0}
.pdb-tete{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-height:32px;cursor:pointer;min-width:0}
.pdb-nom{flex:1 1 12rem;min-width:0;font-size:.9rem;font-weight:600;color:var(--color-svv-ink);
  overflow-wrap:anywhere}
/* Le MOT est toujours ecrit : la couleur ne fait que l'appuyer. */
.pdb-certitude{flex:0 0 auto;padding:.05rem .4rem;border-radius:999px;font-size:.7rem;font-weight:700;
  line-height:1.5;color:var(--color-svv-muted);border:1px solid var(--color-svv-line-strong)}
.pdb-certitude--sure{color:var(--color-svv-green-ink);border-color:var(--color-svv-green-ink)}
.pdb-parties{margin:.25rem 0 0 1.6rem;font-size:.8rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.pdb-role{font-size:.72rem;font-weight:700;letter-spacing:.03em;color:var(--color-svv-muted)}
.pdb-sep{color:var(--color-svv-muted)}
.pdb-motif{margin:.15rem 0 0 1.6rem;font-size:.78rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
.pdb-boutons{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px}
.pdb-resume{font-size:.78rem;color:var(--color-svv-muted)}
`;
