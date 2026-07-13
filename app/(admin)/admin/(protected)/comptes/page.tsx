'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { EnTetePage } from '../_composants/EnTetePage';
import type { Perms, RoleAdmin } from '../../../../lib/admin/session';

interface CompteVue {
  id: number;
  identifiant: string;
  prenom: string;
  nom: string;
  role: RoleAdmin;
  actif: boolean;
  perms: Perms;
  derniere_connexion_a: string | null;
}
interface DetailCompte extends CompteVue {
  doit_changer_mot_de_passe: boolean;
}

const MODULES: ReadonlyArray<{ cle: keyof Perms; libelle: string }> = [
  { cle: 'pilotage', libelle: 'Pilotage' },
  { cle: 'cartes_annee', libelle: 'Cartes d’année' },
  { cle: 'statistiques', libelle: 'Statistiques' },
  { cle: 'internautes', libelle: 'Internautes' },
  { cle: 'curation', libelle: 'Curation' },
  { cle: 'banc_test', libelle: 'Banc de test' },
];
const PERMS_VIDE = (): Perms => ({ pilotage: false, cartes_annee: false, statistiques: false, internautes: false, curation: false, banc_test: false });

/**
 * Date lisible en français, HEURE LOCALE (Intl, locale fr-FR ; aucune dépendance). « jamais » si absente.
 * PUR et déterministe → pas de mismatch d'hydratation (la page ne rend les dates qu'en client, après fetch).
 */
export function formaterDate(iso: string | null): string {
  if (!iso) return 'jamais';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'jamais';
  const jour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(d);
  return `${jour}, ${heure}`;
}

/**
 * Pastille de permission (chip) — contrôle de FORMULAIRE tactile. État coché/décoché perceptible SANS la seule
 * couleur : un indicateur ✓ / □ (forme). Annoncé aux lecteurs d'écran via `aria-pressed`. Désactivée + forcée
 * pour un administrateur (perms implicites).
 */
export function Chip({ libelle, coche, disabled, onToggle }: { libelle: string; coche: boolean; disabled?: boolean; onToggle?: () => void }) {
  return (
    <button type="button" className="cpt-chip" aria-pressed={coche} disabled={disabled} onClick={onToggle}>
      <span className="cpt-chip__ind" aria-hidden="true">{coche ? '✓' : ''}</span>
      {libelle}
    </button>
  );
}

/**
 * Contenu du DÉTAIL d'un compte (présentation PURE, sans fetch). L'identité (prénom/nom/identifiant) n'y figure
 * QU'UNE fois — quand le détail est ouvert, la carte n'affiche que ce contenu, jamais le résumé en plus.
 */
