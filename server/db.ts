import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
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

export const pool = process.env.DATABASE_URL 
  ? new Pool({ connectionString: process.env.DATABASE_URL }) 
  : null;

export const db = pool 
  ? drizzle({ client: pool, schema }) 
  : null;
