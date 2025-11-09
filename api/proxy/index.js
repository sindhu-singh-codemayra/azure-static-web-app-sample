import { app } from "@azure/functions";
// Note: Relying on the global 'fetch' available in Node.js 18+ runtime

/**
 * Creates a consistent 500 error response for configuration issues.
 * @param {string} message - The error message indicating what is missing.
 * @param {import('@azure/functions').Context} context - The Azure Function context for logging.
 * @returns {import('@azure/functions').HttpResponseInit} The standardized HTTP response object.
 */
function createConfigErrorResponse(message, context) {
    context.error(`Configuration Error: ${message}`);
    return {
        status: 500,
        headers: { "Content-Type": "application/json" },
        jsonBody: {
            statusCode: 500,
            error: "Configuration Error",
            message: message,
            detail: "This proxy function requires specific environment variables (VITE_BACKEND_BASE_URL and VITE_X_FUNCTIONS_KEY) to be set."
        }
    };
}

/**
 * Proxy handler: forwards requests under /api/proxy/* to your backend
 */
export async function proxyHandler(request, context) {
    const path = request.params.path || "";
    const query = request.query
        ? `?${new URLSearchParams(request.query).toString()}`
        : "";

    const backendBase = process.env.VITE_BACKEND_BASE_URL;
    const xKey = process.env.VITE_X_FUNCTIONS_KEY;

    // 1. MANDATORY CHECK: VITE_BACKEND_BASE_URL
    if (!backendBase) {
        return createConfigErrorResponse("VITE_BACKEND_BASE_URL is not set.", context);
    }

    // 2. MANDATORY CHECK: VITE_X_FUNCTIONS_KEY
    if (!xKey) {
        return createConfigErrorResponse("VITE_X_FUNCTIONS_KEY is not set.", context);
    }

    const backendUrl = `${backendBase}/${path}${query}`;

    // Using context.log/context.info for standard logging
    context.log(`--- Incoming Request ---`);
    context.log(`Target backend URL: ${backendUrl}`);

    // Headers to be forwarded/set
    const headers = {
        // Ensure backend expects JSON for body processing
        "Content-Type": request.headers.get("content-type") || "application/json",
        // Forward the required function key
        "x-functions-key": xKey,
        // Optionally forward other headers like Authorization, etc.
        // "Authorization": request.headers.get("authorization"), 
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
        // Handle network or other fetch-related errors
        context.error(`Proxy error connecting to backend: ${err.message}`);
        context.log(`Stack: ${err.stack}`);

        return {
            status: 502, // 502 Bad Gateway is appropriate for a proxy failing to connect to the upstream server
            headers: { "Content-Type": "application/json" },
            jsonBody: {
                statusCode: 502,
                error: "Proxy Connection Error",
                message: err.message,
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