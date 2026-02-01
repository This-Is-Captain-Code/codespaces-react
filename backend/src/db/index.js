import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = {
  query: (text, params) => pool.query(text, params),
  
  getClient: async () => {
    const client = await pool.connect();
    return client;
  },
};

export async function initializeDatabase() {
  console.log('Initializing database...');
  
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE,
      password_hash VARCHAR(255),
      auth_token VARCHAR(255) UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS gateways (
      id VARCHAR(100) PRIMARY KEY,
      fly_app_name VARCHAR(255) NOT NULL,
      fly_machine_id VARCHAR(255),
      fly_volume_id VARCHAR(255),
      endpoint VARCHAR(500) NOT NULL,
      setup_password VARCHAR(255) NOT NULL,
      gateway_token VARCHAR(255) NOT NULL,
      region VARCHAR(50) DEFAULT 'iad',
      memory_mb INTEGER DEFAULT 4096,
      max_agents INTEGER DEFAULT 200,
      current_agents INTEGER DEFAULT 0,
      status VARCHAR(50) DEFAULT 'running',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS bots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bot_name VARCHAR(255) NOT NULL,
      gateway_id VARCHAR(100) REFERENCES gateways(id),
      agent_id VARCHAR(255),
      railway_service_id VARCHAR(255),
      endpoint VARCHAR(500),
      token_hash VARCHAR(255),
      setup_password VARCHAR(255),
      model VARCHAR(100) DEFAULT 'gpt-3.5-turbo',
      system_prompt TEXT DEFAULT 'You are a helpful assistant.',
      openrouter_api_key_encrypted TEXT,
      status VARCHAR(50) DEFAULT 'creating',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id)
    )
  `);

  await db.query(`
    ALTER TABLE bots ADD COLUMN IF NOT EXISTS gateway_id VARCHAR(100) REFERENCES gateways(id)
  `).catch(() => {});

  await db.query(`
    ALTER TABLE bots ADD COLUMN IF NOT EXISTS agent_id VARCHAR(255)
  `).catch(() => {});

  await db.query(`
    ALTER TABLE bots ADD COLUMN IF NOT EXISTS setup_password VARCHAR(255)
  `).catch(() => {});

  // Drop foreign key constraint on gateway_id for per-user gateway model
  // gateway_id now stores Fly app name instead of gateways table reference
  await db.query(`
    ALTER TABLE bots DROP CONSTRAINT IF EXISTS bots_gateway_id_fkey
  `).catch(() => {});

  // Add fly_gateway_token column for per-user gateway auth
  await db.query(`
    ALTER TABLE bots ADD COLUMN IF NOT EXISTS fly_gateway_token VARCHAR(255)
  `).catch(() => {});

  await db.query(`
    CREATE TABLE IF NOT EXISTS bot_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
      token VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP,
      is_active BOOLEAN DEFAULT true
    )
  `);

  console.log('Database initialized successfully');
}

export default db;
