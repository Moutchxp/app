'use client';

import { useState } from 'react';
import { FicheCopropriete } from '../gestion/FicheCopropriete';
import {
  dateFr, jourFrDe, MENTION_PROJECTION, moisAnnee, unAnApres, verifierSaisieAg, A_RATTACHER, type ChampAg, type PropositionAg, type StatutAg,
  AIDE_AGO, LIBELLE_DERNIERE_AGO, LIBELLE_PROCHAINE_AGO, CONSIGNE_ALERTE_PROJECTION, projectionPassee, texteAlerteProjection,
} from '../../../../lib/location/agCopropriete';
import { prenomNom } from '../../../../lib/location/triRdvPreavis';
import { ArreteComptes } from '../gestion/ArreteComptes';

/**
 * ══ 🔴🔴 « VALIDER LA SORTIE » — LES DATES D'AG, case « Retenue de 20 % » cochée (Arno, 16/11/2026, migration 475) ══════════════════════════
 * Sous la case : a) « Dernière assemblée générale connue » (préremplie avec la dernière AG tenue de la copropriété, « saisie par … le … »,
 * « Confirmer cette date comme référence », modifiable) ; b) « Prochaine assemblée générale » (l'officielle à venir si elle existe, sinon
 * dernière + 1 an, « projection — … ») avec le statut OBLIGATOIRE « Date projetée » / « Date officielle » ; c) rien ne part sans les deux
 * dates et le statut (message, champs en rouge). Un bien relié à aucune copropriété : la rattacher à une copropriété qui couvre son adresse,
 * en créer une, ou laisser « à rattacher ». Copropriété non renseignée sur la fiche : « Immeuble en copropriété » proposé.
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */

export interface LuAgSortie {
  disponible: boolean;
  lotId: number;
  copropriete: { id: number; libelle: string } | null;
  immeuble: string | null;
  coproprieteSaisie: boolean | null;
  suggestions: { id: number; libelle: string }[];
  proposition: PropositionAg;
  adresse: string | null;
  moi: string;
}

export interface SaisieAgEcran {
  derniere: string;
  derniereConfirmee: boolean;
  prochaine: string;
  /** la prochaine a été modifiée à la main (elle ne suit plus la dernière + 1 an) */
  prochaineTouchee: boolean;
  statut: StatutAg | null;
  mention: boolean;
  /** 🔴 (Arno, 17/11/2026) la fenêtre d'alerte « projection périmée » : la date calculée (ou projetée tapée) déjà passée ; `null` : fermée */
  alerte: { date: string; sorte: 'calculee' | 'saisie' } | null;
  /** 🔴 Arno (23/11/2026) — « Créer une copropriété » n'est plus un choix ici : il ouvre la fiche Copropriété (le parcours de la Gestion). */
  copro: 'rattacher' | 'aucune';
  rattacher: number | null;
  coproOui: boolean;
}

/** Aujourd'hui à Paris, « AAAA-MM-JJ ». */
export const aujourdhuiParis = (): string => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

/** Une réponse lisible (un serveur plus ancien que l'écran : l'historique est dit « non installé », jamais d'erreur). PUR. */
export function luAgPropre(x: unknown): LuAgSortie {
  const o = (x ?? {}) as Partial<LuAgSortie>;
  const p = (o.proposition ?? {}) as Partial<PropositionAg>;
  return { disponible: o.disponible === true && typeof o.lotId === 'number', lotId: typeof o.lotId === 'number' ? o.lotId : 0, copropriete: o.copropriete ?? null,
    immeuble: o.immeuble ?? null, coproprieteSaisie: o.coproprieteSaisie ?? null, suggestions: Array.isArray(o.suggestions) ? o.suggestions : [],
    proposition: { derniere: p.derniere ?? null, prochaine: p.prochaine ?? null, projectionPerimee: typeof p.projectionPerimee === 'string' ? p.projectionPerimee : null },
    adresse: o.adresse ?? null, moi: typeof o.moi === 'string' ? o.moi : '' };
}

