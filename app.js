// --- BASE DE DONNÉES ---
let DB = {
    progs: JSON.parse(localStorage.getItem('gym_v8_progs')) || {},
    history: JSON.parse(localStorage.getItem('gym_v21_history')) || [],
    weight: JSON.parse(localStorage.getItem('gym_weight')) || []
};

let currentSessionLogs = [];
let tempBuilderList = [];
let currentEditingIndex = -1; 
let currentCalDate = new Date(); 
let currentTabIndex = 0; 

// ÉTAT HISTORIQUE
let historyMode = 'list'; 
let historyState = { view: 'categories', selected: null };
let currentProgramKey = ''; 

// --- INITIALISATION ---
document.addEventListener('DOMContentLoaded', () => {
    const savedSession = localStorage.getItem('gym_active_session');
    
    updateSelectMenu();
    renderProgramList();
    renderHistory();
    renderCalendar();
    
    // Initialiser la date du jour pour le poids
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('weightDateInput');
    if(dateInput) dateInput.value = today;

    if (savedSession) {
        try {
            const sessionState = JSON.parse(savedSession);
            const select = document.getElementById('selectProgram');
            
            if (select.querySelector(`option[value="${sessionState.prog}"]`)) {
                select.value = sessionState.prog;
                currentProgramKey = sessionState.prog;
                
                if (sessionState.logs) {
                    currentSessionLogs = sessionState.logs;
                }
                
                chargerInterface(false);
                
                // RESTAURATION INTELLIGENTE (Drop Sets & Valeurs)
                if (sessionState.inputs) {
                    const dropMap = {};
                    Object.keys(sessionState.inputs).forEach(key => {
                        if (key.startsWith('drop_w_')) {
                            const parts = key.split('_'); 
                            const baseId = `${parts[2]}_${parts[3]}`; 
                            const dropIdx = parseInt(parts[4]);
                            
                            if (!dropMap[baseId] || dropIdx > dropMap[baseId]) {
                                dropMap[baseId] = dropIdx;
                            }
                        }
                    });

                    Object.keys(dropMap).forEach(baseId => {
                        const count = dropMap[baseId] + 1; 
                        for(let i=0; i<count; i++) {
                            ajouterDegressive(baseId, '', '', 0, true);
                        }
                    });

                    Object.keys(sessionState.inputs).forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.value = sessionState.inputs[id];
                    });
                }
            }
        } catch(e) { console.log("Erreur restauration session", e); }
    }
});

// --- NAVIGATION PRINCIPALE ---
function switchTab(viewName, btn, newIndex) {
    if (newIndex === currentTabIndex) return;
    currentTabIndex = newIndex;
    
    const views = document.querySelectorAll('.app-view');
    views.forEach(v => { 
        v.classList.add('hidden'); 
        v.classList.remove('anim-right', 'anim-left'); 
    });
    
    const newView = document.getElementById('view-' + viewName);
    newView.classList.remove('hidden');
    
    // Animation simple
    const direction = newIndex > currentTabIndex ? 'anim-right' : 'anim-left';
    newView.classList.add(direction);
    
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    const titleEl = document.getElementById('mainTitle');
    if(viewName === 'seance') titleEl.innerText = "Ma Séance";
    if(viewName === 'progs') titleEl.innerText = "Mon Programme";
    if(viewName === 'history') { 
        updateHistoryTitle(); 
        if(historyMode === 'calendar') renderCalendar();
        if(historyMode === 'weight') renderWeightView();
    }
}

// --- LOGIQUE SÉANCE ---
function hasSessionData() {
    const inputs = document.querySelectorAll('#zoneTravail input[type="number"]');
    for (const input of inputs) {
        if (input.value && input.value.trim() !== '') return true;
    }
    return currentSessionLogs.length > 0;
}

function handleProgramChange() {
    const select = document.getElementById('selectProgram');
    const newKey = select.value; // La nouvelle valeur (peut être "" ou "Push", etc.)
    
    // ÉTAPE 1 : SÉCURITÉ GLOBALE
    // Si on a des données, on déclenche l'alerte, PEU IMPORTE ce qu'on a choisi.
    if (hasSessionData()) {
        if (!confirm("Tu as des données en cours. Changer de séance effacera tout. Continuer ?")) {
            // Si tu cliques sur "Annuler", on remet l'ancien programme visuellement
            select.value = currentProgramKey; 
            return; // Et on arrête tout. Rien ne se passe.
        }
    }
    
    // ÉTAPE 2 : SI C'EST VALIDÉ (ou qu'il n'y avait rien)
    
    // Cas A : Tu as choisi l'option vide "Choisir une Séance"
    if (newKey === "") {
        currentProgramKey = "";
        currentSessionLogs = [];
        localStorage.removeItem('gym_active_session');
        
        // On vide l'écran pour revenir à l'état initial
        document.getElementById('zoneTravail').innerHTML = "";
        document.getElementById('zoneFinSeance').innerHTML = "";
        return;
    }
    
    // Cas B : Tu as choisi un autre programme (ex: Push)
    currentProgramKey = newKey;
    chargerInterface(true);
}

function chargerInterface(shouldClear = true) { 
    const key = document.getElementById('selectProgram').value; 
    if (!key) { currentProgramKey = ""; return; } 
    currentProgramKey = key;
    
    if(shouldClear) {
        currentSessionLogs = [];
        localStorage.removeItem('gym_active_session'); 
    }

    const zone = document.getElementById('zoneTravail'); 
    const btnZone = document.getElementById('zoneFinSeance'); 
    zone.innerHTML = ''; 
    btnZone.innerHTML = ''; 
    
    const exos = DB.progs[key]; 
    for(let i = 0; i < exos.length; i++) { 
        const exoA = exos[i]; const exoB = exos[i+1]; 
        
        if(exoA.isSuperset && exoB && exoB.isSuperset) { 
            renderSuperset(zone, exoA, i, exoB, i+1, key); 
            
            const isDone = currentSessionLogs.some(log => log.exo === exoA.name || log.exo === exoB.name);
            if(isDone) {
                const btn = document.getElementById(`btn_finish_${i}`);
                if(btn) {
                    btn.classList.add('validated');
                    btn.innerText = "Validé";
                    const container = document.getElementById(`sets_super_${i}`);
                    if(container) {
                        container.querySelectorAll('input').forEach(inp => inp.disabled = true);
                        container.querySelectorAll('.btn-mini-add').forEach(b => b.style.display = 'none');
                        container.querySelectorAll('.drop-icon').forEach(icon => icon.style.display = 'none');
                    }
                }
            }
            i++; 
        } else { 
            renderNormal(zone, exoA, i, key); 
            
            const isDone = currentSessionLogs.some(log => log.exo === exoA.name);
            if(isDone) {
                const btn = document.getElementById(`btn_finish_${i}`);
                if(btn) {
                    btn.classList.add('validated');
                    btn.innerText = "Validé";
                    const container = document.getElementById(`sets_${i}`);
                    if(container) {
                        container.querySelectorAll('input').forEach(inp => inp.disabled = true);
                        container.querySelectorAll('.btn-mini-add').forEach(b => b.style.display = 'none');
                        container.querySelectorAll('.drop-icon').forEach(icon => icon.style.display = 'none');
                    }
                }
            }
        } 
    } 
    btnZone.innerHTML = `<button class="btn-terminate-session" onclick="terminerLaSeance('${key}')">Terminer la Séance</button>`; 
    
    document.querySelectorAll('#zoneTravail input').forEach(input => {
        if(!input.disabled) {
            input.addEventListener('input', saveCurrentSessionState);
        }
    });
}

