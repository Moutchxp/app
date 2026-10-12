'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChampsEvenement, CSS_BLOC_EVENEMENT } from './BlocEvenement';
import { ChoisirEvenement } from './ChoisirEvenement';
import { PartiesEnLecture, type ChoixConcernes } from './LocatairesConcernes';
import type { Concerne } from '../../../../lib/gestion/locatairesEvenement';
import { CapsuleEvenement, CSS_CAPSULE_EVENEMENT } from './CapsuleEvenement';
import { CSS_MODIFIER_RATTACHEMENT } from './ModifierRattachement';
import { bornesEvenement, type EvenementDuMail } from '../../../../lib/gestion/evenementQualite';
import {
  dateCourteIso, lectureEvenement, listeEnCours, trierParUrgence, type EvenementLu,
} from '../../../../lib/gestion/evenementRattache';
import { etapeEnMots } from '../../../../lib/gestion/etapeVignette';
import {
  corpsCreation, EXPLICATION_BOUTONS_CREER, libelleBienDuMail, ONGLET_CREER, ONGLET_LIER, partiesDesBiensFiche,
  phraseRemplacement, titrePrerempli, TITRE_EVENEMENT_DU_MAIL,
} from '../../../../lib/gestion/evenementDuMail';
import { motEnTeteMail, type FicheRattachementFil } from '../../../../lib/gestion/ficheRattachement';
import { dateHeureComplete } from '../../../../lib/gestion/ecran';
import { jourParis } from '../../../../lib/gestion/historiqueBien';
import { annoncerClassement } from '../../../../lib/gestion/signalClassement';

/**
 * ══ 🔴🔴 LOT BOUTON-EVENEMENT-ET-RATTACHEMENT-EN-LECTURE — LA FENÊTRE « ÉVÉNEMENT DE CE MAIL » ══════════════════════
 *
 * DÉCISION D'ARNO (12/10/2026) : les ACTIONS sur l'événement quittent « Modifier le rattachement » et viennent ici.
 * Rien n'est supprimé : tout est DÉPLACÉ.
 *
 *   A) « Lier ce mail à un événement déjà ouvert (one shot) » — les événements en cours sur le(s) bien(s) du mail
 *      (capsule · ouvert le … · Étape : …), « Voir aussi les autres événements » (la recherche de l'ancien « Lier à
 *      un événement » : clos, autres biens), « remplacera GES-… » quand le mail est déjà lié, « Lier ce mail ».
 *   B) « Créer un événement à partir de ce mail » — le formulaire existant (`ChampsEvenement`), sans rien retirer ;
 *      le mail est le 1er mail de la carte neuve ; « Créer l'événement ».
 *   · Déjà lié : « Ce mail est lié à <capsule> », et « Retirer ce mail de l'événement » — le « Délier » qui existait
 *     (encart du mail, `BlocEvenement`), par la même route ; offert quand le lien est posé sur CE mail.
 *
 * 🔴 « ONE SHOT » = CE MAIL SEUL : toutes les écritures passent par `/messages/<id>/affectation` (portée « mail »,
 * migration 234), jamais par la conversation. Aucune porte d'écriture neuve, aucun corps recopié : `corpsCreation`
 * est celui de « Modifier le rattachement ».
 *
 * ⚠️ RIEN N'EST ÉCRIT SANS UN CLIC SUR « Lier ce mail », « Créer l'événement » ou « Retirer » ; fermer n'écrit rien.
 */
