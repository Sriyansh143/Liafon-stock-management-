-- ─────────────────────────────────────────────────────────────────────────────
-- Liafon Stock Management — HSN Code Master Seed (Auto-Parts focused)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Run AFTER migrate-v5-to-v6.sql. Preloads ~80 most common HSN codes for
-- auto-parts + vehicles + related services. Default GST rate is 18% unless
-- noted otherwise (28% for parts, 5%/12% for some).
--
-- Source: CBIC India GST rates (https://cbic-gst.gov.in/). Always verify
-- against the latest CBIC notification before filing GSTR-1.
-- ─────────────────────────────────────────────────────────────────────────────

-- Use ON CONFLICT to be idempotent (safe to re-run)
INSERT INTO "HsnCode" ("id", "code", "description", "rate", "category", "createdAt") VALUES
-- ─── Chapter 87 — Vehicles (8701-8716) ──────────────────────────────────
(gen_random_uuid(), '8708', 'Parts and accessories of motor vehicles (general)', 28, 'Auto Parts', now()),
(gen_random_uuid(), '870810', 'Bumpers and parts thereof', 28, 'Body Parts', now()),
(gen_random_uuid(), '870821', 'Safety seat belts', 28, 'Safety', now()),
(gen_random_uuid(), '870829', 'Other parts of bumpers', 28, 'Body Parts', now()),
(gen_random_uuid(), '870830', 'Brakes and servo-brakes and parts thereof', 28, 'Brakes', now()),
(gen_random_uuid(), '870831', 'Mounted brake linings', 28, 'Brakes', now()),
(gen_random_uuid(), '870839', 'Other brake parts', 28, 'Brakes', now()),
(gen_random_uuid(), '870840', 'Gear boxes and parts thereof', 28, 'Transmission', now()),
(gen_random_uuid(), '870850', 'Drive-axles with differential', 28, 'Transmission', now()),
(gen_random_uuid(), '870860', 'Non-driving axles and parts', 28, 'Transmission', now()),
(gen_random_uuid(), '870870', 'Road wheels and parts', 28, 'Body Parts', now()),
(gen_random_uuid(), '870880', 'Suspension shock absorbers', 28, 'Suspension', now()),
(gen_random_uuid(), '870891', 'Radiators and parts', 28, 'Cooling', now()),
(gen_random_uuid(), '870892', 'Silencers and exhaust pipes', 28, 'Exhaust', now()),
(gen_random_uuid(), '870893', 'Clutches and parts thereof', 28, 'Transmission', now()),
(gen_random_uuid(), '870894', 'Steering wheels, columns, boxes', 28, 'Steering', now()),
(gen_random_uuid(), '870895', 'Safety airbags and parts', 28, 'Safety', now()),
(gen_random_uuid(), '870899', 'Other parts and accessories', 28, 'Auto Parts', now()),

-- ─── Chapter 84 — Engines, machinery ────────────────────────────────────
(gen_random_uuid(), '8407', 'Spark-ignition engines (petrol)', 28, 'Engine', now()),
(gen_random_uuid(), '8408', 'Compression-ignition engines (diesel)', 28, 'Engine', now()),
(gen_random_uuid(), '8409', 'Parts for engines (pistons, rings, valves)', 28, 'Engine', now()),
(gen_random_uuid(), '8413', 'Pumps for liquids, fuel pumps', 28, 'Engine', now()),
(gen_random_uuid(), '8414', 'Air/vacuum pumps, compressors', 28, 'Engine', now()),
(gen_random_uuid(), '8421', 'Centrifuges, oil filters', 28, 'Filters', now()),
(gen_random_uuid(), '8482', 'Ball/roller bearings', 28, 'Bearings', now()),
(gen_random_uuid(), '8483', 'Shafts, cranks, gears, gearing', 28, 'Transmission', now()),
(gen_random_uuid(), '8484', 'Gaskets, joints (cylinder head gaskets)', 28, 'Engine', now()),

-- ─── Chapter 85 — Electrical ────────────────────────────────────────────
(gen_random_uuid(), '8501', 'Electric motors', 28, 'Electrical', now()),
(gen_random_uuid(), '8507', 'Electric accumulators (batteries, lead-acid)', 28, 'Electrical', now()),
(gen_random_uuid(), '8511', 'Ignition/dynamo equipment for engines', 28, 'Electrical', now()),
(gen_random_uuid(), '8512', 'Electrical lighting/signalling for vehicles', 28, 'Electrical', now()),
(gen_random_uuid(), '8544', 'Insulated wire, cables, spark plug wires', 18, 'Electrical', now()),

-- ─── Chapter 40 — Rubber (tyres, tubes, belts) ──────────────────────────
(gen_random_uuid(), '4011', 'New pneumatic tyres (rubber)', 28, 'Tyres', now()),
(gen_random_uuid(), '4012', 'Retreaded/used tyres', 28, 'Tyres', now()),
(gen_random_uuid(), '4013', 'Inner tubes (rubber)', 28, 'Tyres', now()),
(gen_random_uuid(), '4016', 'Other rubber articles (gaskets, mounts)', 18, 'Rubber Parts', now()),

-- ─── Chapter 73 — Iron/steel articles ───────────────────────────────────
(gen_random_uuid(), '7315', 'Chain and parts thereof (iron/steel)', 18, 'Hardware', now()),
(gen_random_uuid(), '7320', 'Springs and leaves for springs', 18, 'Suspension', now()),
(gen_random_uuid(), '7326', 'Other iron/steel articles', 18, 'Hardware', now()),

-- ─── Chapter 68 — Friction material ─────────────────────────────────────
(gen_random_uuid(), '6813', 'Friction material (brake linings, pads)', 28, 'Brakes', now()),

-- ─── Chapter 70 — Glass ─────────────────────────────────────────────────
(gen_random_uuid(), '7007', 'Safety glass (toughened/laminated)', 18, 'Glass', now()),
(gen_random_uuid(), '7009', 'Mirrors (rear-view)', 18, 'Glass', now()),

-- ─── Chapter 39 — Plastics ──────────────────────────────────────────────
(gen_random_uuid(), '3926', 'Other plastic articles (interior trim)', 18, 'Plastics', now()),
(gen_random_uuid(), '3919', 'Self-adhesive plastic plates/sheets', 18, 'Plastics', now()),
(gen_random_uuid(), '3920', 'Plastic film/sheet (non-cellular)', 18, 'Plastics', now()),

-- ─── Chapter 48 — Paper (filters) ───────────────────────────────────────
(gen_random_uuid(), '4823', 'Filter paper cut to size', 18, 'Filters', now()),

-- ─── Chapter 90 — Instruments ───────────────────────────────────────────
(gen_random_uuid(), '9026', 'Instruments for measuring pressure/flow', 18, 'Instruments', now()),
(gen_random_uuid(), '9029', 'Revolution counters, speedometers, tachometers', 18, 'Instruments', now()),
(gen_random_uuid(), '9031', 'Measuring/checking instruments', 18, 'Instruments', now()),
(gen_random_uuid(), '9032', 'Automatic regulating instruments (thermostats)', 18, 'Instruments', now()),

-- ─── Chapter 94 — Seats, seat belts (vehicle seats) ─────────────────────
(gen_random_uuid(), '9401', 'Seats and parts thereof (vehicle seats)', 28, 'Body Parts', now()),

-- ─── Chapter 83 — Misc base metal articles ──────────────────────────────
(gen_random_uuid(), '8301', 'Padlocks, locks, keys', 18, 'Hardware', now()),
(gen_random_uuid(), '8302', 'Base metal mountings/fittings for vehicles', 18, 'Hardware', now()),
(gen_random_uuid(), '8412', 'Other engines (hydraulic, pneumatic)', 28, 'Engine', now()),
(gen_random_uuid(), '8418', 'Refrigerators/freezers (vehicle AC compressors)', 28, 'Cooling', now()),
(gen_random_uuid(), '8425', 'Winches and capstans', 28, 'Hardware', now()),

-- ─── Chapter 87 (more granular sub-codes) ───────────────────────────────
(gen_random_uuid(), '8703', 'Motor cars and vehicles for transporting persons', 28, 'Vehicles', now()),
(gen_random_uuid(), '8704', 'Motor vehicles for transport of goods', 28, 'Vehicles', now()),
(gen_random_uuid(), '8705', 'Special purpose motor vehicles', 28, 'Vehicles', now()),
(gen_random_uuid(), '8716', 'Trailers and semi-trailers', 18, 'Vehicles', now()),

-- ─── Service codes (for labour/services — SAC) ──────────────────────────
(gen_random_uuid(), '998714', 'Repair and maintenance services of motor vehicles', 18, 'Services', now()),
(gen_random_uuid(), '998715', 'Installation/commissioning of vehicle parts', 18, 'Services', now()),
(gen_random_uuid(), '998716', 'Vehicle breakdown services', 18, 'Services', now()),
(gen_random_uuid(), '998717', 'Vehicle cleaning/washing services', 18, 'Services', now()),
(gen_random_uuid(), '998718', 'Vehicle towing services', 18, 'Services', now()),

-- ─── Misc (general) ─────────────────────────────────────────────────────
(gen_random_uuid(), '0000', 'No HSN code (use for tax-exempt items)', 0, 'General', now()),
(gen_random_uuid(), '8413', 'Fuel injection pumps', 28, 'Engine', now()),
(gen_random_uuid(), '8504', 'Electrical transformers, alternators', 28, 'Electrical', now()),
(gen_random_uuid(), '8547', 'Electrical insulating fittings', 18, 'Electrical', now()),
(gen_random_uuid(), '87084030', 'Gear boxes for tractors', 28, 'Transmission', now()),
(gen_random_uuid(), '87084050', 'Gear boxes for heavy vehicles', 28, 'Transmission', now()),
(gen_random_uuid(), '87084090', 'Other gear boxes', 28, 'Transmission', now()),
(gen_random_uuid(), '401120', 'New pneumatic tyres for buses/trucks', 28, 'Tyres', now()),
(gen_random_uuid(), '401110', 'New pneumatic tyres for cars', 28, 'Tyres', now()),
(gen_random_uuid(), '401130', 'New pneumatic tyres for two-wheelers', 28, 'Tyres', now()),
(gen_random_uuid(), '401150', 'New pneumatic tyres for bicycles', 28, 'Tyres', now())
ON CONFLICT ("code") DO NOTHING;

-- Verify
SELECT COUNT(*) AS hsn_count FROM "HsnCode";
