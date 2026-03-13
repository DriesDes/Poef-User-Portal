import { config } from "dotenv";
import { randomInt } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
config();

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zijn vereist in .env.local of .env.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

function slug(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20);
}

function buildCode(name) {
  return `dp-${slug(name) || "user"}-${randomInt(1000, 10000)}`;
}

function buildEmail(code) {
  return `${code}@portal.digitale-poef.local`;
}

async function main() {
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("naam")
    .order("naam", { ascending: true });

  if (usersError) {
    throw usersError;
  }

  const { data: accounts, error: accountsError } = await supabase
    .from("portal_accounts")
    .select("auth_user_id,user_naam");

  if (accountsError) {
    throw accountsError;
  }

  const accountByName = new Map(accounts.map((account) => [account.user_naam, account]));
  const exportedCodes = [];

  for (const user of users) {
    const code = buildCode(user.naam);
    const email = buildEmail(code);
    const existing = accountByName.get(user.naam);
    let authUserId = existing?.auth_user_id;

    if (authUserId) {
      const { data, error } = await supabase.auth.admin.updateUserById(authUserId, {
        email,
        password: code,
        email_confirm: true,
        user_metadata: {
          portal_user_naam: user.naam
        }
      });

      if (error || !data.user) {
        authUserId = undefined;
      }
    }

    if (!authUserId) {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: code,
        email_confirm: true,
        user_metadata: {
          portal_user_naam: user.naam
        }
      });

      if (error || !data.user) {
        throw error ?? new Error(`Kon auth user niet aanmaken voor ${user.naam}.`);
      }

      authUserId = data.user.id;
    }

    const { error: upsertError } = await supabase.from("portal_accounts").upsert(
      {
        auth_user_id: authUserId,
        user_naam: user.naam,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: "user_naam"
      }
    );

    if (upsertError) {
      throw upsertError;
    }

    exportedCodes.push({ naam: user.naam, portal_code: code });
  }

  const csv = [
    "naam,portal_code",
    ...exportedCodes.map((entry) => `${entry.naam},${entry.portal_code}`)
  ].join("\n");

  const fileName = `portal_login_codes_${new Date().toISOString().slice(0, 10)}.csv`;
  writeFileSync(fileName, csv, "utf8");
  console.log(`Provisioning klaar. Codes opgeslagen in ${fileName}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
