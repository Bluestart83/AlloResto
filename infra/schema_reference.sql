-- ============================================================
-- SCHEMA BDD — POC Commande Vocale Restaurant
-- PostgreSQL (Supabase / Neon / Railway)
-- v2 : ajout table customers (prénom + adresse par tel)
-- ============================================================

-- ============================================================
-- 1. RESTAURANTS
-- ============================================================
CREATE TABLE restaurants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    address         TEXT,
    city            VARCHAR(100),
    postal_code     VARCHAR(10),
    phone           VARCHAR(20),
    contact_name    VARCHAR(255),
    contact_email   VARCHAR(255),
    
    -- Config IA
    welcome_message TEXT DEFAULT 'Bienvenue, que souhaitez-vous commander ?',
    ai_voice        VARCHAR(50) DEFAULT 'sage',
    ai_instructions TEXT,
    
    -- Config commande
    delivery_enabled    BOOLEAN DEFAULT FALSE,
    delivery_radius_km  DECIMAL(5,2) DEFAULT 5.0,
    delivery_fee        DECIMAL(5,2) DEFAULT 0,
    min_order_amount    DECIMAL(5,2) DEFAULT 0,
    avg_prep_time_min   INTEGER DEFAULT 30,
    
    -- Coordonnées GPS (géocodées une fois au setup)
    lat             DECIMAL(10,7),
    lng             DECIMAL(10,7),
    
    opening_hours   JSONB DEFAULT '{}',
    
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. LIGNES TÉLÉPHONIQUES
-- ============================================================
CREATE TABLE phone_lines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id   UUID UNIQUE NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    phone_number    VARCHAR(20) UNIQUE NOT NULL,
    provider        VARCHAR(50) DEFAULT 'ovh',
    sip_domain      VARCHAR(255),
    sip_username    VARCHAR(255),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. CLIENTS (par numéro de tel, par resto)
--    L'IA reconnaît le client au 2e appel
-- ============================================================
CREATE TABLE customers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    phone           VARCHAR(20) NOT NULL,       -- numéro de l'appelant
    first_name      VARCHAR(100),               -- prénom
    last_name       VARCHAR(100),               -- nom (optionnel)
    
    -- Adresse de livraison (mémorisée)
    delivery_address    TEXT,                    -- "12 rue de la Paix"
    delivery_city       VARCHAR(100),            -- "Marseille"
    delivery_postal_code VARCHAR(10),            -- "13001"
    delivery_notes      TEXT,                    -- "code 1234, 3e étage"
    delivery_lat        DECIMAL(10,7),           -- coordonnées géocodées
    delivery_lng        DECIMAL(10,7),           -- pour calcul distance
    
    -- Stats
    total_orders    INTEGER DEFAULT 0,
    total_spent     DECIMAL(10,2) DEFAULT 0,
    last_order_at   TIMESTAMPTZ,
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    
    -- Un client unique par tel + resto
    UNIQUE(restaurant_id, phone)
);

-- ============================================================
-- 4. CATÉGORIES DU MENU
-- ============================================================
CREATE TABLE menu_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    display_order   INTEGER DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- 5. ARTICLES DU MENU
-- ============================================================
CREATE TABLE menu_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    category_id     UUID REFERENCES menu_categories(id) ON DELETE SET NULL,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    price           DECIMAL(8,2) NOT NULL,
    options         JSONB DEFAULT '[]',
    allergens       TEXT[],
    tags            TEXT[],
    is_available    BOOLEAN DEFAULT TRUE,
    display_order   INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. APPELS
