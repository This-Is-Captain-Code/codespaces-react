import React, { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import '../App.css';
import { BotDashboard } from './BotDashboard';
import { setAuthToken } from '../api/client';

function PrivyApp() {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const [tokenReady, setTokenReady] = useState(false);

  useEffect(() => {
    const setToken = async () => {
      if (authenticated && user) {
        try {
          const accessToken = await getAccessToken();
          setAuthToken(accessToken);
        } catch (err) {
          console.error('Failed to get access token:', err);
          setAuthToken(user.id);
        }
        setTokenReady(true);
      } else {
        setTokenReady(false);
      }
    };
    setToken();
  }, [authenticated, user, getAccessToken]);

  const handleLogout = async () => {
    await logout();
    setAuthToken('');
    setTokenReady(false);
  };

  const getUserDisplay = () => {
    if (user?.twitter) return `@${user.twitter.username}`;
    if (user?.email) return user.email.address;
    if (user?.google) return user.google.email;
    return user?.id?.substring(0, 12) + '...';
  };

  if (!ready) {
    return (
      <div className="App loading-screen">
        <div className="loading-content">
          <h1>MoltRack v0</h1>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="App">
        <div className="auth-landing">
          <div className="auth-card">
            <h1>MoltRack v0</h1>
            <p className="tagline">Persistent OpenClaw Agent Runtime</p>
            <p className="description">
              Create your own AI bot that persists over time. Sign in to get started.
            </p>
            <button onClick={login} className="login-button privy-login">
              Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!tokenReady) {
    return (
      <div className="App loading-screen">
        <div className="loading-content">
          <h1>MoltRack v0</h1>
          <p>Authenticating...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="app-header">
        <div className="header-content">
          <h1>MoltRack v0</h1>
          <div className="user-info">
            <span className="username">{getUserDisplay()}</span>
            <button onClick={handleLogout} className="logout-button">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        <BotDashboard userId={user.id} />
      </main>

      <footer className="app-footer">
        <p>MoltRack v0 - Powered by OpenClaw & OpenRouter</p>
      </footer>
    </div>
  );
}

export default PrivyApp;
