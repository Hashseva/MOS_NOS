import React, { useEffect, useState } from 'react';
import Keycloak from 'keycloak-js';
import Patients from './components/Patients';
import Documents from './components/Documents';
import Rendezvous from './components/Rendezvous';
import Analyses from './components/Analyses';
import Messages from './components/Messages';

const keycloak = new Keycloak({
  url: 'http://localhost:8080',
  realm: 'epitanie',
  clientId: 'epitanie-frontend'
});

export default function App() {
  const [kc, setKc] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState('patients');

  useEffect(() => {
    let refreshTimer;

    keycloak
      .init({
        onLoad: 'login-required',
        checkLoginIframe: false,
        pkceMethod: 'S256',                 // ← ajout 1 : PKCE (recommandé)
      })
      .then((auth) => {
        setKc(keycloak);
        setAuthenticated(auth);
        setLoading(false);

        if (!auth) {
          keycloak.login({                   // ← ajout 2 : force la redirection
            redirectUri: window.location.href,
          });
          return;
        }

        // (optionnel) refresh token pour rester connecté
        refreshTimer = setInterval(() => {
          keycloak.updateToken(60).catch(() => keycloak.login());
        }, 30000);
      })
      .catch((err) => {
        console.error('Erreur Keycloak init', err);
        setLoading(false);
      });

    return () => {
      if (refreshTimer) clearInterval(refreshTimer);
    };
  }, []);

  if (loading) return <div>Initialisation Keycloak...</div>;
  if (!authenticated) return <div>Redirection vers la page de connexion…</div>;

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
      <nav style={{ width: 220, background: '#f0f0f0', padding: 16 }}>
        <h3>Epitanie Dashboard</h3>
        <p>{kc.tokenParsed?.preferred_username}</p>
        <p>Rôles: {kc.tokenParsed?.realm_access?.roles.join(', ')}</p>
        <button onClick={() => kc.logout({ redirectUri: window.location.origin })}>Logout</button>
        <hr />
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li><button onClick={() => setSection('patients')}>Patients</button></li>
          <li><button onClick={() => setSection('documents')}>Documents</button></li>
          <li><button onClick={() => setSection('rendezvous')}>Rendez-vous</button></li>
          <li><button onClick={() => setSection('analyses')}>Résultats d’analyses</button></li>
          <li><button onClick={() => setSection('messages')}>Messagerie</button></li>
        </ul>
      </nav>

      <main style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        {section === 'patients' && <Patients token={kc.token} roles={kc.tokenParsed?.realm_access?.roles} />}
        {section === 'documents' && <Documents token={kc.token} roles={kc.tokenParsed?.realm_access?.roles} />}
        {section === 'rendezvous' && <Rendezvous token={kc.token} roles={kc.tokenParsed?.realm_access?.roles} />}
        {section === 'analyses' && <Analyses token={kc.token} roles={kc.tokenParsed?.realm_access?.roles} />}
        {section === 'messages' && <Messages token={kc.token} roles={kc.tokenParsed?.realm_access?.roles} />}
      </main>
    </div>
  );
}
