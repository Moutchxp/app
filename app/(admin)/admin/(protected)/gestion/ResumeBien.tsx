'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { formaterDateIso, titreLogement } from '../../../../lib/gestion/annuaireRecherche';
import type { FicheLot } from '../../../../lib/gestion/annuaireRepo';
import type { FicheUrl } from '../../../../lib/gestion/ecranUrl';
import { formaterCentimes, LIBELLE_DEPOT, LIBELLE_JOUR, type JourPrelevement } from '../../../../lib/location/conditionsEntree';
import { lireDecimal, tarifAffiche, ZERO, type ZoneHonoraires } from '../../../../lib/location/honorairesProprietaire';
import { libelleEntretien } from '../../../../lib/location/entretien';
import type { ResumeBien } from '../../../../lib/location/resumeBienRepo';

/**
 * ══ 🔴🔴 FICHE BIEN — L'ENCART RÉSUMÉ COMPLET (Arno, 20/10/2026) ═════════════════════════════════════════════════════════════
 *
 * « Afficher TOUTES les informations du bien, rangées en groupes lisibles : Caractéristiques · Gestion · Location en cours.
 * Une information absente s'affiche “non renseignée”. LUES À LEUR SOURCE, sans copie. Rien de ce qui est affiché aujourd'hui
 * ne disparaît. Une colonne sur téléphone, deux sur ordinateur ; groupes repliables seulement sur téléphone,
 * “Caractéristiques” ouvert par défaut. Aucun champ de saisie : c'est un affichage. »
 *
 * Les lignes d'avant (Adresse, Immeuble, Type, Surface, Propriétaire non tranché, En gestion) restent, aux mêmes mots ; la
 * « Surface », qui n'avait pas de source, lit maintenant les surfaces saisies en Location. Le reste vient de la lecture
 * `resume` de la fiche commune (`resumeBienRepo.ts`) ; tant qu'elle n'est pas arrivée — ou si elle échoue — les lignes d'avant
 * s'affichent seules, comme avant.
 */
const API = '/api/admin/gestion/annuaire/location';
const LIBELLE_ZONE: Record<ZoneHonoraires, string> = { tres_tendue: 'zone très tendue', tendue: 'zone tendue', autre: 'autre zone' };

/** Large écran (ordinateur) : deux colonnes, groupes toujours ouverts. Faux au premier rendu (téléphone d'abord). */
function useLarge(): boolean {
  const [large, setLarge] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const m = window.matchMedia('(min-width: 760px)');
    const maj = (): void => setLarge(m.matches);
    maj();
    m.addEventListener?.('change', maj);
    return () => m.removeEventListener?.('change', maj);
  }, []);
  return large;
}

const rien = (mot = 'non renseigné'): ReactNode => <span className="ann-inconnu">{mot}</span>;
const m2 = (n: number): string => `${String(n).replace('.', ',')} m²`;
const ouiNon = (v: boolean | null | undefined, feminin = false): ReactNode => (v === true ? 'oui' : v === false ? 'non' : rien(feminin ? 'non renseignée' : 'non renseigné'));

/** Un groupe : un `<details>` au téléphone (repliable), une section toujours ouverte sur ordinateur. */
function Groupe({ titre, large, ouvert, cle, children }: { titre: string; large: boolean; ouvert: boolean; cle: string; children: ReactNode }) {
  if (large) {
    return <section className="rb-groupe" data-groupe={cle}><h4 className="rb-titre">{titre}</h4><dl className="ann-champs">{children}</dl></section>;
  }
  return (
    <details className="rb-groupe rb-groupe--repli" data-groupe={cle} open={ouvert}>
      <summary className="rb-titre">{titre}</summary>
      <dl className="ann-champs">{children}</dl>
    </details>
  );
}

