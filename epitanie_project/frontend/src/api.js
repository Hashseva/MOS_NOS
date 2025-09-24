import axios from 'axios';

export const api = (token) => axios.create({
  baseURL: 'http://localhost:4000/api',
  headers: { Authorization: `Bearer ${token}` }
});
