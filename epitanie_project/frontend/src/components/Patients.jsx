import React, { useEffect, useState } from 'react';
import { api } from '../api';

export default function Patients({ token, roles }) {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Formulaire nouveau patient (Note : on utilise des codes désormais)
  const [newPatient, setNewPatient] = useState({
    ipp: '',
    nom: '',
    prenom: '',
    date_naissance: '',
    code_sexe: 'M',        // Nouveau champ MOS
    code_pathologie: ''    // On stocke le code (ex: E11)
  });

  // Formulaire de rattachement
  const [attachIPP, setAttachIPP] = useState('');
  const [attachPatho, setAttachPatho] = useState('');

  useEffect(() => { fetchPatients(); }, []);

  async function fetchPatients() {
    try {
      const res = await api(token).get('/patients');
      setPatients(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  // Création
  async function createPatient(e) {
    e.preventDefault();
    await api(token).post('/patients', newPatient);
    setNewPatient({ ipp:'', nom:'', prenom:'', date_naissance:'', code_sexe:'M', code_pathologie:'' });
    await fetchPatients();
  }

  // Rattachement
  async function attachPatient(e) {
    e.preventDefault();
    // Le backend attend 'code_pathologie'
    await api(token).post('/patients/attach', { ipp: attachIPP, code_pathologie: attachPatho || null });
    setAttachIPP(''); setAttachPatho('');
    await fetchPatients();
  }

  const canEdit = Array.isArray(roles) && (roles.includes('medecin') || roles.includes('secretaire'));

  if (loading) return <p>Chargement des patients...</p>;

  return (
    <div>
      <h2>Mes patients</h2>

      {patients.length === 0
        ? <p>Aucun patient accessible</p>
        : (
            <ul style={{ padding: 0, listStyle: 'none' }}>
              {patients.map(p => (
                <li key={p.id} style={{ margin: '8px 0', padding: '8px', border: '1px solid #ddd', borderRadius: 8 }}>
                  <div>
                    <b>{p.nom} {p.prenom}</b> ({p.code_sexe}) — IPP: {p.ipp}
                  </div>
                  <div>Naissance : {new Date(p.date_naissance).toLocaleDateString()}</div>
                  <div style={{ color: '#555', marginTop: 4 }}>
                    {/* On affiche le libellé traduit par le backend (ex: "Diabète de type 2") */}
                    Pathologie : <b>{p.pathologie_libelle ? p.pathologie_libelle : <i>Aucune / Inconnue</i>}</b>
                  </div>
                </li>
              ))}
            </ul> 
          )
      }

      {canEdit && (
        <>
          <hr />
          <h3>Créer et rattacher un nouveau patient (MOS)</h3>
          <form onSubmit={createPatient} style={{ display: 'grid', gap: 8, maxWidth: 400 }}>
            <input placeholder="IPP" value={newPatient.ipp}
                   onChange={e => setNewPatient({ ...newPatient, ipp: e.target.value })} required />
            <input placeholder="Nom" value={newPatient.nom}
                   onChange={e => setNewPatient({ ...newPatient, nom: e.target.value })} required />
            <input placeholder="Prénom" value={newPatient.prenom}
                   onChange={e => setNewPatient({ ...newPatient, prenom: e.target.value })} required />
            
            {/* Nouveau champ Sexe requis */}
            <select value={newPatient.code_sexe} 
                    onChange={e => setNewPatient({ ...newPatient, code_sexe: e.target.value })}>
              <option value="M">Masculin</option>
              <option value="F">Féminin</option>
            </select>

            <input type="date" placeholder="Date de naissance" value={newPatient.date_naissance}
                   onChange={e => setNewPatient({ ...newPatient, date_naissance: e.target.value })} required />
            
            {/* Sélection de pathologie par Code CIM-10 (Simulé pour le TD) */}
            <select value={newPatient.code_pathologie} 
                    onChange={e => setNewPatient({ ...newPatient, code_pathologie: e.target.value })}>
              <option value="">-- Pathologie (Optionnel) --</option>
              <option value="E11">Diabète de type 2 (E11)</option>
              <option value="I10">Hypertension (I10)</option>
              <option value="L00">Dermatologie (L00)</option>
            </select>

            <button type="submit">Créer le patient</button>
          </form>

          <h3>Rattacher un patient existant</h3>
          <form onSubmit={attachPatient} style={{ display: 'flex', gap: 8, maxWidth: 400 }}>
            <input placeholder="IPP du patient" value={attachIPP}
                   onChange={e => setAttachIPP(e.target.value)} required />
            
             <select value={attachPatho} onChange={e => setAttachPatho(e.target.value)}>
              <option value="">-- Pathologie --</option>
              <option value="E11">Diabète (E11)</option>
              <option value="I10">HTA (I10)</option>
              <option value="L00">Dermatologie (L00)</option>
            </select>

            <button type="submit">Rattacher</button>
          </form>
        </>
      )}
    </div>
  );
}