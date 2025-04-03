# DevQuery - Developer Q&A Platform

A modern StackOverflow-type website built using the MERN stack with MySQL database, allowing users to post questions and answers. The platform distinguishes between student and teacher roles during login.

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
3. MySQL (optional - the app can run with in-memory storage for development)

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
- `DATABASE_URL`: Your MySQL connection string (if using a database)
- `SESSION_SECRET`: A random string for session encryption
- `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_HOST`: Optional MySQL configuration if not using a full connection string

4. **Start the application**

```bash
npm run dev
```

The application will be available at http://localhost:5000

### Notes for Windows Users

- If you encounter EADDRINUSE errors, make sure port 5000 is not in use by another application
- If you don't have MySQL installed, the application will automatically fall back to in-memory storage for development purposes
- All file paths in the application use forward slashes (`/`) which are compatible with Windows
- The application will automatically detect Windows and use appropriate network settings (using 'localhost' instead of '0.0.0.0')
- If you still encounter binding issues, you can explicitly set `HOST=localhost` in your `.env` file
- For production deployment on Windows, use the following command instead of `npm start`:
  ```
  set NODE_ENV=production && node dist/index.js
  ```
- When setting environment variables in Windows, use `set VARIABLE=value` syntax
- If you need to use a different port, you can set the `PORT` environment variable in your `.env` file

## Database Setup (Optional)

If you want to use MySQL for persistent storage:

1. Install MySQL on your machine (recommended version: 8.0 or later)
2. Create a new database: `CREATE DATABASE devquery;`
3. Update the `DATABASE_URL` in your `.env` file with the connection string

The application will **automatically create all required tables** when it connects to the database for the first time. No need to run any migration commands manually!

### MySQL Connection on Windows

If you're having issues connecting to MySQL on Windows:

1. **Local MySQL setup**:
   ```
   # In your .env file:
   DATABASE_URL=mysql://username:password@localhost:3306/devquery
   ```
   Replace `username` and `password` with your actual MySQL credentials.

   Alternatively, you can use individual environment variables:
   ```
   MYSQL_USER=root
   MYSQL_PASSWORD=your_password
   MYSQL_DATABASE=devquery
   MYSQL_HOST=localhost
   ```

2. **MySQL Authentication**:
   - Make sure you've created a MySQL user with a password
   - The default MySQL user is 'root', which may or may not have a password depending on your installation
   - To create a new MySQL user with password:
     ```
     # In MySQL command line or MySQL Workbench:
     CREATE USER 'myuser'@'localhost' IDENTIFIED BY 'mypassword';
     GRANT ALL PRIVILEGES ON devquery.* TO 'myuser'@'localhost';
     FLUSH PRIVILEGES;
     ```

3. **Connection Issues Troubleshooting**:
   - Check that MySQL service is running (Services app in Windows)
   - Verify that your user has proper access permissions
   - Try using `127.0.0.1` instead of `localhost` in your connection string
   - If nothing works, you can use PlanetScale (cloud MySQL) which works on all platforms

4. **Using a cloud database (PlanetScale)** instead of local MySQL:
   - Sign up for a free account at https://planetscale.com
   - Create a new database and get your connection string
   - Update your `.env` file with the provided connection string
   - Format should be: `mysql://username:password@aws.connect.psdb.cloud/mydatabase?sslmode=required`

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