/** La saisie de départ, d'après ce que la copropriété connaît. PUR. */
export function saisieAgInitiale(lu: LuAgSortie): SaisieAgEcran {
  const p = lu.proposition;
  return { derniere: p.derniere?.date ?? '', derniereConfirmee: false, prochaine: p.prochaine?.date ?? '', prochaineTouchee: false,
    statut: p.prochaine?.statut ?? null, mention: false,
    // 🔴 (Arno, 17/11/2026) la projection déjà passée : le champ reste vide, la fenêtre d'alerte s'ouvre
    alerte: p.projectionPerimee ? { date: p.projectionPerimee, sorte: 'calculee' } : null, copro: lu.suggestions.length > 0 ? 'rattacher' : 'aucune', rattacher: lu.suggestions[0]?.id ?? null,
    coproOui: false };
}

/** Le corps envoyé au serveur. PUR. */
export function corpsAg(s: SaisieAgEcran, lu: LuAgSortie | null): Record<string, unknown> {
  if (lu === null || !lu.disponible) return {};
  return { ag: { derniere: s.derniere, derniereConfirmee: s.derniereConfirmee, prochaine: s.prochaine, statut: s.statut }, mentionAg: s.mention,
    coproprieteOui: s.coproOui,
    ...(lu.copropriete === null ? { coproprieteChoix: s.copro === 'rattacher' && s.rattacher !== null ? { rattacher: s.rattacher } : null } : {}) };
}

/** Le contrôle de la fenêtre (le serveur le refait). PUR. */
export function verdictAg(s: SaisieAgEcran, lu: LuAgSortie | null): { ok: true } | { ok: false; motif: string; champs: ChampAg[] } {
  if (lu === null || !lu.disponible) return { ok: true };
  const v = verifierSaisieAg(s, aujourdhuiParis());
  if (!v.ok) return v;
  return { ok: true };
}

