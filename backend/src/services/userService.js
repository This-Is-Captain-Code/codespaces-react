import { db } from '../db/index.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

export const userService = {
  createUser: async (email, password) => {
    const passwordHash = await bcrypt.hash(password, 10);
    const authToken = crypto.randomBytes(32).toString('hex');
    
    const result = await db.query(
      `INSERT INTO users (email, password_hash, auth_token) 
       VALUES ($1, $2, $3) 
       RETURNING id, email, auth_token, created_at`,
      [email, passwordHash, authToken]
    );
    
    return result.rows[0];
  },

  login: async (email, password) => {
    const result = await db.query(
      `SELECT id, email, password_hash, auth_token FROM users WHERE email = $1`,
      [email]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Invalid credentials');
    }
    
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    
    if (!valid) {
      throw new Error('Invalid credentials');
    }
    
    return {
      id: user.id,
      email: user.email,
      authToken: user.auth_token,
    };
  },

  getUserByToken: async (token) => {
    const result = await db.query(
      `SELECT id, email, created_at FROM users WHERE auth_token = $1`,
      [token]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  },

  getUserById: async (userId) => {
    const result = await db.query(
      `SELECT id, email, created_at FROM users WHERE id = $1`,
      [userId]
    );
    
    return result.rows[0] || null;
  },

  getOrCreateDevUser: async (devUserId) => {
    let result = await db.query(
      `SELECT id, email, auth_token FROM users WHERE auth_token = $1`,
      [devUserId]
    );
    
    if (result.rows.length === 0) {
      result = await db.query(
        `INSERT INTO users (email, auth_token) 
         VALUES ($1, $2) 
         RETURNING id, email, auth_token`,
        [`${devUserId}@dev.local`, devUserId]
      );
    }
    
    return result.rows[0];
  },
};
