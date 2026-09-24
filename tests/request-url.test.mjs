import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicAppUrl } from "../lib/requestUrl.js";

test("public app links do not inherit an internal localhost request origin", () => {
  const previous = {
    APP_URL: process.env.APP_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
    NODE_ENV: process.env.NODE_ENV,
  };
  try {
    delete process.env.APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "storezn.com";
    process.env.NODE_ENV = "production";
    const req = { headers: new Headers({ host: "localhost:3000" }) };
    assert.equal(buildPublicAppUrl(req, "/invoice/token-1"), "https://storezn.com/invoice/token-1");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