export function AgSortie({ lu, s, onChange, desactive, onRelire }: { lu: LuAgSortie; s: SaisieAgEcran; onChange: (s: SaisieAgEcran) => void; desactive: boolean;
  /** 🔴 Arno (23/11/2026) — la fiche Copropriété refermée : la fenêtre relit la copropriété du bien (créée ou rattachée par la fiche). */
  onRelire?: () => void }) {
  const [ficheOuverte, setFicheOuverte] = useState(false);
  if (!lu.disponible) return <p className="loc-muet" data-ag-indisponible>Dates d’assemblée générale : la mise à jour de la base (migration 475) reste à appliquer.</p>;
  const v = verdictAg(s, lu);
  const enDefaut = (c: ChampAg): boolean => !v.ok && v.champs.includes(c);
  const p = lu.proposition;
  const derniereConnue = p.derniere !== null && p.derniere.date === s.derniere ? p.derniere : null;
  const officielleConnue = p.prochaine !== null && p.prochaine.statut === 'officielle' && p.prochaine.date === s.prochaine ? p.prochaine : null;
  const projection = !s.prochaineTouchee && officielleConnue === null && s.derniere !== '' && unAnApres(s.derniere) === s.prochaine;
  const jour = aujourdhuiParis();
  const changerDerniere = (d: string): void => {
    const suit = !s.prochaineTouchee && officielleConnue === null;
    // 🔴 (Arno, 17/11/2026) « dernière AGO + 1 an » déjà passée : pas conservée, la fenêtre d'alerte s'ouvre
    const perimee = suit && d !== '' ? projectionPassee(d, jour) : null;
    if (perimee !== null) { onChange({ ...s, derniere: d, derniereConfirmee: false, prochaine: '', statut: s.statut === 'officielle' ? s.statut : null, alerte: { date: perimee, sorte: 'calculee' } }); return; }
    const suite = suit ? (unAnApres(d) ?? s.prochaine) : s.prochaine;
    onChange({ ...s, derniere: d, derniereConfirmee: false, prochaine: d === '' && !s.prochaineTouchee ? '' : suite });
  };
  /** une date PROJETÉE déjà passée (tapée, ou le statut « projetée » choisi sur une date passée) : même contrôle, même fenêtre */
  const projeteePassee = (date: string, statut: StatutAg | null): boolean => statut === 'projetee' && /^\d{4}-\d{2}-\d{2}$/.test(date) && date < jour;
  return (
    <div className="vag" data-ag-sortie>
      {/* la copropriété du bien, ou de quoi l'y rattacher */}
      {lu.copropriete !== null ? <>
        <p className="loc-muet vag-copro" data-ag-copropriete>Copropriété : <strong>{lu.copropriete.libelle}</strong> — ses AG valent pour tous ses biens.</p>
        {/* 🔴 (Arno, 23/11/2026, 512) la date d'arrêté des comptes de la copropriété (facultative), le même composant que la fiche Copropriété */}
        <ArreteComptes coproprieteId={lu.copropriete.id} />
      </> : (
        <fieldset className="pvv-choix vag-rattacher" data-ag-rattacher>
          <legend className="pvs-libelle">Ce bien n’est relié à aucune copropriété</legend>
          {/* une case par copropriété qui couvre son adresse (pas de liste déroulante dans la Location) */}
          {lu.suggestions.map((c) => (
            <label key={c.id} className="pvv-case"><input type="radio" name="vag-copro" checked={s.copro === 'rattacher' && s.rattacher === c.id} disabled={desactive}
              onChange={() => onChange({ ...s, copro: 'rattacher', rattacher: c.id })} data-ag-copro="rattacher" data-ag-copro-choisie={c.id} />
              <span>Le rattacher à la copropriété « {c.libelle} » (elle couvre son adresse)</span></label>))}
          {/* 🔴🔴 Arno (23/11/2026) — « Créer une copropriété » = EXACTEMENT le parcours de la Gestion : la fiche Copropriété elle-même (même composant,
              aucune copie) pour l'adresse du bien — adresse officielle, adresses de la même parcelle, adresses déjà rattachées, garde anti-doublon,
              « Rattacher à … ? » et « Non » mémorisé. À son « Valider », la copropriété existe ; à sa fermeture, la fenêtre la relit. */}
          <div className="vag-creer" data-ag-creer>
            <button type="button" className="svv-btn svv-btn-outline gst-btn vag-creer-btn" disabled={desactive} onClick={() => setFicheOuverte(true)} data-ag-copro="creer">
              Créer une copropriété</button>
            <p className="loc-muet vag-aide">Ouvre la fiche Copropriété de l’adresse du bien, comme dans la Gestion : adresse officielle, autres adresses de la même parcelle, copropriété déjà rattachée à l’une d’elles. Une fois la fiche validée, la copropriété apparaît ici.</p>
          </div>
          <label className="pvv-case"><input type="radio" name="vag-copro" checked={s.copro === 'aucune'} disabled={desactive} onChange={() => onChange({ ...s, copro: 'aucune' })} data-ag-copro="aucune" />
            <span>Ne pas rattacher maintenant</span></label>
          {s.copro === 'aucune' && <p className="vse-orange" data-ag-a-rattacher>Les dates seront enregistrées avec la sortie, {A_RATTACHER}.</p>}
        </fieldset>
      )}
      {lu.coproprieteSaisie === null && (
        <label className="pvv-case" data-ag-copro-oui><input type="checkbox" checked={s.coproOui} disabled={desactive} onChange={(e) => onChange({ ...s, coproOui: e.target.checked })} />
          <span>Immeuble en copropriété (le renseigner sur la fiche du bien)</span></label>)}

      {/* a) la dernière AG connue */}
      {/* 🔴 (Arno, 17/11/2026) « Seule l'AGO compte : c'est l'assemblée qui clôture les comptes de la copropriété. » */}
      <p className="loc-muet vag-aide" data-ag-aide-ago>{AIDE_AGO}</p>
      <label className={`pvs-champ${enDefaut('derniere') ? ' vag-defaut' : ''}`}><span className="pvs-libelle">{LIBELLE_DERNIERE_AGO}</span>
        <input type="date" value={s.derniere} disabled={desactive} aria-invalid={enDefaut('derniere')} onChange={(e) => changerDerniere(e.target.value)} data-ag-derniere /></label>
      {derniereConnue !== null && (
        <p className="loc-muet vag-auteur" data-ag-derniere-auteur>saisie par {prenomNom(derniereConnue.par)} le {jourFrDe(derniereConnue.le)}{' '}
          {s.derniereConfirmee ? <span className="vag-confirmee" data-ag-confirmee>✓ confirmée comme référence</span>
            : <button type="button" className="svv-btn svv-btn-outline gst-btn vag-mini" disabled={desactive} onClick={() => onChange({ ...s, derniereConfirmee: true })} data-ag-confirmer>Confirmer cette date comme référence</button>}</p>)}
      {p.derniere === null && s.derniere === '' && <p className="loc-muet" data-ag-derniere-vide>Aucune AGO connue pour cette copropriété : saisissez la dernière.</p>}

      {/* b) la prochaine AG et son statut */}
      <label className={`pvs-champ${enDefaut('prochaine') ? ' vag-defaut' : ''}`}><span className="pvs-libelle">{LIBELLE_PROCHAINE_AGO}</span>
        <input type="date" value={s.prochaine} disabled={desactive} aria-invalid={enDefaut('prochaine')}
          onChange={(e) => {
            const statut = officielleConnue !== null && s.statut === 'officielle' ? null : s.statut;
            if (projeteePassee(e.target.value, statut)) { onChange({ ...s, prochaine: '', prochaineTouchee: true, statut, alerte: { date: e.target.value, sorte: 'saisie' } }); return; }
            onChange({ ...s, prochaine: e.target.value, prochaineTouchee: true, statut });
          }} data-ag-prochaine /></label>
      {projection && <p className="loc-muet" data-ag-projection>{MENTION_PROJECTION}</p>}
      <div className={`vag-statut${enDefaut('statut') ? ' vag-defaut' : ''}`} role="group" aria-label="Statut de la prochaine AGO" data-ag-statut={s.statut ?? 'aucun'}>
        {(['projetee', 'officielle'] as const).map((x) => (
          <button key={x} type="button" className="pva-segment" aria-pressed={s.statut === x} disabled={desactive} onClick={() => {
            if (projeteePassee(s.prochaine, x)) { onChange({ ...s, prochaine: '', prochaineTouchee: true, statut: x, alerte: { date: s.prochaine, sorte: 'saisie' } }); return; }
            onChange({ ...s, statut: x });
          }} data-ag-statut-choix={x}>
            {x === 'projetee' ? 'Date projetée' : 'Date officielle'}</button>))}
      </div>
      {s.prochaine !== '' && (
        <p className="loc-muet vag-auteur" data-ag-prochaine-auteur>
          {officielleConnue !== null && s.statut === 'officielle' && officielleConnue.par !== null
            ? <>date officielle déjà connue — renseignée par {prenomNom(officielleConnue.par)}{officielleConnue.le ? ` le ${jourFrDe(officielleConnue.le)}` : ''}</>
            : <>renseignée par {prenomNom(lu.moi)}</>}</p>)}
      {!v.ok && <p className="cp-refus" role="status" data-ag-message>{v.motif}</p>}

      {/* e) la mention de la prochaine AG dans le paragraphe « 20 % » (proposée, modifiable) */}
      {s.prochaine !== '' && /^\d{4}-\d{2}-\d{2}$/.test(s.prochaine) && (
        <label className="pvv-case" data-ag-mention><input type="checkbox" checked={s.mention} disabled={desactive} onChange={(e) => onChange({ ...s, mention: e.target.checked })} />
          <span>Mentionner dans le paragraphe « 20 % » l’assemblée générale ordinaire de {moisAnnee(s.prochaine)} ({dateFr(s.prochaine)})</span></label>)}
      {ficheOuverte && <FicheCopropriete lotId={lu.lotId} onFerme={() => { setFicheOuverte(false); onRelire?.(); }} />}
      {s.alerte !== null && <AlerteProjection alerte={s.alerte} derniere={s.derniere} jour={jour}
        onFermer={() => onChange({ ...s, alerte: null })}
        onReporter={(date, statut) => onChange({ ...s, prochaine: date, statut, prochaineTouchee: true, alerte: null })} />}
    </div>
  );
}

