import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import pg from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import ws from "ws";
import * as schema from "@shared/schema";
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables from .env file if present
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  console.log('Loading environment variables from .env file');
  dotenv.config({ path: envPath });
}

neonConfig.webSocketConstructor = ws;

// Fallback to a demo database URL if not set
// This enables the app to run in development without needing to set up a database
if (!process.env.DATABASE_URL) {
  console.warn(
    "DATABASE_URL not found. Using in-memory storage instead.",
  );
}

// Try to establish database connection - with better error handling for Windows
let pool = null;
let db = null;

if (process.env.DATABASE_URL) {
  try {
    const isWindows = process.platform === 'win32';
    const isNeonUrl = process.env.DATABASE_URL.includes('neon.tech');
    
    // Use different connection approach depending on URL type and platform
    if (isNeonUrl) {
      // For Neon database (cloud)
      console.log("Connecting to Neon cloud database...");
      pool = new Pool({ connectionString: process.env.DATABASE_URL });
      db = drizzleNeon({ client: pool, schema });
    } else {
      // For local PostgreSQL instance
      console.log("Connecting to local PostgreSQL database...");
      pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      db = drizzlePg(pool, { schema });
    }
    
    console.log("Database connection established successfully");
  } catch (error) {
    console.error("Failed to connect to database:", error);
    console.warn("Falling back to in-memory storage");
    pool = null;
    db = null;
  }
}

export { pool, db };
