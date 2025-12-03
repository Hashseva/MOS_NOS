import React, { useEffect, useState } from 'react';
import { api } from '../api';

export default function Documents({ token, roles }) {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [documents, setDocuments] = useState([]);
  
  // On utilise code_type_document au lieu de type libre
  const [newDoc, setNewDoc] = useState({ code_type_document: 'CR-CONS', contenu: '' });

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
      setNewDoc({ code_type_document:'CR-CONS', contenu:'' });
      fetchDocuments(selectedPatient);
    }catch(err){ console.error(err);}
  }

  return (
    <div>
      <h2>Documents</h2>
      <div>
        <label>Patient : </label>
        <select value={selectedPatient} onChange={e=>{setSelectedPatient(e.target.value); fetchDocuments(e.target.value);}}>
          {patients.map(p=><option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
        </select>
      </div>
      <ul style={{marginTop: 20}}>
        {documents.map(d=>(
          <li key={d.id} style={{marginBottom: 10}}>
             {/* Affichage du libellé traduit par le backend */}
             <strong>{d.type_libelle || d.code_type_document}</strong> 
             <br/>
             <small>Par {d.auteur_nom} le {new Date(d.date_creation).toLocaleString()}</small>
             <p style={{margin: '5px 0', fontStyle: 'italic'}}>"{d.contenu}"</p>
          </li>
        ))}
      </ul>
      
      {(roles.includes('medecin') || roles.includes('secretaire')) &&
        <form onSubmit={addDocument} style={{marginTop: 20, borderTop: '1px solid #ccc', paddingTop: 10}}>
          <h4>Ajouter un document</h4>
          
          {/* Choix du type via Code NOS */}
          <select value={newDoc.code_type_document} 
                  onChange={e=>setNewDoc({...newDoc, code_type_document:e.target.value})}>
            <option value="CR-CONS">Compte-Rendu Consultation</option>
            <option value="CR-IMG">Compte-Rendu Imagerie</option>
            <option value="ORD">Ordonnance</option>
          </select>

          <input placeholder="Contenu du document..." 
                 value={newDoc.contenu} 
                 onChange={e=>setNewDoc({...newDoc, contenu:e.target.value})} required 
                 style={{width: '300px', marginLeft: 10}}/>
          
          <button type="submit">Ajouter</button>
        </form>}
    </div>
  );
}