'use client';

import { useEffect, useState } from 'react';
import { agoApres, suiviVingtPourcent, MENTION_INCERTAINE } from '../../../../lib/location/vingtPourcent';
import type { ArreteComptes as Arrete } from '../../../../lib/location/arreteComptes';
import { FicheCopropriete } from '../gestion/FicheCopropriete';
import {
  dateFr, jourFrDe, MENTION_PROJECTION, moisAnnee, verifierSaisieAg, A_RATTACHER, type ChampAg, type PropositionAg, type StatutAg,
  AIDE_AGO, mentionAgLocataire, LIBELLE_DERNIERE_AGO, LIBELLE_PROCHAINE_AGO, CONSIGNE_ALERTE_PROJECTION, projectionPassee, texteAlerteProjection,
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

/** 🔴 Arno (23/11/2026) — « Ne pas rattacher maintenant » : rien n'est enregistré, le suivi des 20 % reste incomplet. */
export const SANS_COPROPRIETE_INCOMPLET = 'Sans copropriété, le suivi des 20 % restera incomplet : rattachez le bien dès que possible.';
/** 🔴 Arno (23/11/2026) — sans copropriété rattachée : la date d'arrêté des comptes ne peut pas se saisir. */
export const ARRETE_SANS_COPROPRIETE = 'Rattachez ou créez la copropriété pour saisir sa date d’arrêté des comptes.';
/** 🔴 Arno (23/11/2026) — le bandeau quand la copropriété n'a aucune AGO connue. */
export const BANDEAU_DERNIERE_AGO_MANQUANTE = 'Dernière AGO manquante : sans elle, le suivi des 20 % ne peut pas être fiable. Saisissez-la ci-dessous.';

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
  /** 🔴 Arno (23/11/2026) — les AGO officielles de la copropriété et sa date d'arrêté : la prochaine AGO est PRÉREMPLIE par le calcul des 20 % */
  officielles: string[];
  arrete: Arrete | null;
}

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const offsDe = (officielles: readonly string[], ...autres: (string | null)[]): string[] =>
  [...new Set([...officielles, ...autres.filter((d): d is string => d !== null && DATE_ISO.test(d))])].sort();

/**
 * 🔴🔴 Arno (23/11/2026) — « PROCHAINE AGO » = LA PROCHAINE AGO DE LA COPROPRIÉTÉ (« pas forcément celle qui libère les 20 % ») : la première AGO après
 * le jour de la validation, l'officielle de l'année si elle est connue, sinon projetée sur le jour et le mois de la dernière AGO officielle (calcul
 * b0453dc2, `agoApres`), à la place de « dernière + 1 an ». Les AGO officielles connues et la dernière AGO saisie ici servent de base. `null` :
 * aucune AGO connue. PUR.
 */
export function prochaineCalculee(o: { officielles: readonly string[]; derniere: string; jour: string }): { date: string; statut: StatutAg } | null {
  const a = agoApres(offsDe(o.officielles, o.derniere), o.jour, o.jour);
  return a === null ? null : { date: a.date, statut: a.statut };
}

/** L'AGO QUI COMPTE pour le locataire, telle que la fenêtre la montre et l'envoie. */
export interface AgoQuiCompteEcran { date: string; statut: StatutAg; incertaine: boolean; cloture: string | null }
/**
 * 🔴🔴 Arno (23/11/2026) — « l'utilisateur, avant de valider la sortie et l'envoi du mail, doit clairement savoir pour quelle date il prévient son ou ses
 * locataires » : l'AGO QUI COMPTE (calcul b0453dc2 : exercice clos au premier arrêté ≥ date de sortie, puis première AGO après cet arrêté ; arrêté
 * inconnu : après la validation, « incertaine »), et non la simple « Prochaine AGO ». Une prochaine AGO saisie « officielle » compte comme une AGO
 * officielle (elle sera écrite sur la copropriété). `null` : aucune AGO connue. PUR.
 */
