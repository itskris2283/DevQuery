import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from "@shared/schema";

// Parse DATABASE_URL for Neon serverless connection
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

console.log('Connecting to database using DATABASE_URL');

// Create the connection using Neon serverless
const sql = neon(connectionString);
export const db = drizzle(sql, { schema });
