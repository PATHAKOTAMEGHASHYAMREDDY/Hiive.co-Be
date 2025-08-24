import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";

import path from "path";

import { connectDB } from "./lib/db.js";
import { initializeScheduledTasks } from "./lib/scheduledTasks.js";
import { runMigrations } from "./lib/migration.js";

import authRoutes from "./routes/auth.route.js";
import messageRoutes from "./routes/message.route.js";
import roomRoutes from "./routes/room.route.js";
import notificationRoutes from "./routes/notification.route.js";
import adminRoutes from "./routes/admin.route.js";
import { app, server } from "./lib/socket.js";

dotenv.config();

const PORT = process.env.PORT || 5001;
const __dirname = path.resolve();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://hiiveco.vercel.app",
      process.env.FRONTEND_URL,
    ].filter(Boolean),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  })
);

// Root endpoint
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Chat App Backend API",
    status: "running",
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    message: "Server is running",
  });
});

// Debug endpoint to check environment variables (remove after debugging)
app.get("/api/debug", (req, res) => {
  res.status(200).json({
    nodeEnv: process.env.NODE_ENV,
    hasMongoUri: !!process.env.MONGODB_URI,
    hasJwtSecret: !!process.env.JWT_SECRET,
    frontendUrl: process.env.FRONTEND_URL,
    mongoUriStart: process.env.MONGODB_URI ? process.env.MONGODB_URI.substring(0, 20) + "..." : "Not set",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend", "dist", "index.html"));
  });
}

server.listen(PORT, async () => {
  await connectDB();

  // Run migrations for existing data compatibility
  if (process.env.NODE_ENV !== "production") {
    await runMigrations();
  }

  initializeScheduledTasks();
});
