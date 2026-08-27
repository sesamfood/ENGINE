import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";
import { oauthCallback, webhook, wioOnboarding } from "./woltHttp";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);
http.route({ path: "/wolt/webhook", method: "POST", handler: webhook });
http.route({ path: "/wolt/oauth/callback", method: "GET", handler: oauthCallback });
http.route({ path: "/wolt/onboarding", method: "POST", handler: wioOnboarding });

export default http;
