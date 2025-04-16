# DevQuery - Developer Q&A Platform

A modern StackOverflow-type website built using the MERN stack (MongoDB, Express, React, Node.js), allowing users to post questions and answers. The platform distinguishes between student and teacher roles during login.

## Features

- User authentication with role-based access (student/teacher)
- Question and answer posting with image support
- Upvoting/downvoting system
- Tag-based question categorization
- Real-time chat system using WebSockets
- User following system
- Dark/light theme toggle
- Responsive design for desktop and mobile

## Prerequisites

1. Node.js (v16 or later)
2. npm package manager
3. MongoDB (v4.4 or later)

## Setup Steps

1. **Clone the repository or download as ZIP**

```bash
git clone <repository-url>
cd devquery
```

Or download the ZIP file, extract it, and navigate to the extracted folder.

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment variables**

Create a `.env` file in the root directory based on the `.env.example` file:

```bash
# Linux/macOS
cp .env.example .env

# Windows
copy .env.example .env
```

Then edit the `.env` file to add your specific configuration:
- `MONGODB_URI`: Your MongoDB connection string
- `SESSION_SECRET`: A random string for session encryption

Example configuration:
```
# MongoDB connection string
MONGODB_URI=mongodb://localhost:27017/devquery

# Session secret (generate a random string)
SESSION_SECRET=your-secret-key-should-be-long-and-random

# Port for the server to listen on (default is 5000)
PORT=5000

# Network address binding
HOST=0.0.0.0
```

4. **Start the application**

```bash
npm run dev
```

The application will be available at http://localhost:5000

## MongoDB Setup

### Local MongoDB Installation

1. **Install MongoDB Community Edition**:
   - [Windows Installation Guide](https://docs.mongodb.com/manual/tutorial/install-mongodb-on-windows/)
   - [macOS Installation Guide](https://docs.mongodb.com/manual/tutorial/install-mongodb-on-os-x/)
   - [Linux Installation Guide](https://docs.mongodb.com/manual/administration/install-on-linux/)

2. **Start MongoDB service**:
   - Windows: MongoDB is installed as a service and should be running automatically
   - macOS: `brew services start mongodb-community`
   - Linux: `sudo systemctl start mongod`

3. **Verify MongoDB is running**:
   ```bash
   mongosh
   ```
   You should see the MongoDB shell connect successfully.

4. **Update your .env file**:
   ```
   MONGODB_URI=mongodb://localhost:27017/devquery
   ```

### Using MongoDB Atlas (Cloud)

If you prefer using a cloud-hosted MongoDB instance:

1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
2. Create a new cluster
3. Create a database user with read/write privileges
4. Add your IP address to the IP Access List (or allow access from anywhere for development)
5. Get your connection string by clicking "Connect" > "Connect your application"
6. Update your .env file with the connection string:
   ```
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/devquery?retryWrites=true&w=majority
   ```
   Replace `<username>`, `<password>`, and `<cluster>` with your actual credentials.

## Notes for Windows Users

- The application automatically detects Windows and uses appropriate network settings
- If you encounter EADDRINUSE errors, make sure port 5000 is not in use by another application
- You can explicitly set `HOST=localhost` in your `.env` file if needed
- For MongoDB on Windows, make sure the MongoDB service is running (check in Windows Services)
- If you need to use a different port, you can set the `PORT` environment variable in your `.env` file

## Project Structure

- `client/`: React frontend
- `server/`: Express backend
- `shared/`: Shared types and schemas
- `uploads/`: Legacy folder for previously uploaded files (support maintained for backward compatibility)

## Available Scripts

- `npm run dev`: Start the development server
- `npx tsx server/scripts/migrate-uploads.ts`: Migrate existing image uploads from filesystem to MongoDB

## Image Storage

DevQuery now uses MongoDB for storing uploaded images instead of the filesystem:

1. Images are stored as binary data in the MongoDB database using the GridFS-like approach
2. This improves deployment portability and eliminates filesystem dependencies
3. The `/api/upload` endpoint processes uploads and stores them in MongoDB
4. Images are served through the `/api/images/:id` endpoint

If you're upgrading from a previous version that used filesystem storage, run the migration script:
```bash
npx tsx server/scripts/migrate-uploads.ts
```

This script will:
- Scan the uploads directory for existing images
- Store each image in MongoDB
- Update question and answer documents to reference the new image locations
- Preserve backward compatibility for existing image URLs

## Important Information for Downloaders

### MongoDB Requirement

This application is designed to work with MongoDB. There are several options:

1. **Local MongoDB**: Install MongoDB locally (see installation instructions above)
2. **MongoDB Atlas**: Use a cloud-hosted MongoDB instance (see Atlas setup instructions above)
3. **MongoDB Docker**: Run MongoDB in a Docker container:
   ```bash
   docker run -d -p 27017:27017 --name devquery-mongo mongo:latest
   ```
   Then set `MONGODB_URI=mongodb://localhost:27017/devquery` in your .env file

4. **Development Mode Without MongoDB**: For development or testing purposes, you can run the application without MongoDB by setting:
   ```
   USE_MOCK_DB=true
   ```
   in your `.env` file. This will use an in-memory storage implementation that doesn't persist data across restarts.

If you encounter connection errors, confirm that:
1. MongoDB is running and accessible
2. Your connection string in the .env file is correct
3. If using MongoDB Atlas, your IP address is allowed in the access list
4. For quick testing, set `USE_MOCK_DB=true` to bypass the MongoDB requirement

## License

MIT