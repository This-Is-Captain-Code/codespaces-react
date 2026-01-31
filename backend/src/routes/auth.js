import express from 'express';
import { userService } from '../services/userService.js';

const router = express.Router();

router.post('/signup', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = await userService.createUser(email, password);
    
    res.status(201).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
      },
      token: user.auth_token,
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email already registered' });
    }
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await userService.login(email, password);
    
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
      },
      token: user.authToken,
    });
  } catch (error) {
    if (error.message === 'Invalid credentials') {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    next(error);
  }
});

router.get('/me', async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await userService.getUserByToken(token);
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    res.json({
      id: user.id,
      email: user.email,
      createdAt: user.created_at,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
