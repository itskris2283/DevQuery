import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser, insertUserSchema } from "@shared/schema";
import { z } from "zod";
import UserModel from "./models/user.model";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSecret = process.env.SESSION_SECRET || "devquery-secret-key";
  
  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        // Special handling for mock mode
        if (process.env.USE_MOCK_DB === 'true') {
          console.log('Using mock login strategy');
          // For mock mode, accept any credentials and create a mock user
          return done(null, {
            id: Math.floor(Math.random() * 100000) + 1,
            username: username,
            email: `${username}@example.com`,
            password: 'mock-password-hash',
            fullName: username, 
            bio: null,
            avatarUrl: null,
            role: 'student',
            createdAt: new Date()
          });
        }
        
        // Normal operation for non-mock mode
        const user = await storage.getUserByUsername(username);
        
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        } else {
          return done(null, user);
        }
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      
      // If we're in mock mode and the session refers to a user not in our mock DB
      if (!user && process.env.USE_MOCK_DB === 'true') {
        console.log(`Mock mode: Creating temporary user for session ID ${id}`);
        // Create a temporary mock user for the session to avoid errors
        const tempUser = {
          id: id,
          username: `user_${id}`,
          email: `user_${id}@example.com`,
          password: 'password-hash',
          fullName: `User ${id}`,
          bio: null,
          avatarUrl: null,
          role: 'student',
          createdAt: new Date()
        };
        done(null, tempUser);
        return;
      }
      
      done(null, user);
    } catch (error) {
      console.error('Error deserializing user:', error);
      done(error);
    }
  });

  // Extended user schema for registration
  const registerSchema = insertUserSchema.extend({
    email: z.string().email("Invalid email address"),
    fullName: z.string().min(1, "Full name is required"),
    role: z.enum(["student", "teacher"]).default("student"),
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      // Validate user input
      const userData = registerSchema.parse(req.body);
      
      // Check if username already exists
      const existingUser = await storage.getUserByUsername(userData.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      
      // Hash password and create user
      const hashedPassword = await hashPassword(userData.password);
      
      // Ensure all required fields are passed to createUser
      const user = await storage.createUser({
        username: userData.username,
        email: userData.email,
        password: hashedPassword,
        fullName: userData.fullName,
        role: userData.role || "student",
        bio: userData.bio || null,
        avatarUrl: userData.avatarUrl || null,
      });

      // Log the user in
      req.login(user, (err) => {
        if (err) return next(err);
        
        // Return user info without password
        const { password, ...userWithoutPassword } = user;
        res.status(201).json(userWithoutPassword);
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid registration data", 
          errors: error.errors 
        });
      }
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed. Please try again later." });
    }
  });

  app.post("/api/login", (req, res, next) => {
    // Normal authentication with mock support already in the LocalStrategy
    passport.authenticate("local", (err: Error | null, user: Express.User | undefined, info: { message: string }) => {
      if (err) return next(err);
      
      if (!user) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      
      req.login(user, (err) => {
        if (err) return next(err);
        
        // Return user info without password
        const { password, ...userWithoutPassword } = user;
        res.status(200).json(userWithoutPassword);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }
    
    // Return user info without password
    const { password, ...userWithoutPassword } = req.user;
    res.json(userWithoutPassword);
  });

  // Change password endpoint
  app.post("/api/users/change-password", async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const { currentPassword, newPassword } = req.body;
      
      // Validate input
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }
      
      // Get the current user
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Special handling for mock mode
      if (process.env.USE_MOCK_DB === 'true') {
        console.log('Mock mode: Password change simulated');
        return res.status(200).json({ message: "Password updated successfully" });
      }
      
      // Verify current password
      const isPasswordValid = await comparePasswords(currentPassword, user.password);
      if (!isPasswordValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }
      
      // Hash new password
      const hashedPassword = await hashPassword(newPassword);
      
      // Update user in database with new password
      const userDoc = await UserModel.findOne({ id: user.id });
      if (!userDoc) {
        return res.status(404).json({ message: "User not found in database" });
      }
      
      // Update password
      userDoc.password = hashedPassword;
      userDoc.updatedAt = new Date();
      await userDoc.save();
      
      return res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Error changing password:", error);
      return res.status(500).json({ message: "Failed to change password. Please try again later." });
    }
  });

  // Authentication middleware for protected routes
  const requireAuth = (req: any, res: any, next: any) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: 'Unauthorized' });
  };

  // Helper to get the current authenticated user
  const getCurrentUser = (req: any) => {
    return req.user;
  };

  return { requireAuth, getCurrentUser };
}
