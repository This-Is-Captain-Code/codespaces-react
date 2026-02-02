const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

async function provisioningRequest(method, path, body = null) {
  const provisioningKey = process.env.OPENROUTER_PROVISIONING_KEY;
  if (!provisioningKey) {
    throw new Error('OPENROUTER_PROVISIONING_KEY not configured');
  }

  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${provisioningKey}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${OPENROUTER_API_BASE}${path}`, options);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const openrouterProvisioningService = {
  createUserKey: async (options = {}) => {
    const {
      name,
      limitUsd = null,
      userId = null,
      botId = null,
    } = options;

    const keyName = name || `MoltRack-${userId ? userId.substring(0, 8) : 'user'}-${Date.now()}`;

    const requestBody = {
      name: keyName,
    };

    if (limitUsd !== null && limitUsd > 0) {
      requestBody.limit = limitUsd;
    }

    console.log(`Creating OpenRouter key: ${keyName}${limitUsd ? ` with $${limitUsd} limit` : ' (no limit)'}...`);
    console.log(`Request body:`, JSON.stringify(requestBody));

    const result = await provisioningRequest('POST', '/keys', requestBody);
    console.log(`OpenRouter response:`, JSON.stringify(result));

    console.log(`OpenRouter key created: ${result.data?.hash || 'unknown'}`);

    return {
      key: result.data?.key,
      keyHash: result.data?.hash,
      name: result.data?.name,
      limitUsd: result.data?.limit || null,
      usage: result.data?.usage || 0,
      isFreeTier: result.data?.is_free_tier || false,
      rateLimit: result.data?.rate_limit || null,
    };
  },

  getKeyInfo: async (keyHash) => {
    console.log(`Getting info for OpenRouter key: ${keyHash}...`);
    
    const result = await provisioningRequest('GET', `/keys/${keyHash}`);
    console.log(`OpenRouter key info response:`, JSON.stringify(result.data, null, 2));

    return {
      keyHash: result.data?.hash,
      name: result.data?.name,
      limitUsd: result.data?.limit || null,
      usage: result.data?.usage || 0,
      disabled: result.data?.disabled || false,
      isFreeTier: result.data?.is_free_tier || false,
      rateLimit: result.data?.rate_limit || null,
    };
  },

  updateKeyLimit: async (keyHash, newLimitUsd) => {
    console.log(`Updating OpenRouter key ${keyHash} limit to $${newLimitUsd}...`);

    const result = await provisioningRequest('PATCH', `/keys/${keyHash}`, {
      limit: newLimitUsd,
    });

    console.log(`OpenRouter key limit updated`);

    return {
      keyHash: result.data?.hash,
      limitUsd: result.data?.limit,
      usage: result.data?.usage || 0,
    };
  },

  disableKey: async (keyHash) => {
    console.log(`Disabling OpenRouter key: ${keyHash}...`);

    const result = await provisioningRequest('PATCH', `/keys/${keyHash}`, {
      disabled: true,
    });

    console.log(`OpenRouter key disabled`);
    return { success: true, keyHash };
  },

  enableKey: async (keyHash) => {
    console.log(`Enabling OpenRouter key: ${keyHash}...`);

    const result = await provisioningRequest('PATCH', `/keys/${keyHash}`, {
      disabled: false,
    });

    console.log(`OpenRouter key enabled`);
    return { success: true, keyHash };
  },

  deleteKey: async (keyHash) => {
    console.log(`Deleting OpenRouter key: ${keyHash}...`);

    await provisioningRequest('DELETE', `/keys/${keyHash}`);

    console.log(`OpenRouter key deleted`);
    return { success: true };
  },

  listKeys: async () => {
    console.log('Listing all OpenRouter provisioned keys...');

    const result = await provisioningRequest('GET', '/keys');

    return (result.data || []).map(key => ({
      keyHash: key.hash,
      name: key.name,
      limitUsd: key.limit || null,
      usage: key.usage || 0,
      disabled: key.disabled || false,
      createdAt: key.created_at,
    }));
  },

  isProvisioningConfigured: () => {
    return !!process.env.OPENROUTER_PROVISIONING_KEY;
  },
};
