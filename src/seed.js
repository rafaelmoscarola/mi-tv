// Catálogo sugerido inicial. q = @usuario (seguro) o nombre (se busca en YouTube y lo confirmás vos).
// always = transmite las 24 horas.
export const SEED = [
  // Lo más visto
  ...['Bondi Live', 'Blender', 'Gelatina', 'Takawishi', 'Carajo stream', 'Neura', 'Vorterix', 'Un Poco de Ruido', 'Menjunje stream'].map(
    (q) => ({ q, category: 'Lo más visto' })
  ),
  // Noticias 24 horas
  ...['TN Todo Noticias', 'C5N', 'A24', 'LN+', 'Crónica TV', 'Canal 26', 'IP Noticias', 'TV Pública'].map((q) => ({
    q,
    category: 'Noticias',
    always: true,
  })),
  // Noticias: portales y streaming periodístico
  ...['Infobae', 'Clarín', 'La Nación', 'Perfil', 'El Destape', 'Ámbito', 'AURA streaming', 'Cenital', 'Marcelo Longobardi', 'El Observador 107.9'].map(
    (q) => ({ q, category: 'Noticias' })
  ),
  // Radios con video
  ...['Radio Mitre', 'La 100', 'Rock & Pop', 'Urbana Play', 'Radio con Vos', 'Radio Rivadavia', 'Radio La Red', 'Radio 10', 'AM750', 'Radio Continental', 'Cadena 3'].map(
    (q) => ({ q, category: 'Radios' })
  ),
  // Deportes
  { q: '@VestuarioStream', category: 'Deportes' },
  { q: '@solodeportesoficial', category: 'Deportes' },
  ...['La Canchita TV', 'Deportes al Taco', 'Liga Profesional AFA', 'River Plate', 'Boca Juniors', 'Racing Club', 'Independiente', 'San Lorenzo', 'Club Atlético Colón', 'Club Atlético Unión', 'Rosario Central', "Newell's Old Boys", 'ACTC Turismo Carretera', 'Turismo Nacional'].map(
    (q) => ({ q, category: 'Deportes' })
  ),
  { q: 'DeporTV', category: 'Deportes', always: true },
  // Música y folclore
  ...['Bombo TV', 'Folklore y Tradición', 'ANF TV Academia Nacional del Folklore', 'FA! Falklore', 'Aquí Cosquín'].map((q) => ({
    q,
    category: 'Folclore',
  })),
  // Humor y espectáculos
  { q: '@CarnavalStream', category: 'Espectáculos' },
  ...['Bendito Stream', 'Telefe'].map((q) => ({ q, category: 'Espectáculos' })),
  // Autos
  ...['Chery Argentina', 'GWM Argentina', 'BYD Argentina', 'Toyota Argentina', 'Parabrisas autos', '16 Válvulas', 'Autoweb Argentina'].map((q) => ({
    q,
    category: 'Autos',
  })),
  // Campo
  ...['Agrofy News', 'ROSGAN', 'AFA Agricultores Federados Argentinos', 'Canal Rural Argentina'].map((q) => ({ q, category: 'Campo' })),
  // Viajes
  ...['Luisito Comunica', 'Alan por el mundo', 'Araya Vlogs', 'Paco Nadal', 'Mochileros TV'].map((q) => ({ q, category: 'Viajes' })),
  // Salud
  ...['Fundación Favaloro', 'Instituto Alexander Fleming', 'Hospital Italiano de Buenos Aires', 'Hospital Alemán Buenos Aires', 'Hospital Garrahan', 'Dr. Alberto Cormillot'].map(
    (q) => ({ q, category: 'Salud' })
  ),
  // Fe
  ...['Canal Orbe 21', 'Santuario de Luján', 'Catedral de Morón', 'Radio María Argentina'].map((q) => ({ q, category: 'Fe' })),
  // Regional
  { q: 'Aire de Santa Fe', category: 'Regional', always: true },
  ...['Telefe Rosario', 'El Tres Rosario', 'La Voz del Interior'].map((q) => ({ q, category: 'Regional' })),
  // Infantil
  { q: 'Pakapaka', category: 'Infantil' },
  { q: 'Encuentro', category: 'Infantil' },

  // ===== Tanda 2: señales 24 horas =====
  // Radios argentinas con video en YouTube
  ...['Metro 95.1', 'Pop 101.5 radio', 'Los 40 Argentina', 'Radio Nacional Argentina', 'Radio del Plata AM 1030', 'Radio Ciudad AM 1110', 'CNN Radio Argentina', 'Radio Nihuil Mendoza', 'LV10 Radio de Cuyo', 'LT8 La Ocho Rosario', 'LT3 Rosario', 'Radio 2 Rosario', 'LV2 Radio General Paz Córdoba', 'Radio Suquía'].map(
    (q) => ({ q, category: 'Radios', always: true })
  ),
  // Noticias y canales del interior
  ...['Canal E Argentina', 'Net TV Argentina'].map((q) => ({ q, category: 'Noticias', always: true })),
  ...['El Doce Córdoba', 'Canal 10 Córdoba', 'Canal 7 Mendoza', 'Canal 9 Televida Mendoza', 'Canal 13 San Juan', 'Canal 5 Rosario', 'Celta TV Tres Arroyos'].map(
    (q) => ({ q, category: 'Regional', always: true })
  ),
  // Naturaleza: cámaras de fauna y espacio
  ...['Explore Live Nature Cams', 'Africam', 'Monterey Bay Aquarium', 'International Wolf Center', 'Cornell Lab Bird Cams', 'Directo Natura', 'NASA', 'San Diego Zoo', 'Animal Planet Latinoamérica'].map(
    (q) => ({ q, category: 'Naturaleza', always: true })
  ),
  { q: '@BrownvillesFoodPantryForDeer', category: 'Naturaleza', always: true },
  // Ciudades y paisajes del mundo
  ...['EarthCam', 'EarthTV', 'SkylineWebcams'].map((q) => ({ q, category: 'Ciudades en vivo', always: true })),
  { q: 'Lofi Girl', category: 'Paisajes y relax', always: true },
  // Entretenimiento 24 horas en español (maratones)
  ...['Investigation Discovery Latinoamérica', 'Discovery en Español', 'Caso Cerrado'].map((q) => ({ q, category: 'Espectáculos', always: true })),
  { q: 'Food Network Latinoamérica', category: 'Cocina', always: true },
  { q: 'HGTV Latinoamérica', category: 'Hogar y obra', always: true },
  // Deportes: transmiten eventos en vivo (no las 24 horas)
  ...['Red Bull TV', 'FIFA+', 'Olympics', 'World Surf League', 'Formula 1'].map((q) => ({ q, category: 'Deportes' })),
];
