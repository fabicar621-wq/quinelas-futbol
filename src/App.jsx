import React, { useState, useEffect } from 'react';
import { currentProgol } from './data/progolData';

function App() {
  const [predictions, setPredictions] = useState({});
  const [stats, setStats] = useState({ L: 0, E: 0, V: 0 });
  const [savedTickets, setSavedTickets] = useState([]);
  const [lockedMatches, setLockedMatches] = useState({});

  useEffect(() => {
    // Initial auto-prediction based on highest probability
    const initial = {};
    currentProgol.matches.forEach(m => {
      const max = Math.max(m.probL, m.probE, m.probV);
      if (max === m.probL) initial[m.id] = 'L';
      else if (max === m.probE) initial[m.id] = 'E';
      else initial[m.id] = 'V';
    });
    setPredictions(initial);
  }, []);

  useEffect(() => {
    const counts = { L: 0, E: 0, V: 0 };
    Object.values(predictions).forEach(v => counts[v]++);
    setStats(counts);
  }, [predictions]);

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

  const handleGenerateMultiple = (count) => {
    // 1. Prepare an array for each match with the exact distribution
    const matchDistributions = currentProgol.matches.map(m => {
      // If match is locked, use the current prediction for 100% of the tickets
      if (lockedMatches[m.id]) {
        return Array(count).fill(predictions[m.id] || 'L');
      }

      let countL = Math.round(count * (m.probL / 100));
      let countE = Math.round(count * (m.probE / 100));
      let countV = count - countL - countE;

      // Create pool and shuffle it
      const pool = [
        ...Array(countL).fill('L'),
        ...Array(countE).fill('E'),
        ...Array(countV).fill('V')
      ];
      
      // Fisher-Yates Shuffle
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      return pool;
    });

    // 2. Create the tickets with Streak Guard (Max 5 consecutive)
    const newTickets = [];
    const ticketStreaks = Array(count).fill(null).map(() => ({ lastVal: '', count: 0 }));

    for (let i = 0; i < count; i++) {
      const ticket = { id: Date.now() + i };
      currentProgol.matches.forEach((m, mIdx) => {
        let selectedVal = matchDistributions[mIdx][i];
        const streak = ticketStreaks[i];

        // If we hit a streak of 4, we MUST swap with a different result from the remaining pool
        if (streak.count === 4 && selectedVal === streak.lastVal) {
          // Find the first index after 'i' in this match's pool that has a different value
          const swapIdx = matchDistributions[mIdx].findIndex((val, idx) => idx > i && val !== streak.lastVal);
          
          if (swapIdx !== -1) {
            // Perform the swap in the pool
            const temp = matchDistributions[mIdx][i];
            matchDistributions[mIdx][i] = matchDistributions[mIdx][swapIdx];
            matchDistributions[mIdx][swapIdx] = temp;
            selectedVal = matchDistributions[mIdx][i];
          }
        }

        ticket[m.id] = selectedVal;
        
        // Update streak tracking
        if (selectedVal === streak.lastVal) {
          streak.count++;
        } else {
          streak.lastVal = selectedVal;
          streak.count = 1;
        }
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

  return (
    <div className="container">
      <header>
        <h1>Progol AI Predictor</h1>
        <p>Concurso #{currentProgol.concurso} | {currentProgol.fecha}</p>
      </header>

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

      <div className="match-list">
        {currentProgol.matches.map((match) => (
            <div key={match.id} className={`match-row ${Math.max(match.probL, match.probE, match.probV) >= 55 ? 'fijo-highlight' : ''} ${lockedMatches[match.id] ? 'locked-row' : ''}`}>
            <div className="match-number-container" onClick={() => toggleLock(match.id)}>
              <div className="match-number">{match.id}</div>
              <div className={`lock-icon ${lockedMatches[match.id] ? 'active' : ''}`}>
                {lockedMatches[match.id] ? '🔒' : '🔓'}
              </div>
            </div>
            
            <div className="teams-info">
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <div className="league-tag">{match.league}</div>
                {Math.max(match.probL, match.probE, match.probV) >= 55 && (
                  <span className="fijo-badge">⭐ RECOMENDACIÓN: FIJO</span>
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
        ))}
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
              {currentProgol.matches.map((match, matchIdx) => (
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

      <footer style={{ marginTop: '4rem', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
        Análisis basado en modelos estadísticos de rendimiento reciente.
      </footer>
    </div>
  );
}

export default App;
