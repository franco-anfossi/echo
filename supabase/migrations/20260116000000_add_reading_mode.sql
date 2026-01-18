-- Create enum for practice types if not exists (or just check constraint)
-- For simplicity, we'll use a text column with check constraint or just text.
ALTER TABLE attempts 
ADD COLUMN practice_type text NOT NULL DEFAULT 'topic' CHECK (practice_type IN ('topic', 'reading')),
ADD COLUMN target_text text; -- Nullable, used for reading mode

-- Table for reading materials
CREATE TABLE reading_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  difficulty text DEFAULT 'medium',
  category text,
  estimated_duration_seconds int,
  created_at timestamptz DEFAULT now()
);

-- Insert some initial reading materials (Quotes)
INSERT INTO reading_materials (title, content, difficulty, category, estimated_duration_seconds) VALUES
('Discurso de Steve Jobs (Fragmento)', 'Tu tiempo es limitado, así que no lo malgastes viviendo la vida de otro. No te dejes atrapar por el dogma, que es vivir según los resultados del pensamiento de otros. No dejes que el ruido de las opiniones de los demás ahogue tu propia voz interior.', 'medium', 'Inspiración', 30),
('Cien Años de Soledad (Inicio)', 'Muchos años después, frente al pelotón de fusilamiento, el coronel Aureliano Buendía había de recordar aquella tarde remota en que su padre lo llevó a conocer el hielo. Macondo era entonces una aldea de veinte casas de barro y cañabrava construidas a la orilla de un río de aguas diáfanas que se precipitaban por un lecho de piedras pulidas, blancas y enormes como huevos prehistóricos.', 'hard', 'Literatura', 45),
('El Principito (Secreto)', 'He aquí mi secreto, que no puede ser más simple: solo con el corazón se puede ver bien; lo esencial es invisible a los ojos. Lo que hace importante a tu rosa es el tiempo que has perdido con ella.', 'easy', 'Literatura', 20),
('Martin Luther King Jr (I Have a Dream)', 'Tengo un sueño, un solo sueño, seguir soñando. Soñar con la libertad, soñar con la justicia, soñar con la igualdad y ojalá ya no tuviera necesidad de soñarlas.', 'medium', 'Discurso', 25);
