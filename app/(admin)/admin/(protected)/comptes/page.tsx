'use client';

import { useEffect, useState, type FormEvent } from 'react';
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

const MODULES: ReadonlyArray<{ cle: keyof Perms; libelle: string }> = [
  { cle: 'pilotage', libelle: 'Pilotage' },
  { cle: 'cartes_annee', libelle: 'Cartes d’année' },
  { cle: 'statistiques', libelle: 'Statistiques' },
  { cle: 'internautes', libelle: 'Internautes' },
  { cle: 'curation', libelle: 'Curation' },
  { cle: 'banc_test', libelle: 'Banc de test' },
];

const PERMS_VIDE = (): Perms => ({ pilotage: false, cartes_annee: false, statistiques: false, internautes: false, curation: false, banc_test: false });

/** Modale bloquante du mot de passe temporaire : une seule fois, copie, case « transmis » avant fermeture. */
function ModaleTemporaire({ identifiant, motDePasse, onFermer }: { identifiant: string; motDePasse: string; onFermer: () => void }) {
  const [transmis, setTransmis] = useState(false);
  const [copie, setCopie] = useState(false);
  return (
    <div role="alertdialog" aria-modal="true" className="svv-cpt-overlay">
      <div className="svv-cpt-modale">
        <h2 className="svv-cpt-titre">Mot de passe temporaire</h2>
        <p className="svv-cpt-sous">
          Pour <strong>{identifiant}</strong>. Il ne sera <strong>plus jamais affiché</strong> : transmettez-le
          maintenant. Perdu ? Régénérez-en un depuis la liste.
        </p>
        <div className="svv-cpt-mdp">
          <code>{motDePasse}</code>
          <button
            type="button"
            className="svv-btn"
            onClick={() => { navigator.clipboard?.writeText(motDePasse); setCopie(true); }}
          >
            {copie ? 'Copié' : 'Copier'}
          </button>
        </div>
        <label className="svv-cpt-case">
          <input type="checkbox" checked={transmis} onChange={(e) => setTransmis(e.target.checked)} />
          J’ai transmis ce mot de passe
        </label>
        <button type="button" className="svv-btn svv-btn-primary" disabled={!transmis} onClick={onFermer} style={{ minHeight: 44, width: '100%' }}>
          Fermer
        </button>
      </div>
    </div>
  );
}

