import { Router } from 'express';
import { getPublicSiteConfig } from '../controllers/public.controller.js';

const router = Router();

router.get('/site', getPublicSiteConfig);

export default router;
