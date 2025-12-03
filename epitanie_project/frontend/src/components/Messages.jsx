import React, { useEffect, useState } from 'react';
import { api } from '../api';

export default function Messages({ token, roles }) {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');

  useEffect(() => { fetchUsers(); }, []);

  async function fetchUsers() {
    try {
      const res = await api(token).get('/users');
      setUsers(res.data);
      if(res.data.length > 0){
        setSelectedUser(res.data[0].id);
        fetchMessages(res.data[0].id);
      }
    } catch(err){ console.error(err); }
  }

  async function fetchMessages(userId){
    if(!userId) return;
    try{
      const res = await api(token).get(`/messages/${userId}`);
      setMessages(res.data);
    }catch(err){ console.error(err);}
  }

  async function sendMessage(e){
    e.preventDefault();
    try{
      await api(token).post('/messages', { destinataire_id:selectedUser, contenu:newMsg });
      setNewMsg('');
      fetchMessages(selectedUser);
    }catch(err){ console.error(err);}
  }

  return (
    <div>
      <h2>Messagerie interne</h2>
      <div>
        <label>Destinataire : </label>
        <select value={selectedUser} onChange={e=>{setSelectedUser(e.target.value); fetchMessages(e.target.value);}}>
          {users.map(u => (
            // Le backend renvoie maintenant un objet {id: 'pro-1', label: 'Alice (Médecin)'}
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
      </div>

      <ul style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #eee', padding: 10, marginTop: 10 }}>
        {messages.length === 0 && <i>Aucun message.</i>}
        {messages.map(m => (
          <div key={m.id} style={{ 
            textAlign: m.fromMe ? 'right' : 'left',
            margin: '5px 0' 
          }}>
            <span style={{ 
              background: m.fromMe ? '#dcf8c6' : '#f1f0f0', 
              padding: '5px 10px', 
              borderRadius: 10,
              display: 'inline-block'
            }}>
              <b>{m.fromMe ? "Moi" : "Lui"}:</b> {m.contenu}
            </span>
          </div>
        ))}
      </ul>

      <form onSubmit={sendMessage} style={{marginTop: 10}}>
        <input placeholder="Votre message..." value={newMsg} onChange={e=>setNewMsg(e.target.value)} required style={{width: '70%'}} />
        <button type="submit">Envoyer</button>
      </form>
    </div>
  );
}