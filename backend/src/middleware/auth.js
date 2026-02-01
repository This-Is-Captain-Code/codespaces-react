import { userService } from '../services/userService.js';

const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;

let privyClient = null;

async function getPrivyClient() {
  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
    return null;
  }
  
  if (!privyClient) {
    try {
      const { PrivyClient } = await import('@privy-io/node');
      privyClient = new PrivyClient({
        appId: PRIVY_APP_ID,
        appSecret: PRIVY_APP_SECRET,
      });
    } catch (err) {
      console.error('Failed to initialize Privy client:', err.message);
      return null;
    }
  }
  return privyClient;
}

export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    let userId;
    let verified = false;
    let user = null;

    console.log(`Auth middleware: token starts with ${token.substring(0, 10)}...`);

    if (token.startsWith('user:')) {
      userId = token;
      verified = true;
    } else if (token.startsWith('did:privy:')) {
      userId = token;
      verified = true;
    } else {
      console.log('Checking token in database...');
      user = await userService.getUserByToken(token);
      console.log('User found:', user ? user.id : 'null');
      if (user) {
        verified = true;
        userId = token;
      } else {
        const client = await getPrivyClient();
        
        if (client) {
          try {
            const verifiedClaims = await client.verifyAuthToken(token);
            userId = verifiedClaims.userId;
            verified = true;
          } catch (verifyError) {
            console.error('Privy token verification failed:', verifyError.message);
            return res.status(401).json({ error: 'Invalid token' });
          }
        } else {
          const decoded = decodePrivyToken(token);
          if (decoded?.sub) {
            userId = decoded.sub;
            verified = true;
          } else {
            return res.status(401).json({ error: 'Invalid token' });
          }
        }
      }
    }

    console.log('After verification: verified =', verified, 'userId =', userId);
    
    if (!verified || !userId) {
      console.log('Not verified or no userId');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!user) {
      console.log('Fetching user by token:', userId);
      user = await userService.getUserByToken(userId);
    }
    
    if (!user) {
      console.log('Creating dev user:', userId);
      user = await userService.getOrCreateDevUser(userId);
    }

    console.log('Setting req.user with id:', user.id);
    req.user = {
      id: user.id,
      email: user.email,
      authToken: userId,
    };

    console.log('Auth successful, calling next()');
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
