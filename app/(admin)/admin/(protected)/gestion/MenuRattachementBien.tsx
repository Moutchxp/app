'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { planClassement } from '../../../../lib/gestion/gesteClassement';
import { groupesParProprietaire } from '../../../../lib/gestion/ficheBien';
import { messageAucunBien, motRaison, sansLesProposes } from '../../../../lib/gestion/rechercheBien';
import { ColonneBien, ColonneLocataires, CartePersonne, CSS_PROPOSITIONS_BIENS } from './PropositionsDeBiens';
import { CSS_BOUTON_COPIER } from './BoutonCopier';
import type { BienProposable, ContexteClassement } from '../../../../lib/gestion/classementBien';
import type { BienTrouve } from '../../../../lib/gestion/rechercheBienRepo';

/**
 * 🔴 LOT BIEN-RATTACHE — LE MENU DE RATTACHEMENT À UN BIEN, UNE SEULE ENTRÉE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'IL FUSIONNE, ET POURQUOI. Il y avait DEUX portes pour la même question : le bloc des propositions, ouvert
 * en permanence, et « + Rattacher à… », qui dépliait un autre sélecteur ailleurs dans la page. On cochait dans l'un,
 * on validait dans l'autre, et l'on ne savait plus lequel comptait. Demande d'Arno : une seule entrée, un seul
 * menu, une seule validation.
 *
 * L'ORDRE DU MENU EST CELUI DE LA CONFIANCE :
 *   ① LES PROPOSITIONS DE L'AUTOMATISATION, en haut, avec leur fiche complète (bien, propriétaire, locataire à la
 *      date du mail, certitude, motif, pré-coche). Aucune proposition ⇒ la zone ne s'affiche pas du tout.
 *   ② LA RECHERCHE LIBRE, en dessous, pour ajouter ce que l'automatisation n'a pas vu.
 *   ③ UNE SEULE VALIDATION pour les deux zones, avec la portée et « Hors gestion ».
 *
 * 🔴 LES RÉSULTATS DE RECHERCHE SONT DES BIENS, JAMAIS DES PERSONNES. Chercher « MARTY » rend SES biens. Et un bien
 * déjà présent dans les propositions n'est pas répété plus bas : la même ligne deux fois, avec deux cases, c'est
 * une case qu'on oublie de cocher.
 *
 * 🔴 RIEN N'EST ÉCRIT AVANT « Rattacher ». Ouvrir, chercher, cocher, décocher, refermer : aucune écriture.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : les types passent par `import type`, effacés à la compilation.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function MenuRattachementBien({ messageId, filId, onFerme, onGeste, onChange, onHorsGestion }: {
  messageId: number;
  filId: number | null;
  onFerme: () => void;
  onGeste?: (message: string) => void;
  onChange: () => void | Promise<void>;
  /** Ouvre LA fenêtre de classement, qui porte « Hors gestion » et le classement par pièce. */
  onHorsGestion: () => void;
}) {
  const [etat, setEtat] = useState<
    { v: 'charge' } | { v: 'ok'; contexte: ContexteClassement } | { v: 'rien' }
  >({ v: 'charge' });
  const [coches, setCoches] = useState<string[]>([]);
  const [portee, setPortee] = useState<'mail' | 'conversation'>('mail');
  const [envoi, setEnvoi] = useState<{ en_cours: boolean; erreur: string | null }>(
    { en_cours: false, erreur: null });

  // ── LA RECHERCHE ────────────────────────────────────────────────────────────────────────────────────────────
  const [saisie, setSaisie] = useState('');
  const [resultats, setResultats] = useState<{ lignes: BienTrouve[]; tronque: boolean } | null>(null);
  const [cherche, setCherche] = useState(false);
  const champ = useRef<HTMLInputElement | null>(null);

  const charger = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/gestion/classement?message=${messageId}`, { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string; contexte?: ContexteClassement };
      if (d.etat !== 'ok' || !d.contexte || !d.contexte.disponible) { setEtat({ v: 'rien' }); return; }
      setEtat({ v: 'ok', contexte: d.contexte });
      /** 🔴 LA PRÉ-COCHE VIENT DU MOTEUR, et n'est posée QU'UNE FOIS : la recalculer recocherait ce qu'on décoche. */
      setCoches((d.contexte.biens ?? []).filter((b) => b.recommande).map((b) => b.cle));
    } catch {
      setEtat({ v: 'rien' });
    }
  }, [messageId]);

  useEffect(() => { void charger(); }, [charger]);
  useEffect(() => { champ.current?.focus(); }, []);

  const contexte = etat.v === 'ok' ? etat.contexte : null;
  const propositions: BienProposable[] = contexte?.biens ?? [];
  const dateMail = contexte?.dateMail ?? null;

  /**
   * LA RECHERCHE, TEMPORISÉE (250 ms) : on interroge quand la frappe s'arrête, pas à chaque lettre.
   *
   * ⚠️ `annule` COUVRE LES DEUX CAS : composant démonté, et réponse PÉRIMÉE — une réponse lente à « vic » ne doit
   * pas écraser les résultats de « victor hugo ». C'est la même précaution que dans `ChoisirEvenement`.
   */
  useEffect(() => {
    if (saisie.trim().length < 2) { setResultats(null); return undefined; }
    let annule = false;
    setCherche(true);
    const minuteur = setTimeout(() => {
      void (async () => {
        try {
          const p = new URLSearchParams({ q: saisie });
          if (dateMail !== null) p.set('date', dateMail);
          const res = await fetch(`/api/admin/gestion/biens?${p}`, { cache: 'no-store' });
          const d = (await res.json()) as { etat?: string; lignes?: BienTrouve[]; tronque?: boolean };
          if (annule) return;
          setResultats(d.etat === 'ok' ? { lignes: d.lignes ?? [], tronque: d.tronque === true } : { lignes: [], tronque: false });
        } catch {
          if (!annule) setResultats({ lignes: [], tronque: false });
        } finally {
          if (!annule) setCherche(false);
        }
      })();
    }, 250);
    return () => { annule = true; clearTimeout(minuteur); setCherche(false); };
  }, [saisie, dateMail]);

  /** 🔴 UN BIEN DÉJÀ PROPOSÉ N'EST PAS RÉPÉTÉ EN BAS : deux cases pour un bien, c'est une case oubliée. */
  const trouves = sansLesProposes(resultats?.lignes ?? [], propositions.map((b) => b.cle));

  const basculer = (cle: string) => setCoches((c) => (c.includes(cle) ? c.filter((x) => x !== cle) : [...c, cle]));

  /** Le plan des DEUX zones réunies : c'est lui qui écrit la phrase, jamais un compte fait à la main. */
  const plan = planClassement({
    messageId, portee,
    mailsSansManuel: [messageId, ...(contexte?.filId !== null && portee === 'conversation' ? [] : [])],
    selection: coches, existants: [],
  });
  const aFaire = coches.length > 0;

  const valider = async () => {
    if (!aFaire) return;
    setEnvoi({ en_cours: true, erreur: null });
    /**
     * ⚠️ LA PORTÉE « TOUTE LA CONVERSATION » PASSE PAR LA MÊME PORTE, avec la liste des mails que le serveur a
     * donnée. On ne la recalcule pas ici : le serveur seul sait quels mails n'ont aucun classement manuel.
     */
    let mails: number[] = [messageId];
    if (portee === 'conversation' && filId !== null) {
      try {
        const res = await fetch(`/api/admin/gestion/classement?fil=${filId}&portee=1`, { cache: 'no-store' });
        const d = (await res.json()) as { etat?: string; mails?: number[] };
        if (d.etat === 'ok') mails = [...new Set([messageId, ...(d.mails ?? [])])];
      } catch { /* on retombe sur le mail ouvert : le geste le plus étroit est le moins regrettable */ }
    }

    let faits = 0;
    const ratés: string[] = [];
    for (const m of mails) {
      for (const cle of coches) {
        try {
          const res = await fetch('/api/admin/gestion/rattachements', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messageId: m, cible: { sorte: 'lot', cle },
              motif: portee === 'conversation' ? 'rattaché à la main (toute la conversation)' : 'rattaché à la main',
            }),
          });
          if (res.ok) faits += 1; else ratés.push(`${cle} / mail ${m}`);
        } catch { ratés.push(`${cle} / mail ${m}`); }
      }
    }
    setEnvoi({
      en_cours: false,
      erreur: ratés.length === 0 ? null : `${faits} rattachement(s) posé(s), ${ratés.length} en échec.`,
    });
    if (ratés.length === 0) {
      onGeste?.(`${mails.length} mail${mails.length > 1 ? 's' : ''} rattaché${mails.length > 1 ? 's' : ''}`
        + ` à ${coches.length} bien${coches.length > 1 ? 's' : ''}.`);
      await onChange();
      onFerme();
    }
  };

  const fige = envoi.en_cours;

  return (
    <div className="mrb">
      <style>{CSS_PROPOSITIONS_BIENS}</style>
      <style>{CSS_BOUTON_COPIER}</style>
      <style>{CSS_MENU_RATTACHEMENT}</style>

      {etat.v === 'charge' && <p className="gst-info" role="status">Lecture des biens possibles…</p>}

      {/* ══ ① LES PROPOSITIONS DE L'AUTOMATISATION — absentes s'il n'y en a aucune ═══════════════════════════ */}
      {propositions.length > 0 && (
        <>
          <p className="mrb-titre">
            {propositions.length === 1 ? 'Une proposition de l’automatisation' : `${propositions.length} propositions de l’automatisation`}
            {contexte?.examen && <span className="pdb-examen"> — {contexte.examen.motif}</span>}
          </p>
          {groupesParProprietaire(propositions).map((g, i) => (
            <section className="pdb-groupe" key={g.cle === '' ? `sans-${i}` : g.cle}>
              <div className="pdb-proprios">
                <p className="pdb-groupe-titre">{g.personnes.length > 1 ? 'Propriétaires' : 'Propriétaire'}</p>
                {g.personnes.length === 0
                  ? <p className="pdb-vide">Aucun propriétaire à l’annuaire pour ce bien.</p>
                  : <ul className="pdb-cartes">
                    {g.personnes.map((p) => <CartePersonne key={`${p.role}|${p.cle}`} personne={p} />)}
                  </ul>}
              </div>
              <ul className="pdb-liste">
                {g.biens.map((b) => (
                  <li key={b.cle} className="pdb-item">
                    <div className="pdb-deux">
                      <ColonneBien bien={b} coche={coches.includes(b.cle)} fige={fige}
                        onBasculer={() => basculer(b.cle)} />
                      <ColonneLocataires bien={b} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      {/* ══ ② LA RECHERCHE LIBRE — pour ajouter ce que l'automatisation n'a pas vu ════════════════════════════ */}
      <p className="mrb-titre">Chercher un autre bien</p>
      <label className="mrb-champ">
        <span className="svv-label">Adresse, nom (propriétaire ou locataire, même passé), téléphone ou e-mail</span>
        <input ref={champ} className="mrb-saisie" type="search" value={saisie} autoComplete="off" maxLength={120}
          placeholder="ex. « 4 victor hugo », « MARTY », « 06 03 05 07 03 », « nom@exemple.fr »"
          onChange={(e) => setSaisie(e.target.value)} />
      </label>

      {cherche && <p className="gst-info" role="status">Recherche…</p>}
      {!cherche && resultats !== null && trouves.length === 0 && (
        // 🔴 ON DIT CE QU'ON A CHERCHÉ : « aucun résultat » tout court se lit comme une panne.
        <p className="pdb-vide">{messageAucunBien(saisie)}</p>
      )}

      {trouves.length > 0 && (
        <ul className="pdb-liste mrb-resultats">
          {trouves.map((b) => (
            <li key={b.cle} className="pdb-item">
              <div className="pdb-deux">
                {/* Le MÊME rendu que les propositions : c'est le même objet, il doit se reconnaître. */}
                <ColonneBien fige={fige} coche={coches.includes(b.cle)} onBasculer={() => basculer(b.cle)}
                  bien={{
                    cle: b.cle, libelle: b.libelle, adresse: null, commune: null, typeBien: b.typeBien,
                    adresseComplete: b.adresse,
                    caracteristiques: [
                      ...(b.nature ? [{ libelle: 'Nature', valeur: b.nature }] : []),
                      ...(b.typeBien ? [{ libelle: 'Type', valeur: b.typeBien }] : []),
                    ],
                    parties: b.parties, recommande: false, dejaRattache: false,
                    // 🔴 LA RAISON DE LA CORRESPONDANCE, EN CLAIR : sans elle, on ne sait pas pourquoi c'est là.
                    motif: `trouvé par ${b.raisons.map(motRaison).join(' · ')}`,
                    cas: 'd', certitude: 'a_trancher',
                  }} />
                <ColonneLocataires bien={{
                  cle: b.cle, libelle: b.libelle, adresse: null, commune: null, typeBien: b.typeBien,
                  adresseComplete: b.adresse, caracteristiques: [], parties: b.parties,
                  recommande: false, dejaRattache: false, motif: '', cas: 'd', certitude: 'a_trancher',
                }} />
              </div>
              {/* 🔴 LA SOUS-LIGNE DEMANDÉE PAR ARNO, sur UNE ligne : « Propriétaire : … · Locataire : … ». Les
                  deux colonnes donnent le détail ; celle-ci donne le couple d'un coup d'œil, pour trancher sans
                  lire. « vacant » est une réponse — un blanc n'en est pas une. */}
              <p className="mrb-couple">
                <span className="pdb-role">Propriétaire :</span>{' '}
                {b.parties.find((p) => p.role === 'proprietaire')?.nom ?? '(inconnu)'}
                <span className="pdb-sep" aria-hidden="true"> · </span>
                <span className="pdb-role">Locataire :</span>{' '}
                {b.parties.filter((p) => p.role === 'locataire').map((p) => p.nom).join(', ')
                  || 'vacant à cette date'}
              </p>
            </li>
          ))}
        </ul>
      )}
      {resultats?.tronque && (
        <p className="pdb-vide">Seuls les premiers biens sont affichés — précisez votre recherche.</p>
      )}

      {/* ══ ③ UNE SEULE VALIDATION POUR LES DEUX ZONES ═══════════════════════════════════════════════════════ */}
      <fieldset className="mrb-portee">
        <legend className="pdb-groupe-titre">Portée</legend>
        <label className="mrb-choix">
          <input type="radio" name="mrb-portee" checked={portee === 'mail'} onChange={() => setPortee('mail')} />
          <span>Ce mail uniquement</span>
        </label>
        <label className={`mrb-choix${filId === null ? ' mrb-choix--inactif' : ''}`}>
          <input type="radio" name="mrb-portee" checked={portee === 'conversation'} disabled={filId === null}
            onChange={() => setPortee('conversation')} />
          <span>Toute la conversation{filId === null ? ' — échange inconnu' : ''}</span>
        </label>
      </fieldset>

      <div className="pdb-boutons">
        <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={fige || !aFaire}
          onClick={() => void valider()}>
          {fige ? 'Enregistrement…' : 'Rattacher'}
        </button>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={fige} onClick={onFerme}>
          Annuler
        </button>
        {/* « Hors gestion » reste accessible d'ici, par LA fenêtre de classement — une seule implémentation. */}
        <button type="button" className="gst-lien-bouton" disabled={fige} onClick={onHorsGestion}>
          Hors gestion, ou classer par pièce…
        </button>
        <span className="pdb-resume" role="status">
          {aFaire ? plan.resume : 'Aucun bien coché : rien ne sera rattaché.'}
        </span>
      </div>

      {envoi.erreur !== null && <p className="gst-tronc" role="alert">{envoi.erreur}</p>}
    </div>
  );
}

export const CSS_MENU_RATTACHEMENT = `
/* Le menu est le VOISIN IMMEDIAT de la ligne qui l'ouvre : un panneau qui s'ouvre en bas de page apparait hors
   du regard. Un liseré à gauche le rattache visuellement à sa ligne. */
.mrb{margin:6px 0 10px;padding:8px 10px;border:1px solid var(--color-svv-line);border-left:3px solid
  var(--color-svv-line-strong);border-radius:.6rem;background:var(--color-svv-field);min-width:0}
.mrb-titre{margin:.4rem 0 .3rem;font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-muted)}
.mrb-titre:first-child{margin-top:0}
.mrb-champ{display:flex;flex-direction:column;gap:.2rem;min-width:0}
.mrb-saisie{min-height:40px;padding:.3rem .5rem;font:inherit;font-size:.9rem;color:var(--color-svv-ink);
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.4rem;min-width:0}
.mrb-saisie:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.mrb-resultats{margin-top:6px;border-top:1px solid var(--color-svv-line)}
.mrb-resultats .pdb-item{border-top:0}
.mrb-couple{margin:0;padding:0 10px 8px;font-size:.8rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.mrb-portee{margin:8px 0;padding:6px 10px;border:1px solid var(--color-svv-line);border-radius:.6rem;min-width:0}
.mrb-choix{display:flex;align-items:center;gap:.5rem;min-height:32px;font-size:.85rem;color:var(--color-svv-ink);
  cursor:pointer}
.mrb-choix--inactif{color:var(--color-svv-muted);cursor:default}
`;
