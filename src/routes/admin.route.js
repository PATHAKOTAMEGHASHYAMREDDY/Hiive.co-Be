import express from "express";
import { runMigrations } from "../lib/migration.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// Manual migration endpoint (for development/testing)
router.post("/migrate", protectRoute, async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ message: "Migrations not allowed in production" });
    }
    
    await runMigrations();
    res.status(200).json({ message: "Migrations completed successfully" });
  } catch (error) {
    res.status(500).json({ message: "Migration failed", error: error.message });
  }
});

export default router;