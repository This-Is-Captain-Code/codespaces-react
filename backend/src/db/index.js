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
    CREATE TABLE IF NOT EXISTS bots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bot_name VARCHAR(255) NOT NULL,
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
    ALTER TABLE bots ADD COLUMN IF NOT EXISTS setup_password VARCHAR(255)
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
