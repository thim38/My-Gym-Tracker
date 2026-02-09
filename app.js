// --- BASE DE DONNÉES ---
let DB = {
    progs: JSON.parse(localStorage.getItem('gym_v8_progs')) || {},
    history: JSON.parse(localStorage.getItem('gym_v21_history')) || []
};

let currentSessionLogs = [];
let tempBuilderList = [];
let currentEditingIndex = -1; 
let currentCalDate = new Date(); 
let currentTabIndex = 0; 

// ÉTAT HISTORIQUE : 'list' ou 'calendar'
let historyMode = 'list'; 
let historyState = { view: 'categories', selected: null };
let currentProgramKey = ''; 

// --- SCROLL DETECTION ---
let lastScrollTop = 0;
const navBarElement = document.querySelector('.nav-bar');

window.addEventListener('scroll', function() {
    let scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    if (Math.abs(lastScrollTop - scrollTop) <= 5) return;
    if (scrollTop > lastScrollTop && scrollTop > 50) {
        if(navBarElement) navBarElement.classList.add('scroll-hidden');
    } else {
        if(navBarElement) navBarElement.classList.remove('scroll-hidden');
    }
    lastScrollTop = scrollTop <= 0 ? 0 : scrollTop; 
}, false);

// --- INITIALISATION ---
document.addEventListener('DOMContentLoaded', () => {
    const savedSession = localStorage.getItem('gym_active_session');
    
    updateSelectMenu();
    renderProgramList();
    renderHistory();
    // Le calendrier est rendu via renderHistory() si besoin, mais on init ici au cas où
    renderCalendar(); 

    if (savedSession) {
        try {
            const sessionState = JSON.parse(savedSession);
            const select = document.getElementById('selectProgram');
            if (select.querySelector(`option[value="${sessionState.prog}"]`)) {
                select.value = sessionState.prog;
                currentProgramKey = sessionState.prog;
                chargerInterface(false);
                if (sessionState.inputs) {
                    Object.keys(sessionState.inputs).forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.value = sessionState.inputs[id];
                    });
                }
                if (sessionState.logs) {
                    currentSessionLogs = sessionState.logs;
                }
            }
        } catch(e) { console.log("Erreur restauration session", e); }
    }
});

// --- NAVIGATION PRINCIPALE (BAS) ---
function switchTab(viewName, btn, newIndex) {
    if (newIndex === currentTabIndex) return;
    const direction = newIndex > currentTabIndex ? 'right' : 'left';
    currentTabIndex = newIndex;
    
    const views = document.querySelectorAll('.app-view');
    views.forEach(v => { 
        v.classList.add('hidden'); 
        v.classList.remove('anim-right', 'anim-left'); 
    });
    
    const newView = document.getElementById('view-' + viewName);
    newView.classList.remove('hidden');
    newView.classList.add(direction === 'right' ? 'anim-right' : 'anim-left');
    
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    const titleEl = document.getElementById('mainTitle');
    if(viewName === 'seance') titleEl.innerText = "Ma Séance";
    if(viewName === 'progs') titleEl.innerText = "Mon Programme";
    
    // Si on va sur l'historique, on vérifie quel mode est actif
    if(viewName === 'history') { 
        updateHistoryTitle(); 
        if(historyMode === 'calendar') renderCalendar();
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
    const newKey = select.value;
    if (!newKey) return;
    if (newKey === currentProgramKey) return;
    if (hasSessionData()) {
        if (!confirm("Tu as des données en cours. Changer de séance effacera tout. Continuer ?")) {
            select.value = currentProgramKey;
            return;
        }
    }
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
            renderSuperset(zone, exoA, i, exoB, i+1, key); i++; 
        } else { 
            renderNormal(zone, exoA, i, key); 
        } 
    } 
    btnZone.innerHTML = `<button class="btn-terminate-session" onclick="terminerLaSeance('${key}')">Terminer la Séance</button>`; 
    document.querySelectorAll('#zoneTravail input').forEach(input => {
        input.addEventListener('input', saveCurrentSessionState);
    });
}

