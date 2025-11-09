import { app } from "@azure/functions";
// Note: Relying on the global 'fetch' available in Node.js 18+ runtime
// If you are using an older runtime, you would need to install 'node-fetch'
// and import it, but V4 is typically run on newer Node versions.

/**
 * Proxy handler: forwards requests under /api/proxy/* to your backend
 */
export async function proxyHandler(request, context) {
    const path = request.params.path || "";
    const query = request.query
        ? `?${new URLSearchParams(request.query).toString()}`
        : "";

    const backendBase = process.env.VITE_BACKEND_BASE_URL;

    if (!backendBase) {
        context.warn("VITE_BACKEND_BASE_URL not set. Returning sample response.");
        return {
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Hello from proxy! Backend not configured." })
        };
    }

    const backendUrl = `${backendBase}/${path}${query}`;
    const xKey = process.env.VITE_X_FUNCTIONS_KEY || "";

    // Using context.log/context.info for standard logging
    context.log(`--- Incoming Request ---`);
    context.log(`Method: ${request.method}`);
    context.log(`Path: ${path}`);
    context.log(`Query: ${JSON.stringify(request.query)}`);
    context.log(`Target backend URL: ${backendUrl}`);
    context.log(`Headers: ${JSON.stringify(request.headers)}`);

    // In a real proxy, you would typically forward more headers,
    // e.g., Authorization, User-Agent, etc.
    const headers = {
        "Content-Type": "application/json",
        "x-functions-key": xKey
    };

    const method = request.method;
    // Note: request.text() is used to reliably get the body content for POST/PUT/PATCH
    const body = method === "GET" || method === "HEAD" ? undefined : await request.text();

    try {
        const res = await fetch(backendUrl, { method, headers, body });
        const text = await res.text();

        context.log(`--- Backend Response ---`);
        context.log(`Status: ${res.status}`);
        context.log(`Content-Type: ${res.headers.get("content-type")}`);

        // Forwarding the status and body from the backend
        return {
            status: res.status,
            headers: {
                "Content-Type": res.headers.get("content-type") || "application/json"
            },
            body: text
        };
    } catch (err) {
        // FIX: Changed context.error to context.error (correct V4 logging)
        context.error(`Proxy error: ${err.message}`); 
        
        context.log(`Stack: ${err.stack}`);
        context.log(`Backend URL attempted: ${backendUrl}`);
        
        return {
            status: 500,
            headers: { "Content-Type": "application/json" },
            jsonBody: {
                error: "Internal proxy error",
                message: err.message,
                stack: err.stack,
                backendUrl
            }
        };
    }
}

// Register HTTP route
app.http("proxy", {
    route: "proxy/{*path}",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"],
    authLevel: "anonymous",
    handler: proxyHandler
});