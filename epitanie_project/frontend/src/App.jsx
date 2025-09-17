import React, { useEffect, useState } from 'react'
import Keycloak from 'keycloak-js'

const keycloak = new Keycloak({
  url: 'http://localhost:8080',
  realm: 'epitanie',
  clientId: 'epitanie-app'
});

export default function App() {
  const [kc, setKc] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [patients, setPatients] = useState([]);

  useEffect(() => {
    keycloak.init({ onLoad: 'login-required' }).then(authenticated => {
      setKc(keycloak);
      setAuthenticated(authenticated);
      if (authenticated) fetchPatients(keycloak.token);
    });
  }, []);

  async function fetchPatients(token) {
    const res = await fetch('http://localhost:4000/api/patients', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json();
    setPatients(data);
  }

  if (!kc) return <div>Initialisation Keycloak...</div>;
  if (!authenticated) return <div>Non authentifié</div>;

  return (
    <div style={{ padding: 24 }}>
      <h1>Plateforme Epitanie — Interface minimale</h1>
      <p>Utilisateur: {kc.tokenParsed && kc.tokenParsed.preferred_username} — Rôles: {(kc.tokenParsed && kc.tokenParsed.realm_access && kc.tokenParsed.realm_access.roles) ? kc.tokenParsed.realm_access.roles.join(', ') : ''}</p>
      <button onClick={() => { kc.logout(); }}>Logout</button>

      <h2>Mes patients</h2>
      {patients.length === 0 ? <p>Aucun patient accessible</p> : (
        <ul>
          {patients.map(p => (
            <li key={p.id}>{p.prenom} {p.nom} — IPP: {p.ipp}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
