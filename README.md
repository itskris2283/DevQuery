# DevQuery - Developer Q&A Platform

A modern StackOverflow-type website built using the MERN stack with PostgreSQL database, allowing users to post questions and answers. The platform distinguishes between student and teacher roles during login.

## Features

- User authentication with role-based access (student/teacher)
- Question and answer posting with image support
- Upvoting/downvoting system
- Tag-based question categorization
- Real-time chat system using WebSockets
- User following system
- Dark/light theme toggle
- Responsive design for desktop and mobile

## Installation on Windows

### Prerequisites

1. Node.js (v16 or later)
2. npm package manager
3. PostgreSQL (optional - the app can run with in-memory storage for development)

### Setup Steps

1. **Clone the repository**

```bash
git clone <repository-url>
cd devquery
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment variables**

Create a `.env` file in the root directory based on the `.env.example` file:

```
# Copy the example file
copy .env.example .env
```

Then edit the `.env` file to add your specific configuration:
- `DATABASE_URL`: Your PostgreSQL connection string (if using a database)
- `SESSION_SECRET`: A random string for session encryption

4. **Start the application**

```bash
npm run dev
```

The application will be available at http://localhost:5000

### Notes for Windows Users

- If you encounter EADDRINUSE errors, make sure port 5000 is not in use by another application
- If you don't have PostgreSQL installed, the application will automatically fall back to in-memory storage for development purposes
- All file paths in the application use forward slashes (`/`) which are compatible with Windows
- For production deployment on Windows, use the following command instead of `npm start`:
  ```
  set NODE_ENV=production && node dist/index.js
  ```
- When setting environment variables in Windows, use `set VARIABLE=value` syntax

## Database Setup (Optional)

If you want to use PostgreSQL for persistent storage:

1. Install PostgreSQL on your machine
2. Create a new database
3. Update the `DATABASE_URL` in your `.env` file with the connection string
4. The application will automatically create the necessary tables

## Project Structure

- `client/`: React frontend
- `server/`: Express backend
- `shared/`: Shared types and schemas
- `uploads/`: User uploaded files

## Available Scripts

- `npm run dev`: Start the development server
- `npm run db:push`: Push schema changes to the database

## License

MIT