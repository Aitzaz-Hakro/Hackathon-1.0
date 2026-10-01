-- =============================================================================
-- 0004_seed_reference.sql
-- Reference data: departments, labs, equipment categories, equipment, rules.
--
-- Run after 0003_conflict_guard.sql.
--
-- Idempotent — every insert is keyed on a natural unique column with
-- ON CONFLICT DO NOTHING, so re-running will not duplicate rows.
--
-- Historical bookings are NOT seeded here. They require real `profiles.id`
-- values, which only exist once the auth users are created. See
-- `scripts/seed-users.ts`, which runs after this file and seeds the booking
-- history that the analytics and heatmap read from.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Departments
-- -----------------------------------------------------------------------------

insert into departments (name, code, head_name) values
  ('Computer Science',        'CS',  'Dr. Ayesha Khan'),
  ('Electrical Engineering',  'EE',  'Dr. Bilal Ahmed'),
  ('Mechanical Engineering',  'ME',  'Dr. Sana Malik'),
  ('Physics',                 'PHY', 'Dr. Omar Farooq')
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Labs
-- -----------------------------------------------------------------------------

insert into labs (name, code, department_id, capacity, location, facilities, open_time, close_time, status, description)
select v.name, v.code, d.id, v.capacity, v.location, v.facilities, v.open_time::time, v.close_time::time, v.status::lab_status, v.description
from (values
  ('Software Engineering Lab', 'CS-LAB-SE', 'CS',  40, 'Block A, Room 101',
    array['Desktop PCs', 'Projector', 'Whiteboard', 'Air Conditioning'], '08:00', '20:00', 'available',
    'General-purpose programming lab with 40 workstations.'),
  ('Networking & Security Lab', 'CS-LAB-NET', 'CS', 25, 'Block A, Room 204',
    array['Cisco Routers', 'Switches', 'Patch Panels', 'Projector'], '09:00', '18:00', 'available',
    'Network topology experiments and security coursework.'),
  ('AI & Data Science Lab', 'CS-LAB-AI', 'CS', 30, 'Block A, Room 310',
    array['GPU Workstations', 'Projector', 'Whiteboard'], '08:00', '22:00', 'available',
    'GPU-backed workstations for model training.'),
  ('Embedded Systems Lab', 'EE-LAB-EMB', 'EE', 30, 'Block B, Room 105',
    array['Soldering Stations', 'Oscilloscopes', 'Arduino Kits', 'Power Supplies'], '08:00', '18:00', 'available',
    'Microcontroller and embedded coursework.'),
  ('Electronics & Circuits Lab', 'EE-LAB-ELX', 'EE', 35, 'Block B, Room 108',
    array['Oscilloscopes', 'Function Generators', 'Breadboards', 'Multimeters'], '08:00', '18:00', 'available',
    'Analog and digital circuit experiments.'),
  ('CAD/CAM Lab', 'ME-LAB-CAD', 'ME', 28, 'Block C, Room 202',
    array['Workstations', '3D Printers', 'Plotter', 'Projector'], '09:00', '18:00', 'available',
    'Solid modelling, simulation and rapid prototyping.'),
  ('Mechanical Workshop', 'ME-LAB-WS', 'ME', 20, 'Block C, Ground Floor',
    array['Lathe', 'Drill Press', 'Welding Bay', 'Hand Tools'], '08:00', '17:00', 'available',
    'Fabrication and machining. Requires safety briefing.'),
  ('Physics Laboratory', 'PHY-LAB-1', 'PHY', 32, 'Block D, Room 011',
    array['Optics Bench', 'Spectrometers', 'Vacuum Pumps'], '08:00', '17:00', 'available',
    'Optics, mechanics and modern physics experiments.')
) as v(name, code, dept_code, capacity, location, facilities, open_time, close_time, status, description)
join departments d on d.code = v.dept_code
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Equipment categories
-- -----------------------------------------------------------------------------

insert into equipment_categories (name, description, requires_approval) values
  ('Microcontrollers',   'Arduino, ESP32, Raspberry Pi Pico and similar boards',        false),
  ('Single Board Computers', 'Raspberry Pi and similar SBCs',                            true),
  ('Projectors',         'Portable and ceiling-mounted projectors',                      false),
  ('Laptops',            'Loanable laptops and chargers',                                true),
  ('Cameras',            'DSLR, mirrorless and action cameras',                          true),
  ('Networking Devices', 'Routers, switches, access points and cables',                  false),
  ('Oscilloscopes',      'Digital and analog oscilloscopes',                             false),
  ('Power Supplies',     'Bench power supplies and function generators',                 false),
  ('Sensors & Modules',  'Sensor breakouts, motor drivers and interface modules',        false),
  ('VR Headsets',        'Virtual and augmented reality headsets',                       true),
  ('3D Printing',        'Filament, resin and spare nozzles',                            false)
on conflict (name) do nothing;

-- -----------------------------------------------------------------------------
-- Equipment
--
-- `total_quantity` is the only quantity stored. Available is derived in the
-- `equipment_availability` view.
-- -----------------------------------------------------------------------------

