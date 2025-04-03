import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables from .env file if present
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  console.log('Loading environment variables from .env file');
  dotenv.config({ path: envPath });
}

// Set up MongoDB connection string
// Default to a temporary in-memory database for Replit environment
// This will be overridden by actual MongoDB URI if available
const isReplitEnv = process.env.REPL_ID || process.env.REPL_OWNER || process.env.REPL_SLUG;
const defaultUri = isReplitEnv 
  ? 'mongodb://mongodb-memory-server/devquery' // Placeholder - will actually use in-memory storage
  : 'mongodb://localhost:27017/devquery';

const MONGODB_URI = process.env.MONGODB_URI || defaultUri;

// Add MongoDB connection string to environment for other modules to use
process.env.MONGODB_URI = MONGODB_URI;

// Connection states for logging
const CONNECTION_STATES: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
  4: 'unauthorized'
};

// Flag to track if connection is established
let isConnected = false;

// Connect to MongoDB with timeout
export async function connectToDatabase(): Promise<typeof mongoose | null> {
  if (isConnected) {
    console.log('Using existing MongoDB connection');
    return mongoose;
  }

  // Use a simple timeout for the connection attempt
  const TIMEOUT_MS = isReplitEnv ? 3000 : 10000; // Shorter timeout in Replit
  
  try {
    console.log(`Connecting to MongoDB at ${MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@')}`);
    console.log(`Connection timeout set to ${TIMEOUT_MS}ms`);
    
    // Configure mongoose
    mongoose.set('strictQuery', true);
    
    // Create a promise that rejects after timeout
    const timeoutPromise = new Promise<null>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`MongoDB connection timeout after ${TIMEOUT_MS}ms`));
      }, TIMEOUT_MS);
    });
    
    // Race between the connection and timeout
    const mongooseInstance = await Promise.race([
      mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: TIMEOUT_MS,
      }),
      timeoutPromise
    ]);
    
    const connection = mongoose.connection;
    
    connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
      isConnected = false;
    });
    
    connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
      isConnected = false;
    });
    
    connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
      isConnected = true;
    });
    
    // readyState is a number that we can safely cast
    const state = connection.readyState as number;
    console.log(`MongoDB connected: ${CONNECTION_STATES[state] || 'unknown'}`);
    console.log(`Connected to database: ${connection.name}`);
    
    isConnected = true;
    return mongoose;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    return null;
  }
}

// Export the mongoose instance
export { mongoose };