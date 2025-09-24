import React, { useEffect, useState } from 'react';
import { api } from '../api';

export default function Documents({ token, roles }) {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [documents, setDocuments] = useState([]);
  const [newDoc, setNewDoc] = useState({ type: '', contenu: '' });

  useEffect(() => { fetchPatients(); }, []);

  async function fetchPatients() {
    try {
      const res = await api(token).get('/patients');
      setPatients(res.data);
      if(res.data.length > 0){
        setSelectedPatient(res.data[0].id);
        fetchDocuments(res.data[0].id);
      }
    } catch(err){ console.error(err); }
  }

  async function fetchDocuments(patientId){
    try{
      const res = await api(token).get(`/documents/${patientId}`);
      setDocuments(res.data);
    }catch(err){ console.error(err);}
  }

  async function addDocument(e){
    e.preventDefault();
    try{
      await api(token).post('/documents', {...newDoc, patient_id:selectedPatient});
      setNewDoc({type:'', contenu:''});
      fetchDocuments(selectedPatient);
    }catch(err){ console.error(err);}
  }

  return (
    <div>
      <h2>Documents</h2>
      <div>
        <label>Patient: </label>
        <select value={selectedPatient} onChange={e=>{setSelectedPatient(e.target.value); fetchDocuments(e.target.value);}}>
          {patients.map(p=><option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
        </select>
      </div>
      <ul>
        {documents.map(d=><li key={d.id}>{d.type} — {d.contenu} — {new Date(d.date_creation).toLocaleString()}</li>)}
      </ul>
      {(roles.includes('medecin') || roles.includes('secretaire')) &&
        <form onSubmit={addDocument}>
          <input placeholder="Type" value={newDoc.type} onChange={e=>setNewDoc({...newDoc, type:e.target.value})} required />
          <input placeholder="Contenu" value={newDoc.contenu} onChange={e=>setNewDoc({...newDoc, contenu:e.target.value})} required />
          <button type="submit">Ajouter document</button>
        </form>}
    </div>
  );
}
