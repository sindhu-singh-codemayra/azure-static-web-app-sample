import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import fetch, { HeadersInit } from "node-fetch";

/**
 * Proxy handler: forwards any request under /api/proxy/* to your backend
 */
export async function proxyHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const path = request.params.path || "";
    const query = request.query ? `?${new URLSearchParams(request.query).toString()}` : "";

    const backendUrl = `${process.env.VITE_BACKEND_BASE_URL}/${path}${query}`;
    const xKey = process.env.VITE_X_FUNCTIONS_KEY || "";

    context.log(`Incoming ${request.method} request for path: ${path}`);
    context.log(`Target backend URL: ${backendUrl}`);

    const headers: HeadersInit = {
        "Content-Type": "application/json",
        "x-functions-key": xKey
    };

    const method = request.method;
    const body = method === "GET" || method === "HEAD" ? undefined : await request.text();

    try {
        const res = await fetch(backendUrl, {
            method,
            headers,
            body
        });

        const text = await res.text();

        context.log(`Proxy success: ${res.status}`);

        return {
            status: res.status,
            headers: {
                "Content-Type": res.headers.get("content-type") || "application/json"
            },
            body: text
        };
    } catch (err: any) {
        context.error(`Proxy error: ${err.message}`);
        return {
            status: 500,
            headers: {
                "Content-Type": "application/json"
            },
            jsonBody: {
                error: "Internal proxy error",
                message: err.message,
                stack: err.stack,
                backendUrl
            }
        };
    }
}

// Register the route
app.http("proxy", {
    route: "proxy/{*path}",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"],
    authLevel: "anonymous",
    handler: proxyHandler
});