export function DetailContenu({
  compte, perms, collaborateur, msg, enCours, idPrenom, idNom, onIdPrenom, onIdNom, onEnregistrerIdentite,
  onToggle, onEnregistrer, onPromouvoir, onFermer,
}: {
  compte: DetailCompte;
  perms: Perms;
  collaborateur: boolean;
  msg: string | null;
  enCours: boolean;
  idPrenom: string;
  idNom: string;
  onIdPrenom: (v: string) => void;
  onIdNom: (v: string) => void;
  onEnregistrerIdentite: () => void;
  onToggle: (cle: keyof Perms) => void;
  onEnregistrer: () => void;
  onPromouvoir: () => void;
  onFermer: () => void;
}) {
  // Refus AVANT tout appel serveur (le serveur revalide de toute façon) : prénom ET nom non vides après trim.
  const identiteInvalide = idPrenom.trim().length === 0 || idNom.trim().length === 0;
  return (
    <>
      <div className="cpt-tete" id={`cpt-tete-${compte.id}`}>{compte.prenom} {compte.nom}</div>
      <div className="cpt-meta">
        Rôle : {compte.role} · {compte.actif ? 'actif' : 'inactif'} · dernière connexion : {formaterDate(compte.derniere_connexion_a)}
        {compte.doit_changer_mot_de_passe && ' · doit changer son mot de passe'}
      </div>

      {/* Identité : prénom + nom éditables (tout compte, y compris un administrateur — F-2). L'identifiant (e-mail)
          est affiché en TEXTE lecture seule, jamais dans un champ désactivé trompeur : il est IMMUABLE (F-1). */}
      <div className="cpt-identite" role="group" aria-labelledby={`ident-${compte.id}`}>
        <div className="cpt-perms-titre" id={`ident-${compte.id}`}>Identité</div>
        <label className="cpt-libc">
          <span className="cpt-libc-t">Prénom</span>
          <input className="cpt-champ" value={idPrenom} autoCapitalize="words" disabled={enCours}
            onChange={(e) => onIdPrenom(e.target.value)} aria-invalid={idPrenom.trim().length === 0} />
        </label>
        <label className="cpt-libc">
          <span className="cpt-libc-t">Nom</span>
          <input className="cpt-champ" value={idNom} autoCapitalize="words" disabled={enCours}
            onChange={(e) => onIdNom(e.target.value)} aria-invalid={idNom.trim().length === 0} />
        </label>
        <div className="cpt-libc">
          <span className="cpt-libc-t">Identifiant (e-mail)</span>
          <span className="cpt-idval">{compte.identifiant}</span>
          <span className="cpt-note">
            Non modifiable : c’est la clé de connexion. Pour changer d’adresse, désactivez ce compte et recréez-en un.
          </span>
        </div>
        <div className="cpt-actions">
          <button type="button" className="cpt-btn cpt-btn--primary" disabled={enCours || identiteInvalide} onClick={onEnregistrerIdentite}>
            Enregistrer l’identité
          </button>
          {identiteInvalide && <span className="cpt-err" role="status">Prénom et nom sont obligatoires.</span>}
        </div>
      </div>

      <div className="cpt-perms-titre" id={`perms-${compte.id}`}>
        Permissions {!collaborateur && '(administrateur : toutes, non modifiables)'}
      </div>
      <div className="cpt-perms" role="group" aria-labelledby={`perms-${compte.id}`}>
        {MODULES.map((m) => (
          <Chip key={m.cle} libelle={m.libelle} coche={collaborateur ? perms[m.cle] : true} disabled={!collaborateur} onToggle={() => onToggle(m.cle)} />
        ))}
      </div>

      {collaborateur ? (
        <div className="cpt-actions">
          <button type="button" className="cpt-btn cpt-btn--primary" disabled={enCours} onClick={onEnregistrer}>Enregistrer les permissions</button>
          <button type="button" className="cpt-btn cpt-btn--secondary" disabled={enCours} onClick={onPromouvoir}>Promouvoir administrateur</button>
        </div>
      ) : (
        <p className="cpt-note">Un administrateur a toutes les permissions et ne peut être ni rétrogradé ni désactivé depuis l’interface (accès serveur requis).</p>
      )}

      <p className="cpt-note">
        Un changement de permission prend effet <strong>immédiatement</strong> sur les écritures ; l’accès aux pages
        et le menu se mettent à jour à la prochaine connexion de l’intéressé (au plus 8 h).
      </p>
      {msg && <p className="cpt-note" role="status">{msg}</p>}

      <button type="button" className="cpt-btn cpt-btn--neutral" onClick={onFermer}>Fermer</button>
    </>
  );
}

