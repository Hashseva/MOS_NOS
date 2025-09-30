// populate_keycloak_fixed.js
const axios = require('axios');

const KEYCLOAK_URL = 'http://localhost:8080';
const REALM = 'epitanie';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin';
const CLIENT_ID = 'admin-cli';

// Données à injecter
const users = [
  { username: 'IDPP-MED01', firstName: 'Alice', lastName: 'Durand', role: 'medecin', password: 'test' },
  { username: 'IDPP-MED02', firstName: 'Paul', lastName: 'Martin', role: 'medecin', password: 'test' },
  { username: 'IDPP-INF01', firstName: 'Julie', lastName: 'Leclerc', role: 'infirmier', password: 'test' },
  { username: 'IDPP-SEC01', firstName: 'Centre', lastName: 'Secretariat', role: 'secretaire', password: 'test' },
  { username: 'IPP-0001', firstName: 'Jean', lastName: 'Petit', role: 'patient', password: 'test' },
  { username: 'IPP-0002', firstName: 'Marie', lastName: 'Bernard', role: 'patient', password: 'test' },
  { username: 'IPP-0003', firstName: 'Linh', lastName: 'Nguyen', role: 'patient', password: 'test' },
];

async function ensureRole(token, roleName) {
  try {
    await axios.get(`${KEYCLOAK_URL}/admin/realms/${REALM}/roles/${roleName}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch {
    await axios.post(`${KEYCLOAK_URL}/admin/realms/${REALM}/roles`,
      { name: roleName },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log(`Role ${roleName} created.`);
  }
}

// assign role to user (realm role mapping) - axios version
async function assignRealmRoleToUser(token, username, roleName) {
  // find user
  const userRes = await axios.get(
    `${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${encodeURIComponent(username)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!userRes.data.length) throw new Error(`user ${username} not found`);
  const userId = userRes.data[0].id;

  // find role
  const roleRes = await axios.get(
    `${KEYCLOAK_URL}/admin/realms/${REALM}/roles/${encodeURIComponent(roleName)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const roleObj = roleRes.data;

  // check if user already has it
  const userRolesRes = await axios.get(
    `${KEYCLOAK_URL}/admin/realms/${REALM}/users/${userId}/role-mappings/realm`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const hasRole = userRolesRes.data.some(r => r.name === roleName);
  if (hasRole) return;

  // assign
  await axios.post(
    `${KEYCLOAK_URL}/admin/realms/${REALM}/users/${userId}/role-mappings/realm`,
    [{ id: roleObj.id, name: roleObj.name }],
    { headers: { Authorization: `Bearer ${token}` } }
  );
}


async function main() {
  try {
    // 1️⃣ Obtenir un token admin
    const tokenRes = await axios.post(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'password',
        client_id: CLIENT_ID,
        username: ADMIN_USER,
        password: ADMIN_PASS
      })
    );
    const token = tokenRes.data.access_token;

    await ensureRole(token, 'medecin');
    await ensureRole(token, 'infirmier');
    await ensureRole(token, 'secretaire');
    await ensureRole(token, 'patient');


    for (const user of users) {
      try {
        // Vérifier si l'utilisateur existe déjà
        const existing = await axios.get(`${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${user.username}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (existing.data.length > 0) {
          console.log(`User ${user.username} already exists, skipping role assignment if needed.`);
        } else {
          // Créer l'utilisateur
          await axios.post(`${KEYCLOAK_URL}/admin/realms/${REALM}/users`, {
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            enabled: true,
            credentials: [{ type: 'password', value: user.password, temporary: false }]
          }, { headers: { Authorization: `Bearer ${token}` } });

          await assignRealmRoleToUser(token, user.username, user.role);

          console.log(`User ${user.username} created.`);
        }

        // Récupérer l’ID réel de l’utilisateur
        const getUserRes = await axios.get(`${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${user.username}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const userId = getUserRes.data[0].id;

        // Récupérer le rôle
        const roleRes = await axios.get(`${KEYCLOAK_URL}/admin/realms/${REALM}/roles/${user.role}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const roleObj = roleRes.data;

        // Vérifier si l’utilisateur a déjà ce rôle
        const userRolesRes = await axios.get(`${KEYCLOAK_URL}/admin/realms/${REALM}/users/${userId}/role-mappings/realm`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const alreadyHasRole = userRolesRes.data.some(r => r.name === user.role);
        if (!alreadyHasRole) {
          // Assigner le rôle
          await axios.post(`${KEYCLOAK_URL}/admin/realms/${REALM}/users/${userId}/role-mappings/realm`,
            [roleObj],
            { headers: { Authorization: `Bearer ${token}` } }
          );
          console.log(`Role ${user.role} assigned to ${user.username}`);
        } else {
          console.log(`User ${user.username} already has role ${user.role}`);
        }

      } catch (err) {
        console.error(`Error creating/assigning user ${user.username}:`, err.response?.data || err.message);
      }
    }

    console.log('✅ Keycloak population done!');
  } catch (err) {
    console.error('Error obtaining admin token:', err.response?.data || err.message);
  }
}

main();
