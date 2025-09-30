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
        <label>Destinataire: </label>
        <select value={selectedUser} onChange={e=>{setSelectedUser(e.target.value); fetchMessages(e.target.value);}}>
          {users.map(u=><option key={u.id} value={u.id}>{u.nom} {u.prenom}</option>)}
        </select>
      </div>

      <ul>
        {messages.map(m => (
          <div key={m.id}>
            <b>{m.fromMe ? "Moi" : "Lui"}:</b> {m.contenu}
          </div>
        ))}
      </ul>

      <form onSubmit={sendMessage}>
        <input placeholder="Votre message" value={newMsg} onChange={e=>setNewMsg(e.target.value)} required />
        <button type="submit">Envoyer</button>
      </form>
    </div>
  );
}
