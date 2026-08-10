CREATE TYPE "public"."actor_type" AS ENUM('umano', 'ai', 'sistema');--> statement-breakpoint
CREATE TYPE "public"."ai_mode" AS ENUM('off', 'openai', 'anthropic', 'openai_con_revisione_anthropic');--> statement-breakpoint
CREATE TYPE "public"."ai_provider" AS ENUM('openai', 'anthropic', 'mock');--> statement-breakpoint
CREATE TYPE "public"."approval_action_type" AS ENUM('crea_attivita', 'aggiorna_attivita', 'crea_bozza', 'crea_bozza_gmail', 'collega_email_attivita');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('in_attesa', 'approvata', 'rifiutata', 'scaduta');--> statement-breakpoint
CREATE TYPE "public"."confidentiality_level" AS ENUM('pubblico', 'interno', 'riservato', 'sensibile');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('contratto', 'proposta', 'deliverable', 'verbale', 'presentazione', 'nota', 'amministrativo', 'altro');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('generata', 'in_revisione', 'approvata', 'rifiutata', 'trasferita_gmail');--> statement-breakpoint
CREATE TYPE "public"."organization_status" AS ENUM('attiva', 'in_valutazione', 'sospesa', 'archiviata');--> statement-breakpoint
CREATE TYPE "public"."organization_type" AS ENUM('skill_donor', 'ets', 'donor', 'partner', 'fornitore', 'istituzione', 'altro');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('in_esplorazione', 'in_corso', 'in_attesa', 'concluso', 'sospeso');--> statement-breakpoint
CREATE TYPE "public"."project_type" AS ENUM('matching', 'supporto_ets', 'partnership', 'istituzionale', 'governance', 'interno', 'formazione', 'comunicazione');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('critica', 'alta', 'media', 'bassa');--> statement-breakpoint
CREATE TYPE "public"."task_source" AS ENUM('manuale', 'email', 'ai', 'mcp', 'seed');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('da_fare', 'in_lavorazione', 'in_attesa', 'bloccata', 'da_verificare', 'completata', 'archiviata');--> statement-breakpoint
CREATE TYPE "public"."thread_status" AS ENUM('da_classificare', 'collegata', 'risposta_da_preparare', 'in_attesa', 'chiusa', 'ignorata');--> statement-breakpoint
CREATE TABLE "ai_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"model" text NOT NULL,
	"input_summary" text NOT NULL,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" real,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"outcome" text NOT NULL,
	"error_message" text,
	"human_review" text,
	"correlation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"model" text NOT NULL,
	"prompt_template" text NOT NULL,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"status" "draft_status" DEFAULT 'generata' NOT NULL,
	"review_notes" text,
	"revision_provider" "ai_provider",
	"revision_model" text,
	"revision_body" text,
	"revision_notes" text,
	"thread_id" uuid,
	"task_id" uuid,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"gmail_draft_id" text,
	"gmail_transferred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_type" "approval_action_type" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"status" "approval_status" DEFAULT 'in_attesa' NOT NULL,
	"requested_by_type" "actor_type" NOT NULL,
	"requested_by_label" text NOT NULL,
	"approved_by_user_id" uuid,
	"proposed_payload" jsonb NOT NULL,
	"rationale" text,
	"outcome" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_label" text NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"previous_value" jsonb,
	"new_value" jsonb,
	"source" text NOT NULL,
	"session_ref" text,
	"correlation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"email" text,
	"phone" text,
	"role" text,
	"organization_id" uuid,
	"notes" text,
	"last_contact_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "document_type" DEFAULT 'altro' NOT NULL,
	"project_id" uuid,
	"task_id" uuid,
	"version" text DEFAULT 'v1' NOT NULL,
	"status" text DEFAULT 'bozza' NOT NULL,
	"source" text DEFAULT 'interno' NOT NULL,
	"location_ref" text,
	"confidentiality" "confidentiality_level" DEFAULT 'interno' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"gmail_message_id" text NOT NULL,
	"from_name" text,
	"from_email" text NOT NULL,
	"to_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"has_attachments" boolean DEFAULT false NOT NULL,
	"attachment_meta" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"body_cached_text" text,
	"body_fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gmail_thread_id" text NOT NULL,
	"subject" text DEFAULT '(senza oggetto)' NOT NULL,
	"from_name" text,
	"from_email" text NOT NULL,
	"to_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cc_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"first_message_at" timestamp with time zone NOT NULL,
	"last_message_at" timestamp with time zone NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"message_count" integer DEFAULT 1 NOT NULL,
	"gmail_url" text NOT NULL,
	"status" "thread_status" DEFAULT 'da_classificare' NOT NULL,
	"sync_state" text DEFAULT 'sincronizzato' NOT NULL,
	"suggested_project_id" uuid,
	"suggested_urgency" "task_priority",
	"ai_classification" jsonb,
	"injection_flagged" boolean DEFAULT false NOT NULL,
	"injection_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"account_email" text NOT NULL,
	"user_id" uuid,
	"encrypted_payload" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"last_history_id" text,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" text,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"type" "organization_type" NOT NULL,
	"status" "organization_status" DEFAULT 'attiva' NOT NULL,
	"website" text,
	"city" text,
	"fiscal_code" text,
	"legal_form" text,
	"sector" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_organizations" (
	"project_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" text DEFAULT 'coinvolta' NOT NULL,
	CONSTRAINT "project_organizations_project_id_organization_id_pk" PRIMARY KEY("project_id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" "project_type" NOT NULL,
	"status" "project_status" DEFAULT 'in_corso' NOT NULL,
	"owner_id" uuid,
	"referent_contact_id" uuid,
	"need" text,
	"deliverable" text,
	"next_step" text,
	"start_date" timestamp with time zone,
	"due_date" timestamp with time zone,
	"impact_metrics" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"layout" text DEFAULT 'tabella' NOT NULL,
	"filter" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_contacts" (
	"task_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	CONSTRAINT "task_contacts_task_id_contact_id_pk" PRIMARY KEY("task_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"task_id" uuid NOT NULL,
	"depends_on_task_id" uuid NOT NULL,
	"note" text,
	CONSTRAINT "task_dependencies_task_id_depends_on_task_id_pk" PRIMARY KEY("task_id","depends_on_task_id")
);
--> statement-breakpoint
CREATE TABLE "task_email_threads" (
	"task_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"linked_by_type" "actor_type" DEFAULT 'umano' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_email_threads_task_id_thread_id_pk" PRIMARY KEY("task_id","thread_id")
);
--> statement-breakpoint
CREATE TABLE "task_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"detail" jsonb,
	"actor_type" "actor_type" DEFAULT 'umano' NOT NULL,
	"actor_label" text DEFAULT 'Sistema' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_organizations" (
	"task_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	CONSTRAINT "task_organizations_task_id_organization_id_pk" PRIMARY KEY("task_id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"project_id" uuid,
	"owner_id" uuid,
	"status" "task_status" DEFAULT 'da_fare' NOT NULL,
	"priority" "task_priority" DEFAULT 'media' NOT NULL,
	"due_date" timestamp with time zone,
	"next_step" text,
	"last_update_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "task_source" DEFAULT 'manuale' NOT NULL,
	"blocked_reason" text,
	"waiting_on_third_party" boolean DEFAULT false NOT NULL,
	"waiting_on" text,
	"follow_up_date" timestamp with time zone,
	"ai_confidence" real,
	"updated_by_type" "actor_type" DEFAULT 'umano' NOT NULL,
	"updated_by_label" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"timezone" text DEFAULT 'Europe/Rome' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_suggested_project_id_projects_id_fk" FOREIGN KEY ("suggested_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_tokens" ADD CONSTRAINT "integration_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_organizations" ADD CONSTRAINT "project_organizations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_organizations" ADD CONSTRAINT "project_organizations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_referent_contact_id_contacts_id_fk" FOREIGN KEY ("referent_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_contacts" ADD CONSTRAINT "task_contacts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_contacts" ADD CONSTRAINT "task_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_task_id_tasks_id_fk" FOREIGN KEY ("depends_on_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_email_threads" ADD CONSTRAINT "task_email_threads_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_email_threads" ADD CONSTRAINT "task_email_threads_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_organizations" ADD CONSTRAINT "task_organizations_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_organizations" ADD CONSTRAINT "task_organizations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_actions_created_idx" ON "ai_actions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_drafts_status_idx" ON "ai_drafts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_drafts_thread_idx" ON "ai_drafts" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "approvals_status_idx" ON "approvals" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "contacts_org_idx" ON "contacts" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_identity_key" ON "contacts" USING btree (lower("first_name"),lower("last_name"),"organization_id");--> statement-breakpoint
CREATE INDEX "documents_project_idx" ON "documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "documents_task_idx" ON "documents" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_messages_gmail_key" ON "email_messages" USING btree ("gmail_message_id");--> statement-breakpoint
CREATE INDEX "email_messages_thread_idx" ON "email_messages" USING btree ("thread_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_threads_gmail_key" ON "email_threads" USING btree ("gmail_thread_id");--> statement-breakpoint
CREATE INDEX "email_threads_status_idx" ON "email_threads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_threads_last_msg_idx" ON "email_threads" USING btree ("last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_tokens_provider_key" ON "integration_tokens" USING btree ("provider",lower("account_email"));--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "organizations_type_idx" ON "organizations" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_code_key" ON "projects" USING btree ("code");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_views_name_key" ON "saved_views" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "task_events_task_idx" ON "task_events" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_code_key" ON "tasks" USING btree ("code");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_priority_idx" ON "tasks" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "tasks_due_idx" ON "tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree (lower("email"));