export default function ComptesPage() {
  const [comptes, setComptes] = useState<CompteVue[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [temp, setTemp] = useState<{ identifiant: string; motDePasse: string } | null>(null);

  // Formulaire de création
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [identifiant, setIdentifiant] = useState('');
  const [role, setRole] = useState<RoleAdmin>('collaborateur');
  const [perms, setPerms] = useState<Perms>(PERMS_VIDE());
  const [enCours, setEnCours] = useState(false);
  const admin = role === 'administrateur';

  // Recharge la liste (utilisée par les gestionnaires d'événements — setState hors effet, donc autorisé).
  async function recharger() {
    try {
      const res = await fetch('/api/admin/comptes');
      if (!res.ok) throw new Error();
      const body = await res.json();
      setComptes(body.comptes ?? []);
      setErreur(null);
    } catch {
      setErreur('Liste indisponible.');
    } finally {
      setChargement(false);
    }
  }

  // Chargement initial : IIFE asynchrone ; tout setState survient APRÈS un `await` (jamais synchrone dans l'effet).
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/comptes');
        if (!res.ok) throw new Error();
        const body = await res.json();
        if (!annule) { setComptes(body.comptes ?? []); setErreur(null); }
      } catch {
        if (!annule) setErreur('Liste indisponible.');
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => { annule = true; };
  }, []);

  async function creer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      const res = await fetch('/api/admin/comptes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prenom, nom, identifiant, role, perms }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 201) {
        setTemp({ identifiant, motDePasse: body.motDePasseTemporaire });
        setPrenom(''); setNom(''); setIdentifiant(''); setRole('collaborateur'); setPerms(PERMS_VIDE());
        await recharger();
      } else {
        setErreur(typeof body?.erreur === 'string' ? body.erreur : 'Création impossible.');
      }
    } catch {
      setErreur('Création impossible.');
    } finally {
      setEnCours(false);
    }
  }

  async function basculerActif(c: CompteVue) {
    const res = await fetch(`/api/admin/comptes/${c.id}/actif`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actif: !c.actif }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErreur(body?.erreur === 'DERNIER_ADMINISTRATEUR'
        ? 'Impossible de désactiver le dernier administrateur actif.'
        : 'Action impossible.');
      return;
    }
    await recharger();
  }

  async function regenerer(c: CompteVue) {
    const res = await fetch(`/api/admin/comptes/${c.id}/mot-de-passe-temporaire`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setTemp({ identifiant: c.identifiant, motDePasse: body.motDePasseTemporaire });
      await recharger();
    } else {
      setErreur('Régénération impossible.');
    }
  }

  return (
    <div>
      <style>{CSS}</style>
      <h1 className="svv-cpt-h1">Administratif — comptes</h1>

      <section className="svv-card" style={{ marginBottom: 20 }}>
        <h2 className="svv-cpt-h2">Créer un compte</h2>
        <form onSubmit={creer} className="svv-cpt-form">
          <input className="svv-cpt-champ" placeholder="Prénom" value={prenom} onChange={(e) => setPrenom(e.target.value)} required />
          <input className="svv-cpt-champ" placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} required />
          <input className="svv-cpt-champ" type="email" inputMode="email" autoCapitalize="none" placeholder="adresse e-mail" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} required />
          <select className="svv-cpt-champ" value={role} onChange={(e) => setRole(e.target.value as RoleAdmin)}>
            <option value="collaborateur">Collaborateur</option>
            <option value="administrateur">Administrateur</option>
          </select>
          <fieldset className="svv-cpt-perms">
            <legend>Permissions {admin && '(administrateur : toutes, non modifiables)'}</legend>
            {MODULES.map((m) => (
              <label key={m.cle} className="svv-cpt-perm">
                <input
                  type="checkbox"
                  checked={admin || perms[m.cle]}
                  disabled={admin}
                  onChange={(e) => setPerms((p) => ({ ...p, [m.cle]: e.target.checked }))}
                />
                {m.libelle}
              </label>
            ))}
          </fieldset>
          <button type="submit" className="svv-btn svv-btn-primary" disabled={enCours} style={{ minHeight: 44 }}>
            {enCours ? 'Création…' : 'Créer le compte'}
          </button>
        </form>
      </section>

      {erreur && <p role="alert" className="svv-cpt-err">{erreur}</p>}

      <section className="svv-card">
        <h2 className="svv-cpt-h2">Comptes</h2>
        {chargement ? (
          <p>Chargement…</p>
        ) : (
          <div className="svv-cpt-liste">
            {comptes.map((c) => (
              <div key={c.identifiant} className="svv-cpt-ligne">
                <div className="svv-cpt-info">
                  <div className="svv-cpt-nom">{c.prenom} {c.nom}</div>
                  <div className="svv-cpt-id">{c.identifiant}</div>
                  <div className="svv-cpt-meta">
                    {c.role} · {c.actif ? 'actif' : 'inactif'} · dernière connexion : {c.derniere_connexion_a ?? 'jamais'}
                  </div>
                </div>
                <div className="svv-cpt-actions">
                  <button type="button" className="svv-btn" onClick={() => basculerActif(c)}>
                    {c.actif ? 'Désactiver' : 'Activer'}
                  </button>
                  <button type="button" className="svv-btn" onClick={() => regenerer(c)}>
                    Régénérer le mot de passe
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {temp && <ModaleTemporaire identifiant={temp.identifiant} motDePasse={temp.motDePasse} onFermer={() => setTemp(null)} />}
    </div>
  );
}

const CSS = `
.svv-cpt-h1{font-size:1.2rem;font-weight:800;color:var(--color-svv-ink);margin:0 0 16px}
.svv-cpt-h2{font-size:1rem;font-weight:700;color:var(--color-svv-ink);margin:0 0 12px}
.svv-cpt-form{display:flex;flex-direction:column;gap:10px}
.svv-cpt-champ{min-height:44px;padding:.6rem;font-size:1rem;border:1px solid var(--color-svv-line);border-radius:.6rem;background:#fff;color:var(--color-svv-ink)}
.svv-cpt-perms{border:1px solid var(--color-svv-line);border-radius:.6rem;padding:.6rem;display:flex;flex-wrap:wrap;gap:.5rem 1rem}
.svv-cpt-perms legend{font-size:.8rem;color:var(--color-svv-muted);padding:0 .3rem}
.svv-cpt-perm{display:inline-flex;align-items:center;gap:.4rem;min-height:32px;font-size:.9rem}
.svv-cpt-err{color:var(--color-svv-red);font-size:.9rem;margin:0 0 12px}
.svv-cpt-liste{display:flex;flex-direction:column;gap:8px}
.svv-cpt-ligne{display:flex;flex-direction:column;gap:8px;border:1px solid var(--color-svv-line);border-radius:.6rem;padding:.75rem}
.svv-cpt-nom{font-weight:700;color:var(--color-svv-ink)}
.svv-cpt-id{font-size:.85rem;color:var(--color-svv-gray)}
.svv-cpt-meta{font-size:.78rem;color:var(--color-svv-muted);margin-top:2px}
.svv-cpt-actions{display:flex;flex-wrap:wrap;gap:8px}
.svv-cpt-actions .svv-btn{min-height:40px}
.svv-cpt-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:1.5rem;background:rgba(20,20,20,.55)}
.svv-cpt-modale{width:100%;max-width:420px;background:#fff;border:1px solid var(--color-svv-line);border-radius:.9rem;padding:1.25rem}
.svv-cpt-titre{margin:0 0 6px;font-size:1.05rem;font-weight:800;color:var(--color-svv-ink)}
.svv-cpt-sous{margin:0 0 12px;font-size:.85rem;color:var(--color-svv-muted)}
.svv-cpt-mdp{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.svv-cpt-mdp code{flex:1;font-size:1rem;padding:.6rem;background:var(--color-svv-field);border-radius:.5rem;word-break:break-all}
.svv-cpt-case{display:flex;align-items:center;gap:.5rem;min-height:40px;font-size:.9rem;margin-bottom:12px}
@media (min-width:768px){
  .svv-cpt-ligne{flex-direction:row;align-items:center;justify-content:space-between}
  .svv-cpt-actions{flex-shrink:0}
}
`;
