import express, { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import WebSocket from "ws";
import { storage } from "./storage";
import { setupAuth } from "./auth";
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

  // Set up WebSocket connection for chat
  wss.on('connection', (ws, req) => {
    console.log('WebSocket client connected');
    
    // Send initial connection confirmation
    ws.send(JSON.stringify({ type: 'connection', message: 'Connected to DevQuery chat' }));

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'chat') {
          // Handle chat messages
          const { senderId, receiverId, content } = message;
          
          if (!senderId || !receiverId || !content) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Invalid message format'
            }));
            return;
          }
          
          // Store the message
          const newMessage = await storage.createMessage({
            senderId,
            receiverId,
            content
          });
          
          // Send to all connected clients who are part of this conversation
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'chat',
                message: newMessage
              }));
            }
          });
        }
        
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
      
      res.json(question);
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
      res.status(500).json({ message: 'Failed to fetch chats' });
    }
  });

  app.get('/api/messages/:userId', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    try {
      const otherUserId = parseInt(req.params.userId);
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
      res.status(500).json({ message: 'Failed to fetch messages' });
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
