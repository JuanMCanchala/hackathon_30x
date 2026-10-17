CREATE TABLE "adaptations" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"week" date NOT NULL,
	"variant" integer DEFAULT 0 NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analyses" (
	"topic_id" text NOT NULL,
	"week" date NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "analyses_topic_id_week_kind_pk" PRIMARY KEY("topic_id","week","kind")
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"adaptation_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"format" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"scheduled_for" date NOT NULL,
	"approved_by" text NOT NULL,
	"approved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrichments" (
	"item_id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"is_ai" boolean NOT NULL,
	"labels" jsonb NOT NULL,
	"format" text,
	"hook_type" text,
	"hook" text,
	"emotion" text,
	"audience" text,
	"author_type" text,
	"use_case" text,
	"lang" text,
	"country" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_metrics" (
	"item_id" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"views" double precision,
	"likes" double precision,
	"comments" double precision,
	"shares" double precision,
	"saves" double precision,
	"engagement" double precision DEFAULT 0 NOT NULL,
	CONSTRAINT "item_metrics_item_id_captured_at_pk" PRIMARY KEY("item_id","captured_at")
);
--> statement-breakpoint
CREATE TABLE "item_topics" (
	"item_id" text NOT NULL,
	"topic_id" text NOT NULL,
	CONSTRAINT "item_topics_item_id_topic_id_pk" PRIMARY KEY("item_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"url" text NOT NULL,
	"author_id" text NOT NULL,
	"author_name" text NOT NULL,
	"author_handle" text,
	"author_followers" integer,
	"published_at" timestamp with time zone NOT NULL,
	"published_approx" boolean DEFAULT false NOT NULL,
	"title" text,
	"text" text NOT NULL,
	"format" text NOT NULL,
	"lang" text,
	"duration_sec" integer,
	"query" text,
	"views" double precision,
	"likes" double precision,
	"comments" double precision,
	"shares" double precision,
	"saves" double precision,
	"engagement" double precision DEFAULT 0 NOT NULL,
	"reference" boolean DEFAULT false NOT NULL,
	"via_sensor" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cost_usd" double precision NOT NULL,
	"replayed" boolean NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sensor_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"item_id" text,
	"submitted_by" text NOT NULL,
	"note" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_labels" (
	"label" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"similarity" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_series" (
	"topic_id" text NOT NULL,
	"source" text NOT NULL,
	"date" date NOT NULL,
	"value" double precision NOT NULL,
	CONSTRAINT "topic_series_topic_id_source_date_pk" PRIMARY KEY("topic_id","source","date")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"definition" text,
	"wikipedia" text,
	"queries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"centroid" jsonb NOT NULL,
	"label_count" integer DEFAULT 0 NOT NULL,
	"generic" boolean DEFAULT false NOT NULL,
	"named" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adaptations" ADD CONSTRAINT "adaptations_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_adaptation_id_adaptations_id_fk" FOREIGN KEY ("adaptation_id") REFERENCES "public"."adaptations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichments" ADD CONSTRAINT "enrichments_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_metrics" ADD CONSTRAINT "item_metrics_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_topics" ADD CONSTRAINT "item_topics_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_topics" ADD CONSTRAINT "item_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensor_submissions" ADD CONSTRAINT "sensor_submissions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_labels" ADD CONSTRAINT "topic_labels_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_series" ADD CONSTRAINT "topic_series_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_topics_topic_idx" ON "item_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "items_platform_idx" ON "items" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "items_published_idx" ON "items" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "items_author_idx" ON "items" USING btree ("platform","author_id");