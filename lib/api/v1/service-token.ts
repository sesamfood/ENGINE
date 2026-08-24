import {
  SignJWT,
  exportJWK,
  importPKCS8,
  importSPKI,
  jwtVerify,
  type JWK,
} from "jose";

const AUDIENCE = "rest-api-v1";
const TOKEN_LIFETIME_SECONDS = 30;

type KeyMaterial = {
  issuer: string;
  keyId: string;
  privateKey: Awaited<ReturnType<typeof importPKCS8>>;
  publicKey: Awaited<ReturnType<typeof importSPKI>>;
};

let keyMaterialPromise: Promise<KeyMaterial> | null = null;

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function normalizePem(value: string) {
  return value.replaceAll("\\n", "\n");
}

function serviceIssuer() {
  const siteUrl = requiredEnvironment("NEXT_PUBLIC_SITE_URL");
  try {
    return new URL("/api/v1", siteUrl).toString().replace(/\/$/, "");
  } catch {
    throw new Error("NEXT_PUBLIC_SITE_URL must be an absolute URL");
  }
}

async function loadKeyMaterial() {
  const issuer = serviceIssuer();
  const keyId = requiredEnvironment("REST_API_JWT_KEY_ID");
  const [privateKey, publicKey] = await Promise.all([
    importPKCS8(
      normalizePem(requiredEnvironment("REST_API_JWT_PRIVATE_KEY")),
      "RS256",
    ),
    importSPKI(
      normalizePem(requiredEnvironment("REST_API_JWT_PUBLIC_KEY")),
      "RS256",
    ),
  ]);
  const probe = await new SignJWT({ purpose: "configuration-check" })
    .setProtectedHeader({ alg: "RS256", kid: keyId, typ: "JWT" })
    .setSubject("rest-gateway")
    .setIssuer(issuer)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("30s")
    .sign(privateKey);
  await jwtVerify(probe, publicKey, {
    issuer,
    audience: AUDIENCE,
    algorithms: ["RS256"],
  });
  return { issuer, keyId, privateKey, publicKey };
}

function keyMaterial() {
  keyMaterialPromise ??= loadKeyMaterial();
  return keyMaterialPromise;
}

async function signServiceToken(
  subject: string,
  claims: Record<string, string>,
) {
  const material = await keyMaterial();
  const now = Math.floor(Date.now() / 1_000);
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: material.keyId, typ: "JWT" })
    .setSubject(subject)
    .setIssuer(material.issuer)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_LIFETIME_SECONDS)
    .setJti(crypto.randomUUID())
    .sign(material.privateKey);
}

export async function signRestGatewayToken(requestId: string) {
  return await signServiceToken("rest-gateway", {
    principalKind: "restGateway",
    requestId,
  });
}

export async function signApiKeyServiceToken(input: {
  apiKeyId: string;
  organizationId: string;
  requestId: string;
}) {
  return await signServiceToken(`api-key:${input.apiKeyId}`, {
    principalKind: "apiKey",
    apiKeyId: input.apiKeyId,
    organizationId: input.organizationId,
    requestId: input.requestId,
  });
}

async function publicJwk(pem: string, keyId: string): Promise<JWK> {
  const key = await importSPKI(normalizePem(pem), "RS256");
  return {
    ...(await exportJWK(key)),
    alg: "RS256",
    kid: keyId,
    use: "sig",
  };
}

export async function getRestApiJwks() {
  const material = await keyMaterial();
  const keys: JWK[] = [
    {
      ...(await exportJWK(material.publicKey)),
      alg: "RS256",
      kid: material.keyId,
      use: "sig",
    },
  ];
  const previousKey = process.env.REST_API_JWT_PREVIOUS_PUBLIC_KEY?.trim();
  const previousKeyId = process.env.REST_API_JWT_PREVIOUS_KEY_ID?.trim();
  if (previousKey || previousKeyId) {
    if (!previousKey || !previousKeyId) {
      throw new Error(
        "REST_API_JWT_PREVIOUS_PUBLIC_KEY and REST_API_JWT_PREVIOUS_KEY_ID must be set together",
      );
    }
    keys.push(await publicJwk(previousKey, previousKeyId));
  }
  return { keys };
}
