import axios from 'axios';

// Base Axios instance pointing to the FastAPI Core Engine
// In production, this URL would be injected via process.env.VITE_API_URL
export const apiClient = axios.create({
  baseURL: 'http://localhost:8081/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to attach auth headers
apiClient.interceptors.request.use((config) => {
  // Utilizing the Coexistence Strategy defined in backend auth.py
  config.headers['X-User-Id'] = 'designer_admin';
  config.headers['X-User-Role'] = 'admin';
  return config;
});