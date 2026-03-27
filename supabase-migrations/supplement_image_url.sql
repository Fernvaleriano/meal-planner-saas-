-- Add image_url column to supplement_library and client_protocols tables
-- Allows coaches to attach a photo/image URL to supplements

-- Add image_url to supplement_library
ALTER TABLE supplement_library ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add image_url to client_protocols
ALTER TABLE client_protocols ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Comment for clarity
COMMENT ON COLUMN supplement_library.image_url IS 'URL of supplement product image (uploaded or pasted by coach)';
COMMENT ON COLUMN client_protocols.image_url IS 'URL of supplement product image (uploaded or pasted by coach)';
