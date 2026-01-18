-- 1. Create practice_prompts table
CREATE TABLE IF NOT EXISTS practice_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('reading', 'vocab', 'interview', 'debate')),
  title text NOT NULL,
  content text NOT NULL, -- The main text, question, or quote
  meta jsonb DEFAULT '{}'::jsonb, -- For words list, stance, author, etc.
  difficulty text DEFAULT 'medium',
  category text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 2. Update attempts table practice_type constraint
-- We need to drop the old check and add a new one
ALTER TABLE attempts DROP CONSTRAINT IF EXISTS attempts_practice_type_check;
ALTER TABLE attempts ADD CONSTRAINT attempts_practice_type_check 
  CHECK (practice_type IN ('topic', 'reading', 'vocab', 'interview', 'debate', 'improv')); -- Added 'improv' just in case, though 'topic' was used

-- 3. Seed Data

-- Reading (Migrating some from reading_materials concept or adding new)
INSERT INTO practice_prompts (type, title, content, meta, category) VALUES
('reading', 'El Quijote (Inicio)', 'En un lugar de la Mancha, de cuyo nombre no quiero acordarme, no ha mucho tiempo que vivía un hidalgo de los de lanza en astillero, adarga antigua, rocín flaco y galgo corredor.', '{"author": "Miguel de Cervantes"}'::jsonb, 'Literatura'),
('reading', 'Discurso Steve Jobs', 'Tu tiempo es limitado, así que no lo malgastes viviendo la vida de otro. No te dejes atrapar por el dogma, que es vivir según los resultados del pensamiento de otros.', '{"author": "Steve Jobs"}'::jsonb, 'Inspiración');

-- Vocab Challenge
INSERT INTO practice_prompts (type, title, content, meta, difficulty) VALUES
('vocab', 'Desafío Creativo', 'Integra estas palabras en una historia coherente.', '{"words": ["Efímero", "Resiliencia", "Serendipia"]}'::jsonb, 'hard'),
('vocab', 'Mundo Corporativo', 'Usa estos términos en una presentación de negocios.', '{"words": ["Sinergia", "Disruptivo", "Escalabilidad"]}'::jsonb, 'medium'),
('vocab', 'Naturaleza', 'Describe un paisaje usando estas palabras.', '{"words": ["Frondoso", "Cristalino", "Crepúsculo"]}'::jsonb, 'easy');

-- Interview Simulator
INSERT INTO practice_prompts (type, title, content, category) VALUES
('interview', 'Liderazgo', 'Cuéntame de una vez en la que tuviste que liderar un equipo difícil. ¿Qué hiciste y cuál fue el resultado?', 'Comportamiento'),
('interview', 'Debilidad', '¿Cuál consideras que es tu mayor debilidad profesional y cómo trabajas en ella?', 'Personal'),
('interview', 'Conflicto', 'Describe una situación en la que estuviste en desacuerdo con un supervisor. ¿Cómo lo manejaste?', 'Conflicto');

-- Debate Mode
INSERT INTO practice_prompts (type, title, content, meta) VALUES
('debate', 'IA vs Arte', 'La Inteligencia Artificial reemplazará a los artistas humanos y eso es positivo para el progreso.', '{"stance": "AGAINST"}'::jsonb),
('debate', 'Trabajo Remoto', 'El trabajo 100% remoto destruye la cultura empresarial y la innovación colaborativa.', '{"stance": "FOR"}'::jsonb),
('debate', 'Redes Sociales', 'Las redes sociales hacen más daño que bien a la sociedad adolescente.', '{"stance": "AGAINST"}'::jsonb);
