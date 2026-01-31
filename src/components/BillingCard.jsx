import React from 'react';
import { billingAPI } from '../api/client';
import './BillingCard.css';

export function BillingCard() {
  const [balance, setBalance] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    loadBalance();
  }, []);

  const loadBalance = async () => {
    try {
      const response = await billingAPI.getBalance();
      setBalance(response.data.balance);
    } catch (error) {
      console.error('Failed to load balance:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCredits = async (amount) => {
    try {
      const response = await billingAPI.addCredits(amount);
      setBalance(response.data.balance);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to add credits');
    }
  };

  return (
    <div className="billing-card">
      <h3>Credits</h3>
      <div className="balance">
        <div className="balance-value">
          {loading ? 'Loading...' : `$${(balance / 100).toFixed(2)}`}
        </div>
        <small>Available Balance</small>
      </div>

      <div className="credit-packages">
        <button
          onClick={() => handleAddCredits(500)}
          className="credit-btn"
        >
          +$5
        </button>
        <button
          onClick={() => handleAddCredits(2000)}
          className="credit-btn"
        >
          +$20
        </button>
        <button
          onClick={() => handleAddCredits(5000)}
          className="credit-btn"
        >
          +$50
        </button>
      </div>

      <p className="pricing-info">
        Pricing starts at <strong>$0.05</strong> per 1M input tokens
      </p>
    </div>
  );
}
