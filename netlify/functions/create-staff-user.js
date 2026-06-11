exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const envError = requireEnv(["SUPABASE_SERVICE_ROLE_KEY"]);
  if (envError) return json(500, { error: envError });

  const accessToken = readBearerToken(event.headers.authorization || event.headers.Authorization);
  if (!accessToken) return json(401, { error: "Sign in to continue." });

  try {
    const caller = await getSupabaseUser(accessToken);
    const callerProfile = await fetchProfile(caller.id);
    if (callerProfile?.role !== "admin") {
      return json(403, { error: "Only an owner can add accounts." });
    }

    const body = JSON.parse(event.body || "{}");
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const fullName = String(body.full_name || "").trim();
    const phone = String(body.phone || "").trim();
    const role = body.role === "staff" ? "staff" : "admin";

    if (!email || !password || !fullName) {
      return json(400, { error: "Name, email and password are required." });
    }

    if (password.length < 8) {
      return json(400, { error: "Password must be at least 8 characters." });
    }

    const user = await createAuthUser({ email, password, fullName, phone });
    await upsertProfile({
      id: user.id,
      email,
      full_name: fullName,
      phone,
      role,
    });

    return json(200, {
      ok: true,
      user_id: user.id,
      email,
      role,
    });
  } catch (error) {
    return json(500, { error: error.message || "Unable to add account." });
  }
};

function requireEnv(keys) {
  const missing = keys.filter((key) => !process.env[key]);
  return missing.length ? `Missing environment variables: ${missing.join(", ")}` : "";
}

function readBearerToken(value = "") {
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

async function getSupabaseUser(accessToken) {
  const response = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) throw new Error("Sign in to continue.");
  return response.json();
}

async function fetchProfile(userId) {
  const response = await supabaseRest(`/profiles?select=id,role&id=eq.${userId}`);
  const rows = await response.json();
  return rows[0] || null;
}

async function createAuthUser({ email, password, fullName, phone }) {
  const response = await fetch(`${supabaseUrl()}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone,
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.msg || data.message || "Unable to create account.");
  }
  return data;
}

async function upsertProfile(profile) {
  await supabaseRest("/profiles?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(profile),
  });
}

async function supabaseRest(path, options = {}) {
  const response = await fetch(`${supabaseUrl()}/rest/v1${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || "Supabase request failed.");
  }

  return response;
}

function supabaseUrl() {
  return "https://rwyvfknkafidiowkgath.supabase.co";
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
