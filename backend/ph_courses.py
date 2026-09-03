"""Directory of major Philippine golf courses (browsable / importable).

Coordinates are course/city-level approximations used to drop the course pin;
exact tee/green/hazard points are mapped per-hole in the app's Course Editor or
on-site via GPS. Not exhaustive, but covers major courses nationwide.
"""

PH_COURSES = [
    # ---- Metro Manila ----
    {"name": "Manila Golf & Country Club", "location": "Makati, Metro Manila", "region": "Metro Manila", "latitude": 14.5560, "longitude": 121.0170, "holeCount": 18},
    {"name": "Wack Wack Golf & Country Club", "location": "Mandaluyong, Metro Manila", "region": "Metro Manila", "latitude": 14.5880, "longitude": 121.0430, "holeCount": 18},
    {"name": "Club Intramuros Golf Course", "location": "Manila, Metro Manila", "region": "Metro Manila", "latitude": 14.5905, "longitude": 120.9750, "holeCount": 18},
    {"name": "Villamor Golf Club", "location": "Pasay, Metro Manila", "region": "Metro Manila", "latitude": 14.5100, "longitude": 121.0200, "holeCount": 18},
    {"name": "Capitol Hills Golf & Country Club", "location": "Quezon City, Metro Manila", "region": "Metro Manila", "latitude": 14.6600, "longitude": 121.0700, "holeCount": 18},
    {"name": "Veterans Golf Course", "location": "Quezon City, Metro Manila", "region": "Metro Manila", "latitude": 14.6300, "longitude": 121.0480, "holeCount": 18},
    # ---- Cavite ----
    {"name": "Manila Southwoods Golf & Country Club", "location": "Carmona, Cavite", "region": "Cavite / Laguna", "latitude": 14.3100, "longitude": 121.0600, "holeCount": 18},
    {"name": "Eagle Ridge Golf & Country Club", "location": "General Trias, Cavite", "region": "Cavite / Laguna", "latitude": 14.3500, "longitude": 120.9000, "holeCount": 18},
    {"name": "Orchard Golf & Country Club", "location": "Dasmariñas, Cavite", "region": "Cavite / Laguna", "latitude": 14.3300, "longitude": 120.9500, "holeCount": 18},
    {"name": "Riviera Golf Club", "location": "Silang, Cavite", "region": "Cavite / Laguna", "latitude": 14.2200, "longitude": 120.9800, "holeCount": 18},
    {"name": "Southlinks Golf Club", "location": "Bacoor, Cavite", "region": "Cavite / Laguna", "latitude": 14.4200, "longitude": 120.9500, "holeCount": 18},
    # ---- Laguna ----
    {"name": "Sta. Elena Golf & Country Club", "location": "Cabuyao, Laguna", "region": "Cavite / Laguna", "latitude": 14.2700, "longitude": 121.1100, "holeCount": 18},
    {"name": "The Country Club", "location": "Sta. Rosa, Laguna", "region": "Cavite / Laguna", "latitude": 14.2700, "longitude": 121.0900, "holeCount": 18},
    {"name": "Canlubang Golf & Country Club", "location": "Calamba, Laguna", "region": "Cavite / Laguna", "latitude": 14.2000, "longitude": 121.1000, "holeCount": 18},
    # ---- Rizal / Tagaytay / Batangas ----
    {"name": "Valley Golf & Country Club", "location": "Antipolo, Rizal", "region": "Rizal", "latitude": 14.5860, "longitude": 121.1280, "holeCount": 18},
    {"name": "The Country Club at Tagaytay Highlands", "location": "Tagaytay, Cavite", "region": "Tagaytay", "latitude": 14.1400, "longitude": 121.0000, "holeCount": 18},
    {"name": "Tagaytay Midlands Golf Club", "location": "Talisay, Batangas", "region": "Tagaytay", "latitude": 14.0900, "longitude": 121.0100, "holeCount": 18},
    {"name": "Splendido Taal Golf Club", "location": "Laurel, Batangas", "region": "Tagaytay", "latitude": 14.0500, "longitude": 120.9700, "holeCount": 18},
    {"name": "Mount Malarayat Golf & Country Club", "location": "Lipa, Batangas", "region": "Batangas", "latitude": 13.9700, "longitude": 121.1800, "holeCount": 18},
    {"name": "Evercrest Golf Club", "location": "Nasugbu, Batangas", "region": "Batangas", "latitude": 14.1800, "longitude": 120.7200, "holeCount": 18},
    {"name": "Calatagan Golf Club", "location": "Calatagan, Batangas", "region": "Batangas", "latitude": 13.8300, "longitude": 120.6300, "holeCount": 18},
    # ---- Central Luzon (Pampanga, Tarlac, Zambales, Bataan, Bulacan) ----
    {"name": "Mimosa Plus Golf Course", "location": "Clark, Pampanga", "region": "Central Luzon", "latitude": 15.1700, "longitude": 120.5300, "holeCount": 18},
    {"name": "Sun Valley Golf & Country Club", "location": "Clark, Pampanga", "region": "Central Luzon", "latitude": 15.2000, "longitude": 120.5500, "holeCount": 18},
    {"name": "Pradera Verde Golf & Country Club", "location": "Lubao, Pampanga", "region": "Central Luzon", "latitude": 14.9400, "longitude": 120.6000, "holeCount": 18},
    {"name": "Luisita Golf & Country Club", "location": "Tarlac City, Tarlac", "region": "Central Luzon", "latitude": 15.4200, "longitude": 120.6000, "holeCount": 18},
    {"name": "Subic Bay Golf & Country Club", "location": "Subic Bay, Zambales", "region": "Central Luzon", "latitude": 14.8000, "longitude": 120.2700, "holeCount": 18},
    {"name": "Anvaya Cove Beach & Nature Club", "location": "Morong, Bataan", "region": "Central Luzon", "latitude": 14.7200, "longitude": 120.2500, "holeCount": 18},
    {"name": "Pinewoods Golf & Country Club", "location": "Baguio-La Trinidad, Benguet", "region": "Northern Luzon", "latitude": 16.4600, "longitude": 120.5900, "holeCount": 9},
    # ---- Northern Luzon ----
    {"name": "Camp John Hay Golf Club", "location": "Baguio City, Benguet", "region": "Northern Luzon", "latitude": 16.4100, "longitude": 120.6200, "holeCount": 18},
    {"name": "Baguio Country Club", "location": "Baguio City, Benguet", "region": "Northern Luzon", "latitude": 16.4000, "longitude": 120.6100, "holeCount": 9},
    {"name": "Fort Ilocandia Golf Course", "location": "Laoag, Ilocos Norte", "region": "Northern Luzon", "latitude": 18.1600, "longitude": 120.5500, "holeCount": 18},
    {"name": "Palm Grove Golf & Country Club", "location": "San Fernando, La Union", "region": "Northern Luzon", "latitude": 16.6100, "longitude": 120.3200, "holeCount": 9},
    # ---- Bicol ----
    {"name": "Haciendas de Naga Golf Club", "location": "Naga City, Camarines Sur", "region": "Bicol", "latitude": 13.6000, "longitude": 123.2400, "holeCount": 18},
    {"name": "Mayon Imperial Golf Course", "location": "Legazpi, Albay", "region": "Bicol", "latitude": 13.2200, "longitude": 123.6800, "holeCount": 9},
    # ---- Visayas: Cebu ----
    {"name": "Cebu Country Club", "location": "Cebu City, Cebu", "region": "Visayas", "latitude": 10.3300, "longitude": 123.9000, "holeCount": 18},
    {"name": "Alta Vista Golf & Country Club", "location": "Cebu City, Cebu", "region": "Visayas", "latitude": 10.2800, "longitude": 123.8500, "holeCount": 18},
    {"name": "Club Filipino de Cebu (Danao)", "location": "Danao City, Cebu", "region": "Visayas", "latitude": 10.5200, "longitude": 124.0300, "holeCount": 18},
    {"name": "Mactan Island Golf Club", "location": "Lapu-Lapu, Cebu", "region": "Visayas", "latitude": 10.3100, "longitude": 124.0100, "holeCount": 18},
    # ---- Visayas: Negros / Iloilo / Bohol / Leyte / Boracay ----
    {"name": "Bacolod Golf & Country Club", "location": "Bacolod City, Negros Occidental", "region": "Visayas", "latitude": 10.6000, "longitude": 122.9800, "holeCount": 18},
    {"name": "Iloilo Golf & Country Club", "location": "Sta. Barbara, Iloilo", "region": "Visayas", "latitude": 10.8200, "longitude": 122.5300, "holeCount": 18},
    {"name": "Fairways & Bluewater Boracay Golf Club", "location": "Malay, Aklan", "region": "Visayas", "latitude": 11.9800, "longitude": 121.9300, "holeCount": 18},
    {"name": "Bohol Golf & Country Club", "location": "Tagbilaran, Bohol", "region": "Visayas", "latitude": 9.6500, "longitude": 123.8500, "holeCount": 9},
    {"name": "Leyte Golf & Country Club", "location": "Tacloban City, Leyte", "region": "Visayas", "latitude": 11.2200, "longitude": 125.0200, "holeCount": 18},
    {"name": "Negros Occidental Golf & Country Club (Marapara)", "location": "Bacolod City, Negros Occidental", "region": "Visayas", "latitude": 10.6700, "longitude": 122.9600, "holeCount": 18},
    # ---- Mindanao: Davao ----
    {"name": "Apo Golf & Country Club", "location": "Davao City, Davao del Sur", "region": "Mindanao", "latitude": 7.0520, "longitude": 125.5170, "holeCount": 18},
    {"name": "Rancho Palos Verdes Golf & Country Club", "location": "Davao City, Davao del Sur", "region": "Mindanao", "latitude": 7.1000, "longitude": 125.6300, "holeCount": 18},
    {"name": "South Pacific Golf & Leisure Estate", "location": "Davao City, Davao del Sur", "region": "Mindanao", "latitude": 7.1900, "longitude": 125.4500, "holeCount": 18},
    # ---- Mindanao: CDO / Bukidnon / Zamboanga / Iligan / others ----
    {"name": "Pueblo de Oro Golf & Country Club", "location": "Cagayan de Oro, Misamis Oriental", "region": "Mindanao", "latitude": 8.4800, "longitude": 124.6000, "holeCount": 18},
    {"name": "Del Monte Golf Club", "location": "Manolo Fortich, Bukidnon", "region": "Mindanao", "latitude": 8.3600, "longitude": 124.8700, "holeCount": 18},
    {"name": "Zamboanga Golf Club", "location": "Zamboanga City", "region": "Mindanao", "latitude": 6.9300, "longitude": 122.0600, "holeCount": 18},
    {"name": "Iligan Golf & Country Club", "location": "Iligan City, Lanao del Norte", "region": "Mindanao", "latitude": 8.2300, "longitude": 124.2400, "holeCount": 18},
    {"name": "KCC Golf Club", "location": "General Santos City, South Cotabato", "region": "Mindanao", "latitude": 6.1200, "longitude": 125.1700, "holeCount": 18},
    {"name": "Camp Evangelista Golf Course", "location": "Cagayan de Oro, Misamis Oriental", "region": "Mindanao", "latitude": 8.4900, "longitude": 124.6600, "holeCount": 9},
    {"name": "Palmas del Mar / Butuan Golf", "location": "Butuan City, Agusan del Norte", "region": "Mindanao", "latitude": 8.9500, "longitude": 125.5400, "holeCount": 9},
    # ---- Additional courses ----
    {"name": "Camp Aguinaldo Golf Club", "location": "Quezon City, Metro Manila", "region": "Metro Manila", "latitude": 14.6100, "longitude": 121.0600, "holeCount": 9},
    {"name": "Navy Golf Club", "location": "Taguig, Metro Manila", "region": "Metro Manila", "latitude": 14.5200, "longitude": 121.0500, "holeCount": 18},
    {"name": "Forest Hills Golf & Country Club", "location": "Antipolo, Rizal", "region": "Rizal", "latitude": 14.6300, "longitude": 121.1600, "holeCount": 18},
    {"name": "Eastridge Golf Club", "location": "Binangonan, Rizal", "region": "Rizal", "latitude": 14.5000, "longitude": 121.1600, "holeCount": 18},
    {"name": "Puerto Azul Golf & Country Club", "location": "Ternate, Cavite", "region": "Cavite / Laguna", "latitude": 14.2800, "longitude": 120.6200, "holeCount": 18},
    {"name": "Sherwood Hills Golf Club", "location": "Trece Martires, Cavite", "region": "Cavite / Laguna", "latitude": 14.2800, "longitude": 120.8700, "holeCount": 18},
    {"name": "Punta Fuego Golf Club", "location": "Nasugbu, Batangas", "region": "Batangas", "latitude": 14.1000, "longitude": 120.6200, "holeCount": 9},
    {"name": "Korea Golf & Country Club", "location": "Clark, Pampanga", "region": "Central Luzon", "latitude": 15.1900, "longitude": 120.5200, "holeCount": 18},
    {"name": "Isabela Golf Club", "location": "Cauayan, Isabela", "region": "Northern Luzon", "latitude": 16.9300, "longitude": 121.7700, "holeCount": 18},
    {"name": "Palawan Golf & Country Club", "location": "Puerto Princesa, Palawan", "region": "Palawan", "latitude": 9.8000, "longitude": 118.7200, "holeCount": 18},
    {"name": "Pueblo de Panay Golf", "location": "Roxas City, Capiz", "region": "Visayas", "latitude": 11.5800, "longitude": 122.7500, "holeCount": 18},
    {"name": "Awang Golf Course", "location": "Datu Odin Sinsuat, Maguindanao", "region": "Mindanao", "latitude": 7.1600, "longitude": 124.2100, "holeCount": 18},
    {"name": "Malaybalay Golf Course", "location": "Malaybalay, Bukidnon", "region": "Mindanao", "latitude": 8.1500, "longitude": 125.1300, "holeCount": 9},
    {"name": "Dole Philippines Golf Club", "location": "Polomolok, South Cotabato", "region": "Mindanao", "latitude": 6.2200, "longitude": 125.0600, "holeCount": 18},
    {"name": "Bacolod Golf (Marapara Extension)", "location": "Bacolod City, Negros Occidental", "region": "Visayas", "latitude": 10.6800, "longitude": 122.9700, "holeCount": 9},
    {"name": "Beverly Place Golf Club", "location": "San Mateo, Rizal", "region": "Rizal", "latitude": 14.6900, "longitude": 121.1200, "holeCount": 9},
    {"name": "Riverbend Golf & Country Club", "location": "Bacolor, Pampanga", "region": "Central Luzon", "latitude": 14.9900, "longitude": 120.6400, "holeCount": 18},
    {"name": "Camp John Hay - Scout Barrio Nine", "location": "Baguio City, Benguet", "region": "Northern Luzon", "latitude": 16.4050, "longitude": 120.6150, "holeCount": 9},
    # ---- Batch 3 ----
    {"name": "The Palms Country Club", "location": "Alabang, Muntinlupa", "region": "Metro Manila", "latitude": 14.4200, "longitude": 121.0300, "holeCount": 9},
    {"name": "Alabang Country Club", "location": "Muntinlupa, Metro Manila", "region": "Metro Manila", "latitude": 14.4200, "longitude": 121.0200, "holeCount": 9},
    {"name": "Summit Point Golf & Country Club", "location": "Lipa, Batangas", "region": "Batangas", "latitude": 13.9500, "longitude": 121.1300, "holeCount": 18},
    {"name": "Caliraya Springs Golf Club", "location": "Lumban, Laguna", "region": "Cavite / Laguna", "latitude": 14.2800, "longitude": 121.5500, "holeCount": 18},
    {"name": "Clearwater (Sacobia) Golf Course", "location": "Bamban, Tarlac", "region": "Central Luzon", "latitude": 15.2400, "longitude": 120.5400, "holeCount": 18},
    {"name": "Fort Magsaysay Golf Course", "location": "Palayan, Nueva Ecija", "region": "Central Luzon", "latitude": 15.5400, "longitude": 121.0800, "holeCount": 9},
    {"name": "Kingsborough Golf Club", "location": "Marilao, Bulacan", "region": "Central Luzon", "latitude": 14.7600, "longitude": 120.9400, "holeCount": 9},
    {"name": "Cagayan Golf & Country Club", "location": "Tuguegarao, Cagayan", "region": "Northern Luzon", "latitude": 17.6100, "longitude": 121.7200, "holeCount": 9},
    {"name": "Negros Oriental Golf & Country Club", "location": "Dumaguete, Negros Oriental", "region": "Visayas", "latitude": 9.3100, "longitude": 123.3000, "holeCount": 9},
    {"name": "Camp Keithley Golf Course", "location": "Marawi, Lanao del Sur", "region": "Mindanao", "latitude": 8.0000, "longitude": 124.3000, "holeCount": 9},
    # ---- Batch 4 ----
    {"name": "Palo Alto Golf & Country Club", "location": "Baras, Rizal", "region": "Rizal", "latitude": 14.5300, "longitude": 121.2700, "holeCount": 18},
    {"name": "Timberland Highlands Golf Course", "location": "San Mateo, Rizal", "region": "Rizal", "latitude": 14.7200, "longitude": 121.1300, "holeCount": 9},
    {"name": "Ponderosa Golf & Country Club", "location": "Tuba, Benguet", "region": "Northern Luzon", "latitude": 16.3600, "longitude": 120.6000, "holeCount": 9},
    {"name": "Camp Panacan Golf Course", "location": "Davao City, Davao del Sur", "region": "Mindanao", "latitude": 7.1300, "longitude": 125.6500, "holeCount": 9},
    # ---- Batch 5 ----
    {"name": "Southwoods Ridge Golf Club", "location": "Biñan, Laguna", "region": "Cavite / Laguna", "latitude": 14.3200, "longitude": 121.0800, "holeCount": 18},
    {"name": "Royale Tagaytay Country Club", "location": "Alfonso, Cavite", "region": "Tagaytay", "latitude": 14.1300, "longitude": 120.8500, "holeCount": 18},
    {"name": "Aquamarine Golf Course", "location": "Silang, Cavite", "region": "Cavite / Laguna", "latitude": 14.2300, "longitude": 120.9700, "holeCount": 9},
    {"name": "Sacobia Golf Club", "location": "Angeles, Pampanga", "region": "Central Luzon", "latitude": 15.1800, "longitude": 120.5600, "holeCount": 18},
    {"name": "Nueva Ecija Golf & Country Club", "location": "Cabanatuan, Nueva Ecija", "region": "Central Luzon", "latitude": 15.4900, "longitude": 120.9700, "holeCount": 9},
    {"name": "Aguinaldo Highway Golf Range", "location": "Dasmariñas, Cavite", "region": "Cavite / Laguna", "latitude": 14.3200, "longitude": 120.9400, "holeCount": 9},
    {"name": "Vista del Mar Golf Course", "location": "Talomo, Davao City", "region": "Mindanao", "latitude": 7.0600, "longitude": 125.5600, "holeCount": 18},
    {"name": "Sarangani Highlands Golf Club", "location": "Alabel, Sarangani", "region": "Mindanao", "latitude": 6.1000, "longitude": 125.2900, "holeCount": 9},
    {"name": "Sirawai Golf Course", "location": "Cotabato City, Maguindanao", "region": "Mindanao", "latitude": 7.2200, "longitude": 124.2500, "holeCount": 9},
    {"name": "Bantayan Island Golf Course", "location": "Bantayan, Cebu", "region": "Visayas", "latitude": 11.1700, "longitude": 123.7200, "holeCount": 9},
    {"name": "Sta. Barbara (Iloilo) Executive Course", "location": "Sta. Barbara, Iloilo", "region": "Visayas", "latitude": 10.8300, "longitude": 122.5300, "holeCount": 9},
    {"name": "Vigan Golf Club", "location": "Vigan, Ilocos Sur", "region": "Northern Luzon", "latitude": 17.5700, "longitude": 120.3900, "holeCount": 9},
]
