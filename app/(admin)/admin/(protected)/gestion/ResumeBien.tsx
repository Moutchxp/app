'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { formaterDateIso, titreLogement } from '../../../../lib/gestion/annuaireRecherche';
import type { FicheLot } from '../../../../lib/gestion/annuaireRepo';
import type { FicheUrl } from '../../../../lib/gestion/ecranUrl';
import { libelleEntretien } from '../../../../lib/location/entretien';
import type { ResumeBien } from '../../../../lib/location/resumeBienRepo';
import { DPE_NON_SOUMIS, LIBELLE_DPE_NON_SOUMIS } from '../../../../lib/location/bienComplet';
import { libelleEtage } from '../../../../lib/location/locationBien';
import { lignesResume } from '../../../../lib/location/resumeBienLignes';

/**
 * ══ 🔴🔴 FICHE BIEN — L'ENCART : UN RÉSUMÉ TOUJOURS VISIBLE, UN DÉTAIL DÉPLIABLE (Arno, 20/10/2026) ═══════════════════════════
 *
 * « En haut, le résumé “Caractéristiques” : adresse, immeuble, type, meublé, pièces, étage, surfaces, annexes, époque de
 * construction, chauffage — UNE SEULE ligne par information, la Location d'abord, l'import WIPPIMMO à défaut, jamais deux
 * valeurs contradictoires (`resumeBienLignes.ts`). Dessous, replié par défaut : Situation et accès · Copropriété · DPE et
 * entretiens · Commentaire. Un clic sur l'encart, ou “Voir le détail du bien ⌄”, le déplie en douceur ; “Masquer le détail ⌃”
 * le replie. Même comportement sur téléphone et ordinateur. »
 * 🔴 Les groupes « Gestion » et « Location en cours » sont RETIRÉS de l'encart (décision d'Arno du 20/10/2026), sans être
 *    déplacés. Un groupe du détail entièrement vide garde son titre et dit « non renseigné ».
 * Lu à la source (`resumeBienRepo.ts`) ; tant que la lecture n'est pas arrivée — ou si elle échoue — les lignes tirées de la
 * fiche (adresse, immeuble, type, pièces, surface) s'affichent seules. Aucun champ de saisie.
 */
const API = '/api/admin/gestion/annuaire/location';

const rien = (mot = 'non renseigné'): ReactNode => <span className="ann-inconnu">{mot}</span>;
const m2 = (n: number): string => `${String(n).replace('.', ',')} m²`;
const ouiNon = (v: boolean | null | undefined, feminin = false): ReactNode => (v === true ? 'oui' : v === false ? 'non' : rien(feminin ? 'non renseignée' : 'non renseigné'));

/** Un groupe du détail ; entièrement vide, il garde son titre et dit « non renseigné ». */
function Groupe({ titre, cle, vide, children }: { titre: string; cle: string; vide: boolean; children: ReactNode }) {
  return (
    <section className="rb-groupe" data-groupe={cle}>
      <h4 className="rb-titre">{titre}</h4>
      {vide ? <p className="rb-vide" data-rb-vide={cle}>{rien()}</p> : <dl className="ann-champs">{children}</dl>}
    </section>
  );
}