-- ============================================================
CREATE TABLE calls (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id   UUID NOT NULL REFERENCES restaurants(id),
    phone_line_id   UUID REFERENCES phone_lines(id),
    customer_id     UUID REFERENCES customers(id),  -- lié au client si trouvé
    
    caller_number   VARCHAR(20) NOT NULL,
    
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    duration_sec    INTEGER,
    
    transcript      JSONB DEFAULT '[]',
    
    outcome         VARCHAR(50) DEFAULT 'in_progress',
    -- order_placed, abandoned, info_only, error
    
    cost_telecom    DECIMAL(8,4) DEFAULT 0,
    cost_ai         DECIMAL(8,4) DEFAULT 0,
    
    recording_url   TEXT,
    error_log       TEXT,
    
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. COMMANDES
-- ============================================================
CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id   UUID NOT NULL REFERENCES restaurants(id),
    call_id         UUID NOT NULL REFERENCES calls(id),
    customer_id     UUID REFERENCES customers(id),
    order_number    SERIAL,
    
    -- Client (snapshot au moment de la commande)
    customer_name   VARCHAR(255),
    customer_phone  VARCHAR(20) NOT NULL,
    
    -- Type
    order_type      VARCHAR(20) NOT NULL DEFAULT 'pickup',
    delivery_address TEXT,                       -- copié depuis customer ou nouveau
    
    -- Montant
    total           DECIMAL(8,2) NOT NULL DEFAULT 0,
    
    -- Status
    status          VARCHAR(50) DEFAULT 'pending',
    estimated_ready_at TIMESTAMPTZ,
    
    payment_method  VARCHAR(50) DEFAULT 'cash',
    notes           TEXT,
    
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. LIGNES DE COMMANDE
-- ============================================================
CREATE TABLE order_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id    UUID REFERENCES menu_items(id) ON DELETE SET NULL,
    name            VARCHAR(255) NOT NULL,
    quantity        INTEGER NOT NULL DEFAULT 1,
    unit_price      DECIMAL(8,2) NOT NULL,
    total_price     DECIMAL(8,2) NOT NULL,
    selected_options JSONB DEFAULT '[]',
    notes           TEXT
);

-- ============================================================
-- INDEX
-- ============================================================
CREATE INDEX idx_customers_phone        ON customers(restaurant_id, phone);
CREATE INDEX idx_calls_restaurant       ON calls(restaurant_id);
CREATE INDEX idx_calls_caller           ON calls(caller_number);
CREATE INDEX idx_calls_customer         ON calls(customer_id);
CREATE INDEX idx_calls_started          ON calls(started_at DESC);
CREATE INDEX idx_orders_restaurant      ON orders(restaurant_id);
CREATE INDEX idx_orders_status          ON orders(restaurant_id, status);
CREATE INDEX idx_orders_customer        ON orders(customer_id);
CREATE INDEX idx_orders_created         ON orders(created_at DESC);
CREATE INDEX idx_order_items_order      ON order_items(order_id);
CREATE INDEX idx_menu_items_restaurant  ON menu_items(restaurant_id);
CREATE INDEX idx_phone_lines_number     ON phone_lines(phone_number);

-- ============================================================
-- VUES
-- ============================================================

-- Stats appels par resto
CREATE VIEW v_restaurant_stats AS
SELECT 
    r.id AS restaurant_id,
    r.name AS restaurant_name,
    COUNT(DISTINCT c.id) AS total_calls,
    COUNT(DISTINCT c.id) FILTER (WHERE c.outcome = 'order_placed') AS calls_with_order,
    ROUND(AVG(c.duration_sec)) AS avg_call_duration_sec,
    SUM(c.duration_sec) AS total_duration_sec,
    COUNT(DISTINCT cu.id) AS total_customers,
    SUM(c.cost_telecom + c.cost_ai) AS total_cost
FROM restaurants r
LEFT JOIN calls c ON c.restaurant_id = r.id
LEFT JOIN customers cu ON cu.restaurant_id = r.id
GROUP BY r.id, r.name;

-- Top clients par resto
CREATE VIEW v_top_customers AS
SELECT 
    cu.*,
    r.name AS restaurant_name
FROM customers cu
JOIN restaurants r ON r.id = cu.restaurant_id
ORDER BY cu.total_orders DESC;
