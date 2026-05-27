import { validateAccessToken } from '../services/auth/sessionStore';

export function createAuthenticateToken(_jwtSecret: string) {
  return async (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && String(authHeader).split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const user = await validateAccessToken(token);
      req.user = user;
      next();
    } catch {
      return res.status(403).json({ error: 'Session expired. Please log in again.', code: 'SESSION_EXPIRED' });
    }
  };
}
