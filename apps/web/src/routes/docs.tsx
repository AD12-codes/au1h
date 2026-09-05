import { createFileRoute } from "@tanstack/react-router";
import {
  BookOpen,
  Check,
  ChevronRight,
  Code,
  Copy,
  Server,
  Shield,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/docs")({
  component: DocsPage,
});

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <Button
        className="absolute top-2 right-2 size-8"
        onClick={handleCopy}
        size="icon"
        variant="ghost"
      >
        {copied ? (
          <Check className="size-4 text-green-500" />
        ) : (
          <Copy className="size-4" />
        )}
      </Button>
    </div>
  );
}

function DocsPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-muted-foreground text-sm">
          <BookOpen className="size-4" />
          <span>Documentation</span>
        </div>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          au1h Integration Guide
        </h1>
        <p className="text-lg text-muted-foreground">
          Learn how to integrate au1h authentication into your applications.
        </p>
      </div>

      {/* Quick Start Cards */}
      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <Shield className="mb-2 size-8 text-primary" />
            <CardTitle className="text-lg">Secure by Default</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              JWT tokens, JWKS validation, and trusted header propagation.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <Zap className="mb-2 size-8 text-primary" />
            <CardTitle className="text-lg">Two Patterns</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Direct JWT or Proxy pattern - choose what works for your stack.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <Server className="mb-2 size-8 text-primary" />
            <CardTitle className="text-lg">Any Backend</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Works with Node.js, Go, Python, or any language with JWT support.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Authentication Patterns */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-2xl">
          <ChevronRight className="size-5 text-primary" />
          Authentication Patterns
        </h2>

        <Tabs className="w-full" defaultValue="proxy">
          <TabsList className="mb-4">
            <TabsTrigger value="proxy">Proxy Pattern</TabsTrigger>
            <TabsTrigger value="direct">Direct JWT</TabsTrigger>
          </TabsList>

          <TabsContent value="proxy">
            <Card>
              <CardHeader>
                <CardTitle>Server-to-Server (Proxy)</CardTitle>
                <CardDescription>
                  Requests go through au1h gateway which validates sessions and
                  injects trusted headers. Best for internal apps and
                  microservices.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-muted p-4 font-mono text-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge>1</Badge>
                    <span>Your UI → au1h Gateway</span>
                  </div>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge>2</Badge>
                    <span>Gateway validates session</span>
                  </div>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge>3</Badge>
                    <span>Gateway injects: x-user-id, x-app-id</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>4</Badge>
                    <span>Your Backend trusts headers</span>
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 font-medium">Trusted Headers</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <code className="rounded bg-muted px-2 py-1">
                      x-user-id
                    </code>
                    <span className="text-muted-foreground">User's UUID</span>
                    <code className="rounded bg-muted px-2 py-1">
                      x-user-email
                    </code>
                    <span className="text-muted-foreground">User's email</span>
                    <code className="rounded bg-muted px-2 py-1">x-app-id</code>
                    <span className="text-muted-foreground">
                      Application UUID
                    </span>
                    <code className="rounded bg-muted px-2 py-1">
                      x-app-slug
                    </code>
                    <span className="text-muted-foreground">
                      Application slug
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="direct">
            <Card>
              <CardHeader>
                <CardTitle>Client-to-Server (Direct JWT)</CardTitle>
                <CardDescription>
                  Your app gets JWT tokens and validates them directly using
                  JWKS. Best for external apps and mobile applications.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-muted p-4 font-mono text-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge>1</Badge>
                    <span>User logs in via au1h</span>
                  </div>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge>2</Badge>
                    <span>Frontend gets JWT token</span>
                  </div>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge>3</Badge>
                    <span>Frontend sends JWT to your backend</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>4</Badge>
                    <span>Backend validates via JWKS endpoint</span>
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 font-medium">JWKS Endpoint</h4>
                  <CodeBlock code="GET /api/auth/jwks" language="bash" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </section>

      {/* Getting Started */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-2xl">
          <ChevronRight className="size-5 text-primary" />
          Getting Started
        </h2>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge variant="outline">Step 1</Badge>
                Register Your Application
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              <ol className="list-inside list-decimal space-y-2">
                <li>
                  Go to <strong>Applications</strong> →{" "}
                  <strong>Create Application</strong>
                </li>
                <li>Enter your app name and slug</li>
                <li>
                  Add your frontend URLs to <strong>Allowed Origins</strong>
                </li>
                <li>
                  Save and copy your <strong>Application ID</strong> and{" "}
                  <strong>Secret</strong>
                </li>
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge variant="outline">Step 2</Badge>
                Configure Proxy Routes (Optional)
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              <ol className="list-inside list-decimal space-y-2">
                <li>Go to your application's detail page</li>
                <li>
                  Scroll to <strong>Proxy Routes</strong> section
                </li>
                <li>Add routes with path patterns and backend URLs</li>
                <li>Select allowed HTTP methods</li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Code Examples */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-2xl">
          <Code className="size-5 text-primary" />
          Code Examples
        </h2>

        <Tabs className="w-full" defaultValue="nextjs">
          <TabsList className="mb-4 h-auto flex-wrap">
            <TabsTrigger value="nextjs">Next.js</TabsTrigger>
            <TabsTrigger value="nodejs">Node.js</TabsTrigger>
            <TabsTrigger value="go">Go</TabsTrigger>
            <TabsTrigger value="python">Python</TabsTrigger>
          </TabsList>

          <TabsContent className="space-y-4" value="nextjs">
            <Card>
              <CardHeader>
                <CardTitle>Install Better Auth Client</CardTitle>
              </CardHeader>
              <CardContent>
                <CodeBlock code="npm install better-auth" language="bash" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Create Auth Client</CardTitle>
                <CardDescription>lib/auth-client.ts</CardDescription>
              </CardHeader>
              <CardContent>
                <CodeBlock
                  code={`import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_URL,
  fetchOptions: {
    credentials: "include",
    // Every request to au1h must identify your application.
    headers: { "x-app-id": process.env.NEXT_PUBLIC_APP_SLUG! },
  },
});

export const { useSession, signIn, signOut } = authClient;`}
                  language="typescript"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Make API Calls (Proxy Pattern)</CardTitle>
                <CardDescription>lib/api.ts</CardDescription>
              </CardHeader>
              <CardContent>
                <CodeBlock
                  code={`const API_BASE = process.env.NEXT_PUBLIC_AUTH_URL;
const APP_SLUG = process.env.NEXT_PUBLIC_APP_SLUG;

export async function fetchTodos() {
  const response = await fetch(\`\${API_BASE}/proxy/todos\`, {
    headers: {
      "x-app-id": APP_SLUG,
    },
    credentials: "include",
  });
  return response.json();
}`}
                  language="typescript"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent className="space-y-4" value="nodejs">
            <Card>
              <CardHeader>
                <CardTitle>Install Dependencies</CardTitle>
              </CardHeader>
              <CardContent>
                <CodeBlock code="npm install express jose" language="bash" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Auth Middleware (Proxy Pattern)</CardTitle>
                <CardDescription>middleware/auth.js</CardDescription>
              </CardHeader>
              <CardContent>
                <CodeBlock
                  code={`export function authMiddleware(req, res, next) {
  const userId = req.headers["x-user-id"];
  const userEmail = req.headers["x-user-email"];
  const appId = req.headers["x-app-id"];

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.user = { id: userId, email: userEmail, appId };
  next();
}`}
                  language="javascript"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Auth Middleware (Direct JWT)</CardTitle>
                <CardDescription>middleware/auth.js</CardDescription>
              </CardHeader>
              <CardContent>
                <CodeBlock
                  code={`import * as jose from "jose";

const AU1H_URL = process.env.AU1H_URL;
const APP_SLUG = process.env.AU1H_APP_SLUG; // same value as x-app-id
const JWKS = jose.createRemoteJWKSet(
  new URL(\`\${AU1H_URL}/api/auth/jwks\`)
);

export async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.slice(7);
  
  if (!token) {
    return res.status(401).json({ error: "Missing token" });
  }

  try {
    // EdDSA signature via JWKS; aud = your slug rejects other apps' tokens.
    const { payload } = await jose.jwtVerify(token, JWKS, {
      algorithms: ["EdDSA"],
      issuer: AU1H_URL,
      audience: APP_SLUG,
    });
    req.user = {
      id: payload.sub,
      email: payload.email,
      appId: payload.applicationId,
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
}`}
                  language="javascript"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent className="space-y-4" value="go">
            <Card>
              <CardHeader>
                <CardTitle>Install Dependencies</CardTitle>
              </CardHeader>
              <CardContent>
                <CodeBlock
                  code="go get github.com/lestrrat-go/jwx/v2/jwk"
                  language="bash"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Auth Middleware (Proxy Pattern)</CardTitle>
                <CardDescription>middleware/auth.go</CardDescription>
              </CardHeader>
              <CardContent>
                <CodeBlock
                  code={`type UserContext struct {
    ID    string
    Email string
    AppID string
}

func AuthMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        userID := r.Header.Get("X-User-Id")
        if userID == "" {
            http.Error(w, "Unauthorized", http.StatusUnauthorized)
            return
        }

        user := UserContext{
            ID:    userID,
            Email: r.Header.Get("X-User-Email"),
            AppID: r.Header.Get("X-App-Id"),
        }

        ctx := context.WithValue(r.Context(), "user", user)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}`}
                  language="go"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent className="space-y-4" value="python">
            <Card>
              <CardHeader>
                <CardTitle>Install Dependencies</CardTitle>
              </CardHeader>
              <CardContent>
                <CodeBlock
                  code="pip install fastapi python-jose httpx"
                  language="bash"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Auth Dependency (Proxy Pattern)</CardTitle>
                <CardDescription>middleware/auth.py</CardDescription>
              </CardHeader>
              <CardContent>
                <CodeBlock
                  code={`from fastapi import Request, HTTPException
from dataclasses import dataclass

@dataclass
class User:
    id: str
    email: str
    app_id: str

async def get_current_user(request: Request) -> User:
    user_id = request.headers.get("x-user-id")
    
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    return User(
        id=user_id,
        email=request.headers.get("x-user-email", ""),
        app_id=request.headers.get("x-app-id", "")
    )`}
                  language="python"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Using the Dependency</CardTitle>
                <CardDescription>main.py</CardDescription>
              </CardHeader>
              <CardContent>
                <CodeBlock
                  code={`from fastapi import FastAPI, Depends
from middleware.auth import get_current_user, User

app = FastAPI()

@app.get("/api/todos")
async def get_todos(user: User = Depends(get_current_user)):
    # user.id, user.email, user.app_id are available
    return {"todos": [], "user_id": user.id}`}
                  language="python"
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </section>

      {/* API Reference */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-2xl">
          <ChevronRight className="size-5 text-primary" />
          API Reference
        </h2>

        <Card>
          <CardHeader>
            <CardTitle>Authentication Endpoints</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-4">
                <Badge className="w-16 justify-center">POST</Badge>
                <code className="flex-1">/api/auth/sign-in/email</code>
                <span className="text-muted-foreground">Sign in</span>
              </div>
              <div className="flex items-center gap-4">
                <Badge className="w-16 justify-center">POST</Badge>
                <code className="flex-1">/api/auth/sign-up/email</code>
                <span className="text-muted-foreground">Sign up</span>
              </div>
              <div className="flex items-center gap-4">
                <Badge className="w-16 justify-center">POST</Badge>
                <code className="flex-1">/api/auth/sign-out</code>
                <span className="text-muted-foreground">Sign out</span>
              </div>
              <div className="flex items-center gap-4">
                <Badge className="w-16 justify-center" variant="secondary">
                  GET
                </Badge>
                <code className="flex-1">/api/auth/session</code>
                <span className="text-muted-foreground">Get session</span>
              </div>
              <div className="flex items-center gap-4">
                <Badge className="w-16 justify-center" variant="secondary">
                  GET
                </Badge>
                <code className="flex-1">/api/auth/jwks</code>
                <span className="text-muted-foreground">Get JWKS</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Proxy Endpoint</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-4">
                <Badge className="w-16 justify-center" variant="outline">
                  ANY
                </Badge>
                <code className="flex-1">/proxy/*</code>
                <span className="text-muted-foreground">Proxy requests</span>
              </div>
              <p className="mt-2 text-muted-foreground">
                <strong>Required Header:</strong> <code>x-app-id</code> - Your
                application slug
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <div className="border-t pt-8 text-center text-muted-foreground text-sm">
        <p>
          Full documentation available at <code>docs/INTEGRATION.md</code>
        </p>
      </div>
    </div>
  );
}
