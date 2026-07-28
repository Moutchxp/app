'use client';

import { useState } from 'react';
import { PermisVue } from './PermisVue';
import { DemandesVue } from './DemandesVue';
import { ReglagesVue } from './ReglagesVue';
import { AutomatisationVue } from './AutomatisationVue';
import type { CleCategorie } from '../../../../lib/sitadel/priorite';

/** Onglets de la tuile « Permis de construire » : Dossiers, Demandes (S7), Réglages (S7d) et Automatisation (S11b). */
interface Props { depuisParDefaut: string; categories: { cle: CleCategorie; libelle: string; rang: number }[] }

export function PermisTuile({ depuisParDefaut, categories }: Props) {
  const [onglet, setOnglet] = useState<'dossiers' | 'demandes' | 'reglages' | 'automatisation'>('dossiers');
  const styleOnglet = (actif: boolean) => ({
    padding: '.4rem .9rem', border: '1px solid var(--color-svv-line)', borderBottom: actif ? '2px solid var(--color-svv-red)' : '1px solid var(--color-svv-line)',
    background: actif ? '#fff' : 'var(--color-svv-field)', fontWeight: actif ? 700 : 400, cursor: 'pointer', borderRadius: '.4rem .4rem 0 0',
  });
  return (
    <div className="flex flex-col gap-3">
      <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
        <button type="button" style={styleOnglet(onglet === 'dossiers')} onClick={() => setOnglet('dossiers')}>Dossiers</button>
        <button type="button" style={styleOnglet(onglet === 'demandes')} onClick={() => setOnglet('demandes')}>Demandes</button>
        <button type="button" style={styleOnglet(onglet === 'reglages')} onClick={() => setOnglet('reglages')}>Réglages</button>
        <button type="button" style={styleOnglet(onglet === 'automatisation')} onClick={() => setOnglet('automatisation')}>Automatisation</button>
      </div>
      {onglet === 'dossiers' && <PermisVue depuisParDefaut={depuisParDefaut} categories={categories} />}
      {onglet === 'demandes' && <DemandesVue />}
      {onglet === 'reglages' && <ReglagesVue />}
      {onglet === 'automatisation' && <AutomatisationVue />}
    </div>
  );
}
