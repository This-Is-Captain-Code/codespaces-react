import WebSocket from 'ws';
import { gatewayService } from './gatewayService.js';

const activeConnections = new Map();

export const autoApprovalService = {
  startAutoApproval: async (gatewayId) => {
    if (activeConnections.has(gatewayId)) {
      console.log(`Auto-approval already active for gateway ${gatewayId}`);
      return;
    }

    const gateway = await gatewayService.getGateway(gatewayId);
    if (!gateway) {
      throw new Error(`Gateway ${gatewayId} not found`);
    }

    const wsUrl = gateway.endpoint.replace('https://', 'wss://') + `/?token=${gateway.gateway_token}`;
    console.log(`Starting auto-approval for gateway ${gatewayId}`);

    let messageId = 1;

    const connect = () => {
      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        console.log(`Auto-approval connected to gateway ${gatewayId}`);
        activeConnections.set(gatewayId, ws);
      });

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.method === 'node.pair.requested' || message.event === 'node.pair.requested') {
            const requestId = message.params?.requestId || message.data?.requestId || message.requestId;
            
            if (requestId) {
              console.log(`Auto-approving pairing request ${requestId} on gateway ${gatewayId}`);
              
              ws.send(JSON.stringify({
                jsonrpc: '2.0',
                id: messageId++,
                method: 'node.pair.approve',
                params: { requestId },
              }));
            }
          }

          if (message.result?.pending) {
            for (const req of message.result.pending) {
              console.log(`Auto-approving pending request ${req.id} on gateway ${gatewayId}`);
              ws.send(JSON.stringify({
                jsonrpc: '2.0',
                id: messageId++,
                method: 'node.pair.approve',
                params: { requestId: req.id },
              }));
            }
          }
        } catch (err) {
          console.error('Error processing WebSocket message:', err);
        }
      });

      ws.on('error', (err) => {
        console.error(`WebSocket error for gateway ${gatewayId}:`, err.message);
      });

      ws.on('close', (code, reason) => {
        console.log(`WebSocket closed for gateway ${gatewayId}: ${code} ${reason}`);
        activeConnections.delete(gatewayId);
        
        setTimeout(() => {
          console.log(`Reconnecting auto-approval for gateway ${gatewayId}...`);
          connect();
        }, 5000);
      });
    };

    connect();
  },

  stopAutoApproval: (gatewayId) => {
    const ws = activeConnections.get(gatewayId);
    if (ws) {
      ws.close();
      activeConnections.delete(gatewayId);
      console.log(`Stopped auto-approval for gateway ${gatewayId}`);
    }
  },

  startAllGateways: async () => {
    try {
      const gateways = await gatewayService.getAllGateways();
      for (const gateway of gateways) {
        if (gateway.status === 'running') {
          await autoApprovalService.startAutoApproval(gateway.id);
        }
      }
    } catch (err) {
      console.error('Error starting auto-approval for gateways:', err);
    }
  },

  approvePending: async (gatewayId) => {
    const gateway = await gatewayService.getGateway(gatewayId);
    if (!gateway) {
      throw new Error(`Gateway ${gatewayId} not found`);
    }

    try {
      const listUrl = `${gateway.endpoint}/api/nodes/pending`;
      const listResponse = await fetch(listUrl, {
        headers: {
          'Authorization': `Bearer ${gateway.gateway_token}`,
        },
      });

      if (!listResponse.ok) {
        console.log(`Could not list pending requests: ${listResponse.status}`);
        return [];
      }

      const pending = await listResponse.json();
      const approved = [];

      for (const req of pending) {
        const approveUrl = `${gateway.endpoint}/api/nodes/approve`;
        const approveResponse = await fetch(approveUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${gateway.gateway_token}`,
          },
          body: JSON.stringify({ requestId: req.id }),
        });

        if (approveResponse.ok) {
          approved.push(req.id);
          console.log(`Approved pending request ${req.id}`);
        }
      }

      return approved;
    } catch (err) {
      console.error('Error approving pending requests:', err);
      return [];
    }
  },
};