// `ouvrir` reste dans la signature (appelants inchangés) : depuis le retrait de « Location en cours », l'encart n'ouvre plus de fiche.
export function ResumeBienFiche({ f }: { f: FicheLot; ouvrir: (s: FicheUrl['sorte'], id: number) => void }) {
  const [r, setR] = useState<ResumeBien | null>(null);
  const [deplie, setDeplie] = useState(false);
  const idDetail = useId();
  useEffect(() => {
    let vivant = true;
    setR(null);
    void (async () => {
      try {
        const res = await fetch(`${API}?resume=${f.id}`, { cache: 'no-store' });
        const d = await res.json() as { etat?: string; data?: ResumeBien };
        if (vivant && d.etat === 'ok' && d.data !== undefined && d.data !== null && typeof d.data === 'object' && 'caracteristiques' in d.data) setR(d.data);
      } catch { /* la lecture a échoué : les lignes de la fiche restent seules */ }
    })();
    return () => { vivant = false; };
  }, [f.id]);

  const c = r?.caracteristiques;
  const lr = lignesResume({ nature: f.nature, typeBien: f.typeBien, surfaceM2: f.surfaceM2 }, c === undefined ? undefined : {
    famille: c.famille, familleCle: c.familleCle ?? null, type: c.type, meuble: c.meuble, nombrePieces: c.nombrePieces,
    surfaceHabitableM2: c.surfaceHabitableM2, surfaceCarrezM2: c.surfaceCarrezM2, surfaceExterieureM2: c.surfaceExterieureM2, surfaceM2: c.surfaceM2,
  });
  const s = r?.situation;
  const co = r?.copropriete;
  const d = r?.dpe;
  const g = r?.gestion;
  const parking = lr.famille === 'parking';
  const etage = libelleEtage(s?.etage ?? c?.etage ?? null);
  const annexes = c?.annexesDetail ?? [];
  /** Un clic sur l'encart déplie ou replie — sauf sur un lien ou un bouton (qui gardent leur geste) ou une sélection de texte. */
  const surClic = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (r === null) return;
    if ((e.target as HTMLElement).closest('a, button, input, select, textarea') !== null) return;
    if (typeof window.getSelection === 'function' && (window.getSelection()?.toString() ?? '') !== '') return;
    setDeplie((v) => !v);
  };

  // Un groupe du détail est vide quand AUCUNE de ses informations n'est connue.
  const situationVide = s === undefined || [s.batiment, s.escalier, s.porte, s.precisionAcces, s.ascenseur, s.digicode].every((x) => x === null || x === '');
  const coproVide = co === undefined || (co.numLotCopro === null && co.syndic === null && co.derniereAg === null);
  const entretiens = g === undefined ? null : g.entretienAPrevoir === false ? 'non'
    : g.entretiens.length > 0 ? `oui — ${g.entretiens.map((e) => `${libelleEntretien({ sorte: e.sorte as 'chaudiere' | 'ramonage' | 'autre', nom: e.nom })}${e.dateAnniversaire ? ` (${formaterDateIso(e.dateAnniversaire)})` : ''}`).join(' · ')}`
      : g.entretienAPrevoir === true ? 'oui' : null;
  const dpeVide = (d === undefined || (d.classe === null && !d.nonSoumis && d.date === null)) && entretiens === null;

  return (
    <div className={`rb${deplie ? ' rb--deplie' : ''}`} data-resume-bien data-deplie={deplie ? 'oui' : 'non'} onClick={surClic}>
      <style>{CSS_RESUME_BIEN}</style>
      <section className="rb-groupe rb-resume" data-groupe="caracteristiques">
        <h4 className="rb-titre">Caractéristiques</h4>
        <dl className="ann-champs">
          <dt>Adresse</dt>
          <dd data-rb="adresse">{titreLogement(f.adresse, [f.codePostal, f.commune].filter((x) => x).join(' '))}</dd>
          {f.immeuble && <><dt>Immeuble</dt><dd data-rb="immeuble">{f.immeuble}</dd></>}
          <dt>Type</dt>
          <dd data-rb="type">{lr.type ?? rien()}</dd>
          {lr.meuble !== undefined && <><dt>Meublé</dt><dd data-rb="meuble">{ouiNon(lr.meuble)}</dd></>}
          {lr.pieces !== undefined && <><dt>{lr.famille === 'local' ? 'Bureaux / pièces' : 'Pièces'}</dt><dd data-rb="pieces">{lr.pieces ?? rien('non renseignées')}</dd></>}
          <dt>Étage</dt>
          <dd data-rb="etage">{etage ?? rien()}</dd>
          {lr.surfaces.map((x) => (
            <span key={x.cle} style={{ display: 'contents' }}><dt>{x.mot}</dt><dd data-rb={x.cle}>{x.m2 === null ? rien('non renseignée') : m2(x.m2)}</dd></span>
          ))}
          {!parking && c !== undefined && (
            <>
              <dt>Annexes</dt>
              <dd data-rb="annexes" className="rb-liste">{annexes.length === 0 ? rien('aucune') : annexes.map((a) => {
                const det = [a.detail.split(' · ').slice(1).join(' · ') || null, a.etage ? libelleEtage(a.etage) : null, a.adresse ? `adresse : ${a.adresse}` : null]
                  .filter((x): x is string => x !== null && x !== '');
                return (
                  <span key={a.id} data-rb-annexe={a.id}>
                    <strong>{a.titre}</strong>{a.detachee ? ' (détachée)' : ''}{det.length > 0 ? ` — ${det.join(' · ')}` : ''}
                    {a.annotation ? <span className="rb-note"> · {a.annotation}</span> : null}
                  </span>
                );
              })}</dd>
            </>
          )}
          {lr.avecComplements && c !== undefined && (
            <>
              <dt>Époque de construction</dt><dd data-rb="epoque">{c.epoqueConstruction ?? rien()}</dd>
              <dt>Chauffage</dt><dd data-rb="chauffage">{c.chauffage ?? rien()}</dd>
            </>
          )}
          {f.proprietaireId === null && (
            <>
              <dt>Propriétaire</dt>
              <dd><span className="ann-inconnu">{f.proprietaireNom || 'non rattaché'} — nom porté par plusieurs fiches WIPPIMMO, non tranché</span></dd>
            </>
          )}
        </dl>
        {r !== null && (
          <button type="button" className="rb-bascule" aria-expanded={deplie} aria-controls={idDetail} data-bascule-detail
            onClick={() => setDeplie((v) => !v)}>{deplie ? 'Masquer le détail ⌃' : 'Voir le détail du bien ⌄'}</button>
        )}
      </section>

      {r !== null && (
        <div className="rb-detail" id={idDetail} data-detail-bien aria-hidden={!deplie} inert={!deplie}>
          <div className="rb-detail-dedans">
            <Groupe titre="Situation et accès" cle="situation" vide={situationVide}>
              <dt>Bâtiment</dt><dd data-rb="batiment">{s?.batiment ?? rien()}</dd>
              <dt>Escalier</dt><dd data-rb="escalier">{s?.escalier ?? rien()}</dd>
              <dt>{parking ? 'N° de place' : 'N° de porte'}</dt><dd data-rb="porte">{s?.porte ?? rien()}</dd>
              <dt>Précision</dt><dd data-rb="precision">{s?.precisionAcces ?? rien('non renseignée')}</dd>
              <dt>Ascenseur</dt><dd data-rb="ascenseur">{ouiNon(s?.ascenseur)}</dd>
              <dt>Digicode</dt>
              {/* Le code en clair : outil interne (Arno, 20/10/2026). */}
              <dd data-rb="digicode">{s?.digicode === true ? <>oui — code {s.digicodeCode ? <strong>{s.digicodeCode}</strong> : rien()}</> : ouiNon(s?.digicode)}</dd>
            </Groupe>
            <Groupe titre="Copropriété" cle="copropriete" vide={coproVide}>
              <dt>N° de lot</dt><dd data-rb="lot-copro">{co?.numLotCopro ?? rien()}</dd>
              <dt>Syndic</dt>
              <dd data-rb="syndic">{co?.syndic == null ? rien() : <a className="rb-lien" href={`/admin/location/syndic/${co.syndic.id}`}>{co.syndic.nom}</a>}</dd>
              {(lr.avecComplements || co?.agApplicable === true) && <><dt>Dernière AG</dt><dd data-rb="derniere-ag">{co?.derniereAg ? formaterDateIso(co.derniereAg) : rien('non renseignée')}</dd></>}
            </Groupe>
            {!parking && (
              <Groupe titre="DPE et entretiens" cle="dpe" vide={dpeVide}>
                <dt>DPE</dt>
                <dd data-rb="dpe">{d !== undefined && (d.nonSoumis || d.classe === DPE_NON_SOUMIS) ? LIBELLE_DPE_NON_SOUMIS : d?.classe
                  ? <>classe <strong>{d.classe}</strong>{d.date ? ` — du ${formaterDateIso(d.date)}` : <> — {rien('date non renseignée')}</>}</> : rien()}</dd>
                <dt>Entretiens à prévoir</dt>
                <dd data-rb="entretiens">{entretiens ?? rien()}</dd>
              </Groupe>
            )}
            <Groupe titre="Commentaire" cle="commentaire" vide={!r.commentaire}>
              <dt>Commentaire libre</dt>
              {/* En entier, avec ses retours à la ligne. */}
              <dd data-rb="commentaire" className="rb-commentaire">{r.commentaire}</dd>
            </Groupe>
          </div>
        </div>
      )}
    </div>
  );
}

