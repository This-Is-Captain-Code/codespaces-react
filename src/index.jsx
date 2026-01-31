import React from 'react';
import ReactDOM from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || '';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#667eea',
          logo: '/logo192.png',
        },
        loginMethods: ['twitter'],
        embeddedWallets: {
          createOnLogin: 'off',
        },
      }}
    >
      <App />
    </PrivyProvider>
  </React.StrictMode>
);

reportWebVitals();
