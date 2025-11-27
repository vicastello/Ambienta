// @ts-nocheck
/* eslint-disable */
// src/app/api/tiny/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";

const AUTH_URL =
  "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth";

export async function GET(req: NextRequest) {
  const clientId = process.env.TINY_CLIENT_ID;
  const redirectUri = process.env.TINY_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { message: "CLIENT_ID ou REDIRECT_URI do Tiny não configurados." },
      { status: 500 }
    );
  }

  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "openid");
  url.searchParams.set("response_type", "code");

  return NextResponse.redirect(url.toString());
}
// @ts-nocheck