export function ResumeBienFiche({ f, ouvrir }: { f: FicheLot; ouvrir: (s: FicheUrl['sorte'], id: number) => void }) {
  const large = useLarge();
  const [r, setR] = useState<ResumeBien | null>(null);
  useEffect(() => {
    let vivant = true;
    setR(null);
    void (async () => {
      try {
        const res = await fetch(`${API}?resume=${f.id}`, { cache: 'no-store' });
        const d = await res.json() as { etat?: string; data?: ResumeBien };
        if (vivant && d.etat === 'ok' && d.data !== undefined && d.data !== null && typeof d.data === 'object' && 'caracteristiques' in d.data) setR(d.data);
      } catch { /* la lecture a échoué : les lignes d'avant restent seules */ }
    })();
    return () => { vivant = false; };
  }, [f.id]);

  const c = r?.caracteristiques;
  const g = r?.gestion;
  const l = r?.location;
  const surfaces = c === undefined ? [] : [
    c.surfaceCarrezM2 !== null ? `Carrez/Boutin ${m2(c.surfaceCarrezM2)}` : null,
    c.surfaceHabitableM2 !== null ? `habitable ${m2(c.surfaceHabitableM2)}` : null,
    c.surfaceExterieureM2 !== null ? `extérieure ${m2(c.surfaceExterieureM2)}` : null,
    c.surfaceM2 !== null ? `${m2(c.surfaceM2)}` : null,
  ].filter((x): x is string => x !== null);
  const situation = c === undefined ? [] : [
    c.etage !== null && c.etage !== '' ? `étage ${c.etage}` : null, c.porte ? `porte ${c.porte}` : null,
    c.batiment ? `bâtiment ${c.batiment}` : null, c.escalier ? `escalier ${c.escalier}` : null, c.numLotCopro ? `lot de copropriété n° ${c.numLotCopro}` : null,
  ].filter((x): x is string => x !== null);
  const totalLoyer = l?.loyer == null ? null : (l.loyer.principal === null && l.loyer.provisions === null ? null : (l.loyer.principal ?? 0) + (l.loyer.provisions ?? 0));

  return (
    <div className="rb" data-resume-bien>
      <style>{CSS_RESUME_BIEN}</style>
      <Groupe titre="Caractéristiques" large={large} ouvert cle="caracteristiques">
        <dt>Adresse</dt>
        <dd>{titreLogement(f.adresse, [f.codePostal, f.commune].filter((x) => x).join(' '))}</dd>
        {f.immeuble && <><dt>Immeuble</dt><dd>{f.immeuble}</dd></>}
        <dt>Type</dt>
        <dd>{[f.nature, f.typeBien].filter((x) => x).join(' · ') || <span className="ann-inconnu">non renseigné</span>}</dd>
        {c !== undefined && <><dt>Famille et type</dt><dd data-rb="type">{[c.famille, c.type].filter((x) => x).join(' · ') || rien()}</dd></>}
        {c !== undefined && <><dt>Meublé</dt><dd data-rb="meuble">{ouiNon(c.meuble)}</dd></>}
        {c !== undefined && <><dt>Pièces</dt><dd data-rb="pieces">{c.nombrePieces ?? rien('non renseignées')}</dd></>}
        {c !== undefined && <><dt>Étage</dt><dd data-rb="etage">{situation.length > 0 ? situation.join(' · ') : rien()}</dd></>}
        <dt>Surface</dt>
        {/* Arno (20/10/2026) : la surface saisie en Location (Carrez/Boutin, habitable, extérieure) — « non renseignée » sinon. */}
        <dd data-rb="surface">{surfaces.length > 0 ? surfaces.join(' · ') : f.surfaceM2 !== null ? `${f.surfaceM2} m²` : <span className="ann-inconnu">non renseignée</span>}</dd>
        {c !== undefined && <><dt>Annexes</dt><dd data-rb="annexes">{c.annexes.length > 0 ? c.annexes.map((a) => `${a.libelle}${a.detachee ? ' (détachée)' : ''}`).join(' · ') : rien('aucune')}</dd></>}
        {f.proprietaireId === null && (
          <>
            <dt>Propriétaire</dt>
            <dd><span className="ann-inconnu">{f.proprietaireNom || 'non rattaché'} — nom porté par plusieurs fiches WIPPIMMO, non tranché</span></dd>
          </>
        )}
      </Groupe>

      <Groupe titre="Gestion" large={large} ouvert={false} cle="gestion">
        <dt>En gestion</dt>
        <dd>
          {f.debut ? <>depuis le {formaterDateIso(f.debut)}</> : <span className="ann-inconnu">date non renseignée</span>}
          {f.fin && <> · <strong>fin de gestion le {formaterDateIso(f.fin)}</strong></>}
        </dd>
        {g !== undefined && <><dt>Bien en gestion</dt><dd data-rb="en-gestion">{ouiNon(g.enGestionBien)}</dd></>}
        {g !== undefined && (
          <>
            <dt>Zone et honoraires</dt>
            <dd data-rb="zone">{LIBELLE_ZONE[g.zone]}{g.bareme === null ? <> — {rien('aucun barème en vigueur')}</> : (
              <> — {tarifAffiche(lireDecimal(g.bareme.tarifZone) ?? ZERO)} (visite, dossier, bail), {tarifAffiche(lireDecimal(g.bareme.tarifEdl) ?? ZERO)} (état des lieux)
                <span className="rb-note"> · barème du {formaterDateIso(g.bareme.depuis)}</span></>
            )}</dd>
          </>
        )}
        {g !== undefined && (
          <>
            <dt>Entretiens à prévoir</dt>
            <dd data-rb="entretiens">{g.entretienAPrevoir === false ? 'aucun' : g.entretiens.length > 0
              ? g.entretiens.map((e) => `${libelleEntretien({ sorte: e.sorte as 'chaudiere' | 'ramonage' | 'autre', nom: e.nom })}${e.dateAnniversaire ? ` (${formaterDateIso(e.dateAnniversaire)})` : ''}`).join(' · ')
              : rien()}</dd>
          </>
        )}
      </Groupe>

      {l !== undefined && (
        <Groupe titre="Location en cours" large={large} ouvert={false} cle="location">
          <dt>Statut</dt>
          <dd data-rb="statut"><span className={`rb-statut rb-statut--${l.statut}`}>{l.statut === 'loue' ? 'Déjà loué' : 'Libre'}</span></dd>
          {l.statut === 'loue' && (
            <>
              <dt>Locataire{l.locataires.length > 1 ? 's' : ''}</dt>
              <dd data-rb="locataires" className="rb-liens">
                {l.locataires.map((x) => (
                  <button key={x.id} type="button" className="rb-lien" onClick={() => ouvrir('locataire', x.id)}>{x.nom}</button>
                ))}
              </dd>
              <dt>Date d’entrée</dt>
              <dd data-rb="entree">{l.entree === null ? rien('non renseignée') : formaterDateIso(l.entree)}</dd>
            </>
          )}
          <dt>{l.statut === 'loue' ? 'Loyer' : 'Loyer de départ'}</dt>
          <dd data-rb="loyer">{l.loyer === null || totalLoyer === null ? rien() : (
            <>{l.loyer.principal === null ? rien() : formaterCentimes(l.loyer.principal)} + {l.loyer.provisions === null ? rien('provision non renseignée') : formaterCentimes(l.loyer.provisions)}
              {' '}= <strong>{formaterCentimes(totalLoyer)}</strong> charges comprises / mois
              {l.loyerSource === 'depart' && <span className="rb-note"> · dernière location du bien</span>}</>
          )}</dd>
          {l.statut === 'loue' && (
            <>
              <dt>Dépôt de garantie</dt>
              <dd data-rb="depot">{l.depot === null ? rien() : <>{l.depot.montantCentimes === null ? rien('montant non renseigné') : formaterCentimes(l.depot.montantCentimes)} — {LIBELLE_DEPOT[l.depot.mode].toLowerCase()}</>}</dd>
              <dt>Prélèvement</dt>
              <dd data-rb="prelevement">{l.prelevement === null ? rien() : l.prelevement.actif ? `oui, ${LIBELLE_JOUR[String(l.prelevement.jour) as JourPrelevement] ?? `le ${l.prelevement.jour}`}` : 'non'}</dd>
            </>
          )}
        </Groupe>
      )}
    </div>
  );
}

