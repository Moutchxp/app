'use client';

import { useCallback, useEffect, useState } from 'react';
import { useChoixOrigine } from './ChoixOrigine';
import { API_SUIVI, posterSuivi } from './suiviApi';
import { useParametresSuivi } from './SuiviCommercial';
import { ValidationOrigine, type LigneConsequenceVue } from './ValidationOrigine';
import { libelleOrigineContact, LIBELLE_ORIGINE_CONTACT, originesProposees, type OrigineContact } from '../../../../lib/location/suivi/suivi';
import { mentionsOrigine, prerempliOrigine, type OrigineDuBien } from '../../../../lib/location/origineProprietaire';
import { motAnnexeLouee, type AnnexeLouee } from '../../../../lib/location/suivi/annexesGestion';

/**
 * ══ 🔴 Arno (25/10/2026) — L'ORIGINE DU CONTACT D'UNE LOCATION : LECTURE, « MODIFIER », DOUBLE VALIDATION (le même composant partout) ════
 * Bloc 9 de la Fiche du bien (Suivi du mois) et bloc 4 du Dossier de location. Une origine ENREGISTRÉE s'affiche en LECTURE (valeur, et
 * « validé par <nom> le <date> », ou « reprise du fichier de suivi ») avec « Modifier » ; « Modifier » → les champs, « Annuler »,
 * « Enregistrer l'origine » → « Conséquences de la modification » (serveur, sans rien écrire) → la case « J'ai bien compris… » →
 * « Confirmer la modification ». Encore « à renseigner » : les champs directement (l'origine du propriétaire proposée), et UNE validation.
 * Imposée par la case « Relocation » (cochée ET origine « Relocation ») : « Modifier » dit d'abord comment la changer (décocher la case).
 * Enregistrée : « ✓ Origine modifiée », retour en lecture, l'hôte se relit (`onEnregistre`).
 */
export interface LectureOrigineActivite {
  origineContact: OrigineContact | null; origineContactPrecision: string | null; apporteurId: number | null; collegueId: number | null; empreinte: string;
  avecGestion: boolean; mandatGestion?: boolean; source?: string; validation?: { par: string; le: string } | null;
  bien: OrigineDuBien | null; annexe?: AnnexeLouee | null;
}
type Saisie = { origine: string; precision: string; collegueId: number | null; apporteurId: number | null };
const versSaisie = (l: LectureOrigineActivite): Saisie => ({ origine: l.origineContact ?? '', precision: l.origineContactPrecision ?? '', collegueId: l.collegueId, apporteurId: l.apporteurId });
const dateFr = (iso: string): string => iso.slice(0, 10).split('-').reverse().join('/');
/** Imposée : la case « Relocation » cochée ET l'origine « Relocation ». PUR. */
export const origineImposee = (l: Pick<LectureOrigineActivite, 'avecGestion' | 'origineContact'>): boolean => l.avecGestion && l.origineContact === 'relocation';

/** Les écrans qui modifient l'origine d'une location (inscrits au journal). 🔴 26/10/2026 : la fiche locataire, depuis le Suivi et depuis la Location. */
export type EcranOrigine = 'Fiche du bien (Suivi du mois)' | 'Dossier de location (Suivi du mois)' | 'Fiche locataire (Suivi du mois)' | 'Fiche locataire (Location)';

