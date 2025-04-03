import express, { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { connectToDatabase } from "./mongo-db";
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

// Configure multer for file uploads
const storageDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, storageDir);
  },
  filename: (_req, file, cb) => {
    // Generate a unique filename with original extension
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: uploadStorage,
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

export async function registerRoutes(app: Express): Promise<Server> {
  try {
    // Initialize MongoDB connection
    await connectToDatabase();
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    // Continue regardless of MongoDB connection status
    // to allow for fallback to other storage methods
  }

  // Set up authentication routes
  setupAuth(app);

  // Add a health check endpoint for diagnostics
  app.get('/api/health', (req, res) => {
    res.status(200).send('Server is running');
  });

  // Create HTTP server
  const httpServer = createServer(app);

  // Create WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Map to keep track of connected clients by user ID
  const connectedClients = new Map<number, WebSocket[]>();
  
  // Function to broadcast online users to all clients
  const broadcastOnlineUsers = () => {
    const onlineUserIds = Array.from(connectedClients.keys());
    
    const message = JSON.stringify({
      type: 'online_users',
      userIds: onlineUserIds
    });
    
    // Send to all connected clients
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  };

  // Set up WebSocket connection for chat
  wss.on('connection', (ws, req) => {
    console.log('WebSocket client connected');
    let userId: number | null = null;
    
    // Send initial connection confirmation
    ws.send(JSON.stringify({ type: 'connection', message: 'Connected to DevQuery chat' }));

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Register client with a user ID
        if (message.type === 'register') {
          userId = parseInt(message.userId);
          if (!isNaN(userId)) {
            console.log(`Registering WebSocket client for user ID: ${userId}`);
            
            // Add this connection to the map
            if (!connectedClients.has(userId)) {
              connectedClients.set(userId, []);
            }
            connectedClients.get(userId)?.push(ws);
            
            // Confirm registration
            ws.send(JSON.stringify({
              type: 'registered',
              userId
            }));
            
            // Send current online users to the newly connected client
            const onlineUserIds = Array.from(connectedClients.keys());
            ws.send(JSON.stringify({
              type: 'online_users',
              userIds: onlineUserIds
            }));
            
            // Broadcast updated online users list to all clients
            broadcastOnlineUsers();
          }
        }
        // We don't implement message sending via WebSocket anymore
        // That's handled through the REST API
        
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Error processing message'
        }));
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      
      // Remove this connection from the map if user was registered
      if (userId !== null) {
        const userConnections = connectedClients.get(userId);
        if (userConnections) {
          const index = userConnections.indexOf(ws);
          if (index !== -1) {
            userConnections.splice(index, 1);
          }
          
          // Remove the entry completely if no connections left
          if (userConnections.length === 0) {
            connectedClients.delete(userId);
            
            // Broadcast updated online users list
            broadcastOnlineUsers();
          }
        }
      }
    });
  });

  // File upload endpoint
  app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ imageUrl });
  });

  // Serve uploaded files
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
      const validatedData = questionWithTagsSchema.parse(req.body);
      const { tags, ...questionData } = validatedData;
      
      const question = await storage.createQuestion(req.user.id, questionData, tags);
      res.status(201).json(question);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid question data', errors: error.errors });
      }
      console.error('Error creating question:', error);
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
      
      const message = await storage.createMessage(validatedData);
      
      // Notify recipient via WebSocket if they are connected
      if (connectedClients.has(validatedData.receiverId)) {
        const recipientConnections = connectedClients.get(validatedData.receiverId);
        if (recipientConnections && recipientConnections.length > 0) {
          console.log(`Sending message notification to user ${validatedData.receiverId}`);
          
          // Get sender info to include in notification
          const sender = await storage.getUser(req.user.id);
          if (sender) {
            const { password, ...senderWithoutPassword } = sender;
            
            // Send to all connections for this user (in case they have multiple tabs/devices)
            recipientConnections.forEach(ws => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'new_message',
                  message: {
                    ...message,
                    sender: senderWithoutPassword
                  }
                }));
              }
            });
          }
        }
      }
      
      res.status(201).json(message);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid message data', errors: error.errors });
      }
      console.error('Error creating message:', error);
      res.status(500).json({ message: 'Failed to send message' });
    }
  });

  return httpServer;
}
