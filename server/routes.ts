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
  fileFilter: (_req, file, cb): void => {
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

  // Setup WebSocket server with path to prevent conflict with Vite's WebSocket
  const wss = new WebSocketServer({ 
    server,
    path: '/ws', // Specify a path to avoid conflict with Vite's WebSocket
    perMessageDeflate: false,
    maxPayload: 50 * 1024 // 50KB
  });
  
  // Add server-level error handler
  wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
  });

  // Track connected clients - keep connection objects in a map
  const wsConnections = new Map<WebSocket, WSConnection>();
  
  // Track user connections 
  const userConnections = new Map<number, WebSocket[]>();

  // Helper function to safely send messages to clients
  const safeSend = (ws: WebSocket, message: any) => {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(typeof message === 'string' ? message : JSON.stringify(message));
      }
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      try {
        ws.close();
      } catch (closeError) {
        // Ignore errors during close
      }
    }
  };

  // Helper function to broadcast message to all connected clients of a user
  const sendToUser = (userId: number, message: any) => {
    const connections = userConnections.get(userId);
    if (connections) {
      const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
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
      
      // Check if we're in mock mode
      if (process.env.USE_MOCK_DB === 'true') {
        // In mock mode, just broadcast the IDs without fetching user details
        userConnections.forEach((_, userId) => {
          sendToUser(userId, {
            type: 'online-users',
            userIds: onlineUserIds
          });
        });
        return;
      }
      
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
          safeSend(ws, {
            type: 'error',
            message: 'Invalid message format'
          });
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
              
              // Add this connection to the user connections map
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
            
          case 'ping':
            // Handle ping messages from client (keep-alive)
            // Respond with a pong to acknowledge
            safeSend(ws, {
              type: 'pong',
              timestamp: Date.now()
            });
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
                safeSend(ws, {
                  type: 'error',
                  message: 'Failed to send message'
                });
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
                safeSend(ws, {
                  type: 'error',
                  message: 'Failed to mark message as read'
                });
              }
            }
            break;
            
          default:
            // Unknown message type
            console.warn(`Unknown WebSocket message type: ${message.type}`);
            safeSend(ws, {
              type: 'error',
              message: 'Unknown message type'
            });
            break;
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
        try {
          safeSend(ws, {
            type: 'error',
            message: 'Error processing message'
          });
        } catch (sendError) {
          console.error('Error sending error response:', sendError);
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

  // Rest of the API routes would go here
  // ...

  // Questions endpoints
  // Create a new question
  app.post('/api/questions', requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      // Validate the request body
      const validationResult = questionWithTagsSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: 'Invalid question data',
          errors: validationResult.error.format()
        });
      }

      const { tags, ...questionData } = validationResult.data;
      
      // Create the question
      const question = await storage.createQuestion(user.id, questionData, tags);
      
      return res.status(201).json(question);
    } catch (error) {
      console.error('Error creating question:', error);
      return res.status(500).json({ message: 'Failed to create question' });
    }
  });

  // Get all questions with pagination, sorting, and filtering
  app.get('/api/questions', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = parseInt(req.query.offset as string) || 0;
      const sortBy = (req.query.sortBy as string) || 'newest';
      const filter = req.query.filter as string;

      const questions = await storage.getQuestions({ limit, offset, sortBy, filter });
      
      return res.json(questions);
    } catch (error) {
      console.error('Error getting questions:', error);
      return res.status(500).json({ message: 'Failed to fetch questions' });
    }
  });

  // Get a specific question by ID
  app.get('/api/questions/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid question ID' });
      }
      
      const question = await storage.getQuestionWithDetails(id);
      
      if (!question) {
        return res.status(404).json({ message: 'Question not found' });
      }

      // Increment view count
      await storage.incrementQuestionViews(id);
      
      return res.json(question);
    } catch (error) {
      console.error('Error getting question:', error);
      return res.status(500).json({ message: 'Failed to fetch question' });
    }
  });

  // Update a question
  app.patch('/api/questions/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid question ID' });
      }
      
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      // Check if question exists
      const question = await storage.getQuestion(id);
      if (!question) {
        return res.status(404).json({ message: 'Question not found' });
      }
      
      // Check if user is the owner
      if (question.userId !== user.id) {
        return res.status(403).json({ message: 'You can only update your own questions' });
      }
      
      // Validate request body
      const validationResult = insertQuestionSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: 'Invalid question data',
          errors: validationResult.error.format()
        });
      }
      
      // Update the question
      const updatedQuestion = await storage.updateQuestion(id, validationResult.data);
      
      return res.json(updatedQuestion);
    } catch (error) {
      console.error('Error updating question:', error);
      return res.status(500).json({ message: 'Failed to update question' });
    }
  });

  // Delete a question
  app.delete('/api/questions/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid question ID' });
      }
      
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      // Check if question exists
      const question = await storage.getQuestion(id);
      if (!question) {
        return res.status(404).json({ message: 'Question not found' });
      }
      
      // Check if user is the owner or an admin
      if (question.userId !== user.id && user.role !== 'admin') {
        return res.status(403).json({ message: 'You can only delete your own questions' });
      }
      
      // Delete the question
      const success = await storage.deleteQuestion(id);
      
      if (!success) {
        return res.status(500).json({ message: 'Failed to delete question' });
      }
      
      return res.status(200).json({ message: 'Question deleted successfully' });
    } catch (error) {
      console.error('Error deleting question:', error);
      return res.status(500).json({ message: 'Failed to delete question' });
    }
  });

  // Get answers for a question
  app.get('/api/questions/:id/answers', async (req, res) => {
    try {
      const questionId = parseInt(req.params.id);
      
      if (isNaN(questionId)) {
        return res.status(400).json({ message: 'Invalid question ID' });
      }
      
      const answers = await storage.getAnswersByQuestionId(questionId);
      
      return res.json(answers);
    } catch (error) {
      console.error('Error getting answers:', error);
      return res.status(500).json({ message: 'Failed to fetch answers' });
    }
  });

  // Create an answer
  app.post('/api/answers', requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      // Validate the request body
      const validationResult = insertAnswerSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: 'Invalid answer data',
          errors: validationResult.error.format()
        });
      }

      // Create the answer
      const answer = await storage.createAnswer(user.id, validationResult.data);
      
      return res.status(201).json(answer);
    } catch (error) {
      console.error('Error creating answer:', error);
      return res.status(500).json({ message: 'Failed to create answer' });
    }
  });

  // Update an answer
  app.patch('/api/answers/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid answer ID' });
      }
      
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      // Check if answer exists
      const answer = await storage.getAnswer(id);
      if (!answer) {
        return res.status(404).json({ message: 'Answer not found' });
      }
      
      // Check if user is the owner
      if (answer.userId !== user.id) {
        return res.status(403).json({ message: 'You can only update your own answers' });
      }
      
      // Validate request body
      const validationResult = insertAnswerSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: 'Invalid answer data',
          errors: validationResult.error.format()
        });
      }
      
      // Update the answer
      const updatedAnswer = await storage.updateAnswer(id, validationResult.data);
      
      return res.json(updatedAnswer);
    } catch (error) {
      console.error('Error updating answer:', error);
      return res.status(500).json({ message: 'Failed to update answer' });
    }
  });

  // Delete an answer
  app.delete('/api/answers/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid answer ID' });
      }
      
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      // Check if answer exists
      const answer = await storage.getAnswer(id);
      if (!answer) {
        return res.status(404).json({ message: 'Answer not found' });
      }
      
      // Check if user is the owner or an admin
      if (answer.userId !== user.id && user.role !== 'admin') {
        return res.status(403).json({ message: 'You can only delete your own answers' });
      }
      
      // Delete the answer
      const success = await storage.deleteAnswer(id);
      
      if (!success) {
        return res.status(500).json({ message: 'Failed to delete answer' });
      }
      
      return res.status(200).json({ message: 'Answer deleted successfully' });
    } catch (error) {
      console.error('Error deleting answer:', error);
      return res.status(500).json({ message: 'Failed to delete answer' });
    }
  });

  // Accept an answer (mark as correct)
  app.post('/api/questions/:questionId/accept-answer/:answerId', requireAuth, async (req, res) => {
    try {
      const questionId = parseInt(req.params.questionId);
      const answerId = parseInt(req.params.answerId);
      
      if (isNaN(questionId) || isNaN(answerId)) {
        return res.status(400).json({ message: 'Invalid IDs provided' });
      }
      
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      // Check if question exists and user is the owner
      const question = await storage.getQuestion(questionId);
      if (!question) {
        return res.status(404).json({ message: 'Question not found' });
      }
      
      if (question.userId !== user.id) {
        return res.status(403).json({ message: 'Only the question owner can accept an answer' });
      }
      
      // Mark question as solved with the accepted answer
      const success = await storage.markQuestionAsSolved(questionId, answerId);
      
      if (!success) {
        return res.status(500).json({ message: 'Failed to accept answer' });
      }
      
      return res.json({ message: 'Answer accepted successfully' });
    } catch (error) {
      console.error('Error accepting answer:', error);
      return res.status(500).json({ message: 'Failed to accept answer' });
    }
  });

  // Create or update a vote
  app.post('/api/votes', requireAuth, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      // Validate the request body
      const validationResult = insertVoteSchema.safeParse({
        ...req.body,
        userId: user.id
      });
      
      if (!validationResult.success) {
        return res.status(400).json({
          message: 'Invalid vote data',
          errors: validationResult.error.format()
        });
      }

      // Create or update the vote
      const vote = await storage.createOrUpdateVote(validationResult.data);
      
      return res.status(201).json(vote);
    } catch (error) {
      console.error('Error creating/updating vote:', error);
      return res.status(500).json({ message: 'Failed to process vote' });
    }
  });

  // Get all tags
  app.get('/api/tags', async (req, res) => {
    try {
      const tags = await storage.getAllTags();
      return res.json(tags);
    } catch (error) {
      console.error('Error getting tags:', error);
      return res.status(500).json({ message: 'Failed to fetch tags' });
    }
  });
  
  // Image upload endpoint
  app.post('/api/upload', requireAuth, upload.single('image'), async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: 'No image file provided' });
      }
      
      // Try to store in MongoDB or mock storage
      try {
        const fileData = {
          filename: req.file.originalname,
          originalname: req.file.originalname,
          contentType: req.file.mimetype,
          size: req.file.size,
          data: req.file.buffer,
          metadata: {
            uploadedBy: user.id
          }
        };
        
        const imageFile = new ImageFile(fileData);
        await imageFile.save();
        
        // Return the image URL that can be used to retrieve the image
        return res.json({ 
          imageUrl: `/api/images/${imageFile.id}`
        });
      } catch (storageError) {
        console.error('Error storing image:', storageError);
        
        // Fallback to file system storage
        console.log('Falling back to file system storage...');
        
        // Generate a unique filename
        const filename = `${Date.now()}-${req.file.originalname}`;
        const filePath = path.join(storageDir, filename);
        
        // Write file to disk
        fs.writeFileSync(filePath, req.file.buffer);
        
        // Return the image URL that can be used to retrieve the image
        return res.json({ 
          imageUrl: `/uploads/${filename}`,
          note: 'Used fallback file storage'
        });
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      return res.status(500).json({ message: 'Failed to upload image' });
    }
  });
  
  // Image serving endpoint
  app.get('/api/images/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid image ID' });
      }
      
      // Find the image in MongoDB or mock storage
      const imageFile = await ImageFile.findOne({ id });
      
      if (!imageFile) {
        return res.status(404).json({ message: 'Image not found' });
      }
      
      // Set content type and send the image data
      res.contentType(imageFile.contentType);
      res.send(imageFile.data);
    } catch (error) {
      console.error('Error serving image:', error);
      return res.status(500).json({ message: 'Failed to retrieve image' });
    }
  });
  
  // Serve static files from the uploads directory for backward compatibility
  app.use('/uploads', express.static(storageDir));

  return server;
}