export function agoQuiCompte(o: { officielles: readonly string[]; derniere: string; prochaine: string; statut: StatutAg | null; dateSortie: string; arrete: Arrete | null; jour: string }): AgoQuiCompteEcran | null {
  const offs = offsDe(o.officielles, o.derniere, o.statut === 'officielle' ? o.prochaine : null);
  const r = suiviVingtPourcent({ dateSortie: DATE_ISO.test(o.dateSortie) ? o.dateSortie : o.jour, valideLe: o.jour, arrete: o.arrete, officielles: offs, aujourdhui: o.jour });
  return r.etat === 'ok' ? { date: r.ago.date, statut: r.ago.statut, incertaine: r.incertaine, cloture: r.exercice } : null;
}

/** Le libellé de la case, en clair : l'AGO qui permettra de restituer les 20 %, son statut, l'exercice (ou l'incertitude). PUR. */
export function libelleCaseAgoQuiCompte(a: AgoQuiCompteEcran): string {
  const quand = a.statut === 'officielle' ? `prévue le ${dateFr(a.date)}` : `attendue vers ${moisAnnee(a.date)} (date approximative)`;
  const exercice = a.cloture === null ? ` (estimation incertaine : date d’arrêté des comptes manquante)` : ` — exercice clôturé le ${dateFr(a.cloture)}`;
  return `Indiquer au locataire l’AGO qui permettra de restituer ses 20 % : ${quand}${exercice}.`;
}
/** Le texte EXACT ajouté au paragraphe du locataire (sans la virgule d'attache). PUR. */
export const texteAjouteAuMail = (a: AgoQuiCompteEcran): string => mentionAgLocataire(a.date, a.statut).replace(/^, /, '');
export const AIDE_PROCHAINE_AGO = 'Prochaine AGO de la copropriété — pas forcément celle qui libère les 20 % : voir ci-dessous.';

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
  /** 🔴 Arno (23/11/2026) — l'AGO QUI COMPTE pour le locataire (tenue à jour par la fenêtre) : c'est elle que la case et le mail indiquent */
  ago?: AgoQuiCompteEcran | null;
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
    adresse: o.adresse ?? null, moi: typeof o.moi === 'string' ? o.moi : '',
    officielles: Array.isArray(o.officielles) ? o.officielles.filter((d) => typeof d === 'string') : [], arrete: o.arrete ?? null };
}

