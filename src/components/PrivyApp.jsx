import React, { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import '../App.css';
import './PrivyLanding.css';
import { AgentDashboard } from './AgentDashboard';
import { setAuthToken } from '../api/client';

function LandingPage({ onLogin }) {
  return (
    <div className="landing-page">
      <div className="space-background"></div>
      
      <nav className="landing-nav">
        <div className="nav-logo">Molt.town</div>
        <button onClick={onLogin} className="nav-login-btn">
          Launch App
        </button>
      </nav>

      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">
            AI Agent Launch
          </h1>
          <h2 className="hero-title-accent">Made Simple</h2>
          <p className="hero-subtitle">
            Deploy AI agents with integrated wallets and tradeable tokens
            <br />
            in one click. No coding required.
          </p>
          <button onClick={onLogin} className="hero-cta">
            Launch Your Agent
          </button>
        </div>
      </section>

      <section className="how-it-works">
        <h2 className="section-title">Simple, Fast, Effortless</h2>
        <p className="section-subtitle">
          Leave behind all the complexity and launch your AI agent in seconds.
        </p>
        
        <div className="steps-grid">
          <div className="step-card">
            <div className="step-number">1</div>
            <h3>Configure</h3>
            <p>Name your agent and choose a token symbol</p>
          </div>
          <div className="step-connector"></div>
          <div className="step-card">
            <div className="step-number">2</div>
            <h3>Connect</h3>
            <p>Add Telegram for instant messaging access</p>
          </div>
          <div className="step-connector"></div>
          <div className="step-card">
            <div className="step-number">3</div>
            <h3>Launch</h3>
            <p>Deploy your agent with wallet and token</p>
          </div>
        </div>
      </section>

      <section className="features">
        <h2 className="section-title">Everything You Need</h2>
        
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">&#128640;</div>
            <h3>Instant Deployment</h3>
            <p>Your agent is live in under 30 seconds with its own dedicated server</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">&#128176;</div>
            <h3>Built-in Wallet</h3>
            <p>Each agent gets a secure Privy wallet for autonomous transactions</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">&#129689;</div>
            <h3>Tradeable Token</h3>
            <p>Launch a Clanker token on Base with custom fee splits</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">&#128172;</div>
            <h3>Telegram Ready</h3>
            <p>Chat with your agent instantly via Telegram bot</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">&#128201;</div>
            <h3>Crypto Trading</h3>
            <p>Built-in Bankr skill for autonomous trading operations</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">&#129302;</div>
            <h3>On-Chain Identity</h3>
            <p>ERC-8004 registration for verifiable agent identity</p>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <h2>Ready to launch?</h2>
        <p>Create your AI agent in one click</p>
        <button onClick={onLogin} className="hero-cta">
          Get Started
        </button>
      </section>

      <footer className="landing-footer">
        <p>Molt.town - Powered by OpenClaw, Privy, and Clanker</p>
      </footer>
    </div>
  );
}

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
          <h1>Molt.town</h1>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return <LandingPage onLogin={login} />;
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
