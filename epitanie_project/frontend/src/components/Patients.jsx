import React, { useEffect, useState } from 'react';
import { api } from '../api';

export default function Patients({ token, roles }) {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  // New patient form
  const [newPatient, setNewPatient] = useState({
    ipp: '',
    nom: '',
    prenom: '',
    date_naissance: '',
  });

  // Attach existing patient by IPP
  const [attachIPP, setAttachIPP] = useState('');

  useEffect(() => { fetchPatients(); }, []);

  async function fetchPatients() {
    try {
      const res = await api(token).get('/patients');
      setPatients(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function createPatient(e) {
    e.preventDefault();
    try {
      // POST /patients creates AND auto-links to the current professional (backend below)
      await api(token).post('/patients', newPatient);
      setNewPatient({ ipp: '', nom: '', prenom: '', date_naissance: '' });
      await fetchPatients();
    } catch (err) {
      console.error(err);
      alert("Échec de la création du patient.");
    }
  }

  async function attachPatient(e) {
    e.preventDefault();
    try {
      // Attach by IPP to current professional
      await api(token).post('/patients/attach', { ipp: attachIPP });
      setAttachIPP('');
      await fetchPatients();
    } catch (err) {
      console.error(err);
      alert("Échec de l'attachement du patient.");
    }
  }

  const canEdit = Array.isArray(roles) && (roles.includes('medecin') || roles.includes('secretaire'));

  if (loading) return <p>Chargement des patients...</p>;

  return (
    <div>
      <h2>Mes patients</h2>

      {patients.length === 0
        ? <p>Aucun patient accessible</p>
        : <ul>{patients.map(p => <li key={p.id}>{p.prenom} {p.nom} — IPP: {p.ipp}</li>)}</ul>
      }

      {canEdit && (
        <>
          <hr />
          <h3>Créer et rattacher un nouveau patient</h3>
          <form onSubmit={createPatient} style={{ display: 'grid', gap: 8, maxWidth: 400 }}>
            <input placeholder="IPP" value={newPatient.ipp}
                   onChange={e => setNewPatient({ ...newPatient, ipp: e.target.value })} required />
            <input placeholder="Nom" value={newPatient.nom}
                   onChange={e => setNewPatient({ ...newPatient, nom: e.target.value })} required />
            <input placeholder="Prénom" value={newPatient.prenom}
                   onChange={e => setNewPatient({ ...newPatient, prenom: e.target.value })} required />
            <input type="date" placeholder="Date de naissance" value={newPatient.date_naissance}
                   onChange={e => setNewPatient({ ...newPatient, date_naissance: e.target.value })} required />
            <button type="submit">Créer le patient</button>
          </form>

          <h3>Rattacher un patient existant (par IPP)</h3>
          <form onSubmit={attachPatient} style={{ display: 'flex', gap: 8, maxWidth: 400 }}>
            <input placeholder="IPP du patient" value={attachIPP}
                   onChange={e => setAttachIPP(e.target.value)} required />
            <button type="submit">Rattacher</button>
          </form>
        </>
      )}
    </div>
  );
}
