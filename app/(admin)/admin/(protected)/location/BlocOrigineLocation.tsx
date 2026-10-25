'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChoixOrigine } from './ChoixOrigine';
import { CSS_MODALE_ISSUE } from './ModaleIssue';
import { API_SUIVI, posterSuivi } from './suiviApi';
import { CSS_SUIVI_COMMERCIAL, useParametresSuivi } from './SuiviCommercial';
import { libelleOrigineContact, LIBELLE_ORIGINE_CONTACT, originesProposees, type OrigineContact } from '../../../../lib/location/suivi/suivi';
import { mentionsOrigine, prerempliOrigine, type OrigineDuBien } from '../../../../lib/location/origineProprietaire';
import { motAnnexeLouee, type AnnexeLouee } from '../../../../lib/location/suivi/annexesGestion';

/**
 * ══ 🔴 Arno (25/10/2026, 425) — BLOC 9 « ORIGINE DU CONTACT » DE LA FICHE DU BIEN, OUVERTE DEPUIS UNE LIGNE DU SUIVI DU MOIS ══════════
 * Sous « Statut du bien », et SEULEMENT depuis le Suivi : l'origine de la LOCATION de la ligne (la même donnée que le bloc 4), avec le
 * composant extrait du bloc 4 (origine, apporteur interne/externe, création rapide, annuaire, collègue). Son bouton « Enregistrer
 * l'origine » est INDÉPENDANT du bien (un bien incomplet ne le bloque pas) : récapitulatif (ancienne → nouvelle), Confirmer ; conflit
 * refusé ; journal (écran « Fiche du bien (Suivi du mois) ») ; la modale reste ouverte, la page se relit derrière. Encore « à
 * renseigner » : l'origine du propriétaire est proposée (« reprise du propriétaire <nom> »). Ligne sans location : en lecture.
 */
interface Lu { origineContact: OrigineContact | null; origineContactPrecision: string | null; apporteurId: number | null; collegueId: number | null; empreinte: string; avecGestion: boolean; bien: OrigineDuBien | null;
  /** 🔴 426 — une location d'annexe (après la bascule). */
  annexe?: AnnexeLouee | null }
type Saisie = { origine: string; precision: string; collegueId: number | null; apporteurId: number | null };

const versSaisie = (l: Lu): Saisie => ({ origine: l.origineContact ?? '', precision: l.origineContactPrecision ?? '', collegueId: l.collegueId, apporteurId: l.apporteurId });
const motSaisie = (s: Saisie): string => (s.origine === '' ? 'à renseigner' : libelleOrigineContact(s.origine as OrigineContact, s.precision));