export const CSS_RESUME_BIEN = `
.rb{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
@media (min-width:760px){ .rb{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start} .rb-groupe[data-groupe="caracteristiques"]{grid-row:span 2} }
.rb-groupe{min-width:0}
.rb-titre{margin:0 0 6px;font-size:.82rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--color-svv-ink)}
.rb-groupe--repli{border-top:1px solid var(--color-svv-line);padding-top:4px}
.rb-groupe--repli > summary{cursor:pointer;min-height:44px;display:flex;align-items:center;list-style:none}
.rb-groupe--repli > summary::-webkit-details-marker{display:none}
.rb-groupe--repli > summary::before{content:"▸";margin-right:8px;color:var(--color-svv-muted)}
.rb-groupe--repli[open] > summary::before{content:"▾"}
.rb-note{color:var(--color-svv-muted);font-size:.85rem}
.rb-statut{font-weight:800}
.rb-statut--libre{color:var(--color-svv-green-ink)}
.rb-statut--loue{color:var(--color-svv-red)}
.rb-liens{display:flex;flex-wrap:wrap;gap:4px 12px}
.rb-lien{border:0;background:none;padding:0;min-height:44px;font:inherit;font-weight:600;color:var(--color-svv-ink);text-decoration:underline;cursor:pointer;text-align:left}
`;
