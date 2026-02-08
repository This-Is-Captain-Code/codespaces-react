import React, { useState, useEffect } from 'react';
import './App.css';
import { BotDashboard } from './components/BotDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { setAuthToken } from './api/client';

const PRIVY_ENABLED = !!import.meta.env.VITE_PRIVY_APP_ID;
const isAdminRoute = window.location.pathname === '/admin';
const isTestRoute = window.location.pathname === '/test';

function FallbackAuthApp() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');

  useEffect(() => {
    const savedUser = localStorage.getItem('moltrack_user');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      setUser(parsed);
      setAuthToken(`user:${parsed.id}`);
    }
    setLoading(false);
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (!username.trim()) return;
    
    const crypto = window.crypto || window.msCrypto;
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    const uniqueId = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    
    const newUser = {
      id: uniqueId,
      username: username.trim(),
    };
    localStorage.setItem('moltrack_user', JSON.stringify(newUser));
    setAuthToken(`user:${uniqueId}`);
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
              Create your own AI bot that persists over time. Enter a username to get started.
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

function App() {
  if (isTestRoute) {
    const TestConsole = React.lazy(() => import('./components/TestConsole'));
    return (
      <React.Suspense fallback={
        <div className="App loading-screen">
          <div className="loading-content">
            <h1>Test Console</h1>
            <p>Loading...</p>
          </div>
        </div>
      }>
        <TestConsole />
      </React.Suspense>
    );
  }

  if (isAdminRoute) {
    return <AdminDashboard />;
  }
  
  if (PRIVY_ENABLED) {
    const PrivyApp = React.lazy(() => import('./components/PrivyApp'));
    return (
      <React.Suspense fallback={
        <div className="App loading-screen">
          <div className="loading-content">
            <h1>MoltRack v0</h1>
            <p>Loading...</p>
          </div>
        </div>
      }>
        <PrivyApp />
      </React.Suspense>
    );
  }
  return <FallbackAuthApp />;
}

export default App;
