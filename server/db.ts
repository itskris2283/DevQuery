import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import pg from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import ws from "ws";
import * as schema from "@shared/schema";
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';

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
let neonPool: NeonPool | null = null;
let pgPool: pg.Pool | null = null;
let db: any = null;

// Function to automatically create database schema
async function pushDatabaseSchema() {
  try {
    console.log("Checking database tables and creating them if needed...");
    
    // First, check if the tables already exist
    const checkTableExistenceQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'users'
      );
    `;
    
    let client;
    if (neonPool) {
      client = await neonPool.connect();
    } else if (pgPool) {
      client = await pgPool.connect();
    } else {
      throw new Error("No database pool available");
    }
    
    try {
      // Check if the users table exists (as a way to determine if we need to create schema)
      const tableCheck = await client.query(checkTableExistenceQuery);
      
      if (!tableCheck.rows[0].exists) {
        console.log("Database tables don't exist. Running schema push...");
        
        // Run the npm script
        return new Promise<void>((resolve, reject) => {
          exec('npm run db:push', (error: Error | null, stdout: string, stderr: string) => {
            if (error) {
              console.error(`Schema push error: ${error.message}`);
              // Even if there's an error, try to continue
              resolve();
              return;
            }
            
            if (stderr) {
              console.log(`Schema push stderr: ${stderr}`);
            }
            
            console.log(`Schema push output: ${stdout}`);
            console.log("Database schema has been created successfully");
            resolve();
          });
        });
      } else {
        console.log("Database tables already exist");
      }
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("Failed to check/create database schema:", error);
    console.warn("Tables may need to be created manually using 'npm run db:push'");
  }
}

if (process.env.DATABASE_URL) {
  try {
    const isWindows = process.platform === 'win32';
    const isNeonUrl = process.env.DATABASE_URL.includes('neon.tech');
    
    // Use different connection approach depending on URL type and platform
    if (isNeonUrl) {
      // For Neon database (cloud)
      console.log("Connecting to Neon cloud database...");
      neonPool = new NeonPool({ connectionString: process.env.DATABASE_URL });
      db = drizzleNeon({ client: neonPool, schema });
    } else {
      // For local PostgreSQL instance
      console.log("Connecting to local PostgreSQL database...");
      pgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      db = drizzlePg(pgPool, { schema });
    }
    
    console.log("Database connection established successfully");
    
    // Run schema push after connection is established
    pushDatabaseSchema().catch(err => {
      console.error("Error during db schema push:", err);
    });
    
  } catch (error: any) {
    console.error("Failed to connect to database:", error);
    console.warn("Falling back to in-memory storage");
    neonPool = null;
    pgPool = null;
    db = null;
  }
}

// Export a pool variable for backward compatibility
const pool = neonPool || pgPool;
export { pool, db };