export function FenetreEvenementMail({ messageId, filId, onFerme, onFait }: {
  messageId: number;
  filId: number;
  onFerme: () => void;
  /** Après une écriture réussie : le parent ferme, recharge la ligne, le bloc et la carte. */
  onFait: (message: string) => void;
}) {
  const [fiche, setFiche] = useState<FicheRattachementFil | null>(null);
  const [lu, setLu] = useState<{
    evenement: EvenementDuMail | null; qualifie: boolean; rattaches: EvenementLu[]; duBien: EvenementLu[];
  } | null>(null);
  const [onglet, setOnglet] = useState<'lier' | 'creer'>('lier');
  const [choisi, setChoisi] = useState<{ id: number; reference: string; objet: string } | null>(null);
  const [autres, setAutres] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  /* Le formulaire B — les mêmes champs que partout (`ChampsEvenement`). */
  const [titre, setTitre] = useState('');
  const [categorie, setCategorie] = useState('');
  const [urgence, setUrgence] = useState('');
  const [ouvertLe, setOuvertLe] = useState('');
  const [closLe, setClosLe] = useState('');
  const [note, setNote] = useState('');
  const [concernes, setConcernes] = useState<ChoixConcernes | null>(null);
  /** « Garder pour la validation » : le formulaire est retenu (replié), « Créer l'événement » l'écrit. */
  const [garde, setGarde] = useState(false);
  /** Onglet « Lier » : les parties de l'événement choisi (lecture seule), lues par la route de la carte. */
  const [partiesChoisi, setPartiesChoisi] = useState<
    { v: 'aucun' } | { v: 'charge' } | { v: 'ok'; proprietaires: string[]; personnes: Concerne[] }
  >({ v: 'aucun' });
  useEffect(() => {
    if (choisi === null) { setPartiesChoisi({ v: 'aucun' }); return undefined; }
    let vivant = true;
    setPartiesChoisi({ v: 'charge' });
    void fetch(`/api/admin/gestion/evenements/${choisi.id}`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ parties?: { sorte: string; nom: string }[]; concernes?: Concerne[] | null }>)
      .then((d) => {
        if (!vivant) return;
        const parties = d.parties ?? [];
        /* Les personnes : le choix enregistré s'il a été modifié, sinon les locataires en place. */
        const personnes: Concerne[] = d.concernes ?? parties.filter((x) => x.sorte === 'locataire').map((x) => ({
          sorte: 'locataire', locataireId: null, sujet: null, sujetId: null, nom: x.nom, email: null, telephone: null,
          entree: null, sortie: null,
        }));
        setPartiesChoisi({ v: 'ok', proprietaires: parties.filter((x) => x.sorte === 'proprietaire').map((x) => x.nom), personnes });
      })
      .catch(() => { if (vivant) setPartiesChoisi({ v: 'ok', proprietaires: [], personnes: [] }); });
    return () => { vivant = false; };
  }, [choisi]);

  const charger = useCallback(async () => {
    try {
      const [ra, rf] = await Promise.all([
        fetch(`/api/admin/gestion/messages/${messageId}/affectation`, { cache: 'no-store' }),
        fetch(`/api/admin/gestion/rattachements?fiche=${filId}&message=${messageId}`, { cache: 'no-store' }),
      ]);
      const da = (await ra.json().catch(() => ({}))) as {
        etat?: string; evenement?: EvenementDuMail | null; qualifie?: boolean;
        lus?: { rattaches?: EvenementLu[]; duBien?: EvenementLu[] };
      };
      const df = (await rf.json().catch(() => ({}))) as { etat?: string; data?: FicheRattachementFil };
      setLu({
        evenement: da.etat === 'ok' ? (da.evenement ?? null) : null,
        qualifie: da.etat === 'ok' && da.qualifie === true,
        rattaches: da.lus?.rattaches ?? [], duBien: da.lus?.duBien ?? [],
      });
      setFiche(df.etat === 'ok' && df.data && Array.isArray(df.data.biens) ? df.data : null);
    } catch {
      setErreur('Lecture impossible : le serveur n’a pas répondu.');
    }
  }, [messageId, filId]);
  useEffect(() => { void charger(); }, [charger]);

  const biens = (fiche?.biens ?? []).map((b) => ({ cle: b.cle, libelle: libelleBienDuMail(b) }));
  /** Les propriétaires des biens du mail (toujours concernés), sans doublon. */
  const proprietaires = [...new Set((fiche?.biens ?? []).flatMap((b) => (b.personnes ?? [])
    .filter((x) => x.role === 'proprietaire').map((x) => x.nom)))];
  const jourDuMail = fiche?.enTete?.recuLe == null ? null : jourParis(new Date(fiche.enTete.recuLe));
  /* Le titre et la date d'ouverture se préremplissent UNE fois, quand la fiche arrive. */
  useEffect(() => {
    if (fiche === null) return;
    setTitre((t) => (t === '' ? titrePrerempli(biens.map((b) => b.libelle), fiche.enTete?.objet) : t));
    setOuvertLe((o) => (o === '' ? (jourDuMail ?? jourParis(new Date())) : o));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiche]);

  const lecture = lectureEvenement(lu?.rattaches ?? [], lu?.duBien ?? []);
  const liste = listeEnCours(lecture);
  /** Le ou les événements auxquels CE mail est lié (en cours d'abord), sinon celui que la route connaît (gris). */
  const lies: EvenementLu[] = (lu?.rattaches ?? []).length > 0 ? trierParUrgence(lu?.rattaches ?? [])
    : (lu?.evenement ? [{
      id: lu.evenement.evenementId, reference: lu.evenement.reference, objet: lu.evenement.objet, ouvert: false,
      categorie: lu.evenement.categorie, urgence: lu.evenement.urgence,
    }] : []);
  const remplace = phraseRemplacement(lies, choisi?.id ?? null);

  const ecrire = async (methode: 'POST' | 'DELETE', corps: Record<string, unknown> | null, dit: string) => {
    setOccupe(true);
    setErreur(null);
    try {
      const res = await fetch(`/api/admin/gestion/messages/${messageId}/affectation`, {
        method: methode,
        ...(corps === null ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }),
      });
      const d = (await res.json().catch(() => ({}))) as { erreur?: string };
      if (!res.ok) { setErreur(d.erreur ?? 'Le geste n’a pas abouti.'); return; }
      /* La boîte, la recherche et les autres listes ouvertes sont prévenues, comme après tout classement. */
      annoncerClassement({ messageId, filId });
      onFait(dit);
    } catch {
      setErreur('Le geste n’a pas abouti : le serveur n’a pas répondu.');
    } finally {
      setOccupe(false);
    }
  };

  const bornes = bornesEvenement(ouvertLe, closLe);
  const creerPossible = titre.trim() !== '' && bornes.refus === null && !occupe;
  const creer = () => {
    if (!creerPossible) { setErreur(bornes.refus ?? 'Donnez un titre à l’événement.'); return; }
    void ecrire('POST', corpsCreation({
      objet: titre, categorie, urgence, ouvertLe: bornes.ouvertLe, closLe: bornes.closLe,
      note: note.trim() === '' ? null : note.trim(), concernes,
    }, lu?.qualifie === true, partiesDesBiensFiche(fiche?.biens ?? [], biens)), 'Événement créé à partir de ce mail.');
  };

  return (
    <div className="mrt-voile" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onFerme(); }}>
      <style>{CSS_MODIFIER_RATTACHEMENT}</style>
      <style>{CSS_BLOC_EVENEMENT}</style>
      <style>{CSS_FENETRE_EVENEMENT_MAIL}</style>
      <div className="mrt fem" role="dialog" aria-modal="true" aria-labelledby="fem-titre"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onFerme(); } }}>
        <button type="button" className="fem-croix" aria-label="Fermer sans rien changer"
          title="Fermer sans rien changer" onClick={onFerme}>×</button>
        <h2 className="mrt-titre" id="fem-titre">{TITRE_EVENEMENT_DU_MAIL}</h2>
        {fiche?.enTete != null && (
          <p className="fem-entete">{motEnTeteMail(fiche.enTete, dateHeureComplete(fiche.enTete.recuLe))}</p>
        )}
        <p className="fem-biens">
          <span className="fem-libelle">{biens.length > 1 ? 'Biens du mail' : 'Bien du mail'}</span>
          {fiche === null ? 'lecture…' : biens.length === 0 ? 'aucun bien rattaché' : biens.map((b) => b.libelle).join(' · ')}
        </p>

        {/* Déjà lié : on le dit en tête, et l'on peut retirer ce mail (le « Délier » qui existait). */}
        {lies.length > 0 && (
          <div className="fem-lie" role="status">
            <span>Ce mail est lié à</span>
            {lies.map((e) => <CapsuleEvenement key={e.id} e={e} />)}
            {lu?.evenement?.portee === 'mail' ? (
              <button type="button" className="gst-lien-bouton" disabled={occupe}
                onClick={() => void ecrire('DELETE', null, 'Mail retiré de l’événement. Rien n’est supprimé.')}>
                Retirer ce mail de l’événement
              </button>
            ) : lu?.evenement?.portee === 'conversation' ? (
              <span className="fem-note">(par sa conversation)</span>
            ) : null}
          </div>
        )}

        {/* 🔴 LE CHOIX DU MODE : deux onglets de même largeur, l'actif bien marqué. */}
        <div className="fem-onglets" role="tablist" aria-label="Que faire de l’événement de ce mail">
          <button type="button" role="tab" aria-selected={onglet === 'lier'} id="fem-onglet-lier"
            className={`fem-onglet${onglet === 'lier' ? ' fem-onglet--actif' : ''}`}
            onClick={() => { setOnglet('lier'); setErreur(null); }}>
            {ONGLET_LIER}
          </button>
          <button type="button" role="tab" aria-selected={onglet === 'creer'} id="fem-onglet-creer"
            className={`fem-onglet${onglet === 'creer' ? ' fem-onglet--actif' : ''}`}
            onClick={() => { setOnglet('creer'); setErreur(null); }}>
            {ONGLET_CREER}
          </button>
        </div>

        {onglet === 'lier' && (
          <div className="fem-pan" role="tabpanel" aria-labelledby="fem-onglet-lier">
            {/* ① BLOC « ÉVÉNEMENTS EN COURS SUR CE BIEN » */}
            <section className="bev-bloc" aria-labelledby="fem-bloc-liste">
              <p className="bev-bloc-titre" id="fem-bloc-liste">Événements en cours sur ce bien</p>
              <p className="fem-aide">Ce mail seul est lié, pas le reste de la conversation.</p>
              {liste.length === 0 ? (
                <p className="fem-vide">Aucun événement en cours sur le bien de ce mail.</p>
              ) : (
                <ul className="fem-lignes">
                  {liste.map((e) => {
                    const etape = etapeEnMots(e.etape, e.ouvertLe);
                    const ouvert = dateCourteIso(e.ouvertLe);
                    return (
                      <li key={e.id} className="fem-ligne">
                        <label className="fem-choix">
                          <input type="radio" name="fem-evenement" disabled={e.rattache}
                            checked={choisi?.id === e.id}
                            onChange={() => setChoisi({ id: e.id, reference: e.reference, objet: e.objet })} />
                          <CapsuleEvenement e={e} />
                        </label>
                        <span className="fem-meta">
                          {ouvert !== null && <span>ouvert le {ouvert}</span>}
                          <span>Étape : {etape.mot}{etape.date !== null && etape.date !== '—' ? ` (${etape.date})` : ''}</span>
                        </span>
                        {e.rattache && <span className="fem-deja">Rattaché ✓</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
              <button type="button" className="gst-lien-bouton fem-voir" aria-expanded={autres}
                onClick={() => setAutres((v) => !v)}>
                Voir aussi les autres événements
              </button>
              {autres && (
                <div className="fem-autres">
                  {/* La recherche partagée de l'ancien « Lier à un événement » : clos, autres biens. */}
                  <ChoisirEvenement choisi={choisi?.id ?? null} exclure={lies[0]?.id ?? null} autoFocus
                    onChoisir={(id, trouve) => {
                      if (id === null) { setChoisi(null); return; }
                      setChoisi({ id, reference: trouve?.reference ?? `événement n° ${id}`, objet: trouve?.objet ?? '' });
                    }} />
                </div>
              )}
              {choisi !== null && (
                <p className="fem-choisi">
                  Choisi : {choisi.reference}{choisi.objet !== '' ? ` — ${choisi.objet}` : ''}
                  {remplace !== null && <span className="fem-remplace">{` — ${remplace}`}</span>}
                </p>
              )}
            </section>
            {/* ② BLOC « PARTIES CONCERNÉES », en lecture : celles de l'événement choisi. */}
            {partiesChoisi.v === 'aucun' ? (
              <section className="bev-bloc" aria-label="Parties concernées">
                <p className="bev-bloc-titre">Parties concernées</p>
                <p className="fem-vide">Choisissez un événement pour voir ses parties.</p>
              </section>
            ) : (
              <PartiesEnLecture enCours={partiesChoisi.v === 'charge'}
                proprietaires={partiesChoisi.v === 'ok' ? partiesChoisi.proprietaires : []}
                personnes={partiesChoisi.v === 'ok' ? partiesChoisi.personnes : []} />
            )}
          </div>
        )}

        {onglet === 'creer' && (
          <div className="fem-pan" role="tabpanel" aria-labelledby="fem-onglet-creer">
            {garde ? (
              <section className="bev-bloc" aria-label="Événement gardé pour la validation">
                <p className="bev-bloc-titre">Événement</p>
                <p className="fem-choisi">
                  À créer : « {titre.trim()} »
                  <button type="button" className="gst-lien-bouton" onClick={() => setGarde(false)}>Modifier</button>
                </p>
              </section>
            ) : (
              <ChampsEvenement enBlocs mentionPremierMail titre={titre} onTitre={setTitre}
                categorie={categorie} onCategorie={setCategorie}
                urgence={urgence} onUrgence={setUrgence}
                qualifieDisponible={lu?.qualifie === true}
                libellesDesBiens={biens.map((b) => b.libelle)}
                ouvertLe={ouvertLe} onOuvertLe={setOuvertLe}
                closLe={closLe} onClosLe={setClosLe}
                note={note} onNote={setNote}
                bienCles={biens.map((b) => b.cle)} concernes={concernes} onConcernes={setConcernes}
                proprietaires={proprietaires} jourReference={jourDuMail} />
            )}
            {remplace === null && lies.length > 0 && (
              <p className="fem-remplace">{`La carte neuve remplacera ${lies.map((e) => e.reference).join(', ')} pour ce mail.`}</p>
            )}
          </div>
        )}

        {erreur !== null && <p className="gst-tronc" role="alert">{erreur}</p>}

        {/* 🔴 LE PIED, FIXE EN BAS : toujours visible, même quand on fait défiler la fenêtre. */}
        <div className="fem-pied">
          <div className="fem-pied-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFerme}>Fermer</button>
            <span className="fem-pied-droite">
              {onglet === 'lier' ? (
                <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={choisi === null || occupe}
                  onClick={() => choisi !== null && void ecrire('POST', { evenementId: choisi.id }, 'Mail lié à l’événement.')}>
                  {occupe ? 'Enregistrement…' : 'Lier ce mail'}
                </button>
              ) : (
                <>
                  <button type="button" className="svv-btn svv-btn-outline gst-btn"
                    disabled={garde || titre.trim() === '' || bornes.refus !== null}
                    onClick={() => setGarde(true)}>
                    Garder pour la validation
                  </button>
                  <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={!creerPossible}
                    onClick={creer}>
                    {occupe ? 'Création…' : 'Créer l’événement'}
                  </button>
                </>
              )}
            </span>
          </div>
          {onglet === 'creer' && <p className="fem-explication">{EXPLICATION_BOUTONS_CREER}</p>}
        </div>
      </div>
      <style>{CSS_CAPSULE_EVENEMENT}</style>
    </div>
  );
}

/* AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit. Couleurs : jetons seulement, Clair et Sombre.
   Rien ne deborde : tout se replie, cibles tactiles >= 32 px. */
export const CSS_FENETRE_EVENEMENT_MAIL = `
.fem{position:relative}
.fem-croix{position:absolute;top:8px;right:8px;display:inline-flex;align-items:center;justify-content:center;
  min-width:36px;min-height:36px;padding:0;font:inherit;font-size:1.4rem;line-height:1;color:var(--color-svv-muted);
  background:transparent;border:0;border-radius:50%;cursor:pointer}
.fem-croix:hover{background:var(--color-svv-field);color:var(--color-svv-ink)}
.fem-croix:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.fem-entete{margin:-6px 0 2px;padding-right:40px;font-size:.85rem;font-weight:600;color:var(--color-svv-ink);overflow-wrap:anywhere}
.fem-biens{margin:0 0 8px;font-size:.8rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.fem-libelle{margin-right:.5rem;font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--color-svv-muted)}
.fem-lie{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .6rem;margin:0 0 10px;padding:8px 10px;min-width:0;
  font-size:.82rem;font-weight:600;color:var(--color-svv-ink);border:1px solid var(--color-svv-line);border-radius:.6rem;
  background:var(--color-svv-field);box-sizing:border-box}
.fem-note{font-weight:400;color:var(--color-svv-muted)}
.fem-onglets{display:flex;flex-wrap:wrap;gap:6px;margin:0}
.fem-onglet{flex:1 1 0;min-width:14rem;min-height:40px;padding:.4rem .7rem;font:inherit;font-size:.8rem;font-weight:700;
  text-align:center;color:var(--color-svv-ink);background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);
  border-radius:.6rem;cursor:pointer;box-sizing:border-box}
.fem-onglet--actif{border:2px solid var(--color-svv-red);color:var(--color-svv-red);background:var(--color-svv-red-soft)}
.fem-onglet:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-4px}
.fem-pan{display:flex;flex-direction:column;gap:10px;min-width:0}
.fem-aide{margin:0 0 .4rem;font-size:.78rem;font-style:italic;color:var(--color-svv-muted)}
.fem-vide{margin:0;font-size:.82rem;color:var(--color-svv-muted)}
.fem-lignes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;min-width:0}
.fem-ligne{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem .6rem;padding:6px 8px;min-width:0;
  border:1px solid var(--color-svv-line);border-radius:.6rem;box-sizing:border-box}
.fem-choix{display:flex;align-items:center;gap:.45rem;min-width:0;max-width:100%;min-height:32px;cursor:pointer}
.fem-choix input:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
.fem-choix>.cev{flex:0 1 auto}
.fem-meta{display:flex;flex-wrap:wrap;gap:.15rem .6rem;font-size:.76rem;color:var(--color-svv-muted);min-width:0}
.fem-meta>span+span::before{content:'·';margin-right:.6rem}
.fem-deja{margin-left:auto;font-size:.78rem;font-weight:700;color:var(--color-svv-green-ink);white-space:nowrap}
.fem-voir{align-self:flex-start;margin-top:.4rem}
.fem-autres{min-width:0;margin-top:.3rem}
.fem-choisi{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem .6rem;margin:.4rem 0 0;font-size:.82rem;font-weight:600;
  color:var(--color-svv-ink);overflow-wrap:anywhere}
.fem-remplace{margin:0;font-size:.8rem;font-weight:400;color:var(--color-svv-muted)}
/* Le pied, FIXE en bas de la fenetre qui defile (.mrt : overflow auto, padding 16px). */
.fem-pied{position:sticky;bottom:-16px;z-index:2;margin:0 -16px -16px;padding:10px 16px 12px;
  background:var(--color-svv-surface);border-top:1px solid var(--color-svv-line);display:flex;flex-direction:column;gap:6px}
.fem-pied-boutons{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.fem-pied-droite{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-left:auto}
.fem-explication{margin:0;font-size:.74rem;line-height:1.4;color:var(--color-svv-muted);text-align:right;overflow-wrap:anywhere}
/* Grand ecran : un texte plus serre, pour tenir sur une ligne quand la place le permet — jamais tronque. */
@media (min-width:721px){.fem-onglet{font-size:.76rem;padding:.4rem .45rem}}
/* Telephone : le pied reste compact — [Fermer][Garder] sur une ligne, [Creer] dessous, l explication en petit. */
@media (max-width:520px){
  .fem-onglet{min-width:100%}
  .fem-pied{gap:4px;padding:8px 16px 10px}
  .fem-pied-boutons{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .fem-pied-droite{display:contents}
  .fem-pied-boutons .gst-btn{min-height:40px;padding:.3rem .5rem;font-size:.82rem;width:100%}
  .fem-pied-droite>.svv-btn-primary{grid-column:1 / -1}
  .fem-explication{text-align:left;font-size:.7rem;line-height:1.3}
}
`;
