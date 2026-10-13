'use client';

import { useEffect, useRef, useState } from 'react';
import {
  cleRappel, dateLisibleTache, erreurSaisie, jourParisDe, motRappel, phraseTrace, rappelsParDefaut, rappelsProposes,
  type Rappel,
} from '../../../../lib/gestion/taches';
import { blocContacts, type ContactSource } from '../../../../lib/gestion/contactsTache';
import {
  agirSurTache, creerTache, lireCollaborateurs, lireContactsDuBien, lireDetailTache, lireEvenementsDuBien,
  type CollaborateurEcran, type DetailTache, type SaisieEcran,
} from './tachesClient';
import { CSS_TACHES } from './LigneTache';
import { ChoixContacts, ContactsAffiches, CSS_CONTACTS_TACHE, type ContactPropose } from './ContactsTache';

/**
 * ══ 🔴🔴 LOT TACHES-1 — LA FENÊTRE D'UNE TÂCHE : CRÉER, ET LE DÉTAIL (MODIFIER, ANNULER, ROUVRIR) ═══════════════
 *
 * Arno : « Le bouton ouvre une fenêtre de création : objet, date, heure facultative, personne à qui elle est
 * confiée (moi par défaut), note libre, événement du bien lié (facultatif), rappels. » et « Modifier et Annuler
 * restent accessibles dans le détail de la tâche. »
 *
 * 🔴 UNE SEULE FENÊTRE POUR LES DEUX : le formulaire de création EST celui de la modification. Deux formulaires
 * finiraient par ne plus proposer les mêmes champs.
 *
 * 🔴 RAPPELS PAR DÉFAUT D'ARNO : rendez-vous (avec heure) = la veille + 1 h avant ; repère (sans heure) = le jour
 * même à 9 h. Ajouter ou retirer l'heure remet les rappels par défaut de la nouvelle nature — un « 1 h avant » n'a
 * pas de sens sur un repère de la journée.
 *
 * 🔴 ANNULER DEMANDE UNE CONFIRMATION, DANS LA FENÊTRE (pas de boîte du navigateur) ; une tâche annulée reste en
 * base, grisée, avec sa trace — et « Rouvrir » la remet à faire.
 *
 * ══ 🔴🔴 LOT TACHES-1-BIS — LES CONTACTS DU BIEN DANS LA TÂCHE ═══════════════════════════════════════════════════
 * Section « Contacts de la tâche » entre « Événement du bien lié » et « Rappels » (aucun coché par défaut). Sous la
 * note, l'aperçu du bloc « Contacts » GÉNÉRÉ : il se refait à chaque case, et la note n'est jamais touchée. Dans le
 * détail, les contacts copiés avec leurs liens (tel:, Nouveau message) et « Mettre à jour » quand la fiche a changé.
 * Sans la migration 347 (contacts illisibles), rien de tout cela ne s'affiche : la fenêtre est celle du lot 1.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
export type ModeFenetre =
  | { sorte: 'creer'; lotId: number; lotCle: string; adresse: string }
  | { sorte: 'detail'; id: number };

export function FenetreTache({ mode, onFermer, onEcrire }: {
  mode: ModeFenetre;
  onFermer: () => void;
  /** Ouvre le composeur « Nouveau message » avec l'adresse pré-remplie. Rien n'est envoyé. Absent ⇒ adresse en texte. */
  onEcrire?: (email: string) => void;
}) {
  const [collab, setCollab] = useState<{ liste: CollaborateurEcran[]; moi: number | null } | null>(null);
  const [detail, setDetail] = useState<DetailTache | null>(null);
  /** 🔴 LOT TACHES-1-BIS — les contacts du bien (fiche d'aujourd'hui) ; `null` ⇒ section absente. */
  const [sources, setSources] = useState<ContactSource[] | null>(null);
  const [choisis, setChoisis] = useState<string[]>([]);
  const [evenements, setEvenements] = useState<{ id: number; reference: string; objet: string; ouvert: boolean }[]>([]);
  const [saisie, setSaisie] = useState<SaisieEcran>(() => ({
    objet: '', jour: jourParisDe(new Date()), heure: null, note: '', confieeA: null, evenementId: null,
    rappels: rappelsParDefaut(false),
  }));
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [confirmerAnnulation, setConfirmerAnnulation] = useState(false);
  const [version, setVersion] = useState(0);
  const premier = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let annule = false;
    void (async () => {
      const c = await lireCollaborateurs();
      if (annule) return;
      setCollab(c === null ? { liste: [], moi: null } : { liste: c.collaborateurs, moi: c.moi });
      if (mode.sorte === 'creer' && c !== null) {
        // MOI PAR DÉFAUT — si j'ai un compte avec l'accès Gestion ; sinon le premier de la liste.
        const moi = c.collaborateurs.find((x) => x.id === c.moi)?.id ?? c.collaborateurs[0]?.id ?? null;
        setSaisie((s) => ({ ...s, confieeA: s.confieeA ?? moi }));
      }
    })();
    return () => { annule = true; };
  }, [mode.sorte]);

  useEffect(() => {
    if (mode.sorte !== 'detail') return;
    let annule = false;
    void (async () => {
      const d = await lireDetailTache(mode.id);
      if (annule) return;
      setDetail(d);
      if (d !== null && version === 0) {
        const t = d.tache;
        setSaisie({
          objet: t.objet, jour: t.jour, heure: t.heure, note: t.note ?? '', confieeA: t.confieeA,
          evenementId: t.evenement?.id ?? null, rappels: t.rappels,
        });
        setChoisis(d.contacts.map((c) => c.cle));
      }
    })();
    return () => { annule = true; };
    // `version` relit le détail (trace comprise) après un geste, sans écraser une saisie en cours.
  }, [mode, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const lotCle = mode.sorte === 'creer' ? mode.lotCle : detail?.tache.lotCle ?? null;
  useEffect(() => {
    if (lotCle === null) return;
    let annule = false;
    void lireEvenementsDuBien(lotCle).then((e) => { if (!annule) setEvenements(e); });
    return () => { annule = true; };
  }, [lotCle]);

  const lotId = mode.sorte === 'creer' ? mode.lotId : detail?.tache.lotId ?? null;
  useEffect(() => {
    if (lotId === null) return;
    let annule = false;
    void lireContactsDuBien(lotId).then((c) => { if (!annule) setSources(c); });
    return () => { annule = true; };
  }, [lotId, version]);

  useEffect(() => { premier.current?.focus(); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onFermer]);

  const tache = detail?.tache ?? null;
  const terminee = tache !== null && tache.etat !== 'a_faire';
  const lectureSeule = mode.sorte === 'detail' && (tache === null || terminee);

  const changerHeure = (h: string) => setSaisie((s) => {
    const heure = h === '' ? null : h;
    // Changer de NATURE (journée ↔ rendez-vous) remet les rappels par défaut de la nouvelle nature.
    const rappels = (heure === null) !== (s.heure === null) ? rappelsParDefaut(heure !== null) : s.rappels;
    return { ...s, heure, rappels };
  });

  const basculerRappel = (r: Rappel) => setSaisie((s) => {
    const k = cleRappel(r);
    const deja = s.rappels.some((x) => cleRappel(x) === k);
    return { ...s, rappels: deja ? s.rappels.filter((x) => cleRappel(x) !== k) : [...s.rappels, r] };
  });

  /* 🔴 LOT TACHES-1-BIS — ce qu'on propose à la case : la fiche d'aujourd'hui, PLUS les contacts déjà copiés qui n'y
     sont plus (syndic changé, locataire sorti) — leur copie reste lisible et décochable, rien ne s'efface. */
  const copies = detail?.contacts ?? [];
  const proposes: ContactPropose[] = sources === null ? [] : [
    ...sources,
    ...copies.filter((c) => !sources.some((x) => x.cle === c.cle)).map((c) => ({ ...c, plusLie: true })),
  ];
  /* Le bloc « Contacts » tel qu'il sera écrit : la COPIE pour un contact déjà dans la tâche, la fiche sinon. */
  const pourLeBloc = choisis
    .map((cle) => copies.find((c) => c.cle === cle) ?? sources?.find((c) => c.cle === cle))
    .filter((c): c is ContactSource => c !== undefined);
  const basculerContact = (cle: string) =>
    setChoisis((l) => (l.includes(cle) ? l.filter((x) => x !== cle) : [...l, cle]));

  const enregistrer = async () => {
    const erreur = erreurSaisie(saisie);
    if (erreur !== null) { setMessage({ ok: false, texte: erreur }); return; }
    setOccupe(true);
    setMessage(null);
    // Les contacts ne voyagent que si la section existe : sans elle, ils ne sont pas touchés.
    const envoi: SaisieEcran = sources === null ? saisie : { ...saisie, contacts: choisis };
    const r = mode.sorte === 'creer'
      ? await creerTache(mode.lotId, envoi)
      : await agirSurTache(mode.id, { geste: 'modifier', ...envoi });
    setOccupe(false);
    if (!r.ok) { setMessage({ ok: false, texte: r.message }); return; }
    if (mode.sorte === 'creer') { onFermer(); return; }
    setMessage({ ok: true, texte: r.message });
    setVersion((v) => v + 1);
  };

  const mettreAJour = async (cle: string) => {
    if (mode.sorte !== 'detail') return;
    setOccupe(true);
    setMessage(null);
    const r = await agirSurTache(mode.id, { geste: 'actualiserContact', cle });
    setOccupe(false);
    setMessage({ ok: r.ok, texte: r.message });
    if (r.ok) setVersion((v) => v + 1);
  };
  const ecrire = onEcrire === undefined ? undefined : (email: string) => { onFermer(); onEcrire(email); };

  const geste = async (g: 'annuler' | 'rouvrir') => {
    setOccupe(true);
    setMessage(null);
    const r = await agirSurTache((mode as { id: number }).id, { geste: g });
    setOccupe(false);
    setConfirmerAnnulation(false);
    setMessage({ ok: r.ok, texte: r.message });
    if (r.ok) setVersion((v) => v + 1);
  };

  const titre = mode.sorte === 'creer' ? 'Nouvelle tâche' : 'Tâche';
  const adresse = mode.sorte === 'creer' ? mode.adresse : tache?.adresseBien ?? '';

  return (
    <div className="tchf-voile" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <style>{CSS_TACHES}{CSS_FENETRE}{CSS_CONTACTS_TACHE}</style>
      <div className="tchf" role="dialog" aria-modal="true" aria-labelledby="tchf-titre">
        <header className="tchf-tete">
          <h2 className="tchf-titre" id="tchf-titre">
            {titre}
            {adresse !== '' && <span className="tchf-adresse"> — {adresse}</span>}
          </h2>
          <button type="button" className="tchf-croix" onClick={onFermer} aria-label="Fermer">×</button>
        </header>

        {mode.sorte === 'detail' && detail === null && <p className="tch-vide">Lecture de la tâche…</p>}
        {terminee && tache !== null && (
          <p className="tchf-etat">
            {tache.etat === 'faite' ? 'Faite' : 'Annulée'} — {dateLisibleTache(tache.jour, tache.heure)}
          </p>
        )}

        <div className="tchf-corps">
          <label className="tchf-champ">
            <span className="tch-etiquette">Objet</span>
            <input ref={premier} type="text" value={saisie.objet} maxLength={300} disabled={lectureSeule}
              onChange={(e) => setSaisie((s) => ({ ...s, objet: e.target.value }))} />
          </label>
          <div className="tchf-rangee">
            <label className="tchf-champ">
              <span className="tch-etiquette">Date</span>
              <input type="date" value={saisie.jour} disabled={lectureSeule}
                onChange={(e) => setSaisie((s) => ({ ...s, jour: e.target.value }))} />
            </label>
            <label className="tchf-champ">
              <span className="tch-etiquette">Heure (facultative)</span>
              <input type="time" value={saisie.heure ?? ''} disabled={lectureSeule}
                onChange={(e) => changerHeure(e.target.value)} />
            </label>
          </div>
          <p className="tchf-aide">
            {saisie.heure === null ? 'Sans heure : repère sur la journée.' : 'Avec heure : rendez-vous.'}
          </p>
          <label className="tchf-champ">
            <span className="tch-etiquette">Confiée à</span>
            <select value={saisie.confieeA ?? ''} disabled={lectureSeule || collab === null}
              onChange={(e) => setSaisie((s) => ({ ...s, confieeA: e.target.value === '' ? null : Number(e.target.value) }))}>
              {saisie.confieeA === null && <option value="">— choisir —</option>}
              {(collab?.liste ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.libelle}{c.id === collab?.moi ? ' (moi)' : ''}</option>
              ))}
              {/* Une tâche confiée à quelqu'un qui n'a plus l'accès reste lisible : son nom figé. */}
              {tache !== null && tache.confieeA !== null && !(collab?.liste ?? []).some((c) => c.id === tache.confieeA) && (
                <option value={tache.confieeA}>{tache.confieeALibelle}</option>
              )}
            </select>
          </label>
          <label className="tchf-champ">
            <span className="tch-etiquette">Événement du bien lié (facultatif)</span>
            <select value={saisie.evenementId ?? ''} disabled={lectureSeule}
              onChange={(e) => setSaisie((s) => ({ ...s, evenementId: e.target.value === '' ? null : Number(e.target.value) }))}>
              <option value="">Aucun</option>
              {evenements.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.reference} — {ev.objet}{ev.ouvert ? '' : ' (clos)'}</option>
              ))}
              {tache?.evenement && !evenements.some((ev) => ev.id === tache.evenement?.id) && (
                <option value={tache.evenement.id}>{tache.evenement.reference} — {tache.evenement.objet}</option>
              )}
            </select>
          </label>
          {sources !== null && (
            <ChoixContacts proposes={proposes} choisis={choisis} onBasculer={basculerContact} desactive={lectureSeule} />
          )}
          <fieldset className="tchf-rappels" disabled={lectureSeule}>
            <legend className="tch-etiquette">Rappels</legend>
            {rappelsProposes(saisie.heure !== null).map((r) => (
              <label key={cleRappel(r)} className="tchf-case">
                <input type="checkbox" checked={saisie.rappels.some((x) => cleRappel(x) === cleRappel(r))}
                  onChange={() => basculerRappel(r)} />
                {motRappel(r)}
              </label>
            ))}
          </fieldset>
          <label className="tchf-champ">
            <span className="tch-etiquette">Note</span>
            <textarea rows={3} value={saisie.note} maxLength={5000} disabled={lectureSeule}
              onChange={(e) => setSaisie((s) => ({ ...s, note: e.target.value }))} />
          </label>
          {/* 🔴 LOT TACHES-1-BIS — le bloc « Contacts » GÉNÉRÉ, à la suite de la note : texte de la tâche = note +
              ce bloc. Il se refait à chaque case cochée ou décochée ; la note, au-dessus, n'est jamais touchée. */}
          {sources !== null && pourLeBloc.length > 0 && (
            <div className="tchf-champ">
              <span className="tch-etiquette">Texte de la tâche — bloc « Contacts » (généré)</span>
              <pre className="tchc-apercu" data-bloc-contacts>{blocContacts(pourLeBloc)}</pre>
            </div>
          )}

          {detail !== null && (
            <ContactsAffiches contacts={detail.contacts} sources={sources} onEcrire={ecrire}
              onMettreAJour={terminee ? undefined : (cle) => void mettreAJour(cle)} occupe={occupe} />
          )}

          {detail !== null && detail.traces.length > 0 && (
            <section className="tchf-trace" aria-label="Historique de la tâche">
              <h3 className="tch-etiquette">Historique</h3>
              <ul>
                {detail.traces.map((t, i) => <li key={i}>{phraseTrace(t)}</li>)}
              </ul>
            </section>
          )}
        </div>

        {message && <p className={`tch-message${message.ok ? '' : ' tch-message--erreur'}`} role="status">{message.texte}</p>}

        <footer className="tchf-pied">
          {!lectureSeule && (
            <button type="button" className="svv-btn gst-btn tch-btn" disabled={occupe} onClick={() => void enregistrer()}>
              {mode.sorte === 'creer' ? 'Créer la tâche' : 'Enregistrer les modifications'}
            </button>
          )}
          {mode.sorte === 'detail' && tache !== null && !terminee && (
            confirmerAnnulation ? (
              <>
                <button type="button" className="svv-btn svv-btn-outline gst-btn tch-btn tchf-danger" disabled={occupe}
                  onClick={() => void geste('annuler')}>
                  Confirmer l’annulation
                </button>
                <button type="button" className="svv-btn svv-btn-outline gst-btn tch-btn"
                  onClick={() => setConfirmerAnnulation(false)}>
                  Ne pas annuler
                </button>
              </>
            ) : (
              <button type="button" className="svv-btn svv-btn-outline gst-btn tch-btn" disabled={occupe}
                onClick={() => setConfirmerAnnulation(true)}>
                Annuler la tâche
              </button>
            )
          )}
          {mode.sorte === 'detail' && terminee && (
            <button type="button" className="svv-btn svv-btn-outline gst-btn tch-btn" disabled={occupe}
              onClick={() => void geste('rouvrir')}>
              Rouvrir
            </button>
          )}
          <button type="button" className="svv-btn svv-btn-outline gst-btn tch-btn" onClick={onFermer}>Fermer</button>
        </footer>
      </div>
    </div>
  );
}

