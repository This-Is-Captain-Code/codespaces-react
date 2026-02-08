import WebSocket from 'ws';
import { createPublicClient, createWalletClient, http, formatGwei } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia, arbitrum, arbitrumSepolia, mainnet, sepolia } from 'viem/chains';
import {
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createEIP712AuthMessageSigner,
  createAuthVerifyMessageWithJWT,
  createAppSessionMessage,
  createCloseAppSessionMessage,
  createGetConfigMessage,
  createGetLedgerBalancesMessage,
  createGetChannelsMessage,
  createCreateChannelMessage,
  createGetAssetsMessage,
  createPingMessage,
  parseAnyRPCResponse,
  parseCreateChannelResponse,
  parseGetChannelsResponse,
  parseGetAssetsResponse,
  RPCMethod,
  createECDSAMessageSigner,
  NitroliteClient,
  CustodyAbi,
} from '@erc7824/nitrolite';

const USE_TESTNET = process.env.USE_TESTNET === 'true';
const ADMIN_WALLET_PRIVATE_KEY = process.env.ADMIN_WALLET_PRIVATE_KEY;

const WS_ENDPOINTS = {
  mainnet: 'wss://clearnet.yellow.com/ws',
  sandbox: 'wss://clearnet-sandbox.yellow.com/ws',
};

