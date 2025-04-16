/**
 * Script to migrate existing uploaded images from the filesystem to MongoDB
 * 
 * Run with:
 * npx tsx server/scripts/migrate-uploads.ts
 */

import fs from 'fs';
import path from 'path';
import { connectToDatabase, disconnectFromMongoDB } from '../mongo-db';
import ImageFile, { getImageFileModel } from '../models/image-file.model';
import QuestionModel from '../models/question.model';
import AnswerModel from '../models/answer.model';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Path to uploads directory
const uploadsDir = path.join(process.cwd(), 'uploads');
const migratedDir = path.join(process.cwd(), 'uploads-migrated');

// Function to update image URLs in database
async function updateImageUrls(oldPath: string, newId: number) {
  try {
    // Extract the filename from the path
    const filename = path.basename(oldPath);
    const oldUrl = `/uploads/${filename}`;
    const newUrl = `/api/images/${newId}`;
    
    console.log(`Updating references from ${oldUrl} to ${newUrl}`);
    
    if (process.env.USE_MOCK_DB === 'true') {
      console.log('Mock mode: Would update image URLs in database');
      return;
    }
    
    // Update question image URLs
    await QuestionModel.updateMany(
      { imageUrl: oldUrl },
      { $set: { imageUrl: newUrl } }
    );
    
    // Update answer image URLs
    await AnswerModel.updateMany(
      { imageUrl: oldUrl },
      { $set: { imageUrl: newUrl } }
    );
    
    console.log(`Updated references from ${oldUrl} to ${newUrl}`);
  } catch (error) {
    console.error('Error updating image URLs:', error);
  }
}

// Main migration function
async function migrateUploads() {
  try {
    console.log('Migration script starting...');
    console.log(`Mock mode: ${process.env.USE_MOCK_DB === 'true' ? 'ON' : 'OFF'}`);
    
    // Create migrated directory if it doesn't exist (for backups)
    if (!fs.existsSync(migratedDir)) {
      fs.mkdirSync(migratedDir, { recursive: true });
    }
    
    // Connect to MongoDB
    if (process.env.USE_MOCK_DB !== 'true') {
      console.log('Connecting to MongoDB...');
      await connectToDatabase();
    } else {
      console.log('Running in mock mode, not connecting to MongoDB');
    }
    
    // Check if uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
      console.log('No uploads directory found, nothing to migrate');
      return;
    }
    
    // Get all files in the uploads directory
    const files = fs.readdirSync(uploadsDir);
    console.log(`Found ${files.length} files to migrate`);
    
    // Get the appropriate image file model (real or mock)
    const ImageFileModel = getImageFileModel();
    
    // Process each file
    for (const filename of files) {
      const filePath = path.join(uploadsDir, filename);
      
      // Skip directories
      if (fs.statSync(filePath).isDirectory()) {
        console.log(`Skipping directory: ${filename}`);
        continue;
      }
      
      try {
        console.log(`Processing ${filename}...`);
        
        // Read file data
        const fileData = fs.readFileSync(filePath);
        
        // Determine content type based on extension
        const ext = path.extname(filename).toLowerCase();
        let contentType = 'application/octet-stream';
        
        if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        else if (ext === '.png') contentType = 'image/png';
        else if (ext === '.gif') contentType = 'image/gif';
        else if (ext === '.webp') contentType = 'image/webp';
        else if (ext === '.svg') contentType = 'image/svg+xml';
        
        // Create an instance of the model (will be MockImageFile in mock mode)
        const imageFile = new ImageFileModel({
          filename,
          originalname: filename,
          contentType,
          size: fileData.length,
          data: fileData,
          metadata: {
            migratedFromFilesystem: true
          },
          uploadDate: fs.statSync(filePath).mtime
        });
        
        // Save to storage (MongoDB or mock storage)
        const savedImage = await imageFile.save();
        console.log(`Saved ${filename} to storage with ID ${savedImage.id}`);
        
        // Update image URLs in database
        await updateImageUrls(filePath, savedImage.id);
        
        // Backup original file
        if (process.env.BACKUP_UPLOADS === 'true') {
          const backupPath = path.join(migratedDir, filename);
          fs.copyFileSync(filePath, backupPath);
          console.log(`Backed up original file to ${backupPath}`);
        }
        
        // Only remove original when instructed and not in mock mode
        if (process.env.REMOVE_ORIGINALS === 'true' && process.env.USE_MOCK_DB !== 'true') {
          fs.unlinkSync(filePath);
          console.log(`Removed original file: ${filePath}`);
        }
      } catch (error) {
        console.error(`Error processing ${filename}:`, error);
      }
    }
    
    console.log('Migration complete!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    // Disconnect only if we're not in mock mode
    if (process.env.USE_MOCK_DB !== 'true') {
      await disconnectFromMongoDB();
    }
  }
}

// Run the migration
migrateUploads().catch(error => {
  console.error('Error during migration:', error);
  process.exit(1);
}); 