-- Seed all 22 Miners cafe locations into the places table.
-- Each cafe gets source='miners' and a unique slug as source_id.
-- Coordinates come from the CSV data used by the map.

INSERT INTO places (source, source_id, name, address, location, city_id, status)
VALUES
  -- Madrid (3)
  ('miners', 'miners-plaza-espana-madrid', 'The Miners Plaza de España', 'C. de Ventura Rodríguez 12', ST_SetSRID(ST_MakePoint(-3.7136068, 40.4256779), 4326)::geography, 'madrid', 'active'),
  ('miners', 'miners-san-bernardo-madrid', 'The Miners San Bernardo', 'Gta. de Ruiz Giménez 5', ST_SetSRID(ST_MakePoint(-3.7058100, 40.4296200), 4326)::geography, 'madrid', 'active'),
  ('miners', 'miners-pedro-zerolo-madrid', 'The Miners Plaza Pedro Zerolo', 'Pl. de Pedro Zerolo', ST_SetSRID(ST_MakePoint(-3.6994099, 40.4209913), 4326)::geography, 'madrid', 'active'),

  -- Barcelona (5)
  ('miners', 'miners-sagrada-barcelona', 'The Miners Sagrada', 'Carrer de Lepant, 277', ST_SetSRID(ST_MakePoint(2.1759006, 41.4048520), 4326)::geography, 'barcelona', 'active'),
  ('miners', 'miners-rambla-poblenou-barcelona', 'The Miners Rambla Poblenou', 'Rambla del Poblenou, 107, Bajo 1', ST_SetSRID(ST_MakePoint(2.1985535, 41.4029187), 4326)::geography, 'barcelona', 'active'),
  ('miners', 'miners-hospital-clinic-barcelona', 'The Miners Hospital Clinic', 'Carrer de Provença 151', ST_SetSRID(ST_MakePoint(2.1541559, 41.3893424), 4326)::geography, 'barcelona', 'active'),
  ('miners', 'miners-via-augusta-barcelona', 'The Miners Via Augusta', 'Via Augusta 105', ST_SetSRID(ST_MakePoint(2.1484300, 41.4010719), 4326)::geography, 'barcelona', 'active'),
  ('miners', 'miners-gran-via-barcelona', 'The Miners Gran Via', 'Gran Via de les Corts Catalanes, 488/3', ST_SetSRID(ST_MakePoint(2.1567435, 41.3803564), 4326)::geography, 'barcelona', 'active'),

  -- Prague (14)
  ('miners', 'miners-maj-prague', 'The Miners Máj', 'Národní 63/26', ST_SetSRID(ST_MakePoint(14.4194829, 50.0823090), 4326)::geography, 'prague', 'active'),
  ('miners', 'miners-letna-prague', 'The Miners Letná', 'M. Horákové 684/16', ST_SetSRID(ST_MakePoint(14.4309564, 50.0994008), 4326)::geography, 'prague', 'active'),
  ('miners', 'miners-komunardu-prague', 'The Miners Coffee Komunardů', 'Komunardů 35', ST_SetSRID(ST_MakePoint(14.4497265, 50.1042886), 4326)::geography, 'prague', 'active'),
  ('miners', 'miners-victoria-palace-prague', 'The Miners Victoria Palace', 'Vítězné nám. 1145/8', ST_SetSRID(ST_MakePoint(14.3955958, 50.1016751), 4326)::geography, 'prague', 'active'),
  ('miners', 'miners-jzp-prague', 'The Miners JZP', 'Slavíkova 1611/5', ST_SetSRID(ST_MakePoint(14.4481462, 50.0787527), 4326)::geography, 'prague', 'active'),
  ('miners', 'miners-karlin-prague', 'The Miners Coffee Karlín', 'Sokolovská 130/52', ST_SetSRID(ST_MakePoint(14.4443078, 50.0923798), 4326)::geography, 'prague', 'active'),
  ('miners', 'miners-bakery-prague', 'The Miners Bakery', 'Sokolovská 713', ST_SetSRID(ST_MakePoint(14.4606766, 50.0963825), 4326)::geography, 'prague', 'active'),
  ('miners', 'miners-roastery-prague', 'The Miners Roastery', 'DOCK, Boudníkova 11', ST_SetSRID(ST_MakePoint(14.4659874, 50.1039614), 4326)::geography, 'prague', 'active'),
  ('miners', 'miners-port7-prague', 'The Miners Port7', 'Partyzánská 18/23', ST_SetSRID(ST_MakePoint(14.4395349, 50.1112530), 4326)::geography, 'prague', 'active'),
  ('miners', 'miners-churchill-prague', 'The Miners Churchill', 'Italská 2584/69', ST_SetSRID(ST_MakePoint(14.4402804, 50.0846878), 4326)::geography, 'prague', 'active'),
  ('miners', 'miners-old-town-prague', 'The Miners Old Town', 'Železná 490/14', ST_SetSRID(ST_MakePoint(14.4218181, 50.0863821), 4326)::geography, 'prague', 'active'),
  ('miners', 'miners-charles-bridge-prague', 'The Miners Charles Bridge', 'Lázeňská 282/19', ST_SetSRID(ST_MakePoint(14.4060011, 50.0871933), 4326)::geography, 'prague', 'active'),
  ('miners', 'miners-florentinum-prague', 'The Miners Coffee Florentinum', 'Na Florenci 2116/15', ST_SetSRID(ST_MakePoint(14.4356315, 50.0888012), 4326)::geography, 'prague', 'active'),
  ('miners', 'miners-borislavka-prague', 'The Miners Borislavka', 'Evropská 866/71', ST_SetSRID(ST_MakePoint(14.3667547, 50.0985693), 4326)::geography, 'prague', 'active')
ON CONFLICT (source, source_id) DO UPDATE SET
  name = EXCLUDED.name,
  address = EXCLUDED.address,
  location = EXCLUDED.location,
  status = EXCLUDED.status,
  updated_at = now();
