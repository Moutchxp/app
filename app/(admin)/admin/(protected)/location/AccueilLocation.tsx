'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CSS_LOCATION_ECRANS, EtatLecture, useLecture } from './commun';
import { aplatirResultats, LIBELLE_TYPE, type Groupe, type LigneAccueil, type ResultatsAccueil } from '../../../../lib/location/recherchePortefeuille';

/**
 * ══ 🔴🔴 TUILE LOCATION — L'ACCUEIL (/admin/location), REFONTE DU 17/10/2026 ═══════════════════════════════════════
 * Demande d'Arno : « EN HAUT : un seul moteur de recherche, sur toute la largeur » (propriétaires, locataires, syndics
 * par nom / téléphone / e-mail ; adresse des seuls biens du portefeuille), résultats instantanés groupés par type ;
 * « EN DESSOUS : 3 GROSSES CASES » — propriétaires / biens, locataires, outils de suivi.
 * 🔴 Les onglets, les listes et les boutons de l'ancien accueil ne sont pas perdus : ils sont DÉPLACÉS dans ces trois
 * écrans (accord d'Arno pour ce déplacement) — `ListesLocation.tsx`, « + Nouveau propriétaire + bien », « Honoraires ».
 *
 * ══ RETOUCHE D'ARNO (17/10/2026) — LES RÉSULTATS, LISIBLES ═══════════════════════════════════════════════════════════
 * « Dès que des résultats arrivent, le panneau prend TOUT L'ÉCRAN disponible sous la ligne de recherche (toute la largeur,
 * jusqu'en bas de la fenêtre, défilement interne), par-dessus les 3 cases. Recherche vidée (× ou Échap) : retour à
 * l'espace réservé vide et aux 3 cases, sans saut. UNE LIGNE PAR RÉSULTAT : pastille de type colorée (ROUGE propriétaire,
 * VERT locataire, BLEU syndic, GRIS bien) + nom en gras + téléphone + e-mail + adresse du bien. Ordre : propriétaires,
 * locataires, syndics, biens ; par pertinence puis nom. Clic ou Entrée ouvre la fiche commune ; flèches haut / bas.
 * Les fiches sorties du portefeuille (“Anciens”) aussi, en bas, grisées. »
 * 🔴 L'espace réservé garde sa hauteur : le panneau se pose PAR-DESSUS les cases, qui ne bougent jamais.
 */
const LIEN: Record<Groupe, (id: number) => string> = {
  proprietaires: (id) => `/admin/location/proprietaire/${id}`,
  locataires: (id) => `/admin/location/locataire/${id}`,
  syndics: (id) => `/admin/location/syndic/${id}`,
  biens: (id) => `/admin/location/bien/${id}`,
};

export const CASES = [
  { href: '/admin/location/proprietaires', titre: ['Ajouter / supprimer', 'un propriétaire / bien'],
    phrase: 'Créer un nouveau propriétaire avec son bien et ses annexes, ou ajouter un bien à un propriétaire déjà connu.' },
  { href: '/admin/location/locataires', titre: ['Ajouter / supprimer', 'un locataire'],
    phrase: 'Créer un locataire rattaché à un bien, avec alerte de doublon dès la saisie ; la liste des locataires, actifs et anciens.' },
  { href: '/admin/location/outils', titre: ['Outils', 'de suivi'],
    phrase: 'Les outils de pilotage de la location : honoraires de gestion, et ceux qui viendront.' },
] as const;

