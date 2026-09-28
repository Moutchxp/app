'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CSS_MODIFIER_RATTACHEMENT } from './ModifierRattachement';
// LOT STATUT-PAR-MAIL — le plan de la validation est un module PUR, éprouvé sans écran ni base.
import { planClassement, type LienExistant, type PorteeClassement } from '../../../../lib/gestion/gesteClassement';
import type { ContexteClassement } from '../../../../lib/gestion/classementBien';
import type { LienAffiche } from '../../../../lib/gestion/rattachementRepo';

/**
 * LOT STATUT-PAR-MAIL — « CLASSER CE MAIL » : LE CHOIX D'UN OU PLUSIEURS BIENS, ET DE LA PORTÉE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUI MANQUAIT, ET QU'ARNO A DEMANDÉ. Pour classer un mail il fallait savoir d'avance quel lot viser, et le
 * désigner dans un sélecteur de cible — sans voir qui en était le propriétaire, ni qui l'occupait à la date du mail.
 * Cette fenêtre présente au contraire les biens PROPOSABLES, chacun avec ses parties À CETTE DATE, et laisse en
 * cocher PLUSIEURS : un mail parle parfois de deux appartements du même propriétaire.
 *
 * 🔴 DEUX CHOIX EXPLICITES, JAMAIS DEVINÉS :
 *   · LA PORTÉE — « Ce mail uniquement » (DÉFAUT) ou « Toute la conversation ». La seconde pose le même rattachement
 *     sur les mails de l'échange qui n'ont AUCUN classement manuel, et l'écrit noir sur blanc (« 3 mails classés »).
 *     Le défaut est le geste le plus étroit : c'est le moins regrettable des deux.
 *   · LA CIBLE — un ou plusieurs biens. Celui que l'automatisation a trouvé est PRÉ-COCHÉ et marqué « Recommandé
 *     (automatique) » : jamais une coche silencieuse, on doit pouvoir savoir d'où elle vient.
 *
 * 🔴 RIEN N'EST ÉCRIT AVANT LE CLIC SUR « Valider le classement ». Ouvrir cette fenêtre, cocher, décocher, changer
 * d'avis, fermer : aucune écriture. La validation est OBLIGATOIRE et c'est le seul moment où la base bouge.
 *
 * 🔴 ELLE N'OUVRE AUCUN SECOND CHEMIN D'ÉCRITURE. Elle appelle la porte existante — `POST` et `PATCH` sur
 * `/api/admin/gestion/rattachements` — avec son journal, son auteur et sa réversibilité. Un rattachement retiré passe
 * au statut « retiré » (`PATCH`), il n'est JAMAIS supprimé.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : les types passent par `import type`, effacés à la compilation.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function ClasserMail({ messageId, filId, objet, onFerme, onFait, onGeste }: {
  messageId: number;
  /** L'échange, quand on le connaît : sans lui, la portée « toute la conversation » n'a pas de sens. */
  filId: number | null;
  objet?: string | null;
  onFerme: () => void;
  /** Appelé après une validation réussie, pour que l'écran recharge ses rattachements. */
  onFait?: () => void | Promise<void>;
  onGeste?: (message: string) => void;
}) {
  const [etat, setEtat] = useState<
    | { v: 'charge' }
    | { v: 'ok'; contexte: ContexteClassement; mailsSansManuel: number[]; existants: LienExistant[] }
    | { v: 'erreur'; message: string }
  >({ v: 'charge' });
  const [portee, setPortee] = useState<PorteeClassement>('mail');
  const [coches, setCoches] = useState<string[] | null>(null);
  const [envoi, setEnvoi] = useState<{ en_cours: boolean; message: string | null }>({ en_cours: false, message: null });

  const charger = useCallback(async () => {
    setEtat({ v: 'charge' });
    try {
      /**
       * TROIS LECTURES, EN PARALLÈLE : les biens proposables, les mails de l'échange sans classement manuel, et les
       * rattachements déjà posés. La troisième est indispensable : sans elle on reposerait ce qui est déjà là (une
       * ligne de journal pour rien) et on ne saurait pas QUOI retirer quand on décoche.
       */
      const [rc, rp, rl] = await Promise.all([
        fetch(`/api/admin/gestion/classement?message=${messageId}`, { cache: 'no-store' }),
        filId === null
          ? Promise.resolve(null)
          : fetch(`/api/admin/gestion/classement?fil=${filId}&portee=1`, { cache: 'no-store' }),
        fetch(filId === null
          ? `/api/admin/gestion/rattachements?messages=${messageId}`
          : `/api/admin/gestion/rattachements?fil=${filId}`, { cache: 'no-store' }),
      ]);

      const dc = (await rc.json()) as { etat?: string; contexte?: ContexteClassement; message?: string };
      if (dc.etat !== 'ok' || !dc.contexte) {
        setEtat({ v: 'erreur', message: dc.message ?? 'Lecture impossible.' });
        return;
      }
      const dp = rp === null ? null : ((await rp.json()) as { etat?: string; mails?: number[] });
      const dl = (await rl.json()) as {
        etat?: string; data?: LienAffiche[] | Record<string, LienAffiche[]>;
      };

      /**
       * ⚠️ ON NE RETIENT QUE LES RATTACHEMENTS VERS UN LOT. Un lien vers un PROPRIÉTAIRE ou un LOCATAIRE existe
       * aussi, et cette fenêtre ne le propose pas : le compter parmi les « existants » le ferait retirer au premier
       * décochage, alors que personne ne l'a touché.
       */
      const brut = dl.etat !== 'ok' ? [] : Array.isArray(dl.data)
        ? dl.data : Object.values(dl.data ?? {}).flat();
      const existants: LienExistant[] = brut
        .filter((l) => l.statut === 'confirme' && l.cible.sorte === 'lot' && typeof l.cible.cle === 'string')
        .map((l) => ({ id: l.id, messageId: l.messageId, cle: String(l.cible.cle) }));

      setEtat({ v: 'ok', contexte: dc.contexte, mailsSansManuel: dp?.mails ?? [messageId], existants });
      /**
       * 🔴 LA PRÉ-COCHE : le bien recommandé par l'automatisation, et ceux déjà rattachés. Elle n'est posée QU'UNE
       * FOIS, au chargement — si on la recalculait, décocher le bien recommandé le recocherait aussitôt.
       */
      setCoches(dc.contexte.biens.filter((b) => b.recommande || b.dejaRattache).map((b) => b.cle));
    } catch {
      setEtat({ v: 'erreur', message: 'La lecture des biens n’a pas abouti.' });
    }
  }, [messageId, filId]);

  useEffect(() => { void charger(); }, [charger]);

  const selection = coches ?? [];
  /** Le plan, recalculé à chaque coche : c'est LUI qui écrit la phrase du bas, jamais un compte fait à la main. */
  const plan = useMemo(() => etat.v !== 'ok' ? null : planClassement({
    messageId, portee, mailsSansManuel: etat.mailsSansManuel, selection, existants: etat.existants,
  }), [etat, messageId, portee, selection]);

  const basculer = (cle: string) => setCoches((c) => {
    const l = c ?? [];
    return l.includes(cle) ? l.filter((x) => x !== cle) : [...l, cle];
  });

  /**
   * ══ LA VALIDATION — LE SEUL MOMENT OÙ LA BASE BOUGE ═══════════════════════════════════════════════════════════
   *
   * ⚠️ UN APPEL APRÈS L'AUTRE, PAS EN PARALLÈLE. Les rattachements d'un même mail se posent dans une transaction qui
   * lit avant d'écrire (pour confirmer un candidat au lieu d'en créer un second) : deux appels concurrents sur le
   * même mail se marcheraient dessus.
   *
   * ⚠️ ON NE S'ARRÊTE PAS AU PREMIER ÉCHEC, ON LES COMPTE. S'arrêter laisserait un classement à moitié posé sans le
   * dire ; on fait donc tout ce qui peut l'être et on annonce exactement ce qui a manqué.
   */
  const valider = async () => {
    if (plan === null || (plan.aPoser.length === 0 && plan.aRetirer.length === 0)) return;
    setEnvoi({ en_cours: true, message: null });
    let faits = 0;
    const ratés: string[] = [];

    for (const p of plan.aPoser) {
      try {
        const res = await fetch('/api/admin/gestion/rattachements', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageId: p.messageId, cible: { sorte: 'lot', cle: p.cle },
            motif: portee === 'conversation' ? 'classé à la main (toute la conversation)' : 'classé à la main',
          }),
        });
        if (res.ok) faits += 1;
        else ratés.push(`mail nº ${p.messageId}`);
      } catch { ratés.push(`mail nº ${p.messageId}`); }
    }
    for (const id of plan.aRetirer) {
      try {
        const res = await fetch('/api/admin/gestion/rattachements', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lienId: id, statut: 'retire', motif: 'décoché lors du classement du mail' }),
        });
        if (res.ok) faits += 1;
        else ratés.push(`retrait nº ${id}`);
      } catch { ratés.push(`retrait nº ${id}`); }
    }

    setEnvoi({ en_cours: false, message: null });
    if (ratés.length > 0) {
      setEnvoi({
        en_cours: false,
        message: `${faits} geste(s) enregistré(s), ${ratés.length} en échec (${ratés.slice(0, 3).join(', ')}).`,
      });
      await charger();
      return;
    }
    onGeste?.(plan.resume);
    await onFait?.();
    onFerme();
  };

  const contexte = etat.v === 'ok' ? etat.contexte : null;
  /** La portée élargie n'a de sens que s'il y a un AUTRE mail à classer dans l'échange. Sinon elle est désactivée. */
  const autresMails = etat.v === 'ok' ? etat.mailsSansManuel.filter((m) => m !== messageId).length : 0;

  return (
    <div className="mrt-voile" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onFerme(); }}>
      <style>{CSS_MODIFIER_RATTACHEMENT}</style>
      <style>{CSS_CLASSER_MAIL}</style>
      <div className="mrt clm" role="dialog" aria-modal="true" aria-labelledby="clm-titre"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onFerme(); } }}>
        <h2 className="mrt-titre" id="clm-titre">Classer ce mail</h2>
        {objet && <p className="clm-objet">{objet}</p>}

        {etat.v === 'charge' && <p className="gst-info" role="status">Lecture des biens possibles…</p>}
        {etat.v === 'erreur' && <p className="gst-tronc" role="alert">{etat.message}</p>}

        {/* ⚠️ L'ANNUAIRE OU LA MIGRATION ABSENTS SONT UN ÉTAT, PAS UNE PANNE : on le DIT. Une liste vide se lirait
            « aucun bien ne correspond », ce qui serait faux. */}
        {contexte && !contexte.disponible && (
          <p className="gst-tronc">
            Le classement n’est pas encore installé sur cette base (annuaire des biens ou mise à jour 257 à appliquer).
          </p>
        )}

        {contexte?.disponible && (
          <>
            <p className="clm-date">
              {contexte.dateMail
                ? <>Mail du <strong>{contexte.dateMail.slice(0, 10).split('-').reverse().join('/')}</strong>{' '}
                  — les parties affichées sont celles de <strong>cette date</strong>.</>
                : 'Date du mail inconnue : les parties affichées sont celles d’aujourd’hui.'}
            </p>

            {/* ══ 🔴 LA PORTÉE — UN CHOIX EXPLICITE, « ce mail » PAR DÉFAUT ═══════════════════════════════════════ */}
            <fieldset className="clm-bloc">
              <legend className="clm-legende">Portée</legend>
              <label className="clm-choix">
                <input type="radio" name="clm-portee" checked={portee === 'mail'}
                  onChange={() => setPortee('mail')} />
                <span>Ce mail uniquement</span>
              </label>
              <label className={`clm-choix${autresMails === 0 ? ' clm-choix--inactif' : ''}`}>
                <input type="radio" name="clm-portee" checked={portee === 'conversation'}
                  disabled={autresMails === 0} onChange={() => setPortee('conversation')} />
                <span>
                  Toute la conversation
                  {autresMails === 0
                    ? ' — aucun autre mail de l’échange n’est à classer'
                    : ` — ${autresMails + 1} mails sans classement posé à la main`}
                </span>
              </label>
              {/* On DIT ce que la portée élargie ne fait pas : elle ajoute, elle ne défait rien ailleurs. */}
              {portee === 'conversation' && (
                <p className="clm-note">
                  Les mails déjà classés à la main par quelqu’un restent intacts ; un retrait ne porte que sur ce mail.
                </p>
              )}
            </fieldset>

            {/* ══ 🔴 LA CIBLE — UN OU PLUSIEURS BIENS, AVEC LEURS PARTIES À LA DATE DU MAIL ═════════════════════ */}
            <fieldset className="clm-bloc">
              <legend className="clm-legende">
                Bien concerné
                {contexte.proprietaire && <> — biens de <strong>{contexte.proprietaire.nom}</strong></>}
              </legend>
              {contexte.biens.length === 0 && (
                <p className="clm-note">
                  Aucun bien ne se rattache automatiquement à ce mail. Le sélecteur de cible complet reste disponible
                  depuis le bandeau « Rattaché à » du message.
                </p>
              )}
              <ul className="clm-biens">
                {contexte.biens.map((b) => (
                  <li key={b.cle} className="clm-bien">
                    <label className="clm-choix">
                      <input type="checkbox" checked={selection.includes(b.cle)} onChange={() => basculer(b.cle)} />
                      <span className="clm-bien-nom">{b.libelle}</span>
                    </label>
                    {/* 🔴 LE MOT EST ÉCRIT : on doit savoir POURQUOI une case est cochée. */}
                    <p className="clm-marques">
                      {b.recommande && <span className="clm-marque clm-marque--reco">Recommandé (automatique)</span>}
                      {b.dejaRattache && <span className="clm-marque">déjà rattaché à ce mail</span>}
                      {b.typeBien && <span className="clm-marque clm-marque--muet">{b.typeBien}</span>}
                    </p>
                    <ul className="clm-parties">
                      {b.parties.length === 0 && <li className="clm-partie">aucune partie connue à cette date</li>}
                      {b.parties.map((p) => (
                        <li key={`${p.role}|${p.cle}`} className="clm-partie">
                          <span className="clm-role">{p.role === 'proprietaire' ? 'propriétaire' : 'locataire'}</span>
                          {' '}{p.nom}
                          {p.depuis && <span className="clm-periode"> — depuis le {p.depuis}</span>}
                          {p.jusqua && <span className="clm-periode"> jusqu’au {p.jusqua}</span>}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </fieldset>

            {/* ══ CE QUE LA VALIDATION VA FAIRE, DIT AVANT DE LA FAIRE ══════════════════════════════════════════ */}
            {plan && <p className="clm-resume" role="status">{plan.resume}</p>}
          </>
        )}

        {envoi.message && <p className="gst-tronc" role="alert">{envoi.message}</p>}

        <div className="mrt-boutons">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFerme} disabled={envoi.en_cours}>
            Annuler
          </button>
          <button type="button" className="svv-btn gst-btn" onClick={() => void valider()}
            disabled={envoi.en_cours || plan === null || (plan.aPoser.length === 0 && plan.aRetirer.length === 0)}>
            {envoi.en_cours ? 'Enregistrement…' : 'Valider le classement'}
          </button>
        </div>
      </div>
    </div>
  );
}

export const CSS_CLASSER_MAIL = `
.clm{max-width:44rem}
.clm-objet{margin:-6px 0 8px;font-size:.85rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
.clm-date{margin:0 0 10px;font-size:.82rem;color:var(--color-svv-ink)}
.clm-bloc{margin:0 0 12px;padding:10px 12px;border:1px solid var(--color-svv-line);border-radius:10px;min-width:0}
.clm-legende{padding:0 .3rem;font-size:.78rem;font-weight:700;color:var(--color-svv-muted)}
.clm-choix{display:flex;align-items:flex-start;gap:.5rem;min-height:32px;padding:.15rem 0;font-size:.88rem;
  color:var(--color-svv-ink);cursor:pointer}
.clm-choix input{margin-top:.25rem;flex:0 0 auto}
.clm-choix--inactif{color:var(--color-svv-muted);cursor:default}
.clm-note{margin:.3rem 0 0;font-size:.78rem;color:var(--color-svv-muted)}
.clm-biens{display:flex;flex-direction:column;gap:8px;margin:.3rem 0 0;padding:0;list-style:none}
.clm-bien{padding:8px 10px;border:1px solid var(--color-svv-line);border-radius:.6rem;
  background:var(--color-svv-surface);min-width:0}
.clm-bien-nom{font-weight:600;overflow-wrap:anywhere}
.clm-marques{display:flex;flex-wrap:wrap;gap:6px;margin:.2rem 0 0 1.6rem}
.clm-marque{padding:.05rem .4rem;border-radius:999px;border:1px solid var(--color-svv-line-strong);
  font-size:.7rem;font-weight:700;color:var(--color-svv-muted)}
.clm-marque--reco{color:var(--color-svv-green-ink);border-color:var(--color-svv-green-ink)}
.clm-marque--muet{font-weight:400}
.clm-parties{display:flex;flex-direction:column;gap:2px;margin:.35rem 0 0 1.6rem;padding:0;list-style:none}
.clm-partie{font-size:.8rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.clm-role{font-size:.72rem;font-weight:700;letter-spacing:.03em;color:var(--color-svv-muted)}
.clm-role::after{content:' :'}
.clm-periode{color:var(--color-svv-muted)}
.clm-resume{margin:0 0 12px;padding:8px 10px;border-radius:8px;border:1px solid var(--color-svv-line);
  background:var(--color-svv-field);font-size:.85rem;font-weight:600;color:var(--color-svv-ink)}
`;
