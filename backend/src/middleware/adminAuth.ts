import type { Request, Response, NextFunction } from 'express'

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers['authorization']?.replace('Bearer ', '')
  if (!token || token !== process.env['ADMIN_TOKEN']) {
    res.status(401).json({ error: 'No autorizado' })
    return
  }
  next()
}
