// Type declarations to fix express-session import issues

declare module 'express-session' {
  import { EventEmitter } from 'events';
  import { IncomingMessage, ServerResponse } from 'http';

  // Extend session namespace
  namespace session {
    interface SessionData {
      [key: string]: any;
      cookie: SessionCookieData;
    }

    interface SessionCookieData {
      originalMaxAge: number | null;
      path: string;
      maxAge: number | null;
      expires: Date | null;
      secure?: boolean;
      httpOnly: boolean;
      domain?: string;
      sameSite?: boolean | 'lax' | 'strict' | 'none';
    }

    interface SessionOptions {
      secret: string | string[];
      name?: string;
      store?: Store;
      cookie?: Partial<SessionCookieData>;
      genid?: (req: IncomingMessage) => string;
      rolling?: boolean;
      resave?: boolean;
      proxy?: boolean;
      saveUninitialized?: boolean;
      unset?: 'destroy' | 'keep';
    }

    interface Store extends EventEmitter {
      get(sid: string, callback: (err: any, session?: SessionData | null) => void): void;
      set(sid: string, session: SessionData, callback?: (err?: any) => void): void;
      destroy(sid: string, callback?: (err?: any) => void): void;
      touch?(sid: string, session: SessionData, callback?: (err?: any) => void): void;
      all?(callback: (err: any, obj?: { [sid: string]: SessionData } | null) => void): void;
      length?(callback: (err: any, length: number) => void): void;
      clear?(callback?: (err?: any) => void): void;
    }
  }

  // Main function export
  function session(options: session.SessionOptions): (req: any, res: any, next: any) => void;

  // Attach the session namespace as properties
  namespace session {
    export { Store, SessionData };
  }

  // Export default and named exports to support both import styles
  export = session;
  export default session;
} 