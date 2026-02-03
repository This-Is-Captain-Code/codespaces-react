import React, { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import '../App.css';
import { AgentDashboard } from './AgentDashboard';
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

  const getUserWalletAddress = () => {
    const wallet = user?.linkedAccounts?.find(
      (account) => account.type === 'wallet' && account.walletClientType === 'privy'
    );
    return wallet?.address || null;
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
            <h1>Molt.town</h1>
            <p className="tagline">Launch AI Agents with Tokens</p>
            <p className="description">
              Create an AI agent with its own wallet and tradeable token in one click.
            </p>
            <button onClick={login} className="login-button privy-login">
              Login with X
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
          <h1>Molt.town</h1>
          <p>Authenticating...</p>
        </div>
      </div>
    );
  }

  return (
    <AgentDashboard 
      userWalletAddress={getUserWalletAddress()}
      onLogout={handleLogout}
    />
  );
}

export default PrivyApp;
