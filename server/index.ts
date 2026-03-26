import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  if (process.env.NODE_ENV !== "production") {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // or the CLI argument --port / --port=X, then fallback to 3000.
  // This is needed to support both environment override and non-root user defaults.
  const parseNumericPort = (raw: string | undefined): number | undefined => {
    if (!raw || raw.trim() === "") return undefined;
    const candidate = Number(raw.replace(/\D/g, "") || raw);
    if (!Number.isFinite(candidate) || candidate <= 0 || candidate > 65535) return undefined;
    return Math.floor(candidate);
  };

  const parsePortArg = (): number | undefined => {
    const exactArg = process.argv.find((arg) => arg.startsWith("--port="));
    if (exactArg) {
      return parseNumericPort(exactArg.split("=")[1]);
    }

    const argIndex = process.argv.findIndex((arg) => arg === "--port" || arg === "-p");
    if (argIndex >= 0 && process.argv[argIndex + 1]) {
      return parseNumericPort(process.argv[argIndex + 1]);
    }

    return undefined;
  };

  const cliPort = parsePortArg();
  const envPort = parseNumericPort(process.env.PORT);
  const port = cliPort ?? envPort ?? 3000;

  if (!Number.isFinite(port) || port <= 0 || port >= 65536) {
    throw new Error(`Invalid port configured: env=${process.env.PORT ?? "<unset>"}, cli=${JSON.stringify(process.argv)}`);
  }

  httpServer.listen(
    {
      port,
      host: "127.0.0.1",
      reusePort: false,
    },
    () => {
      log(`serving on http://localhost:${port}`);
    },
  );
})();
