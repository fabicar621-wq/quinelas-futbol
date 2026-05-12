/**
 * historyData.js
 * Base de datos histórica de resultados de quinelas Progol.
 * Cada entrada guarda los resultados reales y las probabilidades que se usaron,
 * permitiendo al sistema aprender y calibrar futuras predicciones.
 */

export const historyResults = [
  {
    concurso: "2332",
    fecha: "8 - 10 de Mayo, 2026",
    results: [
      { id: 1, home: "Guadalajara", away: "Tigres", league: "Liga MX", probL: 38, probE: 30, probV: 32, result: "L" },
      { id: 2, home: "Pachuca", away: "Toluca", league: "Liga MX", probL: 26, probE: 33, probV: 41, result: "L" },
      { id: 3, home: "Pumas", away: "América", league: "Liga MX", probL: 28, probE: 31, probV: 41, result: "E" },
      { id: 4, home: "Real Sociedad", away: "Betis", league: "LaLiga", probL: 36, probE: 30, probV: 34, result: "E" },
      { id: 5, home: "Barcelona", away: "Real Madrid", league: "LaLiga", probL: 50, probE: 25, probV: 25, result: "L" },
      { id: 6, home: "Fulham", away: "Bournemouth", league: "Premier League", probL: 32, probE: 30, probV: 38, result: "V" },
      { id: 7, home: "Crystal Palace", away: "Everton", league: "Premier League", probL: 33, probE: 32, probV: 35, result: "E" },
      { id: 8, home: "Stuttgart", away: "Leverkusen", league: "Bundesliga", probL: 37, probE: 27, probV: 36, result: "L" },
      { id: 9, home: "Auxerre", away: "Niza", league: "Ligue 1", probL: 36, probE: 31, probV: 33, result: "L" },
      { id: 10, home: "Groningen", away: "Nijmegen", league: "Eredivisie", probL: 31, probE: 28, probV: 41, result: "L" },
      { id: 11, home: "Atlanta United", away: "L.A. Galaxy", league: "MLS", probL: 36, probE: 31, probV: 33, result: "V" },
      { id: 12, home: "Corinthians", away: "Sao Paulo", league: "Brasileirão", probL: 39, probE: 31, probV: 30, result: "L" },
      { id: 13, home: "Gent", away: "Anderlecht", league: "Jupiler Pro League", probL: 36, probE: 31, probV: 33, result: "E" },
      { id: 14, home: "Celtic", away: "Rangers", league: "Premiership Escocia", probL: 40, probE: 29, probV: 31, result: "L" }
    ]
  }
];

/**
 * Calcula estadísticas históricas globales a partir de todos los concursos guardados.
 * Devuelve distribución general, por liga, y patrones en partidos cerrados.
 */
export function getHistoricalStats() {
  const allMatches = historyResults.flatMap(c => c.results);
  const totalMatches = allMatches.length;

  // --- Distribución General ---
  const globalCounts = { L: 0, E: 0, V: 0 };
  allMatches.forEach(m => globalCounts[m.result]++);

  const globalDistribution = {
    L: Math.round((globalCounts.L / totalMatches) * 1000) / 10,
    E: Math.round((globalCounts.E / totalMatches) * 1000) / 10,
    V: Math.round((globalCounts.V / totalMatches) * 1000) / 10,
    totalMatches,
    totalConcursos: historyResults.length
  };

  // --- Distribución por Liga ---
  const leagueMap = {};
  allMatches.forEach(m => {
    if (!leagueMap[m.league]) leagueMap[m.league] = { L: 0, E: 0, V: 0, total: 0 };
    leagueMap[m.league][m.result]++;
    leagueMap[m.league].total++;
  });

  const leagueDistribution = {};
  Object.entries(leagueMap).forEach(([league, counts]) => {
    leagueDistribution[league] = {
      L: Math.round((counts.L / counts.total) * 1000) / 10,
      E: Math.round((counts.E / counts.total) * 1000) / 10,
      V: Math.round((counts.V / counts.total) * 1000) / 10,
      total: counts.total
    };
  });

  // --- Análisis de Partidos Cerrados (spread < 8%) ---
  // Un "partido cerrado" es aquel donde la diferencia entre la prob más alta y más baja es < 8
  const closeMatches = allMatches.filter(m => {
    const max = Math.max(m.probL, m.probE, m.probV);
    const min = Math.min(m.probL, m.probE, m.probV);
    return (max - min) < 8;
  });

  const closeCounts = { L: 0, E: 0, V: 0 };
  closeMatches.forEach(m => closeCounts[m.result]++);
  const closeTotal = closeMatches.length;

  const closeMatchPattern = closeTotal > 0 ? {
    L: Math.round((closeCounts.L / closeTotal) * 1000) / 10,
    E: Math.round((closeCounts.E / closeTotal) * 1000) / 10,
    V: Math.round((closeCounts.V / closeTotal) * 1000) / 10,
    total: closeTotal
  } : null;

  // --- Análisis de Sorpresas (resultado ≠ favorito) ---
  let surprises = 0;
  allMatches.forEach(m => {
    const max = Math.max(m.probL, m.probE, m.probV);
    let predicted;
    if (max === m.probL) predicted = 'L';
    else if (max === m.probE) predicted = 'E';
    else predicted = 'V';
    if (predicted !== m.result) surprises++;
  });

  const surpriseRate = Math.round((surprises / totalMatches) * 1000) / 10;

  // --- Distribución de Resultados por Posición (partido 1-14) ---
  const positionMap = {};
  allMatches.forEach(m => {
    if (!positionMap[m.id]) positionMap[m.id] = { L: 0, E: 0, V: 0, total: 0 };
    positionMap[m.id][m.result]++;
    positionMap[m.id].total++;
  });

  return {
    globalDistribution,
    leagueDistribution,
    closeMatchPattern,
    surpriseRate,
    positionMap,
    rawCounts: globalCounts
  };
}
