-- Recipes Library - browsable recipes with time-based categories
-- Coaches can add custom recipes, clients can browse and request them for their meal plans

-- Time categories enum
-- grab_go: 5 min or less (smoothies, protein snacks, pre-made)
-- quick: 15 min or less
-- meal_prep: batch cooking, make-ahead
-- family: 30+ min, feeds multiple people

CREATE TABLE IF NOT EXISTS recipes (
    id SERIAL PRIMARY KEY,

    -- Coach who created this recipe (NULL for system/API recipes)
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Basic info
    name VARCHAR(500) NOT NULL,
    description TEXT,

    -- Time category
    time_category VARCHAR(20) NOT NULL CHECK (time_category IN ('grab_go', 'quick', 'meal_prep', 'family')),
    prep_time_minutes INTEGER, -- actual prep time in minutes
    cook_time_minutes INTEGER, -- actual cook time in minutes
    servings INTEGER DEFAULT 1,

    -- Nutrition per serving
    calories INTEGER,
    protein DECIMAL(5,1),
    carbs DECIMAL(5,1),
    fat DECIMAL(5,1),

    -- Recipe content
    ingredients TEXT, -- can be plain text or JSON array
    instructions TEXT, -- step by step instructions

    -- Optional extras
    image_url TEXT,
    source_url TEXT, -- if from external API/website
    source VARCHAR(50) DEFAULT 'custom', -- 'custom', 'edamam', etc.
    external_id VARCHAR(255), -- ID from external API if applicable

    -- Tags for filtering (stored as JSON array)
    tags JSONB DEFAULT '[]', -- e.g., ["high-protein", "low-carb", "vegetarian"]

    -- Visibility
    is_public BOOLEAN DEFAULT false, -- true = visible to all clients of this coach

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Recipe requests - when clients want a recipe added to their meal plan
CREATE TABLE IF NOT EXISTS recipe_requests (
    id SERIAL PRIMARY KEY,

    recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    coach_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Request status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),

    -- Optional note from client
    client_note TEXT,

    -- Coach response
    coach_response TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    responded_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_recipes_coach ON recipes(coach_id) WHERE coach_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(time_category);
CREATE INDEX IF NOT EXISTS idx_recipes_public ON recipes(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_recipe_requests_client ON recipe_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_recipe_requests_coach ON recipe_requests(coach_id);
CREATE INDEX IF NOT EXISTS idx_recipe_requests_status ON recipe_requests(status);

-- Enable Row Level Security
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for recipes

-- Coaches can view their own recipes and public recipes from system
CREATE POLICY "Coaches can view own and public recipes" ON recipes
    FOR SELECT USING (
        coach_id = auth.uid()
        OR (coach_id IS NULL AND is_public = true)
    );

-- Coaches can create their own recipes
CREATE POLICY "Coaches can insert own recipes" ON recipes
    FOR INSERT WITH CHECK (coach_id = auth.uid());

-- Coaches can update their own recipes
CREATE POLICY "Coaches can update own recipes" ON recipes
    FOR UPDATE USING (coach_id = auth.uid());

-- Coaches can delete their own recipes
CREATE POLICY "Coaches can delete own recipes" ON recipes
    FOR DELETE USING (coach_id = auth.uid());

-- Clients can view public recipes from their coach
CREATE POLICY "Clients can view coach public recipes" ON recipes
    FOR SELECT USING (
        is_public = true AND (
            coach_id IS NULL
            OR coach_id IN (SELECT coach_id FROM clients WHERE user_id = auth.uid())
        )
    );

-- RLS Policies for recipe_requests

-- Clients can view their own requests
CREATE POLICY "Clients can view own recipe requests" ON recipe_requests
    FOR SELECT USING (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- Clients can create requests
CREATE POLICY "Clients can create recipe requests" ON recipe_requests
    FOR INSERT WITH CHECK (
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    );

-- Coaches can view requests from their clients
CREATE POLICY "Coaches can view client recipe requests" ON recipe_requests
    FOR SELECT USING (coach_id = auth.uid());

-- Coaches can update requests (approve/decline)
CREATE POLICY "Coaches can update recipe requests" ON recipe_requests
    FOR UPDATE USING (coach_id = auth.uid());

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_recipes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS recipes_updated_at ON recipes;
CREATE TRIGGER recipes_updated_at
    BEFORE UPDATE ON recipes
    FOR EACH ROW
    EXECUTE FUNCTION update_recipes_updated_at();
