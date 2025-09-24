import React, { useEffect, useState } from 'react';
import { api } from '../api';

export default function Analyses({ token, roles }) {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [analyses, setAnalyses] = useState([]);
  const [newAnalyse, setNewAnalyse] = useState({ contenu: '' });

  useEffect(() => { fetchPatients(); }, []);

  async function fetchPatients() {
    try {
      const res = await api(token).get('/patients');
      setPatients(res.data);
      if(res.data.length > 0){
        setSelectedPatient(res.data[0].id);
        fetchAnalyses(res.data[0].id);
      }
    } catch(err){ console.error(err); }
  }

  async function fetchAnalyses(patientId){
    try{
      const res = await api(token).get(`/resultats/${patientId}`);
      setAnalyses(res.data);
    }catch(err){ console.error(err);}
  }

  async function addAnalyse(e){
    e.preventDefault();
    try{
      await api(token).post('/resultats', {...newAnalyse, patient_id:selectedPatient});
      setNewAnalyse({contenu:''});
      fetchAnalyses(selectedPatient);
    }catch(err){ console.error(err);}
  }

  return (
    <div>
      <h2>Résultats d’analyses</h2>
      <div>
        <label>Patient: </label>
        <select value={selectedPatient} onChange={e=>{setSelectedPatient(e.target.value); fetchAnalyses(e.target.value);}}>
          {patients.map(p=><option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
        </select>
      </div>

      <ul>
        {analyses.map(a=><li key={a.id}>{a.contenu} — {new Date(a.date_reception).toLocaleString()}</li>)}
      </ul>

      {(roles.includes('medecin') || roles.includes('secretaire')) &&
        <form onSubmit={addAnalyse}>
          <input placeholder="Contenu" value={newAnalyse.contenu} onChange={e=>setNewAnalyse({...newAnalyse,contenu:e.target.value})} required />
          <button type="submit">Ajouter analyse</button>
        </form>}
    </div>
  );
}
