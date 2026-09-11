"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireStaff } from "./guard";
import { isManualProfileBadgeKey } from "@/lib/profile-badges";

const statuses = new Set(["reviewing", "actioned", "dismissed"]);

export async function updateAdminReportStatus(formData: FormData) {
  const { db } = await requireStaff();
  const reportId = String(formData.get("report_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!reportId || !statuses.has(status)) redirect(`/app/admin/reports?error=${encodeURIComponent("Choose a valid report status.")}`);

  const { data: updatedReport, error } = await db.from("reports").update({ status }).eq("id", reportId).select("id").maybeSingle();
  if (error || !updatedReport) redirect(`/app/admin/reports?report=${encodeURIComponent(reportId)}&error=${encodeURIComponent(error?.message ?? "Report could not be updated.")}`);
  redirect(`/app/admin/reports?report=${encodeURIComponent(reportId)}&updated=1`);
}

export async function setAdminUserRole(formData: FormData) {
  const { db } = await requireAdmin();
  const targetUser = String(formData.get("target_user") ?? "");
  const newRole = String(formData.get("new_role") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!targetUser || !["user", "moderator", "admin"].includes(newRole) || reason.length < 1 || reason.length > 500) {
    redirect(`/app/admin/users/${encodeURIComponent(targetUser)}?error=${encodeURIComponent("Choose a valid role and provide a moderation reason (1–500 characters).")}`);
  }
  const { error } = await db.rpc("set_user_role", { target_user: targetUser, new_role: newRole, change_reason: reason });
  if (error) redirect(`/app/admin/users/${encodeURIComponent(targetUser)}?error=${encodeURIComponent(error.message)}`);
  redirect(`/app/admin/users/${encodeURIComponent(targetUser)}?updated=role`);
}

export async function setAdminAccountStatus(formData: FormData) {
  const { db } = await requireAdmin();
  const targetUser = String(formData.get("target_user") ?? "");
  const shouldDeactivate = String(formData.get("should_deactivate") ?? "") === "true";
  const reason = String(formData.get("reason") ?? "").trim();
  if (!targetUser) redirect("/app/admin/users?error=Missing user.");
  if (formData.get("confirm_status_change") !== "yes") redirect(`/app/admin/users/${encodeURIComponent(targetUser)}?error=${encodeURIComponent("Confirm the account status change before saving.")}`);
  if (reason.length < 1 || reason.length > 500) redirect(`/app/admin/users/${encodeURIComponent(targetUser)}?error=${encodeURIComponent("A moderation reason is required (1–500 characters).")}`);
  const { error } = await db.rpc("admin_set_account_status", { target_user: targetUser, should_deactivate: shouldDeactivate, change_reason: reason });
  if (error) redirect(`/app/admin/users/${encodeURIComponent(targetUser)}?error=${encodeURIComponent(error.message)}`);
  redirect(`/app/admin/users/${encodeURIComponent(targetUser)}?updated=${shouldDeactivate ? "deactivated" : "reactivated"}`);
}

export async function setAdminProfileBadge(formData: FormData) {
  const { db } = await requireStaff();
  const targetUser = String(formData.get("target_user") ?? "");
  const badgeKey = String(formData.get("badge_key") ?? "");
  const action = String(formData.get("action") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const shouldAssign = action === "assign";
  if (!targetUser || !isManualProfileBadgeKey(badgeKey) || !["assign", "remove"].includes(action) || reason.length < 1 || reason.length > 500) {
    redirect(`/app/admin/users/${encodeURIComponent(targetUser)}?error=${encodeURIComponent("Choose a manual badge, an action, and a reason (1–500 characters).")}`);
  }

  const { error } = await db.rpc("set_profile_badge", {
    target_user: targetUser,
    badge_key_input: badgeKey,
    should_assign: shouldAssign,
    change_reason: reason,
  });
  if (error) redirect(`/app/admin/users/${encodeURIComponent(targetUser)}?error=${encodeURIComponent(error.message ?? "The profile badge could not be updated.")}`);
  redirect(`/app/admin/users/${encodeURIComponent(targetUser)}?updated=badge`);
}

export async function removeAdminProfileContent(formData: FormData) {
  const { db } = await requireAdmin();
  const targetUser = String(formData.get("target_user") ?? "");
  const contentType = String(formData.get("content_type") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const allowedTypes = new Set(["bio", "quote", "looking_for", "avatar"]);
  if (!targetUser || !allowedTypes.has(contentType) || reason.length < 1 || reason.length > 500) {
    redirect(`/app/admin/users/${encodeURIComponent(targetUser)}?error=${encodeURIComponent("A moderation reason is required (1–500 characters).")}`);
  }

  const { error } = await db.rpc("admin_remove_profile_content", {
    target_user: targetUser,
    content_type: contentType,
    removal_reason: reason,
  });
  if (error) redirect(`/app/admin/users/${encodeURIComponent(targetUser)}?error=${encodeURIComponent(error.message)}`);
  redirect(`/app/admin/users/${encodeURIComponent(targetUser)}?updated=content_removed`);
}

export async function restoreAdminProfileContent(formData: FormData) {
  const { db } = await requireAdmin();
  const evidenceId = String(formData.get("evidence_id") ?? "");
  const targetUser = String(formData.get("target_user") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!evidenceId || !targetUser || reason.length < 1 || reason.length > 500) {
    redirect(`/app/admin/users/${encodeURIComponent(targetUser)}?error=${encodeURIComponent("A restoration reason is required (1–500 characters).")}`);
  }
  const { error } = await db.rpc("admin_restore_profile_content", { evidence_uuid: evidenceId, restore_reason: reason });
  if (error) redirect(`/app/admin/users/${encodeURIComponent(targetUser)}?error=${encodeURIComponent(error.message ?? "Profile content could not be restored.")}`);
  redirect(`/app/admin/users/${encodeURIComponent(targetUser)}?updated=content_restored`);
}

function caseRedirect(caseId: string, message: string) {
  return `/app/admin/cases/${encodeURIComponent(caseId)}?error=${encodeURIComponent(message)}`;
}

export async function updateModerationCaseStatus(formData: FormData) {
  const { db } = await requireStaff();
  const caseId = String(formData.get("case_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const resolution = String(formData.get("resolution_category") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!caseId || !["new", "triage", "investigating", "waiting", "resolved", "dismissed"].includes(status) || reason.length < 1 || reason.length > 500) {
    redirect(caseRedirect(caseId, "Choose a valid status and provide a reason (1–500 characters)."));
  }
  const { error } = await db.rpc("set_moderation_case_status", { case_uuid: caseId, new_status: status, resolution, status_reason: reason });
  if (error) redirect(caseRedirect(caseId, error.message ?? "Case status could not be updated."));
  revalidatePath("/app", "layout");
  redirect(`/app/admin/cases/${encodeURIComponent(caseId)}?updated=status`);
}

export async function claimModerationCase(formData: FormData) {
  const { db } = await requireStaff();
  const caseId = String(formData.get("case_id") ?? "");
  if (!caseId) redirect("/app/admin/cases?error=Missing case.");
  const { error } = await db.rpc("claim_moderation_case", { case_uuid: caseId, lease_minutes: 30 });
  if (error) redirect(caseRedirect(caseId, error.message ?? "Case could not be claimed."));
  redirect(`/app/admin/cases/${encodeURIComponent(caseId)}?updated=claimed`);
}

export async function releaseModerationCase(formData: FormData) {
  const { db } = await requireStaff();
  const caseId = String(formData.get("case_id") ?? "");
  if (!caseId) redirect("/app/admin/cases?error=Missing case.");
  const { error } = await db.rpc("release_moderation_case", { case_uuid: caseId });
  if (error) redirect(caseRedirect(caseId, error.message ?? "Case could not be released."));
  redirect(`/app/admin/cases/${encodeURIComponent(caseId)}?updated=released`);
}

export async function escalateModerationCase(formData: FormData) {
  const { db, role } = await requireStaff();
  const caseId = String(formData.get("case_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (role !== "moderator") redirect(caseRedirect(caseId, "Only moderators can request administrator attention."));
  if (!caseId || reason.length < 1 || reason.length > 500) {
    redirect(caseRedirect(caseId, "An escalation reason is required (1–500 characters)."));
  }
  const { error } = await db.rpc("request_admin_moderation_review", { case_uuid: caseId, request_reason: reason });
  if (error) redirect(caseRedirect(caseId, error.message ?? "Administrator attention could not be requested."));
  redirect(`/app/admin/cases/${encodeURIComponent(caseId)}?updated=escalated`);
}

export async function reassignModerationCase(formData: FormData) {
  const { db } = await requireAdmin();
  const caseId = String(formData.get("case_id") ?? "");
  const staffId = String(formData.get("staff_id") ?? "").trim() || null;
  const reason = String(formData.get("reason") ?? "").trim();
  if (!caseId || reason.length < 1 || reason.length > 500) redirect(caseRedirect(caseId, "A reassignment reason is required (1–500 characters)."));
  const { error } = await db.rpc("reassign_moderation_case", { case_uuid: caseId, new_staff: staffId, assignment_reason: reason });
  if (error) redirect(caseRedirect(caseId, error.message ?? "Case assignment could not be updated."));
  redirect(`/app/admin/cases/${encodeURIComponent(caseId)}?updated=reassigned`);
}

export async function addModerationCaseNote(formData: FormData) {
  const { db } = await requireStaff();
  const caseId = String(formData.get("case_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!caseId || note.length < 1 || note.length > 4000) redirect(caseRedirect(caseId, "A case note is required."));
  const { error } = await db.rpc("add_moderation_case_note", { case_uuid: caseId, note_text: note });
  if (error) redirect(caseRedirect(caseId, error.message ?? "Case note could not be saved."));
  redirect(`/app/admin/cases/${encodeURIComponent(caseId)}?updated=note`);
}

export async function resolveModerationFlag(formData: FormData) {
  const { db } = await requireStaff();
  const flagId = String(formData.get("flag_id") ?? "");
  const caseId = String(formData.get("case_id") ?? "");
  const resolution = String(formData.get("resolution") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!flagId || !caseId || !["cleared", "confirmed"].includes(resolution) || reason.length < 1 || reason.length > 500) {
    redirect(caseRedirect(caseId, "Choose a resolution and provide a reason (1–500 characters)."));
  }
  const { error } = await db.rpc("resolve_moderation_content_flag", { flag_uuid: flagId, resolution, resolution_reason: reason });
  if (error) redirect(caseRedirect(caseId, error.message ?? "Flag could not be resolved."));
  redirect(`/app/admin/cases/${encodeURIComponent(caseId)}?updated=flag`);
}

export async function upsertModerationDetectionRule(formData: FormData) {
  const { db } = await requireAdmin();
  const ruleIdentifier = String(formData.get("rule_identifier") ?? "").trim();
  const term = String(formData.get("term") ?? "").trim();
  const category = String(formData.get("category") ?? "");
  const matchType = String(formData.get("match_type") ?? "word");
  const enabled = String(formData.get("enabled") ?? "") === "on";
  const reason = String(formData.get("reason") ?? "").trim();
  if (!ruleIdentifier || !term || !category || !reason || reason.length > 500) redirect("/app/admin/moderation-rules?error=Provide a rule, term, category, and reason.");
  const { error } = await db.rpc("admin_upsert_moderation_detection_rule", { rule_identifier: ruleIdentifier, rule_term: term, rule_category: category, rule_match_type: matchType, rule_enabled: enabled, change_reason: reason });
  if (error) redirect(`/app/admin/moderation-rules?error=${encodeURIComponent(error.message ?? "The detection rule could not be saved.")}`);
  redirect("/app/admin/moderation-rules?updated=1");
}

export async function setAdminRetentionPolicy(formData: FormData) {
  const { db } = await requireAdmin();
  const category = String(formData.get("category") ?? "");
  const days = Number(formData.get("days") ?? 0);
  const purpose = String(formData.get("purpose") ?? "").trim();
  const legalBasis = String(formData.get("legal_basis") ?? "").trim();
  const enabled = String(formData.get("enabled") ?? "") === "on";
  if (!["auth_security", "moderation_audit", "moderation_evidence", "contact_evidence"].includes(category) || !Number.isInteger(days) || days < 1 || days > 36500 || !purpose || purpose.length > 2000 || !legalBasis || legalBasis.length > 2000) {
    redirect(`/app/admin/privacy-retention?error=${encodeURIComponent("Choose a valid category and retention period, purpose, and legal basis.")}`);
  }
  const { error } = await db.rpc("set_data_retention_policy", {
    policy_category: category,
    policy_period: `${days} days`,
    policy_purpose: purpose,
    policy_legal_basis: legalBasis,
    policy_enabled: enabled,
  });
  if (error) redirect(`/app/admin/privacy-retention?error=${encodeURIComponent(error.message ?? "Retention policy could not be saved.")}`);
  revalidatePath("/app/admin/privacy-retention");
  redirect("/app/admin/privacy-retention?updated=policy");
}

export async function createAdminRetentionHold(formData: FormData) {
  const { db } = await requireAdmin();
  const category = String(formData.get("category") ?? "");
  const recordId = String(formData.get("record_id") ?? "").trim() || null;
  const reason = String(formData.get("reason") ?? "").trim();
  if (!["auth_security", "moderation_audit", "moderation_evidence", "contact_evidence"].includes(category) || reason.length < 1 || reason.length > 2000) {
    redirect(`/app/admin/privacy-retention?error=${encodeURIComponent("Choose a valid category and provide a hold reason.")}`);
  }
  const { error } = await db.rpc("set_data_retention_hold", {
    hold_category: category,
    held_record_id: recordId,
    hold_reason: reason,
  });
  if (error) redirect(`/app/admin/privacy-retention?error=${encodeURIComponent(error.message ?? "Retention hold could not be created.")}`);
  revalidatePath("/app/admin/privacy-retention");
  redirect("/app/admin/privacy-retention?updated=hold");
}

export async function releaseAdminRetentionHold(formData: FormData) {
  const { db } = await requireAdmin();
  const holdId = String(formData.get("hold_id") ?? "");
  if (!holdId) redirect(`/app/admin/privacy-retention?error=${encodeURIComponent("Missing retention hold.")}`);
  const { error } = await db.rpc("release_data_retention_hold", { hold_id: holdId });
  if (error) redirect(`/app/admin/privacy-retention?error=${encodeURIComponent(error.message ?? "Retention hold could not be released.")}`);
  revalidatePath("/app/admin/privacy-retention");
  redirect("/app/admin/privacy-retention?updated=released");
}
