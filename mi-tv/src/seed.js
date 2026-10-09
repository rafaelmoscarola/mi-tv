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
];