/**
 * 🔴🔴 (Arno, 17/11/2026) LA FENÊTRE D'ALERTE « PROJECTION PÉRIMÉE » : l'incohérence dite mot pour mot, la date à saisir à la main avec le choix
 * « Date projetée » (à venir) ou « Date officielle » ; « Fermer » laisse le champ VIDE (la sortie reste bloquée tant qu'une date valable manque).
 */
function AlerteProjection({ alerte, derniere, jour, onFermer, onReporter }: { alerte: { date: string; sorte: 'calculee' | 'saisie' }; derniere: string; jour: string;
  onFermer: () => void; onReporter: (date: string, statut: StatutAg) => void }) {
  const [date, setDate] = useState('');
  const [statut, setStatut] = useState<StatutAg | null>(null);
  const [tente, setTente] = useState(false);
  const v = verifierSaisieAg({ derniere, prochaine: date, statut }, jour);
  const motif = v.ok ? null : v.motif;
  return (
    <div className="vag-voile" data-ag-alerte-projection>
      <div className="vag-alerte" role="alertdialog" aria-modal="true" aria-labelledby="vag-alerte-titre" aria-describedby="vag-alerte-texte"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onFermer(); } }}>
        <p className="vag-alerte-titre" id="vag-alerte-titre">Prochaine AGO à saisir</p>
        <p className="vag-alerte-texte" id="vag-alerte-texte" data-ag-alerte-texte>{texteAlerteProjection(alerte.date, alerte.sorte)}</p>
        <p className="loc-muet vag-alerte-consigne">{CONSIGNE_ALERTE_PROJECTION}</p>
        <label className={`pvs-champ${tente && motif !== null && !v.ok && v.champs.includes('prochaine') ? ' vag-defaut' : ''}`}><span className="pvs-libelle">{LIBELLE_PROCHAINE_AGO}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-ag-alerte-date autoFocus /></label>
        <div className={`vag-statut${tente && !v.ok && v.champs.includes('statut') ? ' vag-defaut' : ''}`} role="group" aria-label="Statut de la prochaine AGO">
          {(['projetee', 'officielle'] as const).map((x) => (
            <button key={x} type="button" className="pva-segment" aria-pressed={statut === x} onClick={() => setStatut(x)} data-ag-alerte-statut={x}>
              {x === 'projetee' ? 'Date projetée' : 'Date officielle'}</button>))}
        </div>
        {tente && motif !== null && <p className="cp-refus" role="alert" data-ag-alerte-motif>{motif}</p>}
        <div className="vag-alerte-actions">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFermer} data-ag-alerte-fermer>Fermer (le champ reste vide)</button>
          <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { setTente(true); if (v.ok && statut !== null) onReporter(date, statut); }} data-ag-alerte-reporter>Reporter cette date</button>
        </div>
      </div>
    </div>
  );
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. */
export const CSS_AG_SORTIE = `
.vag{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border-radius:10px;border-left:4px solid var(--color-svv-line-strong);background:var(--color-svv-surface)}
.vag input[type=date],.vag input:not([type]){min-height:44px;box-sizing:border-box;max-width:100%}
.vag-copro,.vag-auteur{margin:0;overflow-wrap:anywhere}
.vag-rattacher{display:flex;flex-direction:column;gap:4px}
.vag-statut{display:flex;flex-wrap:wrap;gap:6px;border-radius:10px;padding:2px}
.vag-defaut input,.vag-defaut input:focus{border-color:var(--color-svv-red);outline-color:var(--color-svv-red)}
.vag-defaut .pvs-libelle{color:var(--color-svv-red)}
.vag-statut.vag-defaut{outline:2px solid var(--color-svv-red)}
.vag-mini{min-height:36px;padding:4px 10px;font-size:.85rem}
.vag-confirmee{color:var(--color-svv-green-ink);font-weight:800}
.vag-aide{margin:0}
.vag-voile{position:fixed;inset:0;z-index:300;background:color-mix(in srgb, var(--color-svv-ink) 45%, transparent);display:flex;align-items:center;justify-content:center;padding:16px}
.vag-alerte{width:100%;max-width:460px;box-sizing:border-box;max-height:calc(100vh - 32px);overflow:auto;display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:14px;background:var(--color-svv-surface);color:var(--color-svv-ink);border-top:4px solid var(--color-svv-orange)}
.vag-alerte-titre{margin:0;font-weight:800;font-size:1.05rem}
.vag-alerte-texte{margin:0;font-weight:700}
.vag-alerte-consigne{margin:0}
.vag-alerte input[type=date]{min-height:44px;box-sizing:border-box;max-width:100%}
.vag-alerte-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
.vag-alerte-actions .svv-btn{min-height:44px}
`;
