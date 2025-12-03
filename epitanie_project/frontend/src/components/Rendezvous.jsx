import React, { useEffect, useState } from 'react';
import { api } from '../api';

export default function Rendezvous({ token, roles }) {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [rendezvous, setRendezvous] = useState([]);
  const [newRDV, setNewRDV] = useState({ date_debut: '', date_fin: '', objet: '' });

  useEffect(() => { fetchPatients(); }, []);

  async function fetchPatients() {
    try {
      const res = await api(token).get('/patients');
      setPatients(res.data);
      if(res.data.length > 0){
        setSelectedPatient(res.data[0].id);
        fetchRendezvous(res.data[0].id);
      }
    } catch(err){ console.error(err); }
  }

  async function fetchRendezvous(patientId){
    try{
      const res = await api(token).get(`/rendezvous?patient_id=${patientId}`);
      setRendezvous(res.data);
    }catch(err){ console.error(err);}
  }

  async function addRendezvous(e){
    e.preventDefault();
    try{
      await api(token).post('/rendezvous', {...newRDV, patient_id:selectedPatient});
      setNewRDV({ date_debut:'', date_fin:'', objet:'' });
      fetchRendezvous(selectedPatient);
    }catch(err){ console.error(err);}
  }

  return (
    <div>
      <h2>Rendez-vous</h2>
      <div>
        <label>Patient : </label>
        <select value={selectedPatient} onChange={e=>{setSelectedPatient(e.target.value); fetchRendezvous(e.target.value);}}>
          {patients.map(p=><option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
        </select>
      </div>

      <ul>
        {rendezvous.length === 0 && <p>Aucun rendez-vous planifié.</p>}
        {rendezvous.map(r=>(
            <li key={r.id}>
                <strong>{r.objet}</strong> <br/>
                Du {new Date(r.date_debut).toLocaleString()} <br/>
                Au {new Date(r.date_fin).toLocaleString()}
            </li>
        ))}
      </ul>

      {(roles.includes('medecin') || roles.includes('secretaire')) &&
        <form onSubmit={addRendezvous} style={{display:'flex', flexDirection:'column', gap:5, maxWidth:300, marginTop:20}}>
          <label>Début:</label>
          <input type="datetime-local" value={newRDV.date_debut} onChange={e=>setNewRDV({...newRDV,date_debut:e.target.value})} required/>
          
          <label>Fin:</label>
          <input type="datetime-local" value={newRDV.date_fin} onChange={e=>setNewRDV({...newRDV,date_fin:e.target.value})} required/>
          
          <input placeholder="Objet du RDV" value={newRDV.objet} onChange={e=>setNewRDV({...newRDV,objet:e.target.value})} required/>
          <button type="submit">Ajouter rendez-vous</button>
        </form>}
    </div>
  );
}