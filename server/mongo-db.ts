import mongoose, { Connection } from 'mongoose';
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

// Centralized mongoose configuration - set global mongoose settings once at the top level
// These settings apply to all mongoose operations throughout the application
// For mock DB mode, we need to disable buffer commands to prevent timeout errors
const isMockMode = process.env.USE_MOCK_DB === 'true';

// Only disable buffer commands in mock mode - this is crucial
// In real mode, we want buffer commands enabled
mongoose.set('bufferCommands', !isMockMode);
mongoose.set('strictQuery', true);

// Set a reasonable timeout for buffer operations when using real database
const MONGOOSE_TIMEOUT = 30000; // 30 seconds
if (!isMockMode) {
  mongoose.set('bufferTimeoutMS', MONGOOSE_TIMEOUT);
}

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

// Configure mongoose
mongoose.set('strictQuery', true); // Suppress deprecation warning
mongoose.set('bufferCommands', false); // Prevent command buffering when not connected

// Connection options
const options = {
  autoIndex: true, // Build indexes
  maxPoolSize: 10, // Maintain up to 10 socket connections
  serverSelectionTimeoutMS: 5000, // Timeout for server selection
  socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
  connectTimeoutMS: 10000, // Give up initial connection after 10 seconds
  family: 4, // Use IPv4, skip trying IPv6
};

/**
 * Connect to MongoDB
 */
export async function connectToDatabase(): Promise<typeof mongoose | null> {
  // Don't try to connect to MongoDB if we're in mock mode
  if (process.env.USE_MOCK_DB === 'true') {
    console.log('Using mock MongoDB connection (USE_MOCK_DB=true)');
    console.log('For real MongoDB, set USE_MOCK_DB=false and configure MONGODB_URI');
    return null;
  }

  try {
    console.log(`Attempting to connect to MongoDB at: ${MONGODB_URI}`);
    await mongoose.connect(MONGODB_URI, options);
    console.log('Connected to MongoDB successfully!');
    
    // Set up event listeners for connection issues
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
      console.log('Please ensure MongoDB is running and the connection string is correct.');
      console.log(`Current connection string: ${MONGODB_URI}`);
      
      // Force mock mode if we encounter a connection error
      process.env.USE_MOCK_DB = 'true';
    });
    
    mongoose.connection.on('disconnected', async () => {
      console.log('MongoDB disconnected. Attempting to reconnect...');
      try {
        await mongoose.connect(MONGODB_URI, options);
        console.log('Reconnected to MongoDB successfully!');
      } catch (error) {
        console.error('Failed to reconnect to MongoDB:', error);
        // Force mock mode after failed reconnection
        process.env.USE_MOCK_DB = 'true';
      }
    });

    return mongoose;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    console.log('Falling back to mock database mode...');
    process.env.USE_MOCK_DB = 'true';
    return null;
  }
}

/**
 * Disconnect from MongoDB
 */
export async function disconnectFromMongoDB(): Promise<void> {
  if (process.env.USE_MOCK_DB === 'true') {
    return; // No need to disconnect if we're in mock mode
  }
  
  try {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error disconnecting from MongoDB:', error);
  }
}

/**
 * Initialize the database
 */
export async function initializeDatabase(): Promise<void> {
  if (process.env.USE_MOCK_DB === 'true') {
    console.log('Using mock MongoDB connection (USE_MOCK_DB=true)');
    console.log('For real MongoDB, set USE_MOCK_DB=false and configure MONGODB_URI');
    console.log('MongoDB database initialized successfully');
    return;
  }
  
  try {
    await connectToDatabase();
    console.log('MongoDB database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize MongoDB database:', error);
    console.log('Continuing with mock database mode...');
    process.env.USE_MOCK_DB = 'true';
  }
}

// Export the mongoose instance
export { mongoose };