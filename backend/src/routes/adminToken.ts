import { Router } from "express";
import { adminRefreshAuth, issueAdminToken } from "../middleware/adminAuth";
import { getConfig } from "../config";

const router = Router();

/**
 * POST /admin/token/refresh — exchanges a current (or recently expired) admin
 * JWT for a new short-lived one (#517).
 */
router.post("/admin/token/refresh", adminRefreshAuth, (_req, res) => {
  const { stellarAddress, auth_time } = res.locals.adminToken;
  res.setHeader("Cache-Control", "no-store");
  res.json({
    token: issueAdminToken(stellarAddress, auth_time),
    expires_in: getConfig().adminJwtTtlSeconds,
  });
});

export default router;
