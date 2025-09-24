import React, { useEffect, useState } from 'react';
import { api } from '../api';

export default function Patients({ token, roles }) {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchPatients(); }, []);

  async function fetchPatients() {
    try {
      const res = await api(token).get('/patients');
      setPatients(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  if (loading) return <p>Chargement des patients...</p>;

  return (
    <div>
      <h2>Mes patients</h2>
      {patients.length === 0 ? <p>Aucun patient accessible</p> :
        <ul>{patients.map(p => <li key={p.id}>{p.prenom} {p.nom} — IPP: {p.ipp}</li>)}</ul>}
    </div>
  );
}