insert into equipment (name, asset_code, category_id, lab_id, total_quantity, condition, maintenance_status, damage_count, description)
select v.name, v.asset_code, c.id, l.id, v.total_quantity, v.condition::equipment_condition, v.maintenance::maintenance_status, v.damage_count, v.description
from (values
  ('Arduino Uno Kit',        'ARD-UNO-01', 'Microcontrollers',       'EE-LAB-EMB', 20, 'good', 'operational',       1, 'Uno R3 with breadboard, jumpers and component set.'),
  ('Arduino Mega Kit',       'ARD-MEGA-01','Microcontrollers',       'EE-LAB-EMB', 10, 'good', 'operational',       0, 'Mega 2560 with sensor shield.'),
  ('ESP32 Dev Board',        'ESP32-01',   'Microcontrollers',       'EE-LAB-EMB', 15, 'good', 'operational',       0, 'Wi-Fi and Bluetooth development board.'),
  ('Raspberry Pi 4 (4GB)',   'RPI4-01',    'Single Board Computers', 'CS-LAB-AI',  12, 'good', 'operational',       0, 'Quad-core SBC with case and PSU.'),
  ('Raspberry Pi 5 (8GB)',   'RPI5-01',    'Single Board Computers', 'CS-LAB-AI',   6, 'new',  'operational',       0, 'Latest generation SBC.'),
  ('Epson EB-X51 Projector', 'PRJ-EPS-01', 'Projectors',             'CS-LAB-SE',   4, 'good', 'operational',       0, 'Portable 3800 lumen projector.'),
  ('BenQ MH733 Projector',   'PRJ-BEN-01', 'Projectors',             'ME-LAB-CAD',  3, 'fair', 'needs_service',     1, 'Lamp nearing end of life.'),
  ('Dell Latitude 5540',     'LAP-DEL-01', 'Laptops',                'CS-LAB-SE',   8, 'good', 'operational',       0, 'Loaner laptop with charger and bag.'),
  ('MacBook Air M2',         'LAP-MAC-01', 'Laptops',                'CS-LAB-AI',   3, 'new',  'operational',       0, 'For iOS and design coursework.'),
  ('Canon EOS 250D',         'CAM-CAN-01', 'Cameras',                'CS-LAB-AI',   4, 'good', 'operational',       1, 'DSLR with 18-55mm lens.'),
  ('GoPro Hero 12',          'CAM-GOP-01', 'Cameras',                'CS-LAB-NET',  5, 'good', 'operational',       0, 'Action camera with mounts.'),
  ('Cisco Catalyst 2960',    'NET-CIS-01', 'Networking Devices',     'CS-LAB-NET',  6, 'good', 'operational',       0, '24-port managed switch.'),
  ('TP-Link Archer AX55',    'NET-TPL-01', 'Networking Devices',     'CS-LAB-NET', 10, 'good', 'operational',       0, 'Wi-Fi 6 router for lab topologies.'),
  ('Rigol DS1054Z',          'OSC-RIG-01', 'Oscilloscopes',          'EE-LAB-ELX',  8, 'good', 'operational',       0, '50 MHz 4-channel oscilloscope.'),
  ('Tektronix TBS1102',      'OSC-TEK-01', 'Oscilloscopes',          'EE-LAB-EMB',  5, 'fair', 'under_maintenance', 2, 'Channel 2 intermittently faulty.'),
  ('Bench PSU 30V/5A',       'PSU-30V-01', 'Power Supplies',         'EE-LAB-ELX', 12, 'good', 'operational',       0, 'Adjustable DC bench supply.'),
  ('Function Generator',     'FGN-01',     'Power Supplies',         'EE-LAB-ELX',  6, 'good', 'operational',       0, '2 MHz arbitrary waveform generator.'),
  ('Ultrasonic Sensor Pack', 'SEN-US-01',  'Sensors & Modules',      'EE-LAB-EMB', 30, 'good', 'operational',       2, 'HC-SR04 packs, 5 units per pack.'),
  ('IMU Module Pack',        'SEN-IMU-01', 'Sensors & Modules',      'EE-LAB-EMB', 20, 'good', 'operational',       0, 'MPU6050 accelerometer and gyroscope.'),
  ('L298N Motor Driver',     'SEN-MOT-01', 'Sensors & Modules',      'ME-LAB-WS',  15, 'fair', 'operational',       3, 'Dual H-bridge driver boards.'),
  ('Meta Quest 3',           'VR-META-01', 'VR Headsets',            'CS-LAB-AI',   4, 'new',  'operational',       0, 'Mixed reality headset with controllers.'),
  ('HTC Vive Pro',           'VR-HTC-01',  'VR Headsets',            'CS-LAB-AI',   2, 'fair', 'needs_service',     1, 'Base stations require recalibration.'),
  ('PLA Filament 1kg',       'FIL-PLA-01', '3D Printing',            'ME-LAB-CAD', 25, 'new',  'operational',       0, 'Assorted colours.'),
  ('Resin 1L',               'FIL-RES-01', '3D Printing',            'ME-LAB-CAD',  8, 'new',  'operational',       0, 'UV resin for SLA printer.'),
  ('Nozzle Set 0.4mm',       'NOZ-04-01',  '3D Printing',            'ME-LAB-CAD', 40, 'new',  'operational',       0, 'Brass replacement nozzles.')
) as v(name, asset_code, cat_name, lab_code, total_quantity, condition, maintenance, damage_count, description)
join equipment_categories c on c.name = v.cat_name
left join labs l on l.code = v.lab_code
on conflict (asset_code) do nothing;

-- -----------------------------------------------------------------------------
-- Booking rules, one row per department
-- -----------------------------------------------------------------------------

insert into booking_rules (department_id, max_duration_minutes, max_equipment_quantity, advance_booking_days, requires_approval, allow_student_booking)
select d.id, v.max_duration, v.max_qty, v.advance_days, v.requires_approval, v.allow_students
from (values
  ('CS',  240, 10, 30, true,  true),
  ('EE',  180,  8, 21, true,  true),
  ('ME',  180,  5, 14, true,  true),
  ('PHY', 120,  4, 14, false, true)
) as v(dept_code, max_duration, max_qty, advance_days, requires_approval, allow_students)
join departments d on d.code = v.dept_code
on conflict (department_id) do nothing;
