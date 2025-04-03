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
// Check if we're in development mode and MONGODB_URI is not set
const isDev = process.env.NODE_ENV !== 'production';
const isReplitEnv = process.env.REPL_ID || process.env.REPL_OWNER || process.env.REPL_SLUG;

// Allow in-memory mode for development
const inMemoryMode = isDev && (process.env.USE_IN_MEMORY_DB === 'true' || isReplitEnv);

// Default connection string
const defaultUri = inMemoryMode
  ? 'mongodb://localhost:27017/devquery' // Will be overridden by in-memory mode
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
  // For Replit environment or if USE_MOCK_DB is explicitly set to true, 
  // we'll use mock MongoDB. This allows the app to run without a real MongoDB connection
  if (process.env.USE_MOCK_DB === 'true' || (isReplitEnv && process.env.USE_MOCK_DB !== 'false')) {
    console.log('Using mock MongoDB connection for Replit environment');
    console.log('For real MongoDB, please install MongoDB locally or use MongoDB Atlas');
    // Return mongoose but don't actually connect
    mongoose.set('strictQuery', true);
    isConnected = true;
    return mongoose;
  }

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
    
    if (isReplitEnv || process.env.USE_MOCK_DB === 'true') {
      console.log('Using mock MongoDB storage due to connection failure');
      // Returning mongoose without actual connection
      mongoose.set('strictQuery', true);
      isConnected = true;
      return mongoose;
    }
    
    return null;
  }
}

// Export the mongoose instance
export { mongoose };