import React, { useState, useEffect } from 'react';
import { currentProgol } from './data/progolData';
import { historyResults, getHistoricalStats } from './data/historyData';
import { activeTickets } from './data/activeTickets';

function App() {
  const [predictions, setPredictions] = useState({});
  const [stats, setStats] = useState({ L: 0, E: 0, V: 0 });
  const [savedTickets, setSavedTickets] = useState(activeTickets || []);
  const [lockedMatches, setLockedMatches] = useState({});
  const [activeTab, setActiveTab] = useState('predictor'); // 'predictor' | 'history'
  const [historicalStats, setHistoricalStats] = useState(null);

  useEffect(() => {
    // Calculate historical stats on mount
    const hStats = getHistoricalStats();
    setHistoricalStats(hStats);

    // Smart initial prediction using historical calibration
    const initial = {};
    currentProgol.matches.forEach(m => {
      const calibrated = getCalibratedProbabilities(m, hStats);
      const max = Math.max(calibrated.L, calibrated.E, calibrated.V);
      if (max === calibrated.L) initial[m.id] = 'L';
      else if (max === calibrated.E) initial[m.id] = 'E';
      else initial[m.id] = 'V';
    });
    setPredictions(initial);
  }, []);

  useEffect(() => {
    const counts = { L: 0, E: 0, V: 0 };
    Object.values(predictions).forEach(v => counts[v]++);
    setStats(counts);
  }, [predictions]);

  /**
   * ALGORITMO CALIBRADO CON DATOS HISTÓRICOS
   * Ajusta las probabilidades originales usando:
   * 1. La distribución histórica real (57% L, 29% E, 14% V)
   * 2. Bonus de empate para partidos cerrados (spread < 8%)
   * 3. Datos específicos por liga si están disponibles
   */
  function getCalibratedProbabilities(match, hStats) {
    if (!hStats) return { L: match.probL, E: match.probE, V: match.probV };

    let { probL, probE, probV } = match;
    const global = hStats.globalDistribution;

    // 1. Calcular el "sesgo del algoritmo" vs realidad histórica
    // Las probabilidades originales promedio del progol tienden a ~35% L / 30% E / 35% V
    // Pero la realidad histórica muestra ~57% L / 29% E / 14% V
    const avgProbL = 35, avgProbE = 30, avgProbV = 35;
    const biasL = global.L / avgProbL;   // >1 significa que locales ganan más de lo esperado
    const biasE = global.E / avgProbE;   // ~1 los empates están bien calibrados
    const biasV = global.V / avgProbV;   // <1 visitantes ganan menos de lo esperado

    // 2. Aplicar corrección de sesgo con peso del 30% (no queremos sobre-corregir)
    const calibrationWeight = 0.30;
    let calL = probL * (1 + (biasL - 1) * calibrationWeight);
    let calE = probE * (1 + (biasE - 1) * calibrationWeight);
    let calV = probV * (1 + (biasV - 1) * calibrationWeight);

    // 3. Bonus para empates en partidos cerrados
    const spread = Math.max(probL, probE, probV) - Math.min(probL, probE, probV);
    if (spread < 8 && hStats.closeMatchPattern) {
      // En partidos cerrados, los empates ocurren ~50% según datos históricos
      const drawBonus = hStats.closeMatchPattern.E / 33.3; // ratio vs distribución uniforme
      calE *= (1 + (drawBonus - 1) * 0.5);
    }

    // 4. Ajuste por liga si tenemos datos
    const leagueData = hStats.leagueDistribution[match.league];
    if (leagueData && leagueData.total >= 2) {
      // Micro-ajuste de 10% basado en tendencia de la liga
      calL *= (1 + (leagueData.L / 50 - 1) * 0.10);
      calE *= (1 + (leagueData.E / 33 - 1) * 0.10);
      calV *= (1 + (leagueData.V / 17 - 1) * 0.10);
    }

    // 5. Normalizar a 100%
    const total = calL + calE + calV;
    return {
      L: Math.round((calL / total) * 100),
      E: Math.round((calE / total) * 100),
      V: 100 - Math.round((calL / total) * 100) - Math.round((calE / total) * 100)
    };
  }

  const togglePrediction = (matchId, value) => {
    setPredictions(prev => ({ ...prev, [matchId]: value }));
  };

  const toggleLock = (matchId) => {
    setLockedMatches(prev => ({ ...prev, [matchId]: !prev[matchId] }));
  };

  const handleAddTicket = () => {
    setSavedTickets(prev => [...prev, { ...predictions, id: Date.now() }]);
  };

  const clearTickets = () => {
    setSavedTickets([]);
  };

  /**
   * GENERADOR MEJORADO DE QUINELAS MÚLTIPLES
   * Mejoras:
   * - Usa probabilidades calibradas en vez de las originales
   * - Fuerza distribución mínima de empates (al menos 2 por quinela)
   * - Streak Guard mejorado (máx 4 consecutivos del mismo resultado)
   * - Balance global: cada quinela se acerca a la distribución 57/29/14
   */
  const handleGenerateMultiple = (count) => {
    const hStats = getHistoricalStats();
    const newTickets = [];

    for (let i = 0; i < count; i++) {
      const ticket = { id: Date.now() + i };
      const ticketCounts = { L: 0, E: 0, V: 0 };
      let streak = { val: '', count: 0 };

      currentProgol.matches.forEach((m) => {
        if (lockedMatches[m.id]) {
          const lockedVal = predictions[m.id] || 'L';
          ticket[m.id] = lockedVal;
          ticketCounts[lockedVal]++;
          if (lockedVal === streak.val) streak.count++;
          else streak = { val: lockedVal, count: 1 };
          return;
        }

        const cal = getCalibratedProbabilities(m, hStats);
        let selectedVal;

        // Balance check: si ya tenemos demasiados de un tipo, forzar variación
        const remaining = 14 - (ticketCounts.L + ticketCounts.E + ticketCounts.V);
        const targetE = Math.max(2, Math.round(14 * 0.29)); // Mínimo 2 empates
        const targetV = Math.max(1, Math.round(14 * 0.14)); // Mínimo 1 visitante

        // Si quedan pocos partidos y faltan empates, forzar empate
        if (remaining <= (targetE - ticketCounts.E) + (targetV - ticketCounts.V) + 1) {
          if (ticketCounts.E < targetE && remaining > (targetV - ticketCounts.V)) {
            selectedVal = 'E';
          } else if (ticketCounts.V < targetV) {
            selectedVal = 'V';
          }
        }

        // Si no se forzó, usar probabilidades calibradas con ruleta
        if (!selectedVal) {
          const rand = Math.random() * 100;
          if (rand < cal.L) selectedVal = 'L';
          else if (rand < cal.L + cal.E) selectedVal = 'E';
          else selectedVal = 'V';
        }

        // Streak Guard: max 4 consecutivos
        if (streak.count >= 4 && selectedVal === streak.val) {
          const alternatives = ['L', 'E', 'V'].filter(v => v !== streak.val);
          const altCal = alternatives.map(v => ({ val: v, prob: cal[v] }));
          altCal.sort((a, b) => b.prob - a.prob);
          selectedVal = altCal[0].val;
        }

        ticket[m.id] = selectedVal;
        ticketCounts[selectedVal]++;
        if (selectedVal === streak.val) streak.count++;
        else streak = { val: selectedVal, count: 1 };
      });

      newTickets.push(ticket);
    }
    setSavedTickets(prev => [...prev, ...newTickets]);
  };

  const handleGenerate = () => {
    if (savedTickets.length === 0) {
      alert("Añade al menos una quinela a la lista primero.");
      return;
    }
    alert(`Se han generado ${savedTickets.length} quinelas. ¡Mucha suerte!`);
  };

  // ==================== RENDER ====================

  const renderPredictor = () => (
    <>
      <div className="summary-cards">
        <div className="card">
          <h3>Partidos</h3>
          <div className="value">14 / 14</div>
        </div>
        <div className="card">
          <h3>Locales (L)</h3>
          <div className="value" style={{color: '#10b981'}}>{stats.L}</div>
        </div>
        <div className="card">
          <h3>Empates (E)</h3>
          <div className="value" style={{color: '#3b82f6'}}>{stats.E}</div>
        </div>
        <div className="card">
          <h3>Visitas (V)</h3>
          <div className="value" style={{color: '#f43f5e'}}>{stats.V}</div>
        </div>
      </div>

      {historicalStats && (
        <div className="calibration-banner">
          <span className="calibration-icon">🧠</span>
          <div>
            <strong>Algoritmo Calibrado</strong> con {historicalStats.globalDistribution.totalConcursos} concurso(s) 
            ({historicalStats.globalDistribution.totalMatches} partidos analizados)
            <span className="calibration-detail">
              Distribución histórica real: 
              <span style={{color: 'var(--accent-green)'}}> L {historicalStats.globalDistribution.L}%</span> · 
              <span style={{color: 'var(--accent-blue)'}}> E {historicalStats.globalDistribution.E}%</span> · 
              <span style={{color: 'var(--accent-red)'}}> V {historicalStats.globalDistribution.V}%</span>
            </span>
          </div>
        </div>
      )}

      <div className="match-list">
        {currentProgol.matches.map((match) => {
          const cal = historicalStats ? getCalibratedProbabilities(match, historicalStats) : null;
          const spread = Math.max(match.probL, match.probE, match.probV) - Math.min(match.probL, match.probE, match.probV);
          const isCloseMatch = spread < 8;

          return (
            <div key={match.id} className={`match-row ${Math.max(match.probL, match.probE, match.probV) >= 55 ? 'fijo-highlight' : ''} ${lockedMatches[match.id] ? 'locked-row' : ''} ${isCloseMatch ? 'close-match' : ''}`}>
            <div className="match-number-container" onClick={() => toggleLock(match.id)}>
              <div className="match-number">{match.id}</div>
              <div className={`lock-icon ${lockedMatches[match.id] ? 'active' : ''}`}>
                {lockedMatches[match.id] ? '🔒' : '🔓'}
              </div>
            </div>
            
            <div className="teams-info">
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="league-tag">{match.league}</div>
                {Math.max(match.probL, match.probE, match.probV) >= 55 && (
                  <span className="fijo-badge">⭐ RECOMENDACIÓN: FIJO</span>
                )}
                {isCloseMatch && (
                  <span className="close-match-badge">⚖️ PARTIDO CERRADO</span>
                )}
              </div>
              <div className="teams-display">
                <span>{match.home}</span>
                <span className="vs">vs</span>
                <span>{match.away}</span>
              </div>
            </div>

            <div className="probabilities">
              <div className="prob-text">
                <span>{match.probL}%</span>
                <span>{match.probE}%</span>
                <span>{match.probV}%</span>
              </div>
              <div className="prob-bar-container">
                <div className="prob-segment prob-L" style={{ width: `${match.probL}%` }}></div>
                <div className="prob-segment prob-E" style={{ width: `${match.probE}%` }}></div>
                <div className="prob-segment prob-V" style={{ width: `${match.probV}%` }}></div>
              </div>
              {cal && (
                <>
                  <div className="prob-text calibrated-text">
                    <span>{cal.L}%</span>
                    <span>{cal.E}%</span>
                    <span>{cal.V}%</span>
                  </div>
                  <div className="prob-bar-container">
                    <div className="prob-segment prob-L" style={{ width: `${cal.L}%`, opacity: 0.6 }}></div>
                    <div className="prob-segment prob-E" style={{ width: `${cal.E}%`, opacity: 0.6 }}></div>
                    <div className="prob-segment prob-V" style={{ width: `${cal.V}%`, opacity: 0.6 }}></div>
                  </div>
                  <div className="calibrated-label">▲ Calibrado con historial</div>
                </>
              )}
            </div>

            <div className="prediction-buttons">
              <button 
                className={`btn-pred ${predictions[match.id] === 'L' ? 'active-L' : ''}`}
                onClick={() => togglePrediction(match.id, 'L')}
              >L</button>
              <button 
                className={`btn-pred ${predictions[match.id] === 'E' ? 'active-E' : ''}`}
                onClick={() => togglePrediction(match.id, 'E')}
              >E</button>
              <button 
                className={`btn-pred ${predictions[match.id] === 'V' ? 'active-V' : ''}`}
                onClick={() => togglePrediction(match.id, 'V')}
              >V</button>
            </div>
          </div>
          );
        })}
      </div>

      <div className="batch-btn-container" onClick={() => {
        const count = parseInt(document.getElementById('main-batch-count').value) || 1;
        if (count === 1) handleAddTicket();
        else handleGenerateMultiple(count);
      }}>
        <span>Añadir</span>
        <input 
          type="number" 
          id="main-batch-count"
          defaultValue="1" 
          min="1" 
          max="100"
          onClick={(e) => e.stopPropagation()}
        />
        <span>Quinelas a la Lista</span>
      </div>

      {savedTickets.length > 0 && (
        <div className="saved-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2>Quinelas a Meter ({savedTickets.length})</h2>
            <button 
              onClick={clearTickets}
              style={{ background: 'transparent', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600 }}
            >
              Limpiar Lista
            </button>
          </div>
          <table className="tickets-table">
            <thead>
              <tr>
                <th>Partido</th>
                {savedTickets.map((_, index) => (
                  <th key={index}>Q{index + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currentProgol.matches.map((match) => (
                <tr key={match.id}>
                  <td className="ticket-index">
                    {match.id}. {match.home} vs {match.away}
                  </td>
                  {savedTickets.map((ticket) => {
                    const val = ticket[match.id];
                    return (
                      <td key={ticket.id}>
                        <div className={`ticket-cell cell-${val}`}>{val}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          
          <button 
            className="generate-btn" 
            style={{ marginTop: '2rem', marginBottom: '0' }}
            onClick={handleGenerate}
          >
            CONFIRMAR Y METER {savedTickets.length} QUINELAS
          </button>
        </div>
      )}
    </>
  );

  const renderHistory = () => {
    if (!historicalStats) return <div>Cargando estadísticas...</div>;
    const hs = historicalStats;

    return (
      <div className="history-panel">
        {/* Global Distribution */}
        <div className="history-section">
          <h2>📊 Distribución Global de Resultados</h2>
          <p className="history-subtitle">
            Basado en {hs.globalDistribution.totalConcursos} concurso(s) — {hs.globalDistribution.totalMatches} partidos analizados
          </p>
          
          <div className="distribution-bars">
            <div className="dist-bar-row">
              <div className="dist-label">
                <span className="dist-letter" style={{background: 'var(--accent-green)'}}>L</span>
                <span>Local</span>
              </div>
              <div className="dist-bar-track">
                <div className="dist-bar-fill dist-fill-L" style={{width: `${hs.globalDistribution.L}%`}}>
                  {hs.globalDistribution.L}%
                </div>
              </div>
              <span className="dist-count">{hs.rawCounts.L} partidos</span>
            </div>
            <div className="dist-bar-row">
              <div className="dist-label">
                <span className="dist-letter" style={{background: 'var(--accent-blue)'}}>E</span>
                <span>Empate</span>
              </div>
              <div className="dist-bar-track">
                <div className="dist-bar-fill dist-fill-E" style={{width: `${hs.globalDistribution.E}%`}}>
                  {hs.globalDistribution.E}%
                </div>
              </div>
              <span className="dist-count">{hs.rawCounts.E} partidos</span>
            </div>
            <div className="dist-bar-row">
              <div className="dist-label">
                <span className="dist-letter" style={{background: 'var(--accent-red)'}}>V</span>
                <span>Visitante</span>
              </div>
              <div className="dist-bar-track">
                <div className="dist-bar-fill dist-fill-V" style={{width: `${hs.globalDistribution.V}%`}}>
                  {hs.globalDistribution.V}%
                </div>
              </div>
              <span className="dist-count">{hs.rawCounts.V} partidos</span>
            </div>
          </div>
        </div>

        {/* Surprise Rate */}
        <div className="history-section">
          <h2>🎲 Tasa de Sorpresas</h2>
          <p className="history-subtitle">Partidos donde el favorito NO ganó</p>
          <div className="surprise-rate-card">
            <div className="surprise-value">{hs.surpriseRate}%</div>
            <div className="surprise-desc">
              {hs.surpriseRate > 40 
                ? '⚠️ Alta tasa de sorpresas — Los favoritos son poco confiables'
                : hs.surpriseRate > 25 
                  ? '📌 Tasa normal — Siempre hay sorpresas en el fútbol'
                  : '✅ Baja tasa — Los favoritos tienden a cumplir'}
            </div>
          </div>
        </div>

        {/* Close Matches */}
        {hs.closeMatchPattern && (
          <div className="history-section">
            <h2>⚖️ Partidos Cerrados (spread &lt; 8%)</h2>
            <p className="history-subtitle">
              {hs.closeMatchPattern.total} partido(s) con probabilidades muy parejas
            </p>
            <div className="close-match-stats">
              <div className="close-stat">
                <div className="close-stat-value" style={{color: 'var(--accent-green)'}}>{hs.closeMatchPattern.L}%</div>
                <div className="close-stat-label">Local</div>
              </div>
              <div className="close-stat highlight">
                <div className="close-stat-value" style={{color: 'var(--accent-blue)'}}>{hs.closeMatchPattern.E}%</div>
                <div className="close-stat-label">Empate</div>
                <div className="close-stat-insight">⭐ Dato clave</div>
              </div>
              <div className="close-stat">
                <div className="close-stat-value" style={{color: 'var(--accent-red)'}}>{hs.closeMatchPattern.V}%</div>
                <div className="close-stat-label">Visitante</div>
              </div>
            </div>
          </div>
        )}

        {/* League Breakdown */}
        <div className="history-section">
          <h2>🏆 Tendencia por Liga</h2>
          <p className="history-subtitle">Distribución de resultados por competición</p>
          <div className="league-grid">
            {Object.entries(hs.leagueDistribution).map(([league, data]) => (
              <div key={league} className="league-card">
                <div className="league-card-name">{league}</div>
                <div className="league-card-count">{data.total} partido(s)</div>
                <div className="league-mini-bars">
                  <div className="league-mini-bar">
                    <span className="lmb-label">L</span>
                    <div className="lmb-track">
                      <div className="lmb-fill lmb-L" style={{width: `${data.L}%`}}></div>
                    </div>
                    <span className="lmb-value">{data.L}%</span>
                  </div>
                  <div className="league-mini-bar">
                    <span className="lmb-label">E</span>
                    <div className="lmb-track">
                      <div className="lmb-fill lmb-E" style={{width: `${data.E}%`}}></div>
                    </div>
                    <span className="lmb-value">{data.E}%</span>
                  </div>
                  <div className="league-mini-bar">
                    <span className="lmb-label">V</span>
                    <div className="lmb-track">
                      <div className="lmb-fill lmb-V" style={{width: `${data.V}%`}}></div>
                    </div>
                    <span className="lmb-value">{data.V}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Concurso History Table */}
        <div className="history-section">
          <h2>📋 Historial de Concursos</h2>
          {historyResults.map(concurso => (
            <div key={concurso.concurso} className="concurso-card">
              <div className="concurso-header">
                <h3>Concurso #{concurso.concurso}</h3>
                <span className="concurso-date">{concurso.fecha}</span>
              </div>
              <table className="history-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Partido</th>
                    <th>Liga</th>
                    <th>Prob L</th>
                    <th>Prob E</th>
                    <th>Prob V</th>
                    <th>Resultado</th>
                    <th>Favorito</th>
                  </tr>
                </thead>
                <tbody>
                  {concurso.results.map(m => {
                    const max = Math.max(m.probL, m.probE, m.probV);
                    let favored;
                    if (max === m.probL) favored = 'L';
                    else if (max === m.probE) favored = 'E';
                    else favored = 'V';
                    const wasCorrect = favored === m.result;

                    return (
                      <tr key={m.id} className={wasCorrect ? '' : 'surprise-row'}>
                        <td>{m.id}</td>
                        <td>{m.home} vs {m.away}</td>
                        <td className="league-col">{m.league}</td>
                        <td>{m.probL}%</td>
                        <td>{m.probE}%</td>
                        <td>{m.probV}%</td>
                        <td>
                          <span className={`result-badge result-${m.result}`}>{m.result}</span>
                        </td>
                        <td>
                          {wasCorrect 
                            ? <span className="correct-icon">✅</span> 
                            : <span className="surprise-icon">❌ Sorpresa</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="container">
      <header>
        <h1>Progol AI Predictor</h1>
        <p>Concurso #{currentProgol.concurso} | {currentProgol.fecha}</p>
        
        <div className="tab-nav">
          <button 
            className={`tab-btn ${activeTab === 'predictor' ? 'active' : ''}`}
            onClick={() => setActiveTab('predictor')}
          >
            🎯 Predictor
          </button>
          <button 
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            📊 Análisis Histórico
          </button>
        </div>
      </header>

      {activeTab === 'predictor' ? renderPredictor() : renderHistory()}

      <footer style={{ marginTop: '4rem', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
        Análisis basado en modelos estadísticos de rendimiento reciente y datos históricos calibrados.
      </footer>
    </div>
  );
}

export default App;