/** La saisie de départ, d'après ce que la copropriété connaît. PUR. */
export function saisieAgInitiale(lu: LuAgSortie, jour: string = aujourdhuiParis()): SaisieAgEcran {
  const p = lu.proposition;
  // 🔴 Arno (23/11/2026) — sans AGO officielle à venir déjà connue (elle reste prioritaire) : la prochaine AGO PRÉREMPLIE par le calcul des 20 %,
  // qui n'est jamais antérieure au jour de la validation (l'ancienne « dernière + 1 an » déjà passée ne peut plus se produire)
  const officielleAVenir = p.prochaine !== null && p.prochaine.statut === 'officielle';
  // 🔴 Arno (23/11/2026, option A) — dernière AGO de plus d'un an : la décision du 17/11 d'abord (champ vide, alerte, sortie bloquée)
  const calc = officielleAVenir || p.projectionPerimee ? null : prochaineCalculee({ officielles: lu.officielles, derniere: p.derniere?.date ?? '', jour });
  const prochaine = calc?.date ?? p.prochaine?.date ?? '';
  // 🔴 Arno (23/11/2026) — « lorsque la date est calculée automatiquement […] il faut sélectionner par défaut le bouton "Date projetée" »
  const statut = calc !== null ? calc.statut : p.prochaine?.statut ?? null;
  // l'AGO qui compte (date de sortie pas encore saisie : le jour) ; dernière AGO de plus d'un an non confirmée (option A) : rien
  const ago = p.projectionPerimee ? null : agoQuiCompte({ officielles: lu.officielles, derniere: p.derniere?.date ?? '', prochaine, statut, dateSortie: '', arrete: lu.arrete, jour });
  return { derniere: p.derniere?.date ?? '', derniereConfirmee: false, prochaine, prochaineTouchee: false, statut, mention: false, ago,
    // 🔴 (Arno, 17/11/2026) la projection déjà passée : le champ reste vide, la fenêtre d'alerte s'ouvre (sans calcul possible seulement)
    alerte: calc === null && p.projectionPerimee ? { date: p.projectionPerimee, sorte: 'calculee' } : null, copro: lu.suggestions.length > 0 ? 'rattacher' : 'aucune', rattacher: lu.suggestions[0]?.id ?? null,
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

export function AgSortie({ lu, s, onChange, desactive, onRelire, dateSortie = '' }: { lu: LuAgSortie; s: SaisieAgEcran; onChange: (s: SaisieAgEcran) => void; desactive: boolean;
  /** 🔴 Arno (23/11/2026) — la date de sortie saisie : l'exercice concerné, donc la prochaine AGO calculée, en dépendent */
  dateSortie?: string;
  /** 🔴 Arno (23/11/2026) — la fiche Copropriété refermée : la fenêtre relit la copropriété du bien (créée ou rattachée par la fiche). */
  onRelire?: () => void }) {
  const [ficheOuverte, setFicheOuverte] = useState(false);
  /** 🔴 Arno (23/11/2026) — l'arrêté des comptes de la copropriété (lu, puis saisi ici par ArreteComptes) : il recalcule la prochaine AGO */
  const [arrete, setArrete] = useState<Arrete | null>(lu.arrete);
  if (!lu.disponible) return <p className="loc-muet" data-ag-indisponible>Dates d’assemblée générale : la mise à jour de la base (migration 475) reste à appliquer.</p>;
  const v = verdictAg(s, lu);
  const enDefaut = (c: ChampAg): boolean => !v.ok && v.champs.includes(c);
  const p = lu.proposition;
  const derniereConnue = p.derniere !== null && p.derniere.date === s.derniere ? p.derniere : null;
  const officielleConnue = p.prochaine !== null && p.prochaine.statut === 'officielle' && p.prochaine.date === s.prochaine ? p.prochaine : null;
  const jour = aujourdhuiParis();
  // 🔴🔴 Arno (23/11/2026) — la prochaine AGO SUIT le calcul du suivi des 20 % (date de sortie, arrêté, AGO officielles, dernière saisie) tant qu'elle
  // n'a pas été modifiée à la main et qu'aucune AGO officielle à venir n'est connue (à la place de « dernière + 1 an »)
  // 🔴 Arno (23/11/2026, option A) — tant que la dernière AGO a plus d'un an et n'est ni confirmée ni corrigée, la décision du 17/11 vaut (champ
  // vide, alerte, sortie bloquée) : aucun préremplissage ; confirmée comme référence ou corrigée, la prochaine AGO suit le calcul
  const perimee = DATE_ISO.test(s.derniere) && !s.derniereConfirmee && projectionPassee(s.derniere, jour) !== null;
  const suit = !s.prochaineTouchee && officielleConnue === null && !perimee;
  const calc = (derniere: string) => prochaineCalculee({ officielles: lu.officielles, derniere, jour });
  const calcule = calc(s.derniere);
  // 🔴 Arno (23/11/2026) — l'AGO QUI COMPTE pour le locataire (date de sortie, arrêté, AGO officielles, dernière saisie, prochaine si officielle)
  const ago = perimee ? null : agoQuiCompte({ officielles: lu.officielles, derniere: s.derniere, prochaine: s.prochaine, statut: s.statut, dateSortie, arrete, jour });
  const cleAgo = ago === null ? '' : `${ago.date}|${ago.statut}|${ago.incertaine}|${ago.cloture ?? ''}`;
  const cleAgoSaisie = s.ago == null ? '' : `${s.ago.date}|${s.ago.statut}|${s.ago.incertaine}|${s.ago.cloture ?? ''}`;
  const projection = suit && calcule !== null && calcule.statut === 'projetee' && calcule.date === s.prochaine;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // 🔴 Arno (23/11/2026) — préremplie par le calcul : « Date projetée » sélectionné d'office (sauf statut déjà choisi pour cette date)
  useEffect(() => {
    const preremplir = suit && calcule !== null && (calcule.date !== s.prochaine || s.statut === null);
    if (!preremplir && cleAgo === cleAgoSaisie) return;
    onChange({ ...s, ...(preremplir && calcule !== null ? { prochaine: calcule.date, statut: s.statut ?? calcule.statut, alerte: null } : {}), ago });
  }, [suit, calcule?.date, s.prochaine, s.statut, cleAgo, cleAgoSaisie]);
  const changerDerniere = (d: string): void => {
    const libre = !s.prochaineTouchee && officielleConnue === null;
    // 🔴 (Arno, 17/11/2026) « dernière AGO + 1 an » déjà passée : pas conservée, la fenêtre d'alerte s'ouvre (gardé, option A du 23/11)
    const perimeeSaisie = libre && d !== '' ? projectionPassee(d, jour) : null;
    if (perimeeSaisie !== null) { onChange({ ...s, derniere: d, derniereConfirmee: false, prochaine: '', statut: s.statut === 'officielle' ? s.statut : null, alerte: { date: perimeeSaisie, sorte: 'calculee' } }); return; }
    const c = libre ? calc(d) : null;
    onChange({ ...s, derniere: d, derniereConfirmee: false, prochaine: libre ? (c?.date ?? (d === '' ? '' : s.prochaine)) : s.prochaine, ...(libre && c !== null ? { alerte: null } : {}) });
  };
  /** une date PROJETÉE déjà passée (tapée, ou le statut « projetée » choisi sur une date passée) : même contrôle, même fenêtre */
  const projeteePassee = (date: string, statut: StatutAg | null): boolean => statut === 'projetee' && /^\d{4}-\d{2}-\d{2}$/.test(date) && date < jour;
  return (
    <div className="vag" data-ag-sortie>
      {/* la copropriété du bien, ou de quoi l'y rattacher */}
      {lu.copropriete !== null ? <>
        <p className="loc-muet vag-copro" data-ag-copropriete>Copropriété : <strong>{lu.copropriete.libelle}</strong> — ses AG valent pour tous ses biens.</p>
        {/* 🔴 (Arno, 23/11/2026, 512) la date d'arrêté des comptes de la copropriété (facultative), le même composant que la fiche Copropriété */}
        <ArreteComptes coproprieteId={lu.copropriete.id} alerteSiManquante onChange={(x) => setArrete(x.arrete)} />
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
          {/* 🔴 Arno (23/11/2026) — sans copropriété, pas d'arrêté des comptes possible : on dit comment l'obtenir */}
          <p className="vag-bandeau" data-ag-arrete-sans-copro>{ARRETE_SANS_COPROPRIETE}</p>
          {/* 🔴 Arno (23/11/2026) — plus aucune date n'est gardée avec la sortie (avant : « Les dates seront enregistrées avec la sortie, à rattacher… ») */}
          {s.copro === 'aucune' && <p className="vse-orange" data-ag-a-rattacher>{SANS_COPROPRIETE_INCOMPLET}</p>}
        </fieldset>
      )}
      {lu.coproprieteSaisie === null && (
        <label className="pvv-case" data-ag-copro-oui><input type="checkbox" checked={s.coproOui} disabled={desactive} onChange={(e) => onChange({ ...s, coproOui: e.target.checked })} />
          <span>Immeuble en copropriété (le renseigner sur la fiche du bien)</span></label>)}

      {/* a) la dernière AG connue */}
      {/* 🔴 (Arno, 17/11/2026) « Seule l'AGO compte : c'est l'assemblée qui clôture les comptes de la copropriété. » */}
      {/* 🔴 Arno (23/11/2026) — la dernière AGO manquante est MISE EN AVANT (même raison que l'arrêté : le suivi des 20 % en dépend) ; saisie ici,
          elle est enregistrée sur la COPROPRIÉTÉ à la confirmation (jamais sur la sortie) */}
      {p.derniere === null && s.derniere === '' && <p className="vag-bandeau" role="status" data-ag-bandeau-derniere>⚠ {BANDEAU_DERNIERE_AGO_MANQUANTE}</p>}
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
      <p className="loc-muet vag-aide" data-ag-aide-prochaine>{AIDE_PROCHAINE_AGO}</p>
      <div className={`vag-statut${enDefaut('statut') ? ' vag-defaut' : ''}`} role="group" aria-label="Statut de la prochaine AGO" data-ag-statut={s.statut ?? 'aucun'}>
        {(['projetee', 'officielle'] as const).map((x) => (
          <button key={x} type="button" className="pva-segment" aria-pressed={s.statut === x} disabled={desactive} onClick={() => {
            if (projeteePassee(s.prochaine, x)) { onChange({ ...s, prochaine: '', prochaineTouchee: true, statut: x, alerte: { date: s.prochaine, sorte: 'saisie' } }); return; }
            // 🔴 Arno (23/11/2026) — « passer cette date projetée en date officielle d'un clic » : officielle, la date ne suit plus le calcul (c'est un fait)
            onChange({ ...s, statut: x, ...(x === 'officielle' ? { prochaineTouchee: true } : {}) });
          }} data-ag-statut-choix={x}>
            {x === 'projetee' ? 'Date projetée' : 'Date officielle'}</button>))}
      </div>
      {s.prochaine !== '' && (
        <p className="loc-muet vag-auteur" data-ag-prochaine-auteur>
          {officielleConnue !== null && s.statut === 'officielle' && officielleConnue.par !== null
            ? <>date officielle déjà connue — renseignée par {prenomNom(officielleConnue.par)}{officielleConnue.le ? ` le ${jourFrDe(officielleConnue.le)}` : ''}</>
            : <>renseignée par {prenomNom(lu.moi)}</>}</p>)}
      {!v.ok && <p className="cp-refus" role="status" data-ag-message>{v.motif}</p>}

      {/* e) 🔴🔴 Arno (23/11/2026) — la mention dans le paragraphe « 20 % » du LOCATAIRE porte l'AGO QUI COMPTE pour lui (celle qui permettra de
          restituer ses 20 %), pas la simple « Prochaine AGO » : la case la dit en clair, l'encadré montre le texte EXACT ajouté au mail */}
      {ago !== null && <>
        <label className="pvv-case" data-ag-mention><input type="checkbox" checked={s.mention} disabled={desactive} onChange={(e) => onChange({ ...s, mention: e.target.checked, ago })} />
          <span data-ag-mention-libelle>{libelleCaseAgoQuiCompte(ago)}</span></label>
        {s.mention && (
          <div className="vag-texte-mail" data-ag-texte-mail>
            <p className="vag-texte-mail-titre">Texte ajouté au mail du locataire :</p>
            <p className="vag-texte-mail-phrase" data-ag-texte-mail-phrase>« … {texteAjouteAuMail(ago)} »</p>
            {ago.incertaine && <p className="loc-muet vag-texte-mail-note" data-ag-texte-mail-incertain>{MENTION_INCERTAINE}.</p>}
          </div>)}
      </>}
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
.vag-texte-mail{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border:2px solid var(--color-svv-blue);border-radius:12px;background:var(--color-svv-blue-soft);min-width:0}
.vag-texte-mail-titre{margin:0;font-weight:800;color:var(--color-svv-ink)}
.vag-texte-mail-phrase{margin:0;font-size:1rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.vag-texte-mail-note{margin:0;font-size:.85rem}
.vag-bandeau{margin:0;padding:10px 12px;border:2px solid var(--color-svv-urgence-orange);border-radius:12px;background:var(--color-svv-amber-soft);font-weight:800;color:var(--color-svv-ink);overflow-wrap:anywhere}
.vag-creer{display:flex;flex-direction:column;gap:6px}
/* Arno (23/11/2026) : le bouton Creer une copropriete prend TOUTE la largeur de la colonne (390 px et ordinateur) */
.vag-creer-btn{align-self:stretch;box-sizing:border-box;width:100%;min-height:44px}
.vag{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border-radius:10px;border-left:4px solid var(--color-svv-line-strong);background:var(--color-svv-surface)}
.vag input[type=date],.vag input:not([type]){min-height:44px;box-sizing:border-box;max-width:100%}
.vag-copro,.vag-auteur{margin:0;overflow-wrap:anywhere}
.vag-rattacher{display:flex;flex-direction:column;gap:4px}
.vag-statut{display:flex;flex-wrap:wrap;gap:6px;border-radius:10px;padding:2px}
.vag-defaut input,.vag-defaut input:focus{border-color:var(--color-svv-red);outline-color:var(--color-svv-red)}
.vag-defaut .pvs-libelle{color:var(--color-svv-red)}
/* Arno (23/11/2026) : plus de cerclage rouge autour des deux boutons Date projetee / Date officielle (ce n'est pas un champ de saisie) ; l'obligation reste dite par le message et le champ date */
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