const RECONNECT_CONFIG = {
  maxAttempts: 0,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

const PING_INTERVAL_MS = 30000;
const AUTH_TIMEOUT_MS = 15000;
const REQUEST_TIMEOUT_MS = 10000;

class ClearNodeClient {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.isAuthenticated = false;
    this.reconnectAttempts = 0;
    this.jwtToken = null;
    this.pingInterval = null;
    this.pendingRequests = new Map();
    this.messageHandlers = new Map();
    this.eventListeners = {};
    this.account = null;
    this.walletClient = null;
    this.publicClients = {};
    this.sessionId = null;
    this.connectionPromise = null;
    this.authPromise = null;
    this._intentionalClose = false;
  }

  _getEndpoint() {
    return USE_TESTNET ? WS_ENDPOINTS.sandbox : WS_ENDPOINTS.mainnet;
  }

  _initWallet() {
    if (!ADMIN_WALLET_PRIVATE_KEY) {
      throw new Error('ADMIN_WALLET_PRIVATE_KEY not configured - cannot authenticate with ClearNode');
    }

    this.account = privateKeyToAccount(ADMIN_WALLET_PRIVATE_KEY);
    const chain = USE_TESTNET ? baseSepolia : base;
    this.walletClient = createWalletClient({
      account: this.account,
      chain,
      transport: http(),
    });

    const chains = USE_TESTNET
      ? { base: baseSepolia, arbitrum: arbitrumSepolia, ethereum: sepolia }
      : { base, arbitrum, ethereum: mainnet };

    for (const [name, chain] of Object.entries(chains)) {
      this.publicClients[name] = createPublicClient({ chain, transport: http() });
    }

    console.log(`[ClearNode] Wallet initialized: ${this.account.address}`);
  }

  async connect() {
    if (this.isConnected && this.isAuthenticated) {
      console.log('[ClearNode] Already connected and authenticated');
      return { connected: true, authenticated: true };
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this._doConnect();
    try {
      const result = await this.connectionPromise;
      return result;
    } finally {
      this.connectionPromise = null;
    }
  }

  async _doConnect() {
    this._initWallet();
    const endpoint = this._getEndpoint();
    console.log(`[ClearNode] Connecting to ${endpoint} (${USE_TESTNET ? 'sandbox' : 'mainnet'})...`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, AUTH_TIMEOUT_MS);

      try {
        this.ws = new WebSocket(endpoint);
      } catch (err) {
        clearTimeout(timeout);
        reject(new Error(`WebSocket creation failed: ${err.message}`));
        return;
      }

      this.ws.on('open', async () => {
        console.log('[ClearNode] WebSocket connection established');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this._emit('connected');

        try {
          await this._authenticate();
          clearTimeout(timeout);
          this._startPing();
          resolve({ connected: true, authenticated: this.isAuthenticated });
        } catch (authErr) {
          clearTimeout(timeout);
          console.error('[ClearNode] Authentication failed:', authErr.message);
          resolve({ connected: true, authenticated: false, error: authErr.message });
        }
      });

      this.ws.on('message', (data) => {
        const dataStr = data.toString();
        console.log(`[ClearNode] Raw message received (${dataStr.length} bytes):`, dataStr.substring(0, 200));
        this._handleMessage(dataStr);
      });

      this.ws.on('error', (error) => {
        console.error('[ClearNode] WebSocket error:', error.message);
        this._emit('error', error);
      });

      this.ws.on('close', (code, reason) => {
        const reasonStr = reason ? reason.toString() : '';
        console.log(`[ClearNode] WebSocket closed: ${code} ${reasonStr}`);
        this.isConnected = false;
        this.isAuthenticated = false;
        this._stopPing();
        this._emit('disconnected', { code, reason: reasonStr });

        if (!this._intentionalClose) {
          this._attemptReconnect();
        }
      });
    });
  }

  async _authenticate() {
    if (this.jwtToken) {
      console.log('[ClearNode] Attempting JWT reconnection...');
      try {
        const jwtMsg = await createAuthVerifyMessageWithJWT(this.jwtToken);
        this._send(jwtMsg);

        const response = await this._waitForMethod(RPCMethod.AuthVerify, AUTH_TIMEOUT_MS);
        if (response && response.params && response.params.success) {
          this.isAuthenticated = true;
          console.log('[ClearNode] JWT reconnection successful');
          this._emit('authenticated', { method: 'jwt' });
          return;
        }
        console.log('[ClearNode] JWT reconnection failed, falling back to EIP-712');
        this.jwtToken = null;
      } catch (err) {
        console.log('[ClearNode] JWT auth error, falling back to EIP-712:', err.message);
        this.jwtToken = null;
      }
    }

    console.log('[ClearNode] Starting EIP-712 authentication...');

    const expiresAt = Date.now() + 3600000;

    const errorPromise = new Promise((resolve) => {
      const errorHandler = (msg) => {
        if (msg.params?.error) {
          resolve({ error: msg.params.error });
        }
      };
      if (!this.messageHandlers.has('error')) {
        this.messageHandlers.set('error', []);
      }
      this.messageHandlers.get('error').push(errorHandler);
      setTimeout(() => {
        const handlers = this.messageHandlers.get('error');
        if (handlers) {
          const idx = handlers.indexOf(errorHandler);
          if (idx !== -1) handlers.splice(idx, 1);
        }
        resolve(null);
      }, AUTH_TIMEOUT_MS);
    });

    const authRequest = await createAuthRequestMessage({
      address: this.account.address,
      session_key: this.account.address,
      application: 'molt.town',
      expires_at: expiresAt,
      scope: 'console',
      allowances: [],
    });

    this._send(authRequest);

    const challengePromise = this._waitForMethod(RPCMethod.AuthChallenge, AUTH_TIMEOUT_MS);
    const result = await Promise.race([challengePromise, errorPromise]);

    if (result && result.error) {
      const errMsg = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
      if (errMsg.includes('parse auth') || errMsg.includes('channel') || errMsg.includes('not found')) {
        throw new Error(`ClearNode auth error: ${errMsg}. Create a channel at apps.yellow.com first.`);
      }
      throw new Error(`ClearNode auth error: ${errMsg}`);
    }

    if (!result) {
      throw new Error('No auth challenge received from ClearNode (timeout). Create a channel at apps.yellow.com first.');
    }

    console.log('[ClearNode] Received auth challenge, signing...');
    console.log(`[ClearNode] walletClient.account: ${this.walletClient?.account?.address || 'MISSING'}`);

    const eip712Signer = createEIP712AuthMessageSigner(
      this.walletClient,
      {
        scope: 'console',
        application: 'molt.town',
        session_key: this.account.address,
        expires_at: expiresAt,
        allowances: [],
      },
      { name: 'molt.town' }
    );

    const authVerifyMsg = await createAuthVerifyMessage(eip712Signer, result);
    this._send(authVerifyMsg);

    const verifyResponse = await this._waitForMethod(RPCMethod.AuthVerify, AUTH_TIMEOUT_MS);

    if (verifyResponse && verifyResponse.params) {
      if (verifyResponse.params.success) {
        this.isAuthenticated = true;
        if (verifyResponse.params.jwtToken) {
          this.jwtToken = verifyResponse.params.jwtToken;
        }
        console.log('[ClearNode] EIP-712 authentication successful');
        this._emit('authenticated', { method: 'eip712' });
      } else {
        throw new Error('Authentication rejected by ClearNode');
      }
    } else {
      throw new Error('Invalid auth verify response');
    }
  }

  _handleMessage(data) {
    let method = null;
    let params = {};
    let requestId = null;
    let parsed = null;

    try {
      const raw = JSON.parse(data);

      if (raw.res) {
        requestId = raw.res[0];
        method = raw.res[1];
        params = raw.res[2]?.[0] || raw.res[2] || {};
      } else if (raw.err) {
        requestId = raw.err[0];
        method = raw.err[1];
        params = { error: raw.err[2] || 'Unknown error' };
      }

      try {
        parsed = parseAnyRPCResponse(data);
        if (parsed.method) method = parsed.method;
        if (parsed.params) params = parsed.params;
        if (parsed.requestId) requestId = parsed.requestId;
      } catch (parseErr) {
        // raw parsing was sufficient
      }

      console.log(`[ClearNode] Parsed message: method=${method}, requestId=${requestId}`);

      if (requestId && this.pendingRequests.has(requestId)) {
        const { resolve } = this.pendingRequests.get(requestId);
        this.pendingRequests.delete(requestId);
        resolve(parsed || { method, params, raw });
      }

      if (method) {
        const msg = parsed || { method, params, raw };
        this._emit('message', { method, data: msg });

        if (this.messageHandlers.has(method)) {
          for (const handler of this.messageHandlers.get(method)) {
            handler(msg);
          }
        }

        for (const [key, handlers] of this.messageHandlers) {
          if (key !== method && method && method.toLowerCase().includes(key.toLowerCase())) {
            for (const handler of handlers) {
              handler(msg);
            }
          }
        }
      }
    } catch (err) {
      console.error('[ClearNode] Failed to parse message:', err.message, 'raw:', data.substring(0, 100));
    }
  }

  _waitForMethod(method, timeoutMs = REQUEST_TIMEOUT_MS) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve(null);
      }, timeoutMs);

      const handler = (msg) => {
        clearTimeout(timeout);
        cleanup();
        resolve(msg);
      };

      const cleanup = () => {
        if (!this.messageHandlers.has(method)) return;
        const handlers = this.messageHandlers.get(method);
        const idx = handlers.indexOf(handler);
        if (idx !== -1) handlers.splice(idx, 1);
        if (handlers.length === 0) this.messageHandlers.delete(method);
        if (!this.messageHandlers.has('__any__')) return;
        const anyHandlers = this.messageHandlers.get('__any__');
        const anyIdx = anyHandlers.indexOf(anyHandler);
        if (anyIdx !== -1) anyHandlers.splice(anyIdx, 1);
        if (anyHandlers.length === 0) this.messageHandlers.delete('__any__');
      };

      const anyHandler = (msg) => {
        const msgMethod = msg.method || '';
        if (typeof msgMethod === 'string' && typeof method === 'string') {
          if (msgMethod === method || msgMethod.includes('auth_challenge') && method.includes('auth_challenge') ||
              msgMethod.includes('auth_verify') && method.includes('auth_verify')) {
            clearTimeout(timeout);
            cleanup();
            resolve(msg);
          }
        }
      };

      if (!this.messageHandlers.has(method)) {
        this.messageHandlers.set(method, []);
      }
      this.messageHandlers.get(method).push(handler);

      if (!this.messageHandlers.has('__any__')) {
        this.messageHandlers.set('__any__', []);
      }
      this.messageHandlers.get('__any__').push(anyHandler);
    });
  }

  _send(message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    this.ws.send(payload);
  }

  async sendRequest(message, timeoutMs = REQUEST_TIMEOUT_MS) {
    if (!this.isConnected) {
      throw new Error('Not connected to ClearNode');
    }

    const parsed = typeof message === 'string' ? JSON.parse(message) : message;
    const requestId = parsed.req?.[0] || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
      });

      try {
        this._send(message);
      } catch (err) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(err);
      }
    });
  }

  _startPing() {
    this._stopPing();
    this.pingInterval = setInterval(async () => {
      if (!this.isConnected) return;
      try {
        const pingMsg = await createPingMessage();
        this._send(pingMsg);
      } catch (err) {
        console.error('[ClearNode] Ping failed:', err.message);
      }
    }, PING_INTERVAL_MS);
  }

  _stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  _attemptReconnect() {
    if (this.reconnectAttempts >= RECONNECT_CONFIG.maxAttempts) {
      console.error('[ClearNode] Max reconnection attempts reached');
      this._emit('reconnect_failed');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      RECONNECT_CONFIG.initialDelayMs * Math.pow(RECONNECT_CONFIG.backoffMultiplier, this.reconnectAttempts - 1),
      RECONNECT_CONFIG.maxDelayMs
    );

    console.log(`[ClearNode] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${RECONNECT_CONFIG.maxAttempts})`);

    setTimeout(async () => {
      try {
        await this.connect();
        console.log('[ClearNode] Reconnected successfully');
        this._emit('reconnected');
      } catch (err) {
        console.error('[ClearNode] Reconnection failed:', err.message);
      }
    }, delay);
  }

  disconnect() {
    this._intentionalClose = true;
    this._stopPing();

    for (const [id, { resolve }] of this.pendingRequests) {
      resolve({ error: 'disconnected' });
    }
    this.pendingRequests.clear();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.isConnected = false;
    this.isAuthenticated = false;
    this._intentionalClose = false;
    console.log('[ClearNode] Disconnected');
  }

  async getGasPrice(chainName = 'base') {
    const client = this.publicClients[chainName];
    if (!client) {
      return { gasPrice: null, chain: chainName, error: 'No public client for chain' };
    }

    try {
      const gasPrice = await client.getGasPrice();
      return {
        gasPrice: gasPrice.toString(),
        gasPriceGwei: formatGwei(gasPrice),
        chain: chainName,
      };
    } catch (err) {
      return { gasPrice: null, chain: chainName, error: err.message };
    }
  }

  async getGasPrices() {
    const results = {};
    for (const chainName of Object.keys(this.publicClients)) {
      results[chainName] = await this.getGasPrice(chainName);
    }
    return results;
  }

  async createChannel(chainId, tokenAddress) {
    if (!this.isConnected) {
      throw new Error('Not connected to ClearNode');
    }
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated with ClearNode. Authentication must succeed before channel creation.');
    }

    console.log(`[ClearNode] Creating channel on chain ${chainId} with token ${tokenAddress}...`);

    const signer = createECDSAMessageSigner(this.walletClient, this.account.address);

    const createMsg = await createCreateChannelMessage(signer, {
      chain_id: chainId,
      token: tokenAddress,
    });

    this._send(createMsg);

    const response = await this._waitForMethod('create_channel', 30000);

    if (!response) {
      throw new Error('Channel creation timed out');
    }

    if (response.params?.error) {
      throw new Error(`Channel creation failed: ${JSON.stringify(response.params.error)}`);
    }

    console.log('[ClearNode] Channel creation response received');

    let channelData;
    try {
      channelData = parseCreateChannelResponse(
        typeof response === 'string' ? response : JSON.stringify(response.raw || response)
      );
    } catch (e) {
      channelData = response.params || response;
    }

    console.log('[ClearNode] Channel data:', JSON.stringify(channelData, null, 2));

    return channelData;
  }

  async getChannels() {
    if (!this.isConnected || !this.isAuthenticated) {
      return [];
    }

    const signer = createECDSAMessageSigner(this.walletClient, this.account.address);
    const msg = await createGetChannelsMessage(signer);
    this._send(msg);

    const response = await this._waitForMethod('get_channels', 10000);
    if (!response) return [];

    try {
      return parseGetChannelsResponse(
        typeof response === 'string' ? response : JSON.stringify(response.raw || response)
      );
    } catch (e) {
      return response.params?.channels || response.params || [];
    }
  }

  async getAssets() {
    if (!this.isConnected) return [];

    try {
      const msg = await createGetAssetsMessage();
      this._send(msg);
      const response = await this._waitForMethod('assets', 10000);
      if (!response) return [];
      return response.params?.assets || response.params || [];
    } catch (e) {
      return [];
    }
  }

  getStatus() {
    return {
      connected: this.isConnected,
      authenticated: this.isAuthenticated,
      endpoint: this._getEndpoint(),
      testnet: USE_TESTNET,
      address: this.account?.address || null,
      hasJwt: !!this.jwtToken,
      reconnectAttempts: this.reconnectAttempts,
      pendingRequests: this.pendingRequests.size,
    };
  }

  on(event, callback) {
    if (!this.eventListeners[event]) this.eventListeners[event] = [];
    this.eventListeners[event].push(callback);
    return this;
  }

  _emit(event, ...args) {
    if (!this.eventListeners[event]) return;
    for (const cb of this.eventListeners[event]) {
      try { cb(...args); } catch (err) {
        console.error(`[ClearNode] Event handler error (${event}):`, err.message);
      }
    }
  }
}

export const clearNodeClient = new ClearNodeClient();