export function OrigineActivite({ activiteId, ecran, onEnregistre, onAllerAuxCases }: {
  activiteId: number;
  ecran: EcranOrigine;
  onEnregistre: () => void;
  /** Aller aux cases « Relocation » / « Nouvelle gestion » (absent : le message le dit sans lien). */
  onAllerAuxCases?: () => void;
}) {
  const parametres = useParametresSuivi();
  const [lu, setLu] = useState<LectureOrigineActivite | null>(null);
  const [motifLecture, setMotifLecture] = useState<string | null>(null);
  const [mode, setMode] = useState<'lecture' | 'imposee' | 'edition'>('lecture');
  const [saisie, setSaisie] = useState<Saisie>({ origine: '', precision: '', collegueId: null, apporteurId: null });
  const [reprise, setReprise] = useState(false);
  const [validation, setValidation] = useState(false);
  const [fait, setFait] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivant = true;
    fetch(`${API_SUIVI}?vue=origine-activite&id=${activiteId}`, { cache: 'no-store' }).then((r) => r.json()).then((d: { etat?: string; data?: LectureOrigineActivite }) => {
      if (!vivant) return;
      if (d.etat !== 'ok' || d.data === undefined) { setMotifLecture('L’origine de cette location n’a pas pu être lue.'); return; }
      const l = d.data;
      setLu(l);
      const vide = l.origineContact === null && l.apporteurId === null;
      // Encore « à renseigner » : les champs directement, l'origine du propriétaire PROPOSÉE (rien n'est écrit sans confirmation).
      const h = vide ? prerempliOrigine({ origineContact: '', origineContactPrecision: '', apporteurId: '', collegueId: '' }, l.bien) : null;
      if (h?.reprise) {
        setSaisie({ origine: h.champs.origineContact, precision: h.champs.origineContactPrecision, collegueId: h.champs.collegueId === '' ? null : Number(h.champs.collegueId),
          apporteurId: h.champs.apporteurId === '' ? null : Number(h.champs.apporteurId) });
      } else setSaisie(versSaisie(l));
      setReprise(h?.reprise === true);
      setMode(vide ? 'edition' : 'lecture');
    }).catch(() => { if (vivant) setMotifLecture('L’origine de cette location n’a pas pu être lue : le serveur n’a pas répondu.'); });
    return () => { vivant = false; };
  }, [activiteId, n]);

  const pl = parametres.lu;
  const poser = (p: Partial<Saisie>): void => { setSaisie((s) => ({ ...s, ...p })); setFait(null); };
  const s = saisie;
  const premiere = lu !== null && lu.origineContact === null && lu.apporteurId === null;
  const choix = useChoixOrigine({
    valeur: s,
    lu: { apporteurs: pl?.apporteurs ?? [], collegues: pl?.collegues ?? [], moi: pl?.moi ?? null, annuaire: pl?.annuaire === true },
    rafraichir: parametres.rafraichir,
    options: originesProposees(pl?.personnalisable === true, pl?.dejaClient === true).map((o) => ({ id: o, libelle: LIBELLE_ORIGINE_CONTACT[o],
      ...(o === 'relocation' && lu?.avecGestion !== true ? { bloque: true, mention: ' — seulement avec la case « Relocation » de la location' } : {}) })),
    libelle: 'Origine du contact propriétaire',
    sousOrigine: <>
      {mentionsOrigine({ origineContact: s.origine as OrigineContact | '', origineContactPrecision: s.precision, apporteurId: s.apporteurId === null ? '' : String(s.apporteurId),
        collegueId: s.collegueId === null ? '' : String(s.collegueId) }, lu?.bien ?? null, { reprise }).map((m) => (
        <small key={m} className="loc-muet" data-mention-origine={m.startsWith('reprise') ? 'reprise' : m.startsWith('différente') ? 'differente' : m.startsWith('identique') ? 'identique' : 'coproprietaires'}>{m}</small>))}
    </>,
    onOrigine: (x) => { setReprise(false); poser({ origine: x, ...(x !== 'apporteur' ? { apporteurId: null } : {}), ...(x !== 'collegue' ? { collegueId: null } : {}), ...(x !== 'personnalise' ? { precision: '' } : {}) }); },
    onPrecision: (t) => poser({ precision: t }),
    onCollegue: (id) => poser({ collegueId: id }),
    onApporteur: (id, depuisAnnuaire) => { setReprise(false); poser({ apporteurId: id, ...(depuisAnnuaire ? { origine: 'apporteur', collegueId: null, precision: '' } : {}) }); },
  });
  const corps = useCallback((extra: Record<string, unknown>) => ({ action: 'origine-activite', id: activiteId, ecran,
    origine: { origineContact: s.origine === '' ? null : s.origine, origineContactPrecision: s.precision, apporteurId: s.apporteurId, collegueId: s.collegueId }, ...extra }), [activiteId, ecran, s]);
  const charger = useCallback(async (): Promise<{ lignes: LigneConsequenceVue[] } | { motif: string }> => {
    const r = await posterSuivi(corps({ simuler: true }), { propre: true });
    return r.motif !== null ? { motif: r.motif } : { lignes: ((r.data as { lignes?: LigneConsequenceVue[] } | undefined)?.lignes ?? []) };
  }, [corps]);

  if (motifLecture !== null) return <p className="gst-erreur" role="alert">{motifLecture}</p>;
  if (lu === null || pl === null) return <p className="gst-info" role="status">{parametres.erreur ?? 'Lecture…'}</p>;
  const mot = libelleOrigineContact(lu.origineContact, lu.origineContactPrecision) || 'à renseigner';
  const imposee = origineImposee(lu);
  return (
    <div className="ora" data-origine-activite={mode}>
      <style>{CSS_ORIGINE_ACTIVITE}</style>
      {lu.annexe && <p className="loc-muet" style={{ margin: '0 0 8px' }} data-annexe-louee>{motAnnexeLouee(lu.annexe)}{lu.annexe.principalEnGestion ? '' : ' (lot principal sans gestion)'}.</p>}
      {fait !== null && <p className="gst-info" role="status" data-issue-origine="ok">{fait}</p>}
      {mode !== 'edition' ? (
        <div className="ora-lecture" data-origine-lecture>
          <p className="ora-ligne"><span className="ora-mot">Origine du contact</span> <strong data-origine-valeur>{mot}</strong></p>
          <p className="loc-muet ora-trace" data-origine-trace>
            {imposee ? 'Imposée par la case « Relocation » (portefeuille de gestion).'
              : lu.validation ? `Validé par ${lu.validation.par} le ${dateFr(lu.validation.le)}.`
                : lu.source === 'import' ? 'Reprise du fichier de suivi.' : 'Saisie avec la location.'}
            {lu.bien?.origine && lu.origineContact !== 'relocation' ? ` ${mentionsOrigine(versSaisieChamps(lu), lu.bien, { reprise: false }).map((m) => m.charAt(0).toUpperCase() + m.slice(1)).join(' · ')}.` : ''}</p>
          {mode === 'imposee' ? (
            <div className="ora-imposee" role="alert" data-origine-imposee-avertissement>
              <p style={{ margin: 0 }}>L’origine est imposée par la case Relocation. Pour la changer, décochez Relocation.</p>
              <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
                {onAllerAuxCases && <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={onAllerAuxCases} data-aller-aux-cases>Aller aux cases Relocation / Nouvelle gestion</button>}
                <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setMode('lecture')}>Annuler</button>
                <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setMode('edition')} data-modifier-quand-meme>Modifier quand même</button>
              </div>
            </div>
          ) : (
            <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setFait(null); setSaisie(versSaisie(lu)); setReprise(false); setMode(imposee ? 'imposee' : 'edition'); }}
                data-modifier-origine>Modifier</button>
            </div>
          )}
        </div>
      ) : (
        <div className="ora-edition" data-origine-edition>
          <div className="loc-grille loc-suivi-ligne loc-suivi-ligne--deux" data-origine-contact-bloc>{choix.champs}</div>
          {choix.apres}
          {premiere && reprise && <p className="loc-muet" data-origine-proposee>Proposée d’après le propriétaire : rien n’est enregistré tant que vous ne confirmez pas.</p>}
          <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
            {!premiere && <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setMode('lecture')} data-annuler-origine>Annuler</button>}
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={s.origine === ''} onClick={() => setValidation(true)} data-enregistrer-origine>Enregistrer l’origine</button>
          </div>
        </div>
      )}
      {validation && (
        <ValidationOrigine premiere={premiere} charger={charger} onRevenir={() => setValidation(false)}
          onConfirmer={async () => {
            const r = await posterSuivi(corps({ empreinte: lu.empreinte }), { propre: true });
            if (r.motif !== null) return r.motif;
            setValidation(false);
            setFait(premiere ? '✓ Origine enregistrée.' : '✓ Origine modifiée.');
            setN((x) => x + 1);
            onEnregistre();
            return null;
          }} />
      )}
    </div>
  );
}

const versSaisieChamps = (l: LectureOrigineActivite) => ({ origineContact: (l.origineContact ?? '') as OrigineContact | '', origineContactPrecision: l.origineContactPrecision ?? '',
  apporteurId: l.apporteurId === null ? '' : String(l.apporteurId), collegueId: l.collegueId === null ? '' : String(l.collegueId) });

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; cibles de 44 px. */
export const CSS_ORIGINE_ACTIVITE = `
.ora{display:flex;flex-direction:column;gap:6px}
.ora-lecture{display:flex;flex-direction:column;gap:4px}
.ora-ligne{margin:0;display:flex;flex-wrap:wrap;align-items:baseline;gap:8px}
.ora-mot{color:var(--color-svv-muted)}
.ora-trace{margin:0;font-size:.85rem}
.ora-imposee{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border-radius:12px;border:1px solid var(--color-svv-amber);background:color-mix(in srgb, var(--color-svv-amber) 10%, transparent)}
`;