/* ⚠️ CSS DANS UN GABARIT : jamais d'accent grave dans un commentaire ci-dessous. */
const CSS_FENETRE = `
.tchf-voile{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;
  padding:2vh 16px;background:rgba(0,0,0,.45)}
.tchf{display:flex;flex-direction:column;gap:10px;width:min(560px,100%);max-height:94vh;overflow:auto;padding:14px;
  border:1px solid var(--color-svv-line);border-radius:.8rem;background:var(--color-svv-surface);
  box-shadow:0 18px 50px rgba(0,0,0,.28);color:var(--color-svv-ink)}
.tchf-tete{display:flex;align-items:flex-start;gap:10px}
.tchf-titre{flex:1 1 auto;min-width:0;margin:0;font-size:1rem;font-weight:700;overflow-wrap:anywhere}
.tchf-adresse{font-weight:500;color:var(--color-svv-muted)}
.tchf-croix{flex:0 0 auto;min-width:44px;min-height:44px;font-size:1.3rem;line-height:1;background:none;
  border:1px solid transparent;border-radius:.5rem;color:var(--color-svv-ink);cursor:pointer}
.tchf-croix:hover{background:var(--color-svv-field)}
.tchf-croix:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.tchf-etat{margin:0;font-weight:600;color:var(--color-svv-muted)}
.tchf-corps{display:flex;flex-direction:column;gap:8px}
.tchf-rangee{display:flex;flex-wrap:wrap;gap:8px}
.tchf-rangee > .tchf-champ{flex:1 1 10rem}
.tchf-champ{display:flex;flex-direction:column;gap:3px;min-width:0}
.tch-etiquette{font-size:.78rem;font-weight:600;color:var(--color-svv-muted);margin:0}
.tchf-champ input,.tchf-champ select,.tchf-champ textarea{min-height:44px;padding:.4rem .5rem;border:1px solid var(--color-svv-line-strong);
  border-radius:.4rem;background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;width:100%;box-sizing:border-box}
.tchf-champ textarea{min-height:5rem;resize:vertical}
.tchf-aide{margin:-2px 0 0;font-size:.8rem;color:var(--color-svv-muted)}
.tchf-rappels{display:flex;flex-wrap:wrap;gap:4px 14px;margin:0;padding:6px 8px;border:1px solid var(--color-svv-line);
  border-radius:.5rem}
.tchf-case{display:inline-flex;align-items:center;gap:.4rem;min-height:36px;font-size:.88rem}
.tchf-trace ul{margin:4px 0 0;padding-left:1.1rem;font-size:.84rem;color:var(--color-svv-ink)}
.tchf-pied{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
.tchf-danger{color:var(--color-svv-red);border-color:var(--color-svv-red)}
`;
