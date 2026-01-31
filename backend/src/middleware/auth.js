// Mock auth middleware - replace with Privy in production
export const authMiddleware = (req, res, next) => {
  // For development, use a header token or generate a mock user
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // In production, this would verify with Privy
  req.user = {
    id: token || 'dev-user-123', // Use token as user ID for now
    email: 'dev@example.com',
  };

  next();
};