function createInputWithUnit(id, unit) { return `<div class="input-wrapper"><input type="number" id="${id}" placeholder="" min="0" oninput="if(this.value!=='')this.value=Math.abs(this.value)"><span class="unit-label">${unit}</span></div>`; }
function createDropInput(className, unit) { return `<div class="input-wrapper"><input type="number" class="${className}" placeholder="" min="0" oninput="if(this.value!=='')this.value=Math.abs(this.value)"><span class="unit-label">${unit}</span></div>`; }

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

function ajouterDegressive(baseId, exoName, progName, setNum) { 
    const container = document.getElementById('container_' + baseId); 
    const div = document.createElement('div'); div.className = 'input-row drop-row'; 
    const data = getSplitPerf(exoName, setNum, progName);
    const dropHint = (data && data.drop) ? `<span class="last-perf" style="margin-left:45px;">Précédent : ${data.drop}</span>` : '';
    div.innerHTML = `<div class="set-col"><div class="drop-icon" onclick="this.closest('.drop-row').remove()" title="Supprimer">↳</div></div>${createDropInput('drop-weight', 'kg')}${createDropInput('drop-reps', 'reps')}`; 
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
        
        // Reset l'historique sur la vue liste pour voir la nouvelle séance
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
function renderBuilder() { 
    const listDiv = document.getElementById('builderListDisplay'); listDiv.innerHTML = ''; 
    for (let i = 0; i < tempBuilderList.length; i++) { 
        const item = tempBuilderList[i]; let editingClass = ''; 
        if (currentEditingIndex !== -1 && (i === currentEditingIndex || (item.isSuperset && i === currentEditingIndex + 1))) editingClass = 'editing-active';
        if (item.isSuperset && tempBuilderList[i+1] && tempBuilderList[i+1].isSuperset) { 
            const nextItem = tempBuilderList[i+1]; const dataJson = JSON.stringify({ type: 'superset', dataA: item, dataB: nextItem });
            listDiv.innerHTML += `<div class="builder-item builder-item-superset ${editingClass}" data-json='${dataJson}'><span class="delete-x" onclick="tempBuilderList.splice(${i}, 2); resetBuilderForm(); renderBuilder()">✖</span><div class="builder-click-zone" onclick="editBuilderItem(${i})" title="Cliquer pour modifier"><div style="margin-bottom:12px;"> <span class="builder-exo-name">${item.name}</span> <span class="builder-exo-info">${item.sets} x ${item.reps} reps</span> </div><div> <span class="builder-exo-name">${nextItem.name}</span> <span class="builder-exo-info">${nextItem.sets} x ${nextItem.reps} reps</span> </div></div></div>`; i++; 
        } else { 
            const dataJson = JSON.stringify({ type: 'solo', data: item });
            listDiv.innerHTML += `<div class="builder-item builder-item-solo ${editingClass}" data-json='${dataJson}'><span class="delete-x" onclick="tempBuilderList.splice(${i}, 1); resetBuilderForm(); renderBuilder()">✖</span><div class="builder-click-zone" onclick="editBuilderItem(${i})" title="Cliquer pour modifier"><span class="builder-exo-name">${item.name}</span> <span class="builder-exo-info">${item.sets} x ${item.reps} reps</span></div></div>`; 
        } 
    } 
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
function updateSelectMenu() { const s = document.getElementById('selectProgram'); s.innerHTML = '<option value="" disabled selected>Choisir une Séance</option>'; Object.keys(DB.progs).forEach(k => s.innerHTML += `<option value="${k}">${k}</option>`); }
function renderProgramList() { 
    const div = document.getElementById('listeMesProgrammes'); div.innerHTML = ''; 
    Object.keys(DB.progs).forEach(k => { 
        let html = ` <div class="prog-item" onclick="toggleDetails('${k}')"> <span class="prog-title">${k}</span> <div class="prog-header-actions"><button class="btn-edit" data-name="${k}" onclick="startEditProgram(this, event)">Modifier</button><button class="btn-danger" onclick="deleteProg('${k.replace(/'/g, "\\'")}', event)">Supprimer</button></div> </div> <div id="details-${k}" class="prog-details-box">`; 
        const exos = DB.progs[k]; for (let i = 0; i < exos.length; i++) { const e = exos[i]; if (e.isSuperset && exos[i+1] && exos[i+1].isSuperset) { const eNext = exos[i+1]; html += `<div class="superset-wrapper"> <div class="prog-line prog-line-superset"> <span class="prog-line-name">${e.name}</span> <span class="prog-line-info">${e.sets} x ${e.reps} reps</span> </div> <div class="prog-line prog-line-superset prog-line-superset-b"> <span class="prog-line-name">${eNext.name}</span> <span class="prog-line-info">${eNext.sets} x ${eNext.reps} reps</span> </div></div>`; i++; } else { html += `<div class="exo-wrapper"> <div class="prog-line"> <span class="prog-line-name">${e.name}</span> <span class="prog-line-info">${e.sets} x ${e.reps} reps</span> </div> </div>`; } } html += `</div>`; div.innerHTML += html; 
    }); 
}
function toggleDetails(id) { document.getElementById('details-'+id).classList.toggle('open'); }

// --- NOUVELLE LOGIQUE HISTORIQUE (SWITCH) ---
function switchHistoryMode(mode) {
    historyMode = mode;
    updateHistoryTabsUI();
    
    const listView = document.getElementById('history-subview-list');
    const calView = document.getElementById('history-subview-calendar');
    
    if (mode === 'list') {
        listView.classList.remove('hidden');
        calView.classList.add('hidden');
        renderHistory();
    } else {
        listView.classList.add('hidden');
        calView.classList.remove('hidden');
        renderCalendar();
    }
    updateHistoryTitle();
}

function updateHistoryTabsUI() {
    document.getElementById('switchList').classList.toggle('active', historyMode === 'list');
    document.getElementById('switchCal').classList.toggle('active', historyMode === 'calendar');
}

function updateHistoryTitle() {
    const titleEl = document.getElementById('mainTitle');
    if (historyMode === 'list') {
        titleEl.innerText = "Mon Historique";
    } else {
        titleEl.innerText = "Mon Calendrier";
    }
}

// --- LOGIQUE LISTE HISTORIQUE ---
function renderHistory() { 
    if(historyMode !== 'list') return; // Ne rien faire si on est en mode calendrier
    const container = document.getElementById('listeHistorique'); 
    const titleEl = document.getElementById('histMainTitle'); 
    const btnEl = document.getElementById('histActionBtn'); 
    container.innerHTML = ''; 
    if(DB.history.length === 0) { titleEl.innerText = "Types de Séances"; btnEl.innerText = "Effacer tout"; btnEl.onclick = resetHistoryOnly; container.innerHTML = '<p style="text-align:center; color:#999; margin-top:20px">Aucune séance enregistrée.</p>'; historyState.view = 'categories'; historyState.selected = null; return; } 
    if (historyState.view === 'categories') { 
        titleEl.innerText = "Types de Séances"; btnEl.innerText = "Effacer tout"; btnEl.onclick = resetHistoryOnly; 
        const groups = {}; DB.history.forEach(s => { if(!groups[s.programName]) groups[s.programName] = 0; groups[s.programName]++; }); 
        Object.keys(groups).forEach(name => { const count = groups[name]; const btn = document.createElement('div'); btn.className = 'hist-category-btn'; btn.innerHTML = `<span class="hist-cat-title">${name}</span> <span class="hist-count">${count}</span>`; btn.onclick = () => { historyState.view = 'details'; historyState.selected = name; renderHistory(); }; container.appendChild(btn); }); 
    } else { 
        titleEl.innerText = "SÉANCES " + historyState.selected; btnEl.innerText = "Effacer " + historyState.selected; btnEl.onclick = () => deleteCategoryHistory(historyState.selected); 
        const backBtn = document.createElement('div'); backBtn.className = 'btn-back-hist'; backBtn.innerText = 'Retour aux types de Séances'; backBtn.onclick = () => { historyState.view = 'categories'; historyState.selected = null; renderHistory(); }; container.appendChild(backBtn); 
        const filtered = DB.history.filter(s => s.programName === historyState.selected); 
        filtered.forEach(session => { 
            const wrapper = document.createElement('div'); wrapper.className = 'hist-session'; 
            const header = document.createElement('div'); header.className = 'hist-header'; header.innerHTML = `<span class="hist-date-large">${session.date}</span>`; 
            const body = document.createElement('div'); body.className = 'hist-body'; 
            if(session.details && session.details.length > 0) { session.details.forEach(log => { let cleanPerf = log.perf.replace(/ \+ Dégressive: /g, " + ").replace(/Dégressive: /g, "+ "); body.innerHTML += `<div class="hist-exo-line"><span class="hist-exo-name">${log.exo} <small style="color:#b2bec3;">(#${log.serie})</small></span><span class="hist-exo-perf">${cleanPerf}</span></div>`; }); } else { body.innerHTML = '<div style="padding:10px; color:#999">Pas de détails.</div>'; } 
            header.onclick = () => { body.classList.toggle('open'); }; wrapper.appendChild(header); wrapper.appendChild(body); container.appendChild(wrapper); 
        }); 
    } 
}

function resetHistoryOnly() { if(confirm("Effacer tout l'historique ?")) { DB.history = []; localStorage.setItem('gym_v21_history', JSON.stringify([])); historyState.view = 'categories'; renderHistory(); renderCalendar(); } }
function deleteCategoryHistory(catName) { if(confirm("Effacer tout l'historique pour " + catName + " ?")) { DB.history = DB.history.filter(s => s.programName !== catName); localStorage.setItem('gym_v21_history', JSON.stringify(DB.history)); historyState.view = 'categories'; historyState.selected = null; renderHistory(); renderCalendar(); } }

// --- LOGIQUE CALENDRIER ---
function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const monthDisplay = document.getElementById('calMonthDisplay');
    // Sécurité si l'élément n'existe pas encore dans le DOM
    if(!grid || !monthDisplay) return;
    
    grid.innerHTML = '';
    const year = currentCalDate.getFullYear();
    const month = currentCalDate.getMonth();
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    monthDisplay.innerText = `${monthNames[month]} ${year}`;
    
    const firstDayOfMonth = new Date(year, month, 1).getDay(); 
    let adjustedFirstDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let i = 0; i < adjustedFirstDay; i++) {
        const emptyCell = document.createElement('div');
        grid.appendChild(emptyCell);
    }
    const today = new Date();
    for (let d = 1; d <= daysInMonth; d++) {
        const cell = document.createElement('div');
        cell.className = 'cal-day active-month';
        cell.innerText = d;
        const cellDateObj = new Date(year, month, d);
        const cellDateStr = cellDateObj.toLocaleDateString(); 
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
    if (sessions.length === 0) { listDiv.innerHTML = '<div style="color:#b2bec3; font-style:italic;">Aucune séance ce jour-là.</div>'; return; }
    sessions.forEach(s => {
        const item = document.createElement('div');
        item.className = 'session-item-detail';
        item.innerHTML = `<span>${s.programName}</span> <small style="color:#636e72">Voir Historique pour détails</small>`;
        listDiv.appendChild(item);
    });
}

// --- IMPORT / EXPORT ---
function exportData() {
    const dataStr = JSON.stringify(DB);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = 'gym_tracker_backup_' + new Date().toLocaleDateString().replace(/\//g, '-') + '.json';
    const linkElement = document.createElement('a'); linkElement.setAttribute('href', dataUri); linkElement.setAttribute('download', exportFileDefaultName); linkElement.click();
}
function triggerImport() { document.getElementById('importFile').click(); }
function importData(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                if (data.progs && data.history) {
                    if(confirm("Attention : Cela va remplacer toutes vos données actuelles. Continuer ?")) {
                        DB = data;
                        localStorage.setItem('gym_v8_progs', JSON.stringify(DB.progs));
                        localStorage.setItem('gym_v21_history', JSON.stringify(DB.history));
                        alert("Données restaurées !");
                        location.reload();
                    }
                } else { alert("Fichier invalide."); }
            } catch(err) { alert("Erreur fichier."); }
        };
        reader.readAsText(input.files[0]);
    }
}

// --- SÉCURITÉS ---
window.addEventListener('beforeunload', () => { saveCurrentSessionState(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveCurrentSessionState(); });