export const CSS_RESUME_BIEN = `
.rb{display:flex;flex-direction:column;gap:8px;cursor:pointer}
.rb-groupe{min-width:0}
.rb-titre{margin:0 0 6px;font-size:.82rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--color-svv-ink)}
.rb-bascule{display:inline-flex;align-items:center;min-height:44px;margin-top:4px;padding:0 4px;border:0;background:none;font:inherit;font-weight:700;
  color:var(--color-svv-ink);text-decoration:underline;cursor:pointer}
.rb-bascule:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* Le dépli en douceur : la hauteur passe de rien à son contenu (grille 0fr → 1fr), sans la mesurer. */
.rb-detail{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .28s ease,opacity .28s ease}
.rb--deplie .rb-detail{grid-template-rows:1fr;opacity:1}
.rb-detail-dedans{overflow:hidden;min-height:0;display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
.rb--deplie .rb-detail-dedans{padding-top:10px;border-top:1px solid var(--color-svv-line)}
@media (min-width:760px){ .rb-detail-dedans{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start} }
@media (prefers-reduced-motion: reduce){ .rb-detail{transition:none} }
.rb-vide{margin:0}
.rb-note{color:var(--color-svv-muted);font-size:.85rem}
.rb-liste{display:flex;flex-direction:column;gap:4px;min-width:0;overflow-wrap:anywhere}
.rb-commentaire{white-space:pre-wrap;overflow-wrap:anywhere}
.rb-lien{display:inline-flex;align-items:center;min-height:44px;font-weight:600;color:var(--color-svv-ink);text-decoration:underline;cursor:pointer}
`;
