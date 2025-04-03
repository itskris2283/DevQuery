import mysql from 'mysql2/promise';
import { drizzle as drizzleMysql } from 'drizzle-orm/mysql2';
import { connect as planetscaleConnect } from '@planetscale/database';
import { drizzle as drizzlePlanetscale } from 'drizzle-orm/planetscale-serverless';
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

// Fallback to a demo database URL if not set
// This enables the app to run in development without needing to set up a database
if (!process.env.DATABASE_URL) {
  console.warn(
    "DATABASE_URL not found. Using in-memory storage instead.",
  );
}

// Try to establish database connection - with better error handling for Windows
let mysqlPool: mysql.Pool | null = null;
let planetscaleConn: any = null;
let db: any = null;

// Function to automatically create database schema
async function pushDatabaseSchema() {
  try {
    console.log("Checking database tables and creating them if needed...");
    
    // First, check if the tables already exist
    const checkTableExistenceQuery = `
      SELECT COUNT(*) as count
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() AND table_name = 'users';
    `;
    
    let tableExists = false;
    
    if (mysqlPool) {
      const [rows] = await mysqlPool.query(checkTableExistenceQuery);
      const result = rows as any[];
      tableExists = result[0].count > 0;
    } else if (planetscaleConn) {
      const result = await planetscaleConn.execute(checkTableExistenceQuery);
      tableExists = result.rows[0].count > 0;
    } else {
      throw new Error("No database connection available");
    }
    
    if (!tableExists) {
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
  } catch (error: any) {
    console.error("Failed to check/create database schema:", error);
    console.warn("Tables may need to be created manually using 'npm run db:push'");
  }
}

if (process.env.DATABASE_URL) {
  try {
    const isWindows = process.platform === 'win32';
    const isPlanetscaleUrl = process.env.DATABASE_URL.includes('planetscale');
    
    // Use different connection approach depending on URL type
    if (isPlanetscaleUrl) {
      // For PlanetScale database (cloud)
      console.log("Connecting to PlanetScale cloud database...");
      planetscaleConn = planetscaleConnect({
        url: process.env.DATABASE_URL
      });
      db = drizzlePlanetscale({ client: planetscaleConn, schema, mode: 'default' });
    } else {
      // For local MySQL instance
      console.log("Connecting to local MySQL database...");
      mysqlPool = mysql.createPool(process.env.DATABASE_URL);
      db = drizzleMysql(mysqlPool, { schema, mode: 'default' });
    }
    
    console.log("Database connection established successfully");
    
    // Run schema push after connection is established
    pushDatabaseSchema().catch(err => {
      console.error("Error during db schema push:", err);
    });
    
  } catch (error: any) {
    console.error("Failed to connect to database:", error);
    console.warn("Falling back to in-memory storage");
    mysqlPool = null;
    planetscaleConn = null;
    db = null;
  }
}

// Export a pool variable for backward compatibility
const pool = mysqlPool || planetscaleConn;
export { pool, db };