function createInputWithUnit(id, unit) { return `<div class="input-wrapper"><input type="number" id="${id}" placeholder="" min="0" oninput="if(this.value!=='')this.value=Math.abs(this.value)"><span class="unit-label">${unit}</span></div>`; }
function createDropInput(id, className, unit) { return `<div class="input-wrapper"><input type="number" id="${id}" class="${className}" placeholder="" min="0" oninput="if(this.value!=='')this.value=Math.abs(this.value)"><span class="unit-label">${unit}</span></div>`; }

function getSplitPerf(exoName, setNum, progName) {
    const lastSession = DB.history.find(session => session.programName === progName && session.details && session.details.some(log => log.exo === exoName));
    if (!lastSession) return null;
    const log = lastSession.details.find(l => l.exo === exoName && l.serie === setNum);
    if (!log) return null;
    let cleanRaw = log.perf.replace(/ \+ Dégressive: /g, " + ").replace(/Dégressive: /g, "+ ");
    const parts = cleanRaw.split(" + ");
    return { main: parts[0], drop: parts[1] || null };
}

function renderNormal(container, exo, idx, progName) { 
    let html = `<div class="card" style="animation-delay: ${idx * 0.1}s"><div class="card-header"><div class="header-top"><span class="exo-title">${exo.name}</span><span class="exo-badge">Fourchette de reps : ${exo.reps}</span></div></div><div id="sets_${idx}">`; 
    for(let s=1; s<=exo.sets; s++) { 
        const data = getSplitPerf(exo.name, s, progName);
        const mainPerfHTML = (data && data.main) ? `<span class="last-perf">Précédent : ${data.main}</span>` : '';
        const safeExoName = exo.name.replace(/'/g, "\\'"); 
        const safeProgName = progName.replace(/'/g, "\\'");
        html += `<div class="serie-container" id="container_${idx}_${s}"><div class="input-row"><div class="set-col"><div class="set-num">#${s}</div><button class="btn-mini-add" onclick="ajouterDegressive('${idx}_${s}', '${safeExoName}', '${safeProgName}', ${s})">+</button></div>${createInputWithUnit(`p_${idx}_${s}`, 'kg')}${createInputWithUnit(`r_${idx}_${s}`, 'reps')}</div>${mainPerfHTML}</div>`; 
    } 
    html += `</div><button class="btn-finish-exo" id="btn_finish_${idx}" onclick="validerExerciceNormal('${exo.name}', ${idx}, ${exo.sets}, this)">Exercice Fini</button></div>`; 
    container.innerHTML += html; 
}

function renderSuperset(container, exoA, idxA, exoB, idxB, progName) { 
    const max = Math.max(exoA.sets, exoB.sets); 
    const safeProgName = progName.replace(/'/g, "\\'"); 
    const safeExoNameA = exoA.name.replace(/'/g, "\\'"); 
    const safeExoNameB = exoB.name.replace(/'/g, "\\'");
    let html = `<div class="card superset-container" style="animation-delay: ${idxA * 0.1}s; background-color: transparent !important; box-shadow: none !important;"><span class="superset-label">Superset</span>`;
    html += `<div class="card-header" style="border:none; padding-bottom:5px; margin-bottom:5px;"><div class="header-top"><span class="exo-title">A. ${exoA.name}</span> <span class="exo-badge">Fourchette de reps : ${exoA.reps}</span></div></div>`;
    html += `<div class="card-header"><div class="header-top"><span class="exo-title">B. ${exoB.name}</span> <span class="exo-badge">Fourchette de reps : ${exoB.reps}</span></div></div>`;
    html += `<div id="sets_super_${idxA}">`; 
    for(let s=1; s<=max; s++) { 
        html += `<div class="set-block">`;
        if (s <= exoA.sets) {
            const dataA = getSplitPerf(exoA.name, s, progName); 
            const mainPerfHTMLA = (dataA && dataA.main) ? `<span class="last-perf">Précédent : ${dataA.main}</span>` : '';
            html += `<div class="serie-container" id="container_${idxA}_${s}"><div class="input-row"><div class="set-col"><div class="set-num">A</div><button class="btn-mini-add" onclick="ajouterDegressive('${idxA}_${s}', '${safeExoNameA}', '${safeProgName}', ${s})">+</button></div>${createInputWithUnit(`p_${idxA}_${s}`, 'kg')}${createInputWithUnit(`r_${idxA}_${s}`, 'reps')}</div>${mainPerfHTMLA}</div>`;
        } 
        if (s <= exoB.sets) {
            const dataB = getSplitPerf(exoB.name, s, progName); 
            const mainPerfHTMLB = (dataB && dataB.main) ? `<span class="last-perf">Précédent : ${dataB.main}</span>` : '';
            html += `<div class="serie-container" id="container_${idxB}_${s}"><div class="input-row"><div class="set-col"><div class="set-num">B</div><button class="btn-mini-add" onclick="ajouterDegressive('${idxB}_${s}', '${safeExoNameB}', '${safeProgName}', ${s})">+</button></div>${createInputWithUnit(`p_${idxB}_${s}`, 'kg')}${createInputWithUnit(`r_${idxB}_${s}`, 'reps')}</div>${mainPerfHTMLB}</div>`;
        }
        html += `</div>`; 
    } 
    html += `</div><button class="btn-finish-exo" id="btn_finish_${idxA}" onclick="validerSuperset('${exoA.name}', ${idxA}, '${exoB.name}', ${idxB}, ${max}, this)">Exercices Finis</button></div>`; 
    container.innerHTML += html; 
}

function ajouterDegressive(baseId, exoName, progName, setNum, restorationMode = false) { 
    const container = document.getElementById('container_' + baseId); 
    const dropIndex = container.querySelectorAll('.drop-row').length;
    const dropWeightId = `drop_w_${baseId}_${dropIndex}`;
    const dropRepsId = `drop_r_${baseId}_${dropIndex}`;

    const div = document.createElement('div'); div.className = 'input-row drop-row'; 
    
    let dropHint = '';
    if (!restorationMode) {
        const data = getSplitPerf(exoName, setNum, progName);
        dropHint = (data && data.drop) ? `<span class="last-perf" style="margin-left:45px;">Précédent : ${data.drop}</span>` : '';
    }

    div.innerHTML = `<div class="set-col"><div class="drop-icon" onclick="this.closest('.drop-row').remove(); saveCurrentSessionState();" title="Supprimer">↳</div></div>${createDropInput(dropWeightId, 'drop-weight', 'kg')}${createDropInput(dropRepsId, 'drop-reps', 'reps')}`; 
    div.style.flexWrap = "wrap";
    if(dropHint) div.innerHTML += `<div style="width:100%;">${dropHint}</div>`;
    
    container.appendChild(div); 
    div.querySelectorAll('input').forEach(i => i.addEventListener('input', saveCurrentSessionState));
}

function getDropsString(containerId) { 
    const container = document.getElementById(containerId); 
    let drops = []; 
    container.querySelectorAll('.drop-row').forEach(row => { 
        const w = row.querySelector('.drop-weight').value; const r = row.querySelector('.drop-reps').value; 
        if(w && r) drops.push(`${w} kg x ${r} reps`); 
    }); 
    if(drops.length > 0) return " + " + drops.join(' + '); 
    return ""; 
}

function validerExerciceNormal(nomExo, idx, totalSets, btn) { 
    if (btn.classList.contains('validated')) { 
        btn.classList.remove('validated'); btn.innerText = "Exercice Fini"; 
        for(let s=1; s<=totalSets; s++) { 
            document.getElementById(`p_${idx}_${s}`).disabled = false; document.getElementById(`r_${idx}_${s}`).disabled = false; 
            const c = document.getElementById(`container_${idx}_${s}`); c.querySelectorAll('input').forEach(i => i.disabled = false); if(c.querySelector('.btn-mini-add')) c.querySelector('.btn-mini-add').style.display = 'flex'; c.querySelectorAll('.drop-icon').forEach(icon => icon.style.display = 'block'); 
        } 
        currentSessionLogs = currentSessionLogs.filter(log => log.exo !== nomExo); saveCurrentSessionState(); return; 
    } 
    let savedCount = 0; let tempLogs = []; 
    for(let s=1; s<=totalSets; s++) { 
        const p = document.getElementById(`p_${idx}_${s}`).value; const r = document.getElementById(`r_${idx}_${s}`).value; 
        if(p && r) { let dropText = getDropsString(`container_${idx}_${s}`); tempLogs.push({ exo: nomExo, perf: `${p} kg x ${r} reps${dropText}`, serie: s }); savedCount++; } 
    } 
    if(savedCount > 0) { 
        currentSessionLogs.push(...tempLogs); btn.classList.add('validated'); btn.innerText = "Validé"; 
        for(let s=1; s<=totalSets; s++) { 
            document.getElementById(`p_${idx}_${s}`).disabled = true; document.getElementById(`r_${idx}_${s}`).disabled = true; 
            const c = document.getElementById(`container_${idx}_${s}`); c.querySelectorAll('input').forEach(i => i.disabled = true); if(c.querySelector('.btn-mini-add')) c.querySelector('.btn-mini-add').style.display = 'none'; c.querySelectorAll('.drop-icon').forEach(icon => icon.style.display = 'none'); 
        } 
        saveCurrentSessionState(); 
    } else { alert("Remplis au moins une série !"); } 
}

function validerSuperset(nomA, idxA, nomB, idxB, totalSets, btn) { 
    if (btn.classList.contains('validated')) { 
        btn.classList.remove('validated'); btn.innerText = "Exercices Finis"; 
        for(let s=1; s<=totalSets; s++) { 
            const cA = document.getElementById(`container_${idxA}_${s}`); if(cA) { cA.querySelectorAll('input').forEach(i=>i.disabled=false); cA.querySelectorAll('.btn-mini-add').forEach(b=>b.style.display='flex'); cA.querySelectorAll('.drop-icon').forEach(i=>i.style.display='block'); }
            const cB = document.getElementById(`container_${idxB}_${s}`); if(cB) { cB.querySelectorAll('input').forEach(i=>i.disabled=false); cB.querySelectorAll('.btn-mini-add').forEach(b=>b.style.display='flex'); cB.querySelectorAll('.drop-icon').forEach(i=>i.style.display='block'); }
        } 
        currentSessionLogs = currentSessionLogs.filter(log => log.exo !== nomA && log.exo !== nomB); saveCurrentSessionState(); return; 
    } 
    let savedCount = 0; let tempLogs = []; 
    for(let s=1; s<=totalSets; s++) { 
        if(document.getElementById(`p_${idxA}_${s}`)) { const pA = document.getElementById(`p_${idxA}_${s}`).value; const rA = document.getElementById(`r_${idxA}_${s}`).value; if(pA && rA) { let dropA = getDropsString(`container_${idxA}_${s}`); tempLogs.push({ exo: nomA, perf: `${pA} kg x ${rA} reps${dropA}`, serie: s }); savedCount++; } }
        if(document.getElementById(`p_${idxB}_${s}`)) { const pB = document.getElementById(`p_${idxB}_${s}`).value; const rB = document.getElementById(`r_${idxB}_${s}`).value; if(pB && rB) { let dropB = getDropsString(`container_${idxB}_${s}`); tempLogs.push({ exo: nomB, perf: `${pB} kg x ${rB} reps${dropB}`, serie: s }); savedCount++; } }
    } 
    if(savedCount > 0) { 
        currentSessionLogs.push(...tempLogs); btn.classList.add('validated'); btn.innerText = "Validé"; 
        for(let s=1; s<=totalSets; s++) { 
             const cA = document.getElementById(`container_${idxA}_${s}`); if(cA) { cA.querySelectorAll('input').forEach(i=>i.disabled=true); cA.querySelectorAll('.btn-mini-add').forEach(b=>b.style.display='none'); cA.querySelectorAll('.drop-icon').forEach(i=>i.style.display='none'); }
             const cB = document.getElementById(`container_${idxB}_${s}`); if(cB) { cB.querySelectorAll('input').forEach(i=>i.disabled=true); cB.querySelectorAll('.btn-mini-add').forEach(b=>b.style.display='none'); cB.querySelectorAll('.drop-icon').forEach(i=>i.style.display='none'); }
        } 
        saveCurrentSessionState();
    } else { alert("Remplis au moins une série !"); } 
}

function terminerLaSeance(progName) { 
    if(currentSessionLogs.length === 0) return alert("Tu n'as rien validé !"); 
    if(confirm("Confirmer la fin de la séance ?")) { 
        const sessionObject = { id: Date.now(), date: new Date().toLocaleDateString(), programName: progName, details: currentSessionLogs }; 
        DB.history.unshift(sessionObject); 
        localStorage.setItem('gym_v21_history', JSON.stringify(DB.history)); 
        localStorage.removeItem('gym_active_session');
        currentSessionLogs = []; 
        alert("Séance sauvegardée !"); 
        document.getElementById('selectProgram').value = ""; currentProgramKey = "";
        document.getElementById('zoneTravail').innerHTML = ""; document.getElementById('zoneFinSeance').innerHTML = ""; 
        historyMode = 'list'; historyState.view = 'categories'; historyState.selected = null; 
        updateHistoryTabsUI(); renderHistory(); 
    } 
}

function saveCurrentSessionState() {
    const prog = document.getElementById('selectProgram').value; if(!prog) return;
    const inputs = {}; document.querySelectorAll('#zoneTravail input').forEach(i => { if(i.value) inputs[i.id] = i.value; });
    const state = { prog: prog, inputs: inputs, logs: currentSessionLogs };
    localStorage.setItem('gym_active_session', JSON.stringify(state));
}

// --- BUILDER ---
function toggleBuilder() { 
    const area = document.getElementById('builderArea'); 
    if (!area.classList.contains('hidden')) { resetBuilderForm(); document.getElementById('newProgName').value = ''; tempBuilderList = []; renderBuilder(); document.getElementById('btnSaveProg').innerText = "Sauvegarder la Séance"; } 
    area.classList.toggle('hidden'); 
}
function resetBuilderForm() { currentEditingIndex = -1; document.getElementById('buildExoName').value = ''; document.getElementById('buildSeries').value = ''; document.getElementById('buildReps').value = ''; document.getElementById('buildExoNameB').value = ''; document.getElementById('btnAddNormal').innerText = "Ajouter"; document.getElementById('btnAddSupersetConfirm').innerText = "Valider le Superset"; annulerModeSuperset(); renderBuilder(); }
function activerModeSuperset() { document.getElementById('blockExoB').classList.remove('hidden'); document.getElementById('btnGroupNormal').classList.add('hidden'); document.getElementById('btnGroupSuperset').classList.remove('hidden'); document.getElementById('labelExoA').classList.remove('hidden'); }
function annulerModeSuperset() { document.getElementById('blockExoB').classList.add('hidden'); document.getElementById('btnGroupNormal').classList.remove('hidden'); document.getElementById('btnGroupSuperset').classList.add('hidden'); document.getElementById('labelExoA').classList.add('hidden'); document.getElementById('buildExoNameB').value = ''; }
function ajouterExoAuBuilder() {
    const n = document.getElementById('buildExoName').value; let s = parseInt(document.getElementById('buildSeries').value); if(s < 1 || isNaN(s)) s = 1; const r = document.getElementById('buildReps').value; if(!n) return alert("Nom manquant");
    const newExo = {name:n, sets:s, reps:r, isSuperset: false};
    if (currentEditingIndex > -1) { tempBuilderList[currentEditingIndex] = newExo; } else { tempBuilderList.push(newExo); }
    resetBuilderForm(); renderBuilder(); document.getElementById('buildExoName').value = ''; document.getElementById('buildExoName').focus();
}
function validerSupersetBuilder() {
    const nA = document.getElementById('buildExoName').value; let sA = parseInt(document.getElementById('buildSeries').value); if(sA < 1 || isNaN(sA)) sA = 1; const rA = document.getElementById('buildReps').value;
    const nB = document.getElementById('buildExoNameB').value; let sB = parseInt(document.getElementById('buildSeriesB').value); if(sB < 1 || isNaN(sB)) sB = 1; const rB = document.getElementById('buildRepsB').value;
    if(!nA || !nB) return alert("Remplis les deux noms !");
    const exoA = {name:nA, sets:sA, reps:rA, isSuperset: true}; const exoB = {name:nB, sets:sB, reps:rB, isSuperset: true};
    if (currentEditingIndex > -1) { tempBuilderList[currentEditingIndex] = exoA; tempBuilderList[currentEditingIndex+1] = exoB; } else { tempBuilderList.push(exoA); tempBuilderList.push(exoB); }
    resetBuilderForm(); renderBuilder(); document.getElementById('buildExoName').value = ''; document.getElementById('buildExoNameB').value = ''; annulerModeSuperset(); document.getElementById('buildExoName').focus();
}

// --- VARIABLES POUR LE DRAG & DROP (BUILDER) ---
let dragSrcIndex = -1;
let dragOverIndex = -1;
let longPressTimer = null;
let isDraggingMode = false;

// --- FONCTION RENDER BUILDER (VERSION STABLE) ---
function renderBuilder() { 
    const listDiv = document.getElementById('builderListDisplay'); 
    listDiv.innerHTML = ''; 
    
    for (let i = 0; i < tempBuilderList.length; i++) { 
        const item = tempBuilderList[i]; 
        let editingClass = ''; 
        
        // --- CORRECTION ICI : SIMPLIFICATION TOTALE ---
        // On allume la case SI ET SEULEMENT SI c'est celle qu'on édite.
        // Plus de calcul savant avec "l'exercice suivant", ça évite tous les bugs.
        if (currentEditingIndex !== -1 && i === currentEditingIndex) {
            editingClass = 'editing-active';
        }
        
        let htmlContent = '';
        // Détection d'un début de Superset (Item actuel + Item suivant sont des supersets)
        let isSupersetStart = (item.isSuperset && tempBuilderList[i+1] && tempBuilderList[i+1].isSuperset);
        // Détection du deuxième élément (pour ne pas l'afficher en double)
        let isSupersetSecond = (item.isSuperset && tempBuilderList[i-1] && tempBuilderList[i-1].isSuperset);

        let draggableAttr = isSupersetSecond ? '' : 'data-draggable="true"';

        if (isSupersetStart) { 
            const nextItem = tempBuilderList[i+1]; 
            const dataJson = JSON.stringify({ type: 'superset', dataA: item, dataB: nextItem });
            
            htmlContent = `
            <div class="builder-item builder-item-superset ${editingClass}" 
                 data-index="${i}" ${draggableAttr} data-json='${dataJson}'>
                <span class="delete-x" onclick="event.stopPropagation(); tempBuilderList.splice(${i}, 2); resetBuilderForm(); renderBuilder()">✖</span>
                <div class="builder-click-zone" onclick="editBuilderItem(${i})">
                    <div style="margin-bottom:8px;"> <span class="builder-exo-name">${item.name}</span> <span class="builder-exo-info">${item.sets} x ${item.reps} reps</span> </div>
                    <div> <span class="builder-exo-name">${nextItem.name}</span> <span class="builder-exo-info">${nextItem.sets} x ${nextItem.reps} reps</span> </div>
                </div>
            </div>`; 
            i++; // On saute l'exercice suivant car il est inclus dans la boîte
        } else if (!isSupersetSecond) { 
            const dataJson = JSON.stringify({ type: 'solo', data: item });
            htmlContent = `
            <div class="builder-item builder-item-solo ${editingClass}" 
                 data-index="${i}" ${draggableAttr} data-json='${dataJson}'>
                <span class="delete-x" onclick="event.stopPropagation(); tempBuilderList.splice(${i}, 1); resetBuilderForm(); renderBuilder()">✖</span>
                <div class="builder-click-zone" onclick="editBuilderItem(${i})">
                    <span class="builder-exo-name">${item.name}</span> <span class="builder-exo-info">${item.sets} x ${item.reps} reps</span>
                </div>
            </div>`; 
        } 
        listDiv.innerHTML += htmlContent;
    } 
    
    // --- GESTION TACTILE DRAG & DROP (Rien ne change ici) ---
    const items = listDiv.querySelectorAll('.builder-item[data-draggable="true"]');
    items.forEach(el => {
        el.addEventListener('touchstart', (e) => {
            if (e.target.classList.contains('delete-x')) return; 
            dragSrcIndex = parseInt(el.getAttribute('data-index'));
            isDraggingMode = false; 
            longPressTimer = setTimeout(() => {
                isDraggingMode = true;
                el.classList.add('dragging-active');
                if (navigator.vibrate) navigator.vibrate(50);
            }, 500);
        }, { passive: false });

        el.addEventListener('touchmove', (e) => {
            if (!isDraggingMode) { clearTimeout(longPressTimer); return; }
            e.preventDefault(); 
            const touch = e.touches[0];
            const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
            const closestItem = targetEl ? targetEl.closest('.builder-item') : null;
            document.querySelectorAll('.drag-over').forEach(i => i.classList.remove('drag-over'));
            if (closestItem && closestItem !== el) {
                closestItem.classList.add('drag-over');
                dragOverIndex = parseInt(closestItem.getAttribute('data-index'));
            }
        }, { passive: false });

        el.addEventListener('touchend', (e) => {
            clearTimeout(longPressTimer);
            el.classList.remove('dragging-active');
            document.querySelectorAll('.drag-over').forEach(i => i.classList.remove('drag-over'));
            if (isDraggingMode && dragOverIndex !== -1 && dragSrcIndex !== -1 && dragSrcIndex !== dragOverIndex) {
                handleDropLogic(dragSrcIndex, dragOverIndex);
            }
            isDraggingMode = false;
            dragSrcIndex = -1;
            dragOverIndex = -1;
        });
    });
}

function handleDropLogic(fromIndex, toIndex) {
    let itemA = tempBuilderList[fromIndex];
    let isSupersetA = (itemA.isSuperset && tempBuilderList[fromIndex+1] && tempBuilderList[fromIndex+1].isSuperset);
    let sizeA = isSupersetA ? 2 : 1;
    let movingItems = tempBuilderList.slice(fromIndex, fromIndex + sizeA);
    tempBuilderList.splice(fromIndex, sizeA);
    let adjust = (fromIndex < toIndex) ? -sizeA : 0;
    if (fromIndex < toIndex) adjust = 0; 
    let finalDest = toIndex + adjust;
    if (finalDest < 0) finalDest = 0;
    tempBuilderList.splice(finalDest, 0, ...movingItems);
    renderBuilder();
}

function editBuilderItem(index) {
    currentEditingIndex = index; const item = tempBuilderList[index]; document.getElementById('builderArea').scrollIntoView({behavior: 'smooth'});
    if (item.isSuperset && tempBuilderList[index+1] && tempBuilderList[index+1].isSuperset) {
        const itemB = tempBuilderList[index+1]; activerModeSuperset();
        document.getElementById('buildExoName').value = item.name; document.getElementById('buildSeries').value = item.sets; document.getElementById('buildReps').value = item.reps;
        document.getElementById('buildExoNameB').value = itemB.name; document.getElementById('buildSeriesB').value = itemB.sets; document.getElementById('buildRepsB').value = itemB.reps;
        document.getElementById('btnAddSupersetConfirm').innerText = "Modifier le Superset";
    } else {
        annulerModeSuperset(); document.getElementById('buildExoName').value = item.name; document.getElementById('buildSeries').value = item.sets; document.getElementById('buildReps').value = item.reps;
        document.getElementById('btnAddNormal').innerText = "Modifier l'exercice";
    }
    renderBuilder(); document.getElementById('buildExoName').focus();
}
function sauvegarderProgrammeFinal() { 
    const pendingName = document.getElementById('buildExoName').value; if(pendingName.trim() !== "") { alert("Attention : Tu as un exercice en cours de saisie !"); return; }
    const name = document.getElementById('newProgName').value; if(name && tempBuilderList.length > 0) { DB.progs[name] = tempBuilderList; localStorage.setItem('gym_v8_progs', JSON.stringify(DB.progs)); resetBuilderForm(); tempBuilderList = []; document.getElementById('newProgName').value = ''; renderBuilder(); updateSelectMenu(); renderProgramList(); toggleBuilder(); } 
}
function startEditProgram(btn, e) { e.stopPropagation(); const name = btn.getAttribute('data-name'); resetBuilderForm(); tempBuilderList = JSON.parse(JSON.stringify(DB.progs[name])); document.getElementById('newProgName').value = name; document.getElementById('builderArea').classList.remove('hidden'); renderBuilder(); document.getElementById('builderArea').scrollIntoView({behavior: 'smooth'}); document.getElementById('btnSaveProg').innerText = "Mettre à jour la Séance"; }
function deleteProg(name, e) { e.stopPropagation(); if(confirm("Supprimer ?")) { delete DB.progs[name]; localStorage.setItem('gym_v8_progs', JSON.stringify(DB.progs)); updateSelectMenu(); renderProgramList(); chargerInterface(); } }
function updateSelectMenu() { 
    const s = document.getElementById('selectProgram'); 
    // J'ai enlevé 'disabled' ici. L'option a une valeur vide "".
    s.innerHTML = '<option value="">Choisir une Séance</option>'; 
    Object.keys(DB.progs).forEach(k => s.innerHTML += `<option value="${k}">${k}</option>`); 
}

// --- MODIF: VARIABLES DRAG & DROP PROGRAMMES ---
let progDragSrcIndex = -1;
let progDragOverIndex = -1;
let progLongPressTimer = null;
let isProgDraggingMode = false;

// --- MODIF: FONCTION RENDER PROGRAMMES AVEC DRAG & DROP ---
function renderProgramList() { 
    const div = document.getElementById('listeMesProgrammes'); 
    div.innerHTML = ''; 
    
    const progKeys = Object.keys(DB.progs);

    progKeys.forEach((k, index) => { 
        let html = ` 
        <div class="prog-item" data-index="${index}" onclick="toggleDetails('${k}')"> 
            <div style="flex:1">
                <span class="prog-title">${k}</span> 
            </div>
            <div class="prog-header-actions">
                <button class="btn-edit" data-name="${k}" onclick="startEditProgram(this, event)">Modifier</button>
                <button class="btn-danger" onclick="deleteProg('${k.replace(/'/g, "\\'")}', event)">Supprimer</button>
            </div> 
        </div> 
        <div id="details-${k}" class="prog-details-box">`; 
        
        const exos = DB.progs[k]; 
        for (let i = 0; i < exos.length; i++) { 
            const e = exos[i]; 
            if (e.isSuperset && exos[i+1] && exos[i+1].isSuperset) { 
                const eNext = exos[i+1]; 
                html += `<div class="superset-wrapper"> <div class="prog-line prog-line-superset"> <span class="prog-line-name">${e.name}</span> <span class="prog-line-info">${e.sets} x ${e.reps} reps</span> </div> <div class="prog-line prog-line-superset prog-line-superset-b"> <span class="prog-line-name">${eNext.name}</span> <span class="prog-line-info">${eNext.sets} x ${eNext.reps} reps</span> </div></div>`; 
                i++; 
            } else { 
                html += `<div class="exo-wrapper"> <div class="prog-line"> <span class="prog-line-name">${e.name}</span> <span class="prog-line-info">${e.sets} x ${e.reps} reps</span> </div> </div>`; 
            } 
        } 
        html += `</div>`; 
        div.innerHTML += html; 
    });

    const items = div.querySelectorAll('.prog-item');
    items.forEach(el => {
        el.addEventListener('touchstart', (e) => {
            if (e.target.tagName === 'BUTTON') return;

            progDragSrcIndex = parseInt(el.getAttribute('data-index'));
            isProgDraggingMode = false;

            progLongPressTimer = setTimeout(() => {
                isProgDraggingMode = true;
                el.classList.add('dragging-active');
                el.style.opacity = '0.9';
                el.style.backgroundColor = '#e9ecef';
                el.style.transform = 'scale(1.03)';
                el.style.zIndex = '100';
                el.style.pointerEvents = 'none'; 
                if (navigator.vibrate) navigator.vibrate(50);
            }, 500); 
        }, { passive: false });

        el.addEventListener('touchmove', (e) => {
            if (!isProgDraggingMode) {
                clearTimeout(progLongPressTimer);
                return;
            }
            e.preventDefault(); 
            
            const touch = e.touches[0];
            const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
            const closestItem = targetEl ? targetEl.closest('.prog-item') : null;

            div.querySelectorAll('.drag-over').forEach(i => {
                i.classList.remove('drag-over');
                i.style.border = ''; 
            });

            if (closestItem && closestItem !== el) {
                closestItem.classList.add('drag-over');
                closestItem.style.border = '2px dashed #b2bec3';
                progDragOverIndex = parseInt(closestItem.getAttribute('data-index'));
            }
        }, { passive: false });

        el.addEventListener('touchend', (e) => {
            clearTimeout(progLongPressTimer);
            el.classList.remove('dragging-active');
            el.style.opacity = '';
            el.style.backgroundColor = '';
            el.style.transform = '';
            el.style.zIndex = '';
            el.style.pointerEvents = '';

            div.querySelectorAll('.drag-over').forEach(i => {
                i.classList.remove('drag-over');
                i.style.border = '';
            });

            if (isProgDraggingMode && progDragOverIndex !== -1 && progDragSrcIndex !== -1 && progDragSrcIndex !== progDragOverIndex) {
                handleProgramDrop(progDragSrcIndex, progDragOverIndex);
            }
            
            isProgDraggingMode = false;
            progDragSrcIndex = -1;
            progDragOverIndex = -1;
        });
    });
}

function handleProgramDrop(fromIndex, toIndex) {
    const keys = Object.keys(DB.progs);
    const movedKey = keys[fromIndex];
    
    keys.splice(fromIndex, 1);
    keys.splice(toIndex, 0, movedKey);
    
    const newProgs = {};
    keys.forEach(key => {
        newProgs[key] = DB.progs[key];
    });
    
    DB.progs = newProgs;
    localStorage.setItem('gym_v8_progs', JSON.stringify(DB.progs));
    
    updateSelectMenu();
    renderProgramList();
}

function toggleDetails(id) { document.getElementById('details-'+id).classList.toggle('open'); }

// --- NOUVELLE LOGIQUE HISTORIQUE (SWITCH) ---
function switchHistoryMode(mode) {
    historyMode = mode;
    updateHistoryTabsUI();
    
    const listView = document.getElementById('history-subview-list');
    const calView = document.getElementById('history-subview-calendar');
    const weightView = document.getElementById('history-subview-weight');
    
    listView.classList.add('hidden');
    calView.classList.add('hidden');
    weightView.classList.add('hidden');
    
    if (mode === 'list') {
        listView.classList.remove('hidden');
        renderHistory();
    } else if (mode === 'calendar') {
        calView.classList.remove('hidden');
        renderCalendar();
    } else if (mode === 'weight') {
        weightView.classList.remove('hidden');
        renderWeightView();
    }
    updateHistoryTitle();
}

function updateHistoryTabsUI() {
    document.getElementById('switchList').classList.toggle('active', historyMode === 'list');
    document.getElementById('switchCal').classList.toggle('active', historyMode === 'calendar');
    document.getElementById('switchWeight').classList.toggle('active', historyMode === 'weight');
}

function updateHistoryTitle() {
    const titleEl = document.getElementById('mainTitle');
    if (historyMode === 'list') { titleEl.innerText = "Mon Historique"; } 
    else if (historyMode === 'calendar') { titleEl.innerText = "Mon Calendrier"; }
    else if (historyMode === 'weight') { titleEl.innerText = "Mon Suivi de Poids"; }
}

function renderHistory() { 
    if(historyMode !== 'list') return; 
    const container = document.getElementById('listeHistorique'); 
    const titleEl = document.getElementById('histMainTitle'); 
    const btnEl = document.getElementById('histActionBtn'); 
    
    container.innerHTML = ''; 
    
    if(DB.history.length === 0) { 
        titleEl.innerText = "Types de Séances"; 
        btnEl.innerText = "Effacer tout"; 
        btnEl.onclick = resetHistoryOnly; 
        container.innerHTML = '<p style="text-align:center; color:#999; margin-top:20px">Aucune séance enregistrée.</p>'; 
        historyState.view = 'categories'; 
        historyState.selected = null; 
        return; 
    } 
    
    if (historyState.view === 'categories') { 
        titleEl.innerText = "Types de Séances"; 
        btnEl.innerText = "Effacer tout"; 
        btnEl.onclick = resetHistoryOnly; 
        
        const groups = {}; 
        DB.history.forEach(s => { if(!groups[s.programName]) groups[s.programName] = 0; groups[s.programName]++; }); 
        
        Object.keys(groups).forEach(name => { 
            const count = groups[name]; 
            const btn = document.createElement('div'); 
            btn.className = 'hist-category-btn'; 
            btn.innerHTML = `<span class="hist-cat-title">${name}</span> <span class="hist-count">${count}</span>`; 
            btn.onclick = () => { historyState.view = 'details'; historyState.selected = name; renderHistory(); }; 
            container.appendChild(btn); 
        }); 
    } else { 
        // VUE DETAILS
        titleEl.innerText = "SÉANCES " + historyState.selected; 
        btnEl.innerText = "Effacer " + historyState.selected; 
        btnEl.onclick = () => deleteCategoryHistory(historyState.selected); 
        
        const backBtn = document.createElement('div'); 
        backBtn.className = 'btn-back-hist'; 
        backBtn.innerText = 'Retour aux types de Séances'; 
        backBtn.onclick = () => { historyState.view = 'categories'; historyState.selected = null; renderHistory(); }; 
        container.appendChild(backBtn); 
        
        const filtered = DB.history.filter(s => s.programName === historyState.selected); 
        
        filtered.forEach(session => { 
            const wrapper = document.createElement('div'); wrapper.className = 'hist-session'; 
            const header = document.createElement('div'); header.className = 'hist-header'; 
            header.innerHTML = `<span class="hist-date-large">${session.date}</span>`; 
            
            const body = document.createElement('div'); body.className = 'hist-body'; 
            
            if(session.details && session.details.length > 0) { 
                session.details.forEach(log => { 
                    let cleanPerf = log.perf.replace(/ \+ Dégressive: /g, " + ").replace(/Dégressive: /g, "+ "); 
                    body.innerHTML += `<div class="hist-exo-line"><span class="hist-exo-name">${log.exo} <small style="color:#b2bec3;">(#${log.serie})</small></span><span class="hist-exo-perf">${cleanPerf}</span></div>`; 
                }); 
            } else { 
                body.innerHTML = '<div style="padding:10px; color:#999">Pas de détails.</div>'; 
            } 
            
            header.onclick = () => { body.classList.toggle('open'); }; 
            
            // --- LOGIQUE MAGIQUE : SI C'EST LA DATE DEMANDÉE, ON OUVRE ET ON SCROLL ---
            if (historyState.targetDate && session.date === historyState.targetDate) {
                body.classList.add('open');
                // Petit délai pour laisser le temps au navigateur d'afficher la page avant de scroller
                setTimeout(() => {
                    wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 200);
            }

            wrapper.appendChild(header); 
            wrapper.appendChild(body); 
            container.appendChild(wrapper); 
        }); 
        
        // On remet à zéro la cible pour ne pas que ça le refasse tout le temps
        historyState.targetDate = null;
    } 
}

function resetHistoryOnly() { if(confirm("Effacer tout l'historique ?")) { DB.history = []; localStorage.setItem('gym_v21_history', JSON.stringify([])); historyState.view = 'categories'; renderHistory(); } }
function deleteCategoryHistory(catName) { if(confirm("Effacer tout l'historique pour " + catName + " ?")) { DB.history = DB.history.filter(s => s.programName !== catName); localStorage.setItem('gym_v21_history', JSON.stringify(DB.history)); historyState.view = 'categories'; historyState.selected = null; renderHistory(); } }

// --- LOGIQUE CALENDRIER ---
function renderCalendar() {
    if(historyMode !== 'calendar') return;
    const grid = document.getElementById('calendarGrid');
    const monthDisplay = document.getElementById('calMonthDisplay');
    if(!grid || !monthDisplay) return;
    grid.innerHTML = '';
    const year = currentCalDate.getFullYear();
    const month = currentCalDate.getMonth();
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    monthDisplay.innerText = `${monthNames[month]} ${year}`;
    const firstDayOfMonth = new Date(year, month, 1).getDay(); 
    let adjustedFirstDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < adjustedFirstDay; i++) { const emptyCell = document.createElement('div'); grid.appendChild(emptyCell); }
    const today = new Date();
    for (let d = 1; d <= daysInMonth; d++) {
        const cell = document.createElement('div'); cell.className = 'cal-day active-month'; cell.innerText = d;
        const cellDateObj = new Date(year, month, d); const cellDateStr = cellDateObj.toLocaleDateString(); 
        if (d === today.getDate() && month === today.getMonth() && year === today.getFullYear()) cell.classList.add('today');
        const hasSession = DB.history.some(s => s.date === cellDateStr);
        if (hasSession) cell.classList.add('has-session');
        cell.onclick = () => {
            document.querySelectorAll('.cal-day').forEach(c => c.classList.remove('selected'));
            cell.classList.add('selected');
            showDayDetails(cellDateStr);
        };
        grid.appendChild(cell);
    }
}
function changeMonth(delta) { currentCalDate.setMonth(currentCalDate.getMonth() + delta); renderCalendar(); }
function showDayDetails(dateStr) {
    const listDiv = document.getElementById('daySessionsList');
    listDiv.innerHTML = '';
    const sessions = DB.history.filter(s => s.date === dateStr);
    
    if (sessions.length === 0) { 
        listDiv.innerHTML = '<div style="color:#b2bec3; font-style:italic;">Aucune séance ce jour-là.</div>'; 
        return; 
    }

    sessions.forEach(s => {
        const item = document.createElement('div'); 
        item.className = 'session-item-detail';
        item.style.cursor = 'pointer';
        
// --- FONCTION DE REDIRECTION (A METTRE TOUT A LA FIN DU FICHIER) ---
function goToHistoryFromCalendar(progName, dateStr) {
    historyMode = 'list';
    historyState.view = 'details';
    historyState.selected = progName;
    
    // On retient la date cible pour l'ouverture auto
    historyState.targetDate = dateStr;
    
    // Changement d'onglet (Index 2 = Historique)
    const historyBtn = document.querySelectorAll('.nav-item')[2];
    switchTab('history', historyBtn, 2);
    switchHistoryMode('list');
    
    renderHistory();
}
        
        item.innerHTML = `
            <span style="font-weight:800; color:var(--text-main);">${s.programName}</span> 
            <small style="color:#636e72; display:flex; align-items:center; font-weight:600;">
                Voir détails <span style="font-size:1.2em; margin-left:4px;">➔</span>
            </small>
        `;
        listDiv.appendChild(item);
    });
}

// --- LOGIQUE POIDS & GRAPHIQUE ---
function renderWeightView() {
    if(historyMode !== 'weight') return;
    renderWeightList();
    drawWeightChart();
}

function addWeightEntry() {
    const dateInput = document.getElementById('weightDateInput');
    const valInput = document.getElementById('weightValueInput');
    const dateVal = dateInput.value;
    const weightVal = parseFloat(valInput.value);
    
    if(!dateVal || isNaN(weightVal)) return alert("Date ou poids invalide");
    
    DB.weight.push({ date: dateVal, value: weightVal });
    
    DB.weight.sort((a,b) => new Date(a.date) - new Date(b.date));
    
    localStorage.setItem('gym_weight', JSON.stringify(DB.weight));
    valInput.value = '';
    renderWeightView();
}

function deleteWeight(index) {
    if(confirm("Supprimer cette pesée ?")) {
        DB.weight.splice(index, 1);
        localStorage.setItem('gym_weight', JSON.stringify(DB.weight));
        renderWeightView();
    }
}

function renderWeightList() {
    const listDiv = document.getElementById('weightHistoryList');
    listDiv.innerHTML = '';
    const sortedForList = [...DB.weight].reverse();
    
    if(sortedForList.length === 0) {
        listDiv.innerHTML = '<p style="text-align:center; color:#b2bec3;">Aucune donnée.</p>';
        return;
    }
    
    sortedForList.forEach((item, index) => {
        const realIndex = DB.weight.length - 1 - index;
        const d = new Date(item.date);
        const dateStr = d.toLocaleDateString();
        
        listDiv.innerHTML += `
            <div class="weight-item">
                <span class="weight-date">${dateStr}</span>
                <div style="display:flex; align-items:center;">
                    <span class="weight-val">${item.value} kg</span>
                    <button class="btn-del-weight" onclick="deleteWeight(${realIndex})">✖</button>
                </div>
            </div>
        `;
    });
}

function drawWeightChart() {
    const canvas = document.getElementById('weightChart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const w = rect.width;
    const h = rect.height;
    
    ctx.clearRect(0, 0, w, h);
    
 if (DB.weight.length < 2) {
        ctx.fillStyle = "#b2bec3";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        
        ctx.fillText("Ajoutez 2 mesures", w/2, h/2 - 10);
        ctx.fillText("pour voir le graphique", w/2, h/2 + 15);
        return;
    }
    
    const padLeft = 40;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 30;
    
    const graphW = w - padLeft - padRight;
    const graphH = h - padTop - padBottom;
    
    const values = DB.weight.map(i => i.value);
    let minVal = Math.min(...values);
    let maxVal = Math.max(...values);
    
    const range = maxVal - minVal;
    minVal -= (range * 0.1) || 1; 
    maxVal += (range * 0.1) || 1;
    
    ctx.strokeStyle = "#eee";
    ctx.lineWidth = 1;
    
    ctx.beginPath();
    ctx.moveTo(padLeft, h - padBottom);
    ctx.lineTo(w - padRight, h - padBottom);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.strokeStyle = "#2d3436";
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    
    const stepX = graphW / (DB.weight.length - 1);
    
    const points = DB.weight.map((item, i) => {
        const x = padLeft + (i * stepX);
        const ratio = (item.value - minVal) / (maxVal - minVal);
        const y = (h - padBottom) - (ratio * graphH);
        return {x, y, val: item.value, date: item.date};
    });
    
    ctx.moveTo(points[0].x, points[0].y);
    for(let i=1; i<points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    
    ctx.fillStyle = "#2d3436";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    
    points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI*2);
        ctx.fill();
        
        ctx.fillText(p.val, p.x, p.y - 10);
    });
    
    ctx.fillStyle = "#636e72";
    ctx.font = "10px sans-serif";
    
    const dateStep = Math.ceil(points.length / 5);
    points.forEach((p, i) => {
        if (i % dateStep === 0 || i === points.length - 1) {
            const d = new Date(p.date);
            const str = `${d.getDate()}/${d.getMonth()+1}`;
            ctx.fillText(str, p.x, h - 5);
        }
    });
}

// --- IMPORT / EXPORT (VERSION ANTI-CRASH / PRESSE-PAPIER) ---
function exportData() {
    const dataStr = JSON.stringify(DB);
    
    navigator.clipboard.writeText(dataStr).then(function() {
        alert("Sauvegarde COPIÉE !\n\nOuvre ton appli 'Notes', crée une nouvelle note et fais 'Coller' pour conserver tes données.");
    }, function(err) {
        prompt("Impossible de copier automatiquement. Copie ce texte manuellement et garde-le précieusement :", dataStr);
    });
}

// --- IMPORTATION DIRECTE PAR COLLER ---
function triggerImport() {
    // On attend un tout petit peu pour laisser le temps au menu de se fermer
    setTimeout(() => {
        const text = prompt("Colle le texte de ta sauvegarde ici :");
        if (text && text.trim() !== "") {
            processImport(text);
        }
    }, 100);
}

// Tu peux SUPPRIMER complètement la fonction : function importData(input) { ... }

function processImport(jsonString) {
    try {
        const data = JSON.parse(jsonString);
        if (data.progs || data.history) {
            if(confirm("Attention : Cela va remplacer TOUTES tes données actuelles par cette sauvegarde.\n\nContinuer ?")) {
                DB = {
                    progs: data.progs || {},
                    history: data.history || [],
                    weight: data.weight || [] 
                };
                localStorage.setItem('gym_v8_progs', JSON.stringify(DB.progs));
                localStorage.setItem('gym_v21_history', JSON.stringify(DB.history));
                localStorage.setItem('gym_weight', JSON.stringify(DB.weight));
                
                alert("Données restaurées avec succès !");
                location.reload();
            }
        } else { 
            alert("Ce texte/fichier n'est pas une sauvegarde valide."); 
        }
    } catch(err) { 
        alert("Erreur : Le format des données est incorrect ou corrompu."); 
    }
}

// --- GESTION PARAMETRES (AJOUT) ---
function toggleSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.toggle('hidden');
    }
}

// --- SÉCURITÉS ---
window.addEventListener('beforeunload', () => { saveCurrentSessionState(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveCurrentSessionState(); });

// --- GESTION CLAVIER (Cacher Nav Bar) ---
document.addEventListener('focusin', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        const nav = document.querySelector('.nav-bar');
        if (nav) nav.classList.add('keyboard-active');
    }
});

document.addEventListener('focusout', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        const nav = document.querySelector('.nav-bar');
        setTimeout(() => {
            if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                if (nav) nav.classList.remove('keyboard-active');
            }
        }, 100);
    }
});

