CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"key_hash" text NOT NULL,
	"scope" jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "agents_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "approval_links" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "approval_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"required" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "approval_requests_invoice_id_unique" UNIQUE("invoice_id")
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"note" text,
	"via" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"outcome" text NOT NULL,
	"approvals_required" integer NOT NULL,
	"results" jsonb NOT NULL,
	"summary" text NOT NULL,
	"counterfactual" jsonb NOT NULL,
	"facts" jsonb NOT NULL,
	"policy_version" integer NOT NULL,
	"mandate_id" text,
	"engine_version" text NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	CONSTRAINT "decisions_invoice_id_unique" UNIQUE("invoice_id")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"sha256" text NOT NULL,
	"filename" text NOT NULL,
	"media_type" text NOT NULL,
	"size" integer NOT NULL,
	"storage_path" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"seq" integer NOT NULL,
	"ref" text NOT NULL,
	"document_id" text,
	"source" text NOT NULL,
	"requester" jsonb NOT NULL,
	"dataset_id" text,
	"title" text,
	"received_at" timestamp with time zone NOT NULL,
	"extraction" jsonb,
	"extraction_meta" jsonb NOT NULL,
	"status" text NOT NULL,
	"outcome" text,
	"period_key" text NOT NULL,
	"payee_id" text,
	"issuer_name" text,
	"issuer_tax_id_norm" text,
	"issuer_name_folded" text,
	"destination_norm" text,
	"invoice_number" text,
	"invoice_number_norm" text,
	"amount_minor" bigint,
	"currency" text,
	"usd_cents" bigint,
	"issue_date" text,
	"due_date" text,
	"service_period" text,
	"decided_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"type" text NOT NULL,
	"entity_id" text,
	"actor" jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"at" text NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mandates" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"key" text NOT NULL,
	"version" integer NOT NULL,
	"payee_id" text NOT NULL,
	"status" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"legal_name" text NOT NULL,
	"tax_id" text NOT NULL,
	"aliases" jsonb NOT NULL,
	"time_zone" text NOT NULL,
	"treasury_balance_usd_cents" bigint NOT NULL,
	"invoice_seq" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payees" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" integer NOT NULL,
	"terms" jsonb NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"status" text NOT NULL,
	"draft" jsonb NOT NULL,
	"impact" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"resolution_note" text,
	"result_mandate_id" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"title" text NOT NULL,
	"role" text NOT NULL,
	"can_approve" boolean NOT NULL,
	"can_sign" boolean NOT NULL
);
--> statement-breakpoint
CREATE INDEX "approval_requests_org_status_idx" ON "approval_requests" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_request_user_idx" ON "approvals" USING btree ("request_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_org_sha_idx" ON "documents" USING btree ("org_id","sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_org_seq_idx" ON "invoices" USING btree ("org_id","seq");--> statement-breakpoint
CREATE INDEX "invoices_org_status_idx" ON "invoices" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "invoices_org_period_idx" ON "invoices" USING btree ("org_id","period_key");--> statement-breakpoint
CREATE INDEX "invoices_document_idx" ON "invoices" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "ledger_org_seq_idx" ON "ledger_entries" USING btree ("org_id","seq");--> statement-breakpoint
CREATE INDEX "ledger_entity_idx" ON "ledger_entries" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "mandates_org_payee_idx" ON "mandates" USING btree ("org_id","payee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mandates_key_version_idx" ON "mandates" USING btree ("org_id","key","version");--> statement-breakpoint
CREATE INDEX "payees_org_idx" ON "payees" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "policies_org_version_idx" ON "policies" USING btree ("org_id","version");--> statement-breakpoint
CREATE INDEX "proposals_org_status_idx" ON "proposals" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("org_id");