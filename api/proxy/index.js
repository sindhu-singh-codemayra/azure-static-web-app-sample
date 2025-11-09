import { app } from "@azure/functions";

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

export async function proxyHandler(request, context) {
    const path = request.params.path || "";
    const query = request.query
        ? `?${new URLSearchParams(request.query).toString()}`
        : "";

    const backendBase = process.env.VITE_BACKEND_BASE_URL;
    const xKey = process.env.VITE_X_FUNCTIONS_KEY;

    // MANDATORY CHECK: VITE_BACKEND_BASE_URL
    if (!backendBase) 
        return createConfigErrorResponse("VITE_BACKEND_BASE_URL is not set.", context);

    //MANDATORY CHECK: VITE_X_FUNCTIONS_KEY
    if (!xKey)
        return createConfigErrorResponse("VITE_X_FUNCTIONS_KEY is not set.", context);

    const backendUrl = `${backendBase}/${path}${query}`;

    
    // Update to forward all incoming headers
    const headers = {};
    
    // Iterate over all incoming headers and copy them to the headers object
    for (const [key, value] of request.headers.entries()) {
        // It's critical to skip the 'host' header as it references the Azure Function
        // domain and can cause routing/SSL issues on the backend.
        if (key.toLowerCase() !== 'host') {
            headers[key] = value;
        }
    }

    // Explicitly set the required function key, overwriting if it was passed by the client
    headers["x-functions-key"] = xKey;
    
    context.log(`Forwarding Headers: ${JSON.stringify(Object.keys(headers))}`);

    const method = request.method;
    // Note:request.text() is used to reliably get the body content for POST/PUT/PATCH
    const body = method === "GET" || method === "HEAD" ? undefined : await request.text();

    try {
        const res = await fetch(backendUrl, { method, headers, body });
        const text = await res.text();

        context.log(`--- Backend Response ---`);
        context.log(`Status: ${res.status}`);
        context.log(`Content-Type: ${res.headers.get("content-type")}`);

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
            status: 502, //502 Bad Gateway is appropriate for a proxy failing to connect to the upstream server
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