export function AccueilLocation() {
  const [texte, setTexte] = useState('');
  const [terme, setTerme] = useState('');
  const [actif, setActif] = useState(-1);
  const zone = useRef<HTMLElement | null>(null);
  const listeRef = useRef<HTMLUListElement | null>(null);
  const [hauteur, setHauteur] = useState<number | null>(null);
  // Instantané pendant la frappe : la recherche part 200 ms après la dernière touche (un appel par intention).
  useEffect(() => {
    const t = setTimeout(() => setTerme(texte.trim()), 200);
    return () => clearTimeout(t);
  }, [texte]);
  const recherche = useLecture<ResultatsAccueil>(terme.length >= 2 ? `q=${encodeURIComponent(terme)}` : null);
  const lignes: LigneAccueil[] = recherche.etat.etat === 'ok' ? aplatirResultats(recherche.etat.data) : [];
  const ouvert = terme.length >= 2;

  // La hauteur du panneau : du haut de l'espace réservé jusqu'en bas de la fenêtre (recalculée si la fenêtre change).
  const mesurer = useCallback(() => {
    const z = zone.current;
    if (z === null) return;
    setHauteur(Math.max(160, Math.floor(window.innerHeight - z.getBoundingClientRect().top - 12)));
  }, []);
  useLayoutEffect(() => {
    if (!ouvert) return;
    mesurer();
    window.addEventListener('resize', mesurer);
    window.addEventListener('scroll', mesurer, { passive: true });
    return () => { window.removeEventListener('resize', mesurer); window.removeEventListener('scroll', mesurer); };
  }, [ouvert, mesurer]);
  useEffect(() => { setActif(-1); }, [terme]);
  useEffect(() => {
    if (actif < 0) return;
    const el = listeRef.current?.querySelector(`[data-index="${actif}"]`);
    if (el instanceof HTMLElement && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [actif]);

  const vider = (): void => { setTexte(''); setTerme(''); setActif(-1); };
  const auClavier = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') { e.preventDefault(); vider(); return; }
    if (lignes.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActif((i) => Math.min(lignes.length - 1, i + 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActif((i) => Math.max(0, i - 1)); return; }
    if (e.key === 'Enter') {
      const l = lignes[actif >= 0 ? actif : 0];
      if (l !== undefined) { e.preventDefault(); window.location.href = LIEN[l.groupe](l.id); }
    }
  };
  const premierAncien = lignes.findIndex((l) => l.ancien);

  return (
    <div className="loc-page">
      <style>{CSS_LOCATION_ECRANS + CSS_RESULTATS}</style>
      <label className="loc-recherche loc-recherche--large">
        <span aria-hidden="true">🔎</span>
        <input value={texte} onChange={(e) => setTexte(e.target.value)} onKeyDown={auClavier} autoFocus type="search"
          placeholder="Propriétaire, locataire, syndic (nom, téléphone, e-mail) ou adresse d’un bien du portefeuille"
          aria-label="Chercher un propriétaire, un locataire, un syndic ou un bien du portefeuille"
          role="combobox" aria-expanded={ouvert && lignes.length > 0} aria-controls="loc-resultats" aria-autocomplete="list"
          aria-activedescendant={actif >= 0 ? `loc-res-${actif}` : undefined} />
        {texte !== '' && <button type="button" className="loc-vider" aria-label="Vider la recherche" onClick={vider}>×</button>}
      </label>

      {/* L'espace RÉSERVÉ (hauteur fixe) : vide sans recherche ; avec une recherche, le panneau s'y ancre et descend
          jusqu'en bas de la fenêtre, PAR-DESSUS les cases — qui ne bougent donc jamais. */}
      <section ref={zone} className={`loc-zone-resultats loc-zone-resultats--vide${ouvert ? ' loc-zone-resultats--ouverte' : ''}`}
        aria-label="Résultats de la recherche" aria-live="polite" data-resultats>
        {ouvert && (
          <div className="loc-panneau" style={hauteur === null ? undefined : { height: hauteur }} data-panneau>
            {recherche.etat.etat !== 'ok' ? <EtatLecture etat={recherche.etat} />
              : lignes.length === 0 ? <p className="loc-muet loc-panneau-vide">Aucun propriétaire, locataire, syndic ni bien du portefeuille ne correspond à « {terme} ».</p>
                : (
                  <>
                    <ul className="loc-res" id="loc-resultats" role="listbox" ref={listeRef}>
                      {lignes.map((l, i) => (
                        <li key={`${l.groupe}-${l.id}`} role="presentation">
                          {i === premierAncien && <p className="loc-res-separateur">Anciens — sortis du portefeuille (réactivation depuis la fiche)</p>}
                          <a id={`loc-res-${i}`} role="option" aria-selected={i === actif} data-index={i} data-groupe={l.groupe}
                            className={`loc-res-ligne${l.ancien ? ' loc-res-ligne--ancien' : ''}`} href={LIEN[l.groupe](l.id)}
                            onMouseEnter={() => setActif(i)}>
                            <span className={`loc-res-type loc-res-type--${l.ancien ? 'ancien' : l.groupe}`}>{l.ancien ? `Ancien · ${LIBELLE_TYPE[l.groupe]}` : LIBELLE_TYPE[l.groupe]}</span>
                            <strong className="loc-res-nom">{l.titre}</strong>
                            <span className="loc-res-infos">
                              <span className="loc-res-tel">{l.telephone ?? ''}</span>
                              <span className="loc-res-mail">{l.email ?? ''}</span>
                              <span className="loc-res-adr">{l.groupe === 'biens' ? (l.detail ?? '') : (l.adresse ?? '')}</span>
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                    {recherche.etat.data.tronque && <p className="loc-muet loc-panneau-vide">D’autres fiches correspondent : précisez la recherche.</p>}
                  </>
                )}
          </div>
        )}
      </section>

      {/* Arno (17/10/2026) : cases DEUX FOIS plus hautes, titres sur deux lignes — sur l'accueil seulement. */}
      <ul className="loc-cases loc-cases--accueil" aria-label="Espaces de la Location">
        {CASES.map((c) => (
          <li key={c.href}>
            <a className="loc-case" href={c.href} data-case={c.href}>
              <span className="loc-case-titre">{c.titre.map((l) => <span key={l} className="loc-case-ligne">{l}</span>)}</span>
              <span className="loc-case-phrase">{c.phrase}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Le panneau et ses lignes. Couleurs du thème uniquement — celles des pastilles de rôle de la Gestion (`cp-role--…`) :
 * ROUGE propriétaire, VERT locataire ; BLEU syndic, GRIS bien (Arno). Une ligne au bureau (colonnes tronquées, jamais
 * de chevauchement), deux lignes de texte au téléphone.
 */
export const CSS_RESULTATS = `
.loc-vider{flex:0 0 auto;width:40px;height:40px;border:0;border-radius:999px;background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;font-size:1.3rem;line-height:1;cursor:pointer}
.loc-zone-resultats{position:relative;overflow:visible}
.loc-zone-resultats--ouverte{z-index:30}
.loc-panneau{position:absolute;top:0;left:0;right:0;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);border-radius:14px;padding:6px;box-shadow:0 18px 40px -16px color-mix(in srgb, var(--color-svv-ink) 30%, transparent)}
.loc-panneau-vide{margin:10px 12px}
.loc-res{list-style:none;margin:0;padding:0}
.loc-res-ligne{display:grid;grid-template-columns:9.5rem minmax(0,1.3fr) minmax(0,3.2fr);gap:12px;align-items:center;padding:10px 12px;text-decoration:none;color:var(--color-svv-ink);min-height:44px;box-sizing:border-box}
.loc-res li + li .loc-res-ligne{border-top:1px solid var(--color-svv-line)}
.loc-res-ligne[aria-selected="true"],.loc-res-ligne:focus-visible{background:var(--color-svv-field);outline:2px solid var(--color-svv-line-strong-hover);outline-offset:-2px;border-radius:10px}
.loc-res-type{justify-self:start;border-radius:999px;padding:3px 10px;font-size:.74rem;font-weight:800;text-transform:uppercase;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;box-sizing:border-box}
.loc-res-type--proprietaires{background:var(--color-svv-red-soft);color:var(--color-svv-red-dark)}
.loc-res-type--locataires{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.loc-res-type--syndics{background:var(--color-svv-syndic-fond);color:var(--color-svv-syndic-texte);border:1px solid var(--color-svv-syndic-bord)} /* rose du syndic de la Gestion (Arno, 17/10) */
.loc-res-type--biens{background:var(--color-svv-field);color:var(--color-svv-ink);border:1px solid var(--color-svv-line-strong)}
.loc-res-type--ancien{background:var(--color-svv-field);color:var(--color-svv-muted);border:1px dashed var(--color-svv-line-strong)}
.loc-res-nom{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:800;min-width:0}
.loc-res-infos{display:grid;grid-template-columns:minmax(0,9rem) minmax(0,1.2fr) minmax(0,1.6fr);gap:12px;min-width:0;color:var(--color-svv-muted);font-size:.9rem}
.loc-res-infos > span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.loc-res-ligne--ancien .loc-res-nom{color:var(--color-svv-muted)}
.loc-res-separateur{margin:12px 12px 4px;font-size:.78rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:var(--color-svv-muted)}
@media (max-width:760px){
  .loc-res-ligne{grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto auto;gap:4px 10px;padding:10px 8px}
  .loc-res-type{grid-row:1;grid-column:1}
  .loc-res-nom{grid-row:1;grid-column:2}
  .loc-res-infos{grid-row:2;grid-column:1 / -1;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:.85rem}
  .loc-res-infos > span{display:inline}
  .loc-res-infos > span:empty{display:none}
  .loc-res-infos > span:not(:empty) ~ span:not(:empty)::before{content:" · "}
}
`;
