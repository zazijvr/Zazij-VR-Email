import "../mock_tauri.js";
import React from 'react'
import ReactDOM from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './App.jsx'
import { AlertProvider } from './components/AlertProvider.jsx'
import '@fontsource-variable/inter';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import '@fontsource/rajdhani/latin-ext-600.css';
import '@fontsource/rajdhani/latin-ext-700.css';
import './index.css'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <AlertProvider>
        <App />
      </AlertProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>,
)
