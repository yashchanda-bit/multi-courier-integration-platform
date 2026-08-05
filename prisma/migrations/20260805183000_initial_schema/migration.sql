CREATE TABLE "courier_partners" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "courier_partners_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_id" VARCHAR(100) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "normalized_request" JSONB NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "failure_code" VARCHAR(100),
    "failure_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "orders_status_check" CHECK (
        "status" IN ('PENDING', 'PROCESSING', 'SHIPMENT_CREATED', 'FAILED')
    )
);

CREATE TABLE "shipments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "courier_partner_id" UUID NOT NULL,
    "shipment_sequence" SMALLINT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "courier_shipment_id" VARCHAR(150),
    "awb_number" VARCHAR(150),
    "status" VARCHAR(40) NOT NULL,
    "courier_status_code" VARCHAR(50),
    "courier_request_payload" JSONB,
    "courier_response_payload" JSONB,
    "failure_code" VARCHAR(100),
    "failure_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shipments_sequence_check" CHECK ("shipment_sequence" > 0),
    CONSTRAINT "shipments_status_check" CHECK (
        "status" IN (
            'PENDING',
            'CREATED',
            'PICKED_UP',
            'IN_TRANSIT',
            'OUT_FOR_DELIVERY',
            'DELIVERED',
            'CANCELLED',
            'RETURN_TO_ORIGIN',
            'FAILED'
        )
    )
);

CREATE TABLE "tracking_events" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "normalized_status" VARCHAR(40) NOT NULL,
    "courier_status_code" VARCHAR(50) NOT NULL,
    "courier_status_description" VARCHAR(255),
    "courier_reason_code" VARCHAR(50),
    "courier_reason_description" VARCHAR(255),
    "location" VARCHAR(255),
    "courier_event_time" TIMESTAMPTZ(3),
    "event_fingerprint" CHAR(64) NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tracking_events_status_check" CHECK (
        "normalized_status" IN (
            'PENDING',
            'CREATED',
            'PICKED_UP',
            'IN_TRANSIT',
            'OUT_FOR_DELIVERY',
            'DELIVERED',
            'CANCELLED',
            'RETURN_TO_ORIGIN',
            'FAILED'
        )
    )
);

CREATE TABLE "courier_api_attempts" (
    "id" UUID NOT NULL,
    "shipment_id" UUID,
    "courier_partner_id" UUID NOT NULL,
    "operation" VARCHAR(40) NOT NULL,
    "attempt_number" SMALLINT NOT NULL,
    "request_id" VARCHAR(100) NOT NULL,
    "request_payload" JSONB,
    "response_payload" JSONB,
    "http_status" SMALLINT,
    "business_status" VARCHAR(20) NOT NULL,
    "error_code" VARCHAR(100),
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "courier_api_attempts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "courier_api_attempts_operation_check" CHECK (
        "operation" IN ('AUTHENTICATE', 'CREATE_SHIPMENT', 'TRACK_SHIPMENT', 'CANCEL_SHIPMENT')
    ),
    CONSTRAINT "courier_api_attempts_number_check" CHECK ("attempt_number" > 0),
    CONSTRAINT "courier_api_attempts_business_status_check" CHECK (
        "business_status" IN ('SUCCESS', 'FAILED')
    ),
    CONSTRAINT "courier_api_attempts_duration_check" CHECK (
        "duration_ms" IS NULL OR "duration_ms" >= 0
    )
);

CREATE TABLE "batches" (
    "id" UUID NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "total_count" SMALLINT NOT NULL,
    "success_count" SMALLINT NOT NULL DEFAULT 0,
    "failure_count" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    CONSTRAINT "batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "batches_status_check" CHECK (
        "status" IN ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED')
    ),
    CONSTRAINT "batches_total_count_check" CHECK ("total_count" BETWEEN 1 AND 100),
    CONSTRAINT "batches_success_count_check" CHECK ("success_count" >= 0),
    CONSTRAINT "batches_failure_count_check" CHECK ("failure_count" >= 0),
    CONSTRAINT "batches_processed_count_check" CHECK (
        "success_count" + "failure_count" <= "total_count"
    )
);

CREATE TABLE "batch_items" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "order_id" UUID,
    "submitted_order_id" VARCHAR(100) NOT NULL,
    "submitted_courier_partner" VARCHAR(50) NOT NULL,
    "position" SMALLINT NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "error_code" VARCHAR(100),
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "batch_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "batch_items_position_check" CHECK ("position" >= 0),
    CONSTRAINT "batch_items_status_check" CHECK (
        "status" IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED')
    )
);

CREATE UNIQUE INDEX "courier_partners_code_key" ON "courier_partners"("code");
CREATE UNIQUE INDEX "orders_order_id_key" ON "orders"("order_id");
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");
CREATE UNIQUE INDEX "shipments_one_active_per_order_key" ON "shipments"("order_id") WHERE "is_active" = true;
CREATE INDEX "shipments_order_id_is_active_idx" ON "shipments"("order_id", "is_active");
CREATE INDEX "shipments_courier_partner_id_status_idx" ON "shipments"("courier_partner_id", "status");
CREATE INDEX "shipments_updated_at_idx" ON "shipments"("updated_at");
CREATE UNIQUE INDEX "shipments_order_id_shipment_sequence_key" ON "shipments"("order_id", "shipment_sequence");
CREATE UNIQUE INDEX "shipments_courier_partner_id_courier_shipment_id_key" ON "shipments"("courier_partner_id", "courier_shipment_id");
CREATE UNIQUE INDEX "shipments_courier_partner_id_awb_number_key" ON "shipments"("courier_partner_id", "awb_number");
CREATE INDEX "tracking_events_shipment_id_courier_event_time_idx" ON "tracking_events"("shipment_id", "courier_event_time" DESC);
CREATE UNIQUE INDEX "tracking_events_shipment_id_event_fingerprint_key" ON "tracking_events"("shipment_id", "event_fingerprint");
CREATE INDEX "courier_api_attempts_shipment_id_created_at_idx" ON "courier_api_attempts"("shipment_id", "created_at" DESC);
CREATE INDEX "courier_api_attempts_request_id_idx" ON "courier_api_attempts"("request_id");
CREATE UNIQUE INDEX "courier_api_attempts_courier_partner_id_operation_request_i_key" ON "courier_api_attempts"("courier_partner_id", "operation", "request_id", "attempt_number");
CREATE INDEX "batches_status_created_at_idx" ON "batches"("status", "created_at");
CREATE INDEX "batch_items_batch_id_status_idx" ON "batch_items"("batch_id", "status");
CREATE UNIQUE INDEX "batch_items_batch_id_position_key" ON "batch_items"("batch_id", "position");
CREATE UNIQUE INDEX "batch_items_batch_id_submitted_order_id_key" ON "batch_items"("batch_id", "submitted_order_id");

ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_courier_partner_id_fkey"
    FOREIGN KEY ("courier_partner_id") REFERENCES "courier_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_shipment_id_fkey"
    FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "courier_api_attempts" ADD CONSTRAINT "courier_api_attempts_shipment_id_fkey"
    FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "courier_api_attempts" ADD CONSTRAINT "courier_api_attempts_courier_partner_id_fkey"
    FOREIGN KEY ("courier_partner_id") REFERENCES "courier_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "batch_items" ADD CONSTRAINT "batch_items_batch_id_fkey"
    FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "batch_items" ADD CONSTRAINT "batch_items_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