export function BlocOrigineLocation({ activiteId, numero, origineLigne, onEnregistre }: {
  activiteId: number | null; numero: number;
  /** L'origine lue sur la ligne du Suivi (pour une ligne sans location : la lecture seule). */
  origineLigne: string;
  onEnregistre: () => void;
}) {
  const parametres = useParametresSuivi();
  const [lu, setLu] = useState<Lu | null>(null);
  const [motifLecture, setMotifLecture] = useState<string | null>(null);
  const [saisie, setSaisie] = useState<Saisie | null>(null);
  const [reprise, setReprise] = useState(false);
  const [recap, setRecap] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [issue, setIssue] = useState<{ sorte: 'ok' | 'refus' | 'conflit'; mot: string } | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (activiteId === null) return;
    let vivant = true;
    fetch(`${API_SUIVI}?vue=origine-activite&id=${activiteId}`, { cache: 'no-store' }).then((r) => r.json()).then((d: { etat?: string; data?: Lu }) => {
      if (!vivant) return;
      if (d.etat !== 'ok' || d.data === undefined) { setMotifLecture('L’origine de cette location n’a pas pu être lue.'); return; }
      const l = d.data;
      setLu(l);
      // Encore « à renseigner » : l'origine du propriétaire est PROPOSÉE (modifiable), jamais une origine déjà saisie remplacée.
      const h = l.origineContact === null && l.apporteurId === null ? prerempliOrigine({ origineContact: '', origineContactPrecision: '', apporteurId: '', collegueId: '' }, l.bien) : null;
      if (h?.reprise) {
        setSaisie({ origine: h.champs.origineContact, precision: h.champs.origineContactPrecision, collegueId: h.champs.collegueId === '' ? null : Number(h.champs.collegueId),
          apporteurId: h.champs.apporteurId === '' ? null : Number(h.champs.apporteurId) });
        setReprise(true);
      } else { setSaisie(versSaisie(l)); setReprise(false); }
    }).catch(() => { if (vivant) setMotifLecture('L’origine de cette location n’a pas pu être lue : le serveur n’a pas répondu.'); });
    return () => { vivant = false; };
  }, [activiteId, n]);

  const pl = parametres.lu;
  const s = saisie ?? { origine: '', precision: '', collegueId: null, apporteurId: null };
  const poser = (p: Partial<Saisie>): void => { setSaisie({ ...s, ...p }); setIssue(null); };
  const choix = useChoixOrigine({
    valeur: s,
    lu: { apporteurs: pl?.apporteurs ?? [], collegues: pl?.collegues ?? [], moi: pl?.moi ?? null, annuaire: pl?.annuaire === true },
    rafraichir: parametres.rafraichir,
    options: originesProposees(pl?.personnalisable === true, pl?.dejaClient === true).map((o) => ({ id: o, libelle: LIBELLE_ORIGINE_CONTACT[o],
      ...(o === 'relocation' && lu?.avecGestion !== true ? { bloque: true, mention: ' — seulement avec la case « Relocation » de la location' } : {}) })),
    libelle: 'Origine du contact propriétaire',
    desactive: lu?.avecGestion === true,
    sousOrigine: <>
      {lu?.avecGestion === true && <small className="loc-muet" data-origine-imposee>Imposée par « Relocation » (portefeuille de gestion).</small>}
      {mentionsOrigine({ origineContact: s.origine as OrigineContact | '', origineContactPrecision: s.precision, apporteurId: s.apporteurId === null ? '' : String(s.apporteurId),
        collegueId: s.collegueId === null ? '' : String(s.collegueId) }, lu?.bien ?? null).map((m) => (
        <small key={m} className="loc-muet" data-mention-origine={m.startsWith('reprise') ? 'reprise' : m.startsWith('différente') ? 'differente' : 'coproprietaires'}>{m}</small>))}
    </>,
    onOrigine: (x) => poser({ origine: x, ...(x !== 'apporteur' ? { apporteurId: null } : {}), ...(x !== 'collegue' ? { collegueId: null } : {}), ...(x !== 'personnalise' ? { precision: '' } : {}) }),
    onPrecision: (t) => poser({ precision: t }),
    onCollegue: (id) => poser({ collegueId: id }),
    onApporteur: (id, depuisAnnuaire) => poser({ apporteurId: id, ...(depuisAnnuaire ? { origine: 'apporteur', collegueId: null, precision: '' } : {}) }),
  });

  const titre = <h3 id="loc-b9"><span className="loc-num">{numero}</span>Origine du contact</h3>;
  if (activiteId === null) {
    return (
      <section className="loc-section" aria-labelledby="loc-b9" data-bloc-origine-location="lecture">
        {titre}
        <p className="loc-muet" data-origine-non-rattache>Dossier non rattaché — l’origine se lit ici sans se modifier : <strong>{origineLigne || 'à renseigner'}</strong>.</p>
      </section>
    );
  }
  const avant = lu === null ? '' : motSaisie(versSaisie(lu));
  const apres = motSaisie(s);
  const change = lu !== null && JSON.stringify(versSaisie(lu)) !== JSON.stringify(s);
  const enregistrer = async (): Promise<void> => {
    if (lu === null) return;
    setEnvoi(true);
    const r = await posterSuivi({ action: 'origine-activite', id: activiteId, empreinte: lu.empreinte,
      origine: { origineContact: s.origine === '' ? null : s.origine, origineContactPrecision: s.precision, apporteurId: s.apporteurId, collegueId: s.collegueId } }, { propre: true });
    setEnvoi(false); setRecap(false);
    const etat = (r as { etat?: string }).etat;
    if (r.motif !== null) { setIssue({ sorte: etat === 'conflit' ? 'conflit' : 'refus', mot: r.motif }); return; }
    setIssue({ sorte: 'ok', mot: `✓ Origine enregistrée : ${apres}.` });
    setReprise(false);
    setN((x) => x + 1);
    onEnregistre();
  };
  return (
    // Un « Entrée » dans le bloc n'envoie jamais le formulaire du bien (l'origine a son propre bouton).
    <section className="loc-section" aria-labelledby="loc-b9" data-bloc-origine-location onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault(); }}>
      <style>{CSS_SUIVI_COMMERCIAL}</style>
      {titre}
      <p className="loc-muet" style={{ margin: '0 0 8px' }}>L’origine du contact de cette location (la même que dans le Dossier de location). Son enregistrement est indépendant du bien.</p>
      {lu?.annexe && <p className="loc-muet" style={{ margin: '0 0 8px' }} data-annexe-louee>{motAnnexeLouee(lu.annexe)}{lu.annexe.principalEnGestion ? '' : ' (lot principal sans gestion)'}.</p>}
      {motifLecture !== null ? <p className="gst-erreur" role="alert">{motifLecture}</p> : lu === null || pl === null ? <p className="gst-info" role="status">{parametres.erreur ?? 'Lecture…'}</p> : (
        <>
          <div className="loc-grille loc-suivi-ligne loc-suivi-ligne--deux" data-origine-contact-bloc>{choix.champs}</div>
          {choix.apres}
          {reprise && <p className="loc-muet" data-origine-proposee>Proposée d’après le propriétaire : rien n’est enregistré tant que vous ne cliquez pas « Enregistrer l’origine ».</p>}
          {issue !== null && <p className={issue.sorte === 'ok' ? 'gst-info' : 'gst-erreur'} role={issue.sorte === 'ok' ? 'status' : 'alert'} data-issue-origine={issue.sorte}>{issue.mot}</p>}
          <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi || (!change && !reprise)} onClick={() => setRecap(true)} data-enregistrer-origine>
              Enregistrer l’origine</button>
          </div>
        </>
      )}
      {recap && createPortal(
        <div className="mis-voile" onMouseDown={(e) => { if (e.target === e.currentTarget) setRecap(false); }}>
          <style>{CSS_MODALE_ISSUE}</style>
          <div className="mis-boite" role="dialog" aria-modal="true" aria-label="Récapitulatif" data-recap-origine>
            <h2 className="mis-titre">Récapitulatif</h2>
            <p style={{ margin: 0 }}>Origine du contact : <strong>{avant}</strong> → <strong>{apres}</strong></p>
            <p className="loc-muet" style={{ margin: 0 }}>Sur cette location seulement : le propriétaire n’est pas modifié.</p>
            <div className="mis-actions">
              <button type="button" className="svv-btn svv-btn-outline gst-btn mis-action" onClick={() => setRecap(false)} disabled={envoi}>Revenir</button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn mis-action" onClick={() => { void enregistrer(); }} disabled={envoi} data-confirmer-origine>
                {envoi ? 'Enregistrement…' : 'Confirmer'}</button>
            </div>
          </div>
        </div>, document.querySelector('.svv-adm-root') ?? document.body)}
    </section>
  );
}
