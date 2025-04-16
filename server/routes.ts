import express, { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { connectToDatabase } from "./mongo-db";
import { messageEvents } from "./models/message.model";
import ImageFile from "./models/image-file.model";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  insertQuestionSchema,
  insertAnswerSchema,
  questionWithTagsSchema,
  insertVoteSchema,
  insertMessageSchema,
  insertFollowSchema
} from "@shared/schema";
import { validate } from "uuid";

// We'll use a simpler approach with Map to track WebSocket connections
type WSConnection = {
  ws: WebSocket;
  isAlive: boolean;
  userId: number | null;
};

// Configure multer for memory storage (not disk storage)
// This allows us to access the buffer for storing in MongoDB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Only allow images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// For backward compatibility, we'll still maintain the uploads directory
// for serving files (though we'll eventually remove this)
const storageDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

export async function registerRoutes(app: Express): Promise<Server> {
  const isReplitEnv = process.env.REPL_ID || process.env.REPL_OWNER || process.env.REPL_SLUG;
  
  try {
    // Initialize MongoDB connection - handle errors gracefully
    if (process.env.USE_MOCK_DB === 'true') {
      console.log('Using mock data mode (USE_MOCK_DB=true)');
    } else {
      try {
    const mongooseInstance = await connectToDatabase();
    if (mongooseInstance) {
      console.log('MongoDB connected successfully');
    }
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
        console.log('Falling back to mock data mode');
        // Force mock mode if connection fails
        process.env.USE_MOCK_DB = 'true';
      }
    }
  } catch (error) {
    console.error('Error initializing database:', error);
    // Force mock mode if initialization fails
    process.env.USE_MOCK_DB = 'true';
  }

  // Register authentication middleware
  const { requireAuth, getCurrentUser } = setupAuth(app);

  // Add a health check endpoint for diagnostics
  app.get('/api/health', (req, res) => {
    res.status(200).send('Server is running');
  });

  // Create HTTP server
  const server = createServer(app);

  // Setup WebSocket server with proper error handling
  const wss = new WebSocketServer({ 
    server,
    // Disable compression which can cause issues
    perMessageDeflate: false,
    // Set a reasonable max payload size
    maxPayload: 50 * 1024, // 50KB
    // Use a more generous ping timeout
    clientTracking: true,
    // Add WebSocket protocol validation
    handleProtocols: (protocols: string[] | undefined) => {
      // Accept any protocol or none
      return protocols && protocols.length > 0 ? protocols[0] : false;
    }
  });

  // Add server-level error handler
  wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
  });

  // Track connected clients - keep connection objects in a map
  const wsConnections = new Map<WebSocket, WSConnection>();
  
  // Track user connections 
  const userConnections = new Map<number, WebSocket[]>();

  // Helper function to broadcast message to all connected clients of a user
  const sendToUser = (userId: number, message: any) => {
    const connections = userConnections.get(userId);
    if (connections) {
      const messageStr = JSON.stringify(message);
      const validConnections: WebSocket[] = [];

      connections.forEach(ws => {
        try {
              if (ws.readyState === WebSocket.OPEN) {
            ws.send(messageStr);
            validConnections.push(ws);
          }
        } catch (error) {
          console.error(`Error sending message to user ${userId}:`, error);
        }
      });

      // Update the connections with only valid ones
      if (validConnections.length !== connections.length) {
        userConnections.set(userId, validConnections);
      }
    }
  };

  // Helper function to broadcast online users to all clients
  const broadcastOnlineUsers = async () => {
    try {
      // Get all online users (with unique user IDs)
      const onlineUserIds = Array.from(userConnections.keys());
      
      // If no users are online, don't bother fetching user details
      if (onlineUserIds.length === 0) return;
      
      // Fetch user details
      const onlineUsers = await storage.getUsersByIds(onlineUserIds);
      
      // Broadcast to all connected clients
      userConnections.forEach((_, userId) => {
        sendToUser(userId, {
          type: 'online-users',
          users: onlineUsers.map(user => ({
            id: user.id,
            username: user.username,
            avatarUrl: user.avatarUrl
          }))
        });
      });
    } catch (error) {
      console.error('Error broadcasting online users:', error);
    }
  };
  
  // Set up ping interval to keep connections alive and detect stale ones
  const pingInterval = setInterval(() => {
    wsConnections.forEach((connection, ws) => {
      // Check if websocket is still alive
      if (!connection.isAlive) {
        try {
          wsConnections.delete(ws);
          // Close properly, don't terminate immediately
          ws.close();
        } catch (err) {
          console.error('Error closing WebSocket:', err);
        }
        return;
      }
      
      // Mark as inactive for next round of pings
      connection.isAlive = false;
      
      // Send ping - with error handling
      try {
        if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
        } else {
          wsConnections.delete(ws);
        }
      } catch (err) {
        console.error('Error sending ping:', err);
        wsConnections.delete(ws);
        try {
          ws.close();
        } catch (closeErr) {
          // Already closed or error, ignore
        }
      }
    });
  }, 30000);
  
  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  // Handle WebSocket connections
  wss.on('connection', (ws, req) => {
    console.log('WebSocket client connected');
    
    // Handle socket-level errors
    ws.on('error', (error) => {
      console.error('WebSocket connection error:', error);
      try {
        ws.close();
      } catch (e) {
        // Already closed
      }
    });
    
    // Create connection object
    const connection: WSConnection = {
      ws,
      isAlive: true,
      userId: null
    };
    
    // Store in our Map
    wsConnections.set(ws, connection);
    
    // Set up pong handler to mark connection as alive
    ws.on('pong', () => {
      const conn = wsConnections.get(ws);
      if (conn) {
        conn.isAlive = true;
      }
    });

    ws.on('message', async (data) => {
      try {
        let message;
        try {
          message = JSON.parse(data.toString());
        } catch (e) {
          console.error('Invalid JSON in WebSocket message:', e);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format'
          }));
          return;
        }
        
        const connection = wsConnections.get(ws);
        
        if (!connection) {
          console.error('WebSocket connection not found');
          return;
        }
        
        switch (message.type) {
          case 'register':
            // Associate this connection with a user ID
            if (typeof message.userId === 'number') {
              connection.userId = message.userId;
              console.log(`Registering WebSocket client for user ID: ${connection.userId}`);
              
              // Add this connection to the user connections map - with proper type checking
              if (connection.userId !== null) {
                if (!userConnections.has(connection.userId)) {
                  userConnections.set(connection.userId, []);
                }
                
                const userWsList = userConnections.get(connection.userId);
                if (userWsList && !userWsList.includes(ws)) {
                  userWsList.push(ws);
                }
                
                // Broadcast updated online users list
                broadcastOnlineUsers();
              }
            }
            break;
            
          case 'message':
            // Handle chat messages
            if (connection.userId && message.receiverId && message.content) {
              try {
                // Create and save message to database
                const newMessage = await storage.createMessage({
                  senderId: connection.userId,
                  receiverId: message.receiverId,
                  content: message.content
                });
                
                // Send to sender (acknowledgment + UI update)
                if (connection.userId !== null) {
                  sendToUser(connection.userId, {
                    type: 'message-sent',
                    message: newMessage
                  });
                }
                
                // Send to receiver if online
                sendToUser(message.receiverId, {
                  type: 'new-message',
                  message: newMessage
                });
              } catch (error) {
                console.error('Error creating message:', error);
                if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Failed to send message'
                  }));
                }
              }
            }
            break;
            
          case 'mark-read':
            // Mark message as read
            if (connection.userId && message.messageId) {
              try {
                const success = await storage.markMessageAsRead(message.messageId);
                if (success && connection.userId !== null) {
                  // Acknowledge to the user who marked it as read
                  sendToUser(connection.userId, {
                    type: 'message-read',
                    messageId: message.messageId
                  });
                }
              } catch (error) {
                console.error('Error marking message as read:', error);
                if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'error',
                    message: 'Failed to mark message as read'
            }));
          }
        }
            }
            break;

          default:
            // Unknown message type
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Unknown message type'
              }));
            }
            break;
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
        try {
          if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Error processing message'
          }));
          }
        } catch (sendError) {
          console.error('Error sending error message:', sendError);
        }
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      
      // Get the connection info before deleting
      const connection = wsConnections.get(ws);
      
      // Remove from wsConnections
      wsConnections.delete(ws);
      
      // Remove from userConnections if associated with a user
      if (connection && connection.userId !== null) {
        const userWsList = userConnections.get(connection.userId);
        
        if (userWsList) {
          const index = userWsList.indexOf(ws);
          if (index !== -1) {
            userWsList.splice(index, 1);
          }
          
          // Remove the entry completely if no connections left
          if (userWsList.length === 0) {
            userConnections.delete(connection.userId);
            
            // Broadcast updated online users list
            broadcastOnlineUsers();
          }
        }
      }
    });
  });

  // File upload endpoint
  app.post('/api/upload', requireAuth, upload.single('image'), async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    try {
      // Extract user ID from authenticated session
      const userId = req.user?.id;
      
      const imageFileName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}`;
      
      if (process.env.USE_MOCK_DB === 'true') {
        // In mock mode, we'll still save to the file system
        // for simplicity and backward compatibility
        const filePath = path.join(storageDir, imageFileName);
        
        // Save to disk
        fs.writeFileSync(filePath, req.file.buffer);
        console.log(`Mock mode: Saved image to ${filePath}`);
        
        // Use old-style URL for mock mode
        const imageUrl = `/uploads/${imageFileName}`;
        return res.json({ imageUrl });
      }
      
      // Create a new ImageFile document
      const imageFile = new ImageFile({
        filename: imageFileName,
        originalname: req.file.originalname,
        contentType: req.file.mimetype,
        size: req.file.size,
        data: req.file.buffer,
        metadata: {
          uploadedBy: userId
        }
      });
      
      // Save to MongoDB
      const savedFile = await imageFile.save();
      
      // Return the URL for the image - using the image ID
      // Get the ID with a type-safe approach
      const imageId = process.env.USE_MOCK_DB === 'true' 
        ? (savedFile as any).id
        : (savedFile as any).id || (savedFile as any)._id;
        
      const imageUrl = `/api/images/${imageId}`;
    res.json({ imageUrl });
    } catch (error) {
      console.error('Error saving image:', error);
      
      // Fall back to file system if MongoDB storage fails
      try {
        const imageFileName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}`;
        const filePath = path.join(storageDir, imageFileName);
        
        // Save to disk
        fs.writeFileSync(filePath, req.file.buffer);
        console.log(`Fallback: Saved image to ${filePath}`);
        
        // Use old-style URL for fallback
        const imageUrl = `/uploads/${imageFileName}`;
        return res.json({ imageUrl });
      } catch (fallbackError) {
        console.error('Error in fallback image save:', fallbackError);
        res.status(500).json({ message: 'Failed to save image' });
      }
    }
  });

  // Image serving endpoint - return the image directly from MongoDB or fallback to filesystem
  app.get('/api/images/:id', async (req, res) => {
    try {
      const imageId = parseInt(req.params.id);
      if (isNaN(imageId)) {
        return res.status(400).json({ message: 'Invalid image ID' });
      }
      
      // Find the image in MongoDB
      const imageFile = await ImageFile.findOne({ id: imageId });
      if (!imageFile) {
        // For backward compatibility - try to serve from filesystem
        // Check if a file with this name exists in uploads directory
        const files = fs.readdirSync(storageDir);
        const matchingFile = files.find(file => file.includes(req.params.id));
        
        if (matchingFile) {
          const filePath = path.join(storageDir, matchingFile);
          return res.sendFile(filePath);
        }
        
        return res.status(404).json({ message: 'Image not found' });
      }
      
      // Set correct content type
      res.contentType(imageFile.contentType);
      
      // Send the image data
      res.send(imageFile.data);
      
    } catch (error) {
      console.error('Error retrieving image:', error);
      
      // Try filesystem as fallback
      try {
        // For backward compatibility - try to serve from filesystem
        const files = fs.readdirSync(storageDir);
        const matchingFile = files.find(file => file.includes(req.params.id));
        
        if (matchingFile) {
          const filePath = path.join(storageDir, matchingFile);
          return res.sendFile(filePath);
        }
      } catch (fallbackError) {
        console.error('Fallback retrieval failed:', fallbackError);
      }
      
      res.status(500).json({ message: 'Failed to retrieve image' });
    }
  });

  // For backward compatibility - serve uploaded files from disk
  app.use('/uploads', express.static(storageDir));

  // Questions routes
  app.get('/api/questions', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = parseInt(req.query.offset as string) || 0;
      const sortBy = (req.query.sortBy as string) || 'newest';
      const filter = req.query.filter as string;
      
      const questions = await storage.getQuestions({ limit, offset, sortBy, filter });
      res.json(questions);
    } catch (error) {
      console.error('Error fetching questions:', error);
      res.status(500).json({ message: 'Failed to fetch questions' });
    }
  });

  app.get('/api/questions/:id', async (req, res) => {
    try {
      const questionId = parseInt(req.params.id);
      const question = await storage.getQuestionWithDetails(questionId);
      
      if (!question) {
        return res.status(404).json({ message: 'Question not found' });
      }
      
      // Increment the view count
      await storage.incrementQuestionViews(questionId);
      
      // Get the updated question with the new view count
      const updatedQuestion = await storage.getQuestionWithDetails(questionId);
      
      res.json(updatedQuestion || question);
    } catch (error) {
      console.error('Error fetching question:', error);
      res.status(500).json({ message: 'Failed to fetch question' });
    }
  });

  app.post('/api/questions', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    try {
      // First validate that required fields are present
      if (!req.body.title || !req.body.content || req.body.content.trim() === '') {
        return res.status(400).json({ 
          message: 'Title and content are required', 
          errors: [
            !req.body.title ? { path: 'title', message: 'Title is required' } : null,
            !req.body.content || req.body.content.trim() === '' ? { path: 'content', message: 'Content is required' } : null
          ].filter(Boolean)
        });
      }
      
      // Then try to parse with Zod schema
      const validatedData = questionWithTagsSchema.parse(req.body);
      const { tags, ...questionData } = validatedData;
      
      // Create the question
      const question = await storage.createQuestion(req.user.id, questionData, tags || []);
      res.status(201).json(question);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid question data', errors: error.errors });
      }
      
      // Better error handling for specific DB errors
      console.error('Error creating question:', error);
      
      // Check for specific MongoDB validation errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('validation failed')) {
        if (errorMessage.includes('content')) {
          return res.status(400).json({ message: 'Question content is required' });
        }
      }
      
      res.status(500).json({ message: 'Failed to create question' });
    }
  });

  app.patch('/api/questions/:id', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    try {
      const questionId = parseInt(req.params.id);
      const question = await storage.getQuestion(questionId);
      
      if (!question) {
        return res.status(404).json({ message: 'Question not found' });
      }
      
      if (question.userId !== req.user.id) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      
      const validatedData = insertQuestionSchema.partial().parse(req.body);
      const updatedQuestion = await storage.updateQuestion(questionId, validatedData);
      
      res.json(updatedQuestion);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid question data', errors: error.errors });
      }
      console.error('Error updating question:', error);
      res.status(500).json({ message: 'Failed to update question' });
    }
  });

  app.post('/api/questions/:id/solve', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    try {
      const questionId = parseInt(req.params.id);
      const answerId = parseInt(req.body.answerId);
      
      const question = await storage.getQuestion(questionId);
      if (!question) {
        return res.status(404).json({ message: 'Question not found' });
      }
      
      if (question.userId !== req.user.id) {
        return res.status(403).json({ message: 'Only the question author can mark as solved' });
      }
      
      const success = await storage.markQuestionAsSolved(questionId, answerId);
      if (!success) {
        return res.status(400).json({ message: 'Failed to mark question as solved' });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error marking question as solved:', error);
      res.status(500).json({ message: 'Failed to mark question as solved' });
    }
  });

  // Answers routes
  app.get('/api/questions/:id/answers', async (req, res) => {
    try {
      const questionId = parseInt(req.params.id);
      const answers = await storage.getAnswersByQuestionId(questionId);
      res.json(answers);
    } catch (error) {
      console.error('Error fetching answers:', error);
      res.status(500).json({ message: 'Failed to fetch answers' });
    }
  });

  app.post('/api/questions/:id/answers', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    try {
      const questionId = parseInt(req.params.id);
      const question = await storage.getQuestion(questionId);
      
      if (!question) {
        return res.status(404).json({ message: 'Question not found' });
      }
      
      const validatedData = insertAnswerSchema.parse({
        ...req.body,
        questionId
      });
      
      const answer = await storage.createAnswer(req.user.id, validatedData);
      res.status(201).json(answer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid answer data', errors: error.errors });
      }
      console.error('Error creating answer:', error);
      res.status(500).json({ message: 'Failed to create answer' });
    }
  });

  app.patch('/api/answers/:id', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    try {
      const answerId = parseInt(req.params.id);
      const answer = await storage.getAnswer(answerId);
      
      if (!answer) {
        return res.status(404).json({ message: 'Answer not found' });
      }
      
      if (answer.userId !== req.user.id) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      
      const validatedData = insertAnswerSchema.partial().parse(req.body);
      const updatedAnswer = await storage.updateAnswer(answerId, validatedData);
      
      res.json(updatedAnswer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid answer data', errors: error.errors });
      }
      console.error('Error updating answer:', error);
      res.status(500).json({ message: 'Failed to update answer' });
    }
  });

  // Votes routes
  app.post('/api/votes', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    try {
      const validatedData = insertVoteSchema.parse({
        ...req.body,
        userId: req.user.id
      });
      
      // Ensure the value is only 1 or -1
      if (validatedData.value !== 1 && validatedData.value !== -1) {
        return res.status(400).json({ message: 'Vote value must be 1 or -1' });
      }
      
      // Ensure either questionId or answerId is provided, but not both
      if (
        (!validatedData.questionId && !validatedData.answerId) || 
        (validatedData.questionId && validatedData.answerId)
      ) {
        return res.status(400).json({ 
          message: 'Either questionId or answerId must be provided, but not both' 
        });
      }
      
      const vote = await storage.createOrUpdateVote(validatedData);
      res.status(201).json(vote);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid vote data', errors: error.errors });
      }
      console.error('Error creating vote:', error);
      res.status(500).json({ message: 'Failed to create vote' });
    }
  });

  // Tags routes
  app.get('/api/tags', async (_req, res) => {
    try {
      const tags = await storage.getAllTags();
      res.json(tags);
    } catch (error) {
      console.error('Error fetching tags:', error);
      res.status(500).json({ message: 'Failed to fetch tags' });
    }
  });

  // User routes
  app.get('/api/users/search', async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.length < 2) {
        return res.status(400).json({ message: 'Search query must be at least 2 characters' });
      }
      
      const users = await storage.searchUsers(query);
      res.json(users);
    } catch (error) {
      console.error('Error searching users:', error);
      res.status(500).json({ message: 'Failed to search users' });
    }
  });

  app.get('/api/users/:id', async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Don't send password
      const { password, ...userWithoutPassword } = user;
      
      // Get additional user data
      const [
        questions,
        answers,
        followerCount,
        followingCount
      ] = await Promise.all([
        storage.getQuestionsByUserId(userId),
        storage.getAnswersByUserId(userId),
        storage.getFollowerCount(userId),
        storage.getFollowingCount(userId)
      ]);
      
      res.json({
        ...userWithoutPassword,
        questionsCount: questions.length,
        answersCount: answers.length,
        followerCount,
        followingCount
      });
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ message: 'Failed to fetch user' });
    }
  });

  app.get('/api/users/:id/questions', async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const questions = await storage.getQuestionsByUserId(userId);
      res.json(questions);
    } catch (error) {
      console.error('Error fetching user questions:', error);
      res.status(500).json({ message: 'Failed to fetch user questions' });
    }
  });

  app.get('/api/users/:id/answers', async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const answers = await storage.getAnswersByUserId(userId);
      res.json(answers);
    } catch (error) {
      console.error('Error fetching user answers:', error);
      res.status(500).json({ message: 'Failed to fetch user answers' });
    }
  });

  // Follow routes
  app.post('/api/follow', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    try {
      const validatedData = insertFollowSchema.parse({
        followerId: req.user.id,
        followingId: req.body.followingId
      });
      
      // Check if already following
      const existingFollow = await storage.getFollowByUserIds(
        validatedData.followerId,
        validatedData.followingId
      );
      
      if (existingFollow) {
        return res.status(400).json({ message: 'Already following this user' });
      }
      
      const follow = await storage.createFollow(validatedData);
      res.status(201).json(follow);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid follow data', errors: error.errors });
      }
      console.error('Error creating follow:', error);
      res.status(500).json({ message: 'Failed to follow user' });
    }
  });

  app.delete('/api/follow/:id', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    try {
      const followingId = parseInt(req.params.id);
      const success = await storage.deleteFollow(req.user.id, followingId);
      
      if (!success) {
        return res.status(404).json({ message: 'Follow relationship not found' });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error unfollowing user:', error);
      res.status(500).json({ message: 'Failed to unfollow user' });
    }
  });

  app.get('/api/user/following', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    try {
      const follows = await storage.getFollowsByFollowerId(req.user.id);
      const followingIds = follows.map(follow => follow.followingId);
      
      if (followingIds.length === 0) {
        return res.json([]);
      }
      
      const users = await storage.getUsersByIds(followingIds);
      
      // Remove passwords
      const usersWithoutPasswords = users.map(user => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      
      res.json(usersWithoutPasswords);
    } catch (error) {
      console.error('Error fetching following users:', error);
      res.status(500).json({ message: 'Failed to fetch following users' });
    }
  });

  // Message routes
  app.get('/api/messages/chats', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    try {
      const recentChats = await storage.getRecentChats(req.user.id);
      
      if (!recentChats || recentChats.length === 0) {
        // Return empty array instead of error if no chats found
        return res.json([]);
      }
      
      // Remove sensitive data
      const sanitizedChats = recentChats.map(chat => {
        const { password, ...userWithoutPassword } = chat.user;
        return {
          ...chat,
          user: userWithoutPassword
        };
      });
      
      res.json(sanitizedChats);
    } catch (error) {
      console.error('Error fetching chats:', error);
      // Return empty array instead of error for better client experience
      res.json([]);
    }
  });

  app.get('/api/messages/:userId', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    try {
      const otherUserId = parseInt(req.params.userId);
      
      if (isNaN(otherUserId)) {
        return res.status(400).json({ message: 'Invalid user ID' });
      }
      
      // Verify the other user exists
      const otherUser = await storage.getUser(otherUserId);
      if (!otherUser) {
        return res.json([]);  // Return empty array if user doesn't exist
      }
      
      const messages = await storage.getMessagesBetweenUsers(req.user.id, otherUserId);
      
      // Mark all messages as read if they are sent to the current user
      for (const message of messages) {
        if (message.receiverId === req.user.id && !message.read) {
          await storage.markMessageAsRead(message.id);
        }
      }
      
      res.json(messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      // Return empty array instead of error for better client experience
      res.json([]);
    }
  });
  
  // Endpoint to mark all messages from a user as read
  app.post('/api/messages/:userId/read', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    try {
      const otherUserId = parseInt(req.params.userId);
      
      if (isNaN(otherUserId)) {
        return res.status(400).json({ message: 'Invalid user ID' });
      }
      
      // Verify the other user exists
      const otherUser = await storage.getUser(otherUserId);
      if (!otherUser) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Get all messages between the users
      const messages = await storage.getMessagesBetweenUsers(req.user.id, otherUserId);
      
      // Mark all messages from the other user as read
      let markedCount = 0;
      for (const message of messages) {
        if (message.senderId === otherUserId && message.receiverId === req.user.id && !message.read) {
          await storage.markMessageAsRead(message.id);
          markedCount++;
        }
      }
      
      res.json({ success: true, markedCount });
    } catch (error) {
      console.error('Error marking messages as read:', error);
      res.status(500).json({ message: 'Failed to mark messages as read' });
    }
  });

  app.post('/api/messages', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    try {
      const validatedData = insertMessageSchema.parse({
        senderId: req.user.id,
        receiverId: req.body.receiverId,
        content: req.body.content
      });
      
      // Create message - MongoDB event hooks will handle notification
      const message = await storage.createMessage(validatedData);
      
      // The event listener we set up earlier will handle WebSocket notifications
      // when messageEvents.emit('new_message') is triggered by the message model
      
      res.status(201).json(message);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid message data', errors: error.errors });
      }
      console.error('Error creating message:', error);
      res.status(500).json({ message: 'Failed to send message' });
    }
  });

  return server;
}
