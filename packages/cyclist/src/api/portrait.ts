import { Router } from 'express';

// Portrait state (in-memory for prototype)
let currentPortrait = { src: '' };

// Get current portrait state
export function getCurrentPortrait() {
  return currentPortrait;
}

// Create portrait API router
export function createPortraitRouter(): Router {
  const router = Router();

  // Portrait API - GET current portrait
  router.get('/', (_req, res) => {
    res.json(currentPortrait);
  });

  // Portrait API - SET portrait
  router.post('/', (req, res) => {
    const { src } = req.body;
    if (src && typeof src === 'string') {
      currentPortrait = { src };
      res.json({ success: true, src });
    } else {
      res.status(400).json({ error: 'Invalid portrait src' });
    }
  });

  return router;
}
