-- Expand the shared, canonical interest catalogue used by profile setup and
-- Discover. Existing IDs and names are preserved; this is additive only.

insert into public.interests (name) values
  -- Sports and movement
  ('Football'), ('Basketball'), ('Tennis'), ('Volleyball'), ('Baseball'),
  ('Cricket'), ('Rugby'), ('Golf'), ('Running'), ('Cycling'), ('Swimming'),
  ('Yoga'), ('Pilates'), ('Climbing'), ('Surfing'), ('Skateboarding'),
  ('Skiing'), ('Snowboarding'), ('Martial arts'), ('Dance'), ('Badminton'),
  ('Table tennis'), ('Formula 1'), ('Horse riding'),
  -- Creative work and making
  ('Drawing'), ('Painting'), ('Illustration'), ('Sculpture'), ('Pottery'),
  ('Ceramics'), ('Crafts'), ('Sewing'), ('Knitting'), ('Embroidery'),
  ('Woodworking'), ('DIY'), ('Calligraphy'), ('Graphic design'), ('Fashion'),
  ('Architecture'), ('Interior design'), ('Film-making'), ('Theatre'),
  ('Acting'), ('Singing'), ('Playing guitar'), ('Playing piano'),
  -- Food and drink
  ('Baking'), ('Coffee'), ('Tea'), ('Food markets'), ('Street food'),
  ('Vegetarian cooking'), ('Vegan cooking'), ('Wine'), ('Craft beer'),
  ('Mixology'), ('Restaurants'),
  -- Outdoors and nature
  ('Camping'), ('Backpacking'), ('Road trips'), ('Nature walks'), ('Beaches'),
  ('Wildlife'), ('Birdwatching'), ('Stargazing'), ('Gardening'), ('Plants'),
  ('Astronomy'), ('Sustainability'), ('Conservation'),
  -- Culture and entertainment
  ('Podcasts'), ('Documentaries'), ('Anime'), ('Comics'), ('Manga'),
  ('Museums'), ('Galleries'), ('History'), ('Local history'), ('Literature'),
  ('Poetry'), ('Journaling'), ('Classical music'), ('Jazz'), ('Rock music'),
  ('Electronic music'), ('Folk music'), ('Live music'), ('Concerts'),
  ('Festivals'), ('Board games'), ('Chess'), ('Puzzles'), ('Trivia'),
  ('Role-playing games'), ('Cosplay'), ('Collecting'),
  -- Learning and technology
  ('Languages'), ('Linguistics'), ('Philosophy'), ('Psychology'), ('Sociology'),
  ('Coding'), ('Robotics'), ('Data'), ('Mathematics'), ('Education'),
  ('Journalism'), ('Public speaking'), ('Research'),
  -- Travel and place
  ('City breaks'), ('Train travel'), ('Cultural travel'), ('Solo travel'),
  ('Travel planning'), ('Geography'), ('Maps'),
  -- Community and wellbeing
  ('Volunteering'), ('Community projects'), ('Mentoring'), ('Book clubs'),
  ('Debate'), ('Meditation'), ('Mindfulness'), ('Fitness'), ('Nutrition')
on conflict (name) do nothing;
