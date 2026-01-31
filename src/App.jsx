import React, { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import './App.css';
import { BotDashboard } from './components/BotDashboard';

function App() {
  const { login, logout, authenticated, ready, user } = usePrivy();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ready) {
      setLoading(false);
    }
  }, [ready]);

  if (loading || !ready) {
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
              Create your own AI bot that persists over time. 
              Sign in with X to get started.
            </p>
            <button onClick={login} className="login-button">
              Sign in with X
            </button>
          </div>
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
            {user?.twitter && (
              <span className="username">@{user.twitter.username}</span>
            )}
            <button onClick={logout} className="logout-button">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        <BotDashboard userId={user?.id} />
      </main>

      <footer className="app-footer">
        <p>MoltRack v0 - Powered by OpenClaw & OpenRouter</p>
      </footer>
    </div>
  );
}

export default App;
