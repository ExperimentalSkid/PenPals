import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createContactVerificationServiceClient, hashContactVerificationToken } from "@/lib/contact-verification";
import { publicContactRequestMetadata } from "../request-metadata";

export async function GET(request: NextRequest) {
  const submission = request.nextUrl.searchParams.get("submission")?.trim() ?? "";
  const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(submission) || !/^[A-Za-z0-9_-]{40,80}$/.test(token)) {
    return NextResponse.redirect(new URL("/contact?verification=invalid", request.url));
  }

  const service = createContactVerificationServiceClient();
  const { error } = await service.rpc("verify_public_contact_submission", {
    p_submission_id: submission,
    p_token_hash: hashContactVerificationToken(token),
    p_verification_metadata: publicContactRequestMetadata(await headers()),
  });
  if (error) {
    const reason = /expired/i.test(error.message ?? "") ? "expired" : /invalid/i.test(error.message ?? "") ? "invalid" : "failed";
    return NextResponse.redirect(new URL(`/contact?verification=${reason}`, request.url));
  }
  return NextResponse.redirect(new URL("/contact?verified=1", request.url));
}
