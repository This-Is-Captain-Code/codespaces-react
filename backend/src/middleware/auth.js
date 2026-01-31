import { userService } from '../services/userService.js';

export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    let userId;

    if (token.startsWith('did:privy:')) {
      userId = token;
    } else {
      const decoded = decodePrivyToken(token);
      userId = decoded?.sub || token;
    }

    let user = await userService.getUserByToken(userId);
    
    if (!user) {
      user = await userService.getOrCreateDevUser(userId);
    }

    req.user = {
      id: user.id,
      email: user.email,
      privyId: userId,
    };

    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ error: 'Unauthorized' });
  }
};

function decodePrivyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      return payload;
    }
    return null;
  } catch {
    return null;
  }
}
