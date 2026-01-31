import React, { useState, useEffect } from 'react';
import './App.css';
import { BotDashboard } from './components/BotDashboard';
import { setAuthToken } from './api/client';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');

  useEffect(() => {
    const savedUser = localStorage.getItem('moltrack_user');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      setUser(parsed);
      setAuthToken(`did:privy:${parsed.id}`);
    }
    setLoading(false);
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (!username.trim()) return;
    
    const userId = username.toLowerCase().replace(/[^a-z0-9]/g, '');
    const newUser = {
      id: userId,
      username: username.trim(),
    };
    localStorage.setItem('moltrack_user', JSON.stringify(newUser));
    setAuthToken(`did:privy:${userId}`);
    setUser(newUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('moltrack_user');
    setAuthToken('');
    setUser(null);
  };

  if (loading) {
    return (
      <div className="App loading-screen">
        <div className="loading-content">
          <h1>MoltRack v0</h1>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="App">
        <div className="auth-landing">
          <div className="auth-card">
            <h1>MoltRack v0</h1>
            <p className="tagline">Persistent OpenClaw Agent Runtime</p>
            <p className="description">
              Create your own AI bot that persists over time.
              Enter a username to get started.
            </p>
            <form onSubmit={handleLogin} className="login-form">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="username-input"
              />
              <button type="submit" className="login-button">
                Get Started
              </button>
            </form>
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
            <span className="username">@{user.username}</span>
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

export default App;