// --- DETECTION SCROLL (A METTRE A LA FIN DU FICHIER) ---
document.addEventListener('DOMContentLoaded', () => {
    const navBar = document.querySelector('.nav-bar');
    let lastScrollTop = 0;

    if (navBar) {
        window.addEventListener('scroll', function() {
            // On cherche le scroll partout où il peut se cacher sur Android
            let scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
            
            // Sécurité rebond haut de page
            if (scrollTop <= 0) {
                navBar.classList.remove('scroll-hidden');
                lastScrollTop = 0;
                return;
            }

            // Si on descend de plus de 5px
            if (Math.abs(lastScrollTop - scrollTop) > 5) {
                if (scrollTop > lastScrollTop && scrollTop > 50) {
                    navBar.classList.add('scroll-hidden');
                } else {
                    navBar.classList.remove('scroll-hidden');
                }
                lastScrollTop = scrollTop;
            }
        }, { passive: true });
    }
});

// --- FORCE L'AFFICHAGE DE LA NAV BAR AU CLIC HORS INPUT ---
document.addEventListener('click', function(e) {
    const nav = document.querySelector('.nav-bar');
    if (!nav) return;

    // Si on ne clique PAS sur un champ de saisie
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        // On retire les classes qui cachent la barre
        nav.classList.remove('scroll-hidden');
        nav.classList.remove('keyboard-active');
    }
});






