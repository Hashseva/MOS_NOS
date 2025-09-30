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
    pathologie:''
  });

  // Attach existing patient by IPP
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

  // create
  async function createPatient(e) {
    e.preventDefault();
    await api(token).post('/patients', newPatient);   // pathologie included
    setNewPatient({ ipp:'', nom:'', prenom:'', date_naissance:'', pathologie:'' });
    await fetchPatients();
  }

  // attach
  async function attachPatient(e) {
    e.preventDefault();
    await api(token).post('/patients/attach', { ipp: attachIPP, pathologie: attachPatho || null });
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
                  <div><b>{p.nom} {p.prenom}</b> — IPP: {p.ipp}</div>
                  <div>Naissance : {new Date(p.date_naissance).toLocaleDateString()}</div>
                  <div>
                    Pathologie{p.pathologie && p.pathologie.includes(',') ? 's' : ''} :{" "}
                    {p.pathologie ? p.pathologie : <i>—</i>}
                  </div>
                </li>
              ))}
            </ul> 
          )
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
            <input placeholder="Pathologie (optionnel)"
                   value={newPatient.pathologie}
                   onChange={e => setNewPatient({ ...newPatient, pathologie: e.target.value })} />
            <button type="submit">Créer le patient</button>
          </form>

          <h3>Rattacher un patient existant (par IPP)</h3>
          <form onSubmit={attachPatient} style={{ display: 'flex', gap: 8, maxWidth: 400 }}>
            <input placeholder="IPP du patient" value={attachIPP}
                   onChange={e => setAttachIPP(e.target.value)} required />
            <input placeholder="Pathologie (optionnel)"
                   value={attachPatho} onChange={e => setAttachPatho(e.target.value)} />
            <button type="submit">Rattacher</button>
          </form>
        </>
      )}
    </div>
  );
}