/** Détail d'un compte : charge l'état RÉEL en base, puis rend `DetailContenu`. Prend le focus au dépli (a11y). */
function Detail({ id, onFermer, onRafraichir }: { id: number; onFermer: () => void; onRafraichir: () => void }) {
  const [d, setD] = useState<DetailCompte | null>(null);
  const [perms, setPerms] = useState<Perms>(PERMS_VIDE());
  const [idPrenom, setIdPrenom] = useState('');
  const [idNom, setIdNom] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { ref.current?.focus(); }, []); // dépli → focus au détail (focus, pas d'animation)
  useEffect(() => {
    let annule = false;
    void (async () => {
      const res = await fetch(`/api/admin/comptes/${id}`);
      if (annule) return;
      if (!res.ok) { setMsg('Détail indisponible.'); return; }
      const body = await res.json();
      if (!annule) { setD(body.compte); setPerms(body.compte.perms); setIdPrenom(body.compte.prenom); setIdNom(body.compte.nom); }
    })();
    return () => { annule = true; };
  }, [id]);

  async function recharger() {
    const res = await fetch(`/api/admin/comptes/${id}`);
    if (!res.ok) { setMsg('Détail indisponible.'); return; }
    const body = await res.json();
    setD(body.compte); setPerms(body.compte.perms); setIdPrenom(body.compte.prenom); setIdNom(body.compte.nom);
  }
  async function enregistrerIdentite() {
    const prenom = idPrenom.trim(); const nom = idNom.trim();
    if (prenom.length === 0 || nom.length === 0) { setMsg('Prénom et nom sont obligatoires.'); return; }
    setEnCours(true); setMsg(null);
    try {
      // Allowlist stricte côté serveur : le corps ne porte QUE prenom + nom. L'identifiant n'est jamais transmis.
      const res = await fetch(`/api/admin/comptes/${id}/identite`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prenom, nom }) });
      if (res.ok) { setMsg('Identité enregistrée.'); await recharger(); onRafraichir(); } else setMsg('Enregistrement de l’identité refusé.');
    } finally { setEnCours(false); }
  }
  async function enregistrer() {
    setEnCours(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/comptes/${id}/permissions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ perms }) });
      if (res.ok) { setMsg('Permissions enregistrées.'); await recharger(); onRafraichir(); } else setMsg('Enregistrement refusé.');
    } finally { setEnCours(false); }
  }
  async function promouvoir() {
    if (!window.confirm('Promouvoir ce compte en administrateur ? Un administrateur a toutes les permissions et ne peut plus être rétrogradé.')) return;
    setEnCours(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/comptes/${id}/role`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'administrateur' }) });
      if (res.ok) { setMsg('Compte promu administrateur.'); await recharger(); onRafraichir(); } else setMsg('Promotion refusée.');
    } finally { setEnCours(false); }
  }

  return (
    <div ref={ref} tabIndex={-1} className="cpt-detail" id={`detail-${id}`} role="region" aria-labelledby={`cpt-tete-${id}`}>
      {d
        ? <DetailContenu compte={d} perms={perms} collaborateur={d.role === 'collaborateur'} msg={msg} enCours={enCours}
            idPrenom={idPrenom} idNom={idNom} onIdPrenom={setIdPrenom} onIdNom={setIdNom} onEnregistrerIdentite={enregistrerIdentite}
            onToggle={(cle) => setPerms((p) => ({ ...p, [cle]: !p[cle] }))} onEnregistrer={enregistrer} onPromouvoir={promouvoir} onFermer={onFermer} />
        : (msg ?? 'Chargement…')}
    </div>
  );
}

/** Modale bloquante du mot de passe temporaire : une seule fois, copie, case « transmis » avant fermeture. */
function ModaleTemporaire({ identifiant, motDePasse, onFermer }: { identifiant: string; motDePasse: string; onFermer: () => void }) {
  const [transmis, setTransmis] = useState(false);
  const [copie, setCopie] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []); // focus initial dans la modale bloquante (a11y)
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="cpt-modale-titre" className="cpt-overlay">
      <div ref={ref} tabIndex={-1} className="cpt-modale" style={{ outline: 'none' }}>
        <h2 className="cpt-titre" id="cpt-modale-titre">Mot de passe temporaire</h2>
        <p className="cpt-sous">
          Pour <strong>{identifiant}</strong>. Il ne sera <strong>plus jamais affiché</strong> : transmettez-le
          maintenant. Perdu ? Régénérez-en un depuis la liste.
        </p>
        <div className="cpt-mdp">
          <code>{motDePasse}</code>
          <button type="button" className="cpt-btn cpt-btn--secondary" onClick={() => { navigator.clipboard?.writeText(motDePasse); setCopie(true); }}>
            {copie ? 'Copié' : 'Copier'}
          </button>
        </div>
        <label className="cpt-case">
          <input type="checkbox" checked={transmis} onChange={(e) => setTransmis(e.target.checked)} />
          J’ai transmis ce mot de passe
        </label>
        <button type="button" className="cpt-btn cpt-btn--primary" disabled={!transmis} onClick={onFermer} style={{ width: '100%' }}>Fermer</button>
      </div>
    </div>
  );
}

export default function ComptesPage() {
  const [comptes, setComptes] = useState<CompteVue[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [temp, setTemp] = useState<{ identifiant: string; motDePasse: string } | null>(null);
  const [ouvertId, setOuvertId] = useState<number | null>(null);
  const [desactivesOuverts, setDesactivesOuverts] = useState(false);
  const detailsBtnRef = useRef<HTMLButtonElement | null>(null);

  // Formulaire de création
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [identifiant, setIdentifiant] = useState('');
  const [role, setRole] = useState<RoleAdmin>('collaborateur');
  const [perms, setPerms] = useState<Perms>(PERMS_VIDE());
  const [enCours, setEnCours] = useState(false);
  const admin = role === 'administrateur';

  async function recharger() {
    try {
      const res = await fetch('/api/admin/comptes');
      if (!res.ok) throw new Error();
      const body = await res.json();
      setComptes(body.comptes ?? []); setErreur(null);
    } catch { setErreur('Liste indisponible.'); } finally { setChargement(false); }
  }
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/comptes');
        if (!res.ok) throw new Error();
        const body = await res.json();
        if (!annule) { setComptes(body.comptes ?? []); setErreur(null); }
      } catch { if (!annule) setErreur('Liste indisponible.'); } finally { if (!annule) setChargement(false); }
    })();
    return () => { annule = true; };
  }, []);

  async function creer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setEnCours(true); setErreur(null);
    try {
      const res = await fetch('/api/admin/comptes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prenom, nom, identifiant, role, perms }) });
      const body = await res.json().catch(() => ({}));
      if (res.status === 201) {
        setTemp({ identifiant, motDePasse: body.motDePasseTemporaire });
        setPrenom(''); setNom(''); setIdentifiant(''); setRole('collaborateur'); setPerms(PERMS_VIDE());
        await recharger();
      } else setErreur(typeof body?.erreur === 'string' ? body.erreur : 'Création impossible.');
    } catch { setErreur('Création impossible.'); } finally { setEnCours(false); }
  }

  async function definirActif(c: CompteVue, actif: boolean) {
    const res = await fetch(`/api/admin/comptes/${c.id}/actif`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actif }) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const erreurs: Record<string, string> = {
        ADMIN_CLI_UNIQUEMENT: 'Un administrateur ne peut pas être activé ou désactivé depuis l’interface.',
        DERNIER_ADMINISTRATEUR: 'Impossible de désactiver le dernier administrateur actif.',
      };
      setErreur(erreurs[body?.erreur as string] ?? 'Action impossible.');
      return;
    }
    await recharger();
  }
  async function regenerer(c: CompteVue) {
    const res = await fetch(`/api/admin/comptes/${c.id}/mot-de-passe-temporaire`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    if (res.ok) { setTemp({ identifiant: c.identifiant, motDePasse: body.motDePasseTemporaire }); await recharger(); } else setErreur('Régénération impossible.');
  }

  function ouvrir(c: CompteVue, btn: HTMLButtonElement) { detailsBtnRef.current = btn; setOuvertId(c.id); }
  function fermer() { const btn = detailsBtnRef.current; setOuvertId(null); requestAnimationFrame(() => btn?.focus()); }

  const actifs = comptes.filter((c) => c.actif);
  const desactives = comptes.filter((c) => !c.actif);

  function carte(c: CompteVue, desactive: boolean) {
    if (ouvertId === c.id) {
      return <div key={c.id} className="cpt-carte"><Detail id={c.id} onFermer={fermer} onRafraichir={recharger} /></div>;
    }
    const collaborateur = c.role === 'collaborateur';
    return (
      <div key={c.id} className="cpt-carte">
        <div className="cpt-resume">
          <div className="cpt-nom">{c.prenom} {c.nom}</div>
          <div className="cpt-id">{c.identifiant}</div>
          <div className="cpt-meta">{c.role} · dernière connexion : {formaterDate(c.derniere_connexion_a)}</div>
          {/* Règle admin (F1) : sous la ligne de rôle, dans la colonne d'identité — jamais dans la rangée de
              boutons (ceux-ci s'alignent ainsi d'une carte à l'autre). Ton sobre. Le refus est aussi serveur. */}
          {!collaborateur && (
            <div className="cpt-regle">
              {desactive
                ? 'Un administrateur ne peut pas être réactivé depuis l’interface.'
                : 'Un administrateur ne peut pas être désactivé depuis l’interface.'}
            </div>
          )}
        </div>
        <div className="cpt-actions">
          <button type="button" className="cpt-btn cpt-btn--secondary" aria-expanded={false} aria-controls={`detail-${c.id}`} onClick={(e) => ouvrir(c, e.currentTarget)}>Détails</button>
          {!desactive && <button type="button" className="cpt-btn cpt-btn--secondary" onClick={() => regenerer(c)}>Régénérer le mot de passe</button>}
          {collaborateur && (
            <button type="button" className="cpt-btn cpt-btn--secondary" onClick={() => definirActif(c, desactive)}>{desactive ? 'Réactiver' : 'Désactiver'}</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <style>{CSS}</style>
      <EnTetePage titre="Administratif — comptes" intro="Gestion des comptes administrateurs, de leurs rôles et de leurs permissions." />

      {/* Bloc « Créer un compte » encapsulé en TRAME GRISE (cohérence admin) ; champs/cases/bouton restent en fond clair.
          Affichage seul — aucune logique compte/rôle/permission modifiée. */}
      <section className="svv-card" style={{ marginBottom: 20, background: 'var(--color-svv-field)' }}>
        <h2 className="cpt-h2">Créer un compte</h2>
        <form onSubmit={creer} className="cpt-form">
          <input className="cpt-champ" placeholder="Prénom" value={prenom} onChange={(e) => setPrenom(e.target.value)} required />
          <input className="cpt-champ" placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} required />
          <input className="cpt-champ" type="email" inputMode="email" autoCapitalize="none" placeholder="adresse e-mail" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} required />
          <select className="cpt-champ" value={role} onChange={(e) => setRole(e.target.value as RoleAdmin)}>
            <option value="collaborateur">Collaborateur</option>
            <option value="administrateur">Administrateur</option>
          </select>
          <div className="cpt-perms-titre" id="perms-creation">Permissions {admin && '(administrateur : toutes, non modifiables)'}</div>
          <div className="cpt-perms" role="group" aria-labelledby="perms-creation">
            {MODULES.map((m) => (
              <Chip key={m.cle} libelle={m.libelle} coche={admin || perms[m.cle]} disabled={admin} onToggle={() => setPerms((p) => ({ ...p, [m.cle]: !p[m.cle] }))} />
            ))}
          </div>
          <button type="submit" className="cpt-btn cpt-btn--primary" disabled={enCours}>{enCours ? 'Création…' : 'Créer le compte'}</button>
        </form>
      </section>

      {erreur && <p role="alert" className="cpt-err">{erreur}</p>}

      <section className="svv-card" style={{ marginBottom: 20 }}>
        <h2 className="cpt-h2">Comptes actifs ({actifs.length})</h2>
        {chargement ? <p>Chargement…</p> : <div className="cpt-liste">{actifs.map((c) => carte(c, false))}</div>}
      </section>

      <section className="svv-card cpt-desactives">
        <button type="button" className="cpt-repli cpt-btn--focus" aria-expanded={desactivesOuverts} onClick={() => setDesactivesOuverts((v) => !v)}>
          <span className="cpt-h2" style={{ margin: 0 }}>Comptes désactivés ({desactives.length})</span>
          <span aria-hidden="true">{desactivesOuverts ? '▾' : '▸'}</span>
        </button>
        {desactivesOuverts && (desactives.length === 0
          ? <p className="cpt-note">Aucun compte désactivé.</p>
          : <div className="cpt-liste">{desactives.map((c) => carte(c, true))}</div>)}
      </section>

      {temp && <ModaleTemporaire identifiant={temp.identifiant} motDePasse={temp.motDePasse} onFermer={() => setTemp(null)} />}
    </div>
  );
}

const CSS = `
.cpt-h2{font-size:1rem;font-weight:700;color:var(--color-svv-ink);margin:0 0 12px}
.cpt-form{display:flex;flex-direction:column;gap:10px}
.cpt-champ{min-height:44px;padding:.6rem;font-size:1rem;border:1px solid var(--color-svv-line);border-radius:.6rem;background:#fff;color:var(--color-svv-ink)}
.cpt-champ:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
.cpt-err{color:var(--color-svv-red);font-size:.9rem;margin:0 0 12px}
.cpt-liste{display:flex;flex-direction:column;gap:10px}
/* Trame de fond : gris très clair UNIFORME sur tout le cartouche + bordure fine. Aucun filet interne. */
.cpt-carte{background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:.7rem;padding:.9rem;display:flex;flex-direction:column;gap:10px}
.cpt-nom{font-weight:700;color:var(--color-svv-ink)}
.cpt-id{font-size:.85rem;color:var(--color-svv-gray)}
.cpt-meta{font-size:.8rem;color:var(--color-svv-muted)}
.cpt-tete{font-weight:700;color:var(--color-svv-ink)}
.cpt-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.cpt-regle{font-size:.72rem;color:var(--color-svv-muted);margin-top:4px}
/* Bloc identité (édition prénom/nom + identifiant en texte lecture seule). */
.cpt-identite{display:flex;flex-direction:column;gap:8px}
.cpt-libc{display:flex;flex-direction:column;gap:4px}
.cpt-libc-t{font-size:.8rem;color:var(--color-svv-muted)}
.cpt-idval{font-size:.95rem;font-weight:600;color:var(--color-svv-ink);word-break:break-all}
.cpt-detail{outline:none}
.cpt-note{font-size:.8rem;color:var(--color-svv-muted);margin:4px 0 0}
.cpt-perms-titre{font-size:.8rem;color:var(--color-svv-muted)}
.cpt-perms{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:2px 0}
/* Boutons — hiérarchie stricte, palette du site (aucun bleu), focus rouge visible, cibles >= 44px. */
.cpt-btn{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;min-height:44px;padding:.6rem 1rem;font-weight:700;font-size:.95rem;line-height:1.1;border-radius:.7rem;border:1.5px solid transparent;background:#fff;color:var(--color-svv-ink);cursor:pointer;transition:background-color .15s ease,border-color .15s ease}
.cpt-btn--primary{background:var(--color-svv-red);color:#fff;border-color:var(--color-svv-red)}
.cpt-btn--primary:hover{background:var(--color-svv-red-dark);border-color:var(--color-svv-red-dark)}
.cpt-btn--secondary{background:#fff;color:var(--color-svv-red);border-color:var(--color-svv-red)}
.cpt-btn--secondary:hover{background:#fbeceb}
.cpt-btn--neutral{background:#fff;color:var(--color-svv-gray);border-color:var(--color-svv-line)}
.cpt-btn--neutral:hover{border-color:var(--color-svv-muted)}
.cpt-btn:disabled{opacity:.55;cursor:not-allowed}
.cpt-btn:focus-visible,.cpt-btn--focus:focus-visible,.cpt-chip:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* Pastilles de permission (chips) — état par forme (indicateur ✓/□) + fond, pas la seule couleur. */
.cpt-chip{display:flex;align-items:center;gap:.5rem;min-height:44px;padding:.5rem .75rem;border-radius:.7rem;border:1.5px solid var(--color-svv-line);background:#fff;color:var(--color-svv-ink);font-size:.9rem;font-weight:600;cursor:pointer;text-align:left;width:100%}
.cpt-chip[aria-pressed="true"]{background:var(--color-svv-green-soft);border-color:var(--color-svv-green-ink);color:var(--color-svv-green-ink)}
.cpt-chip:disabled{cursor:not-allowed;opacity:.85}
.cpt-chip__ind{width:20px;height:20px;flex-shrink:0;border:1.5px solid currentColor;border-radius:.35rem;display:inline-flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:800}
.cpt-desactives{border-style:dashed}
.cpt-repli{width:100%;display:flex;align-items:center;justify-content:space-between;min-height:44px;background:none;border:0;cursor:pointer;padding:0;color:var(--color-svv-ink)}
.cpt-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:1.5rem;background:rgba(20,20,20,.55)}
.cpt-modale{width:100%;max-width:420px;background:#fff;border:1px solid var(--color-svv-line);border-radius:.9rem;padding:1.25rem}
.cpt-titre{margin:0 0 6px;font-size:1.05rem;font-weight:800;color:var(--color-svv-ink)}
.cpt-sous{margin:0 0 12px;font-size:.85rem;color:var(--color-svv-muted)}
.cpt-mdp{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.cpt-mdp code{flex:1;font-size:1rem;padding:.6rem;background:var(--color-svv-field);border-radius:.5rem;word-break:break-all;color:var(--color-svv-ink)}
.cpt-case{display:flex;align-items:center;gap:.5rem;min-height:44px;font-size:.9rem;margin-bottom:12px}
/* Case à cocher : coche + focus à la palette du site (jamais le bleu natif du navigateur). */
.cpt-case input{accent-color:var(--color-svv-red)}
.cpt-case input:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
@media (min-width:768px){
  .cpt-carte{flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:space-between}
  .cpt-carte .cpt-detail{flex-basis:100%}
  .cpt-resume{flex:1;min-width:0}
}
@media (prefers-reduced-motion: reduce){ .cpt-btn{transition:none} }
`;
