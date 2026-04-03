import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, where, orderBy, doc, deleteDoc, getDocs, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- CONFIGURAÇÃO E INICIALIZAÇÃO ---
const firebaseConfig = {
    apiKey: "AIzaSyCsvNMfta3Y2sQUxYHunCIyTcrrH6eT6j8",
    authDomain: "projetoz-do-vini.firebaseapp.com",
    projectId: "projetoz-do-vini",
    storageBucket: "projetoz-do-vini.firebasestorage.app",
    messagingSenderId: "183074290629",
    appId: "1:183074290629:web:1823c0f0428d2d9bc869ac"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- ESTADO LOCAL ---
let planosLocal = {}; 
let docAtivoId = null; 
let saldoTemp = 0; 
let restanteTemp = 0;

// --- CONTROLE DE ACESSO ---
onAuthStateChanged(auth, user => {
    if(user) { 
        const display = document.getElementById('user-display');
        if(display) display.innerText = `CONECTADO: ${user.email.split('@')[0].toUpperCase()}`;
        core();
    } else { 
        window.location.href = "index.html"; 
    }
});

// --- MOTOR PRINCIPAL (REAL-TIME) ---
function core() {
    const uid = auth.currentUser.uid;

    // 1. Monitorar Finanças do Dia (Caixa Aberto)
    onSnapshot(query(collection(db, "vendas_dia"), where("userId", "==", uid)), snap => {
        let cx = { Pix: 0, Dinheiro: 0, Débito: 0, Crédito: 0, Total: 0 };
        snap.forEach(d => { 
            const v = d.data(); 
            if(cx[v.metodo] !== undefined) cx[v.metodo] += v.valor; 
            cx.Total += v.valor; 
        });
        document.getElementById('f-total').innerText = `R$ ${cx.Total.toFixed(2)}`;
        document.getElementById('f-pix').innerText = `R$ ${cx.Pix.toFixed(2)}`;
        document.getElementById('f-dinheiro').innerText = `R$ ${cx.Dinheiro.toFixed(2)}`;
        document.getElementById('f-debito').innerText = `R$ ${cx.Débito.toFixed(2)}`;
        document.getElementById('f-credito').innerText = `R$ ${cx.Crédito.toFixed(2)}`;
    });

    // 2. Monitorar Lista de Planos
    onSnapshot(query(collection(db, "planos"), where("userId", "==", uid)), snap => {
        const sel = document.getElementById('c-plano');
        const pList = document.getElementById('lista-planos-gestao');
        if(sel) sel.innerHTML = ""; 
        if(pList) pList.innerHTML = "";
        snap.forEach(d => {
            planosLocal[d.id] = d.data();
            if(sel) sel.innerHTML += `<option value="${d.id}">${d.data().nome}</option>`;
            if(pList) pList.innerHTML += `
                <div class="gold-card" style="display:flex; justify-content:space-between; align-items:center">
                    <div><b>${d.data().nome}</b><br><small>R$ ${d.data().preco} - ${d.data().cortes} cortes</small></div>
                    <button onclick="window.delP('${d.id}')" style="background:none; border:none; color:var(--danger); font-weight:800; cursor:pointer">REMOVER</button>
                </div>`;
        });
    });

    // 3. Monitorar Atendimentos e Devedores
    onSnapshot(query(collection(db, "atendimentos"), where("userId", "==", uid), orderBy("data", "desc")), snap => {
        const listC = document.getElementById('lista-clientes-atendidos');
        const listD = document.getElementById('lista-somente-devedores');
        if(listC) listC.innerHTML = ""; 
        if(listD) listD.innerHTML = "";
        let temD = false;

        snap.forEach(d => {
            const c = d.data(); const id = d.id;
            const card = `
                <div class="gold-card">
                    <div style="display:flex; justify-content:space-between; align-items:center">
                        <div onclick="window.abrirAcao('${id}', '${c.nome}', ${c.saldo}, ${c.restante})" style="cursor:pointer">
                            <b style="text-transform:uppercase">${c.nome}</b><br>
                            <small style="color:var(--info)">${c.saldo} cortes restantes</small><br>
                            ${c.restante > 0 ? `<span class="badge badge-pendente">FALTA R$ ${c.restante.toFixed(2)}</span>` : `<span class="badge badge-pago">PAGO</span>`}
                        </div>
                        <button onclick="window.delAtendimento('${id}')" style="background:none; border:none; color:var(--danger); font-size:0.6rem; font-weight:800; cursor:pointer">REMOVER</button>
                    </div>
                </div>`;
            if(listC) listC.innerHTML += card;
            if(c.restante > 0) { temD = true; if(listD) listD.innerHTML += card; }
        });
        const msg = document.getElementById('msg-limpo');
        if(msg) msg.style.display = temD ? "none" : "block";
    });

    // 4. Monitorar Histórico de Fechamentos (Aba Relatórios)
onSnapshot(query(collection(db, "historico_fechamentos"), where("userId", "==", uid), orderBy("data", "asc")), snap => {
    const listaH = document.getElementById('lista-historico-detalhado');
    const containerGrafico = document.getElementById('grafico-performance');
    
    let maxValor = 0;
    let fechamentos = [];

    // Pegamos os dados e descobrimos o maior valor para a escala do gráfico
    snap.forEach(d => {
        const h = d.data();
        fechamentos.push(h);
        if (h.totalDia > maxValor) maxValor = h.totalDia;
    });

    // 4a. Desenha o Gráfico "Raiz" (Barras de CSS)
    if (containerGrafico) {
        containerGrafico.innerHTML = '<div style="display: flex; align-items: flex-end; justify-content: space-around; height: 120px; padding: 10px 0;"></div>';
        const barraContainer = containerGrafico.querySelector('div');

        fechamentos.slice(-7).forEach(h => {
            const altura = maxValor > 0 ? (h.totalDia / maxValor) * 100 : 0;
            const dataF = h.data ? new Date(h.data.seconds * 1000).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}) : '--';
            
            barraContainer.innerHTML += `
                <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
                    <div style="background: var(--accent); width: 15px; height: ${altura}px; border-radius: 3px 3px 0 0; min-height: 2px;" title="R$ ${h.totalDia.toFixed(2)}"></div>
                    <span style="font-size: 0.6rem; color: var(--subtext); margin-top: 5px;">${dataF}</span>
                </div>`;
        });
    }

    // 4b. Atualiza a Lista logo abaixo
    if (listaH) {
        listaH.innerHTML = "";
        [...fechamentos].reverse().forEach(h => {
            const dataFormatada = h.data ? new Date(h.data.seconds * 1000).toLocaleDateString('pt-BR') : '---';
            listaH.innerHTML += `
                <div class="gold-card" style="margin-bottom:10px; border-left: 4px solid var(--accent)">
                    <div style="display:flex; justify-content:space-between">
                        <b>${dataFormatada}</b>
                        <b style="color:var(--accent)">R$ ${h.totalDia.toFixed(2)}</b>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-top: 8px;">
                        <small style="color:var(--subtext)">Pix: R$ ${h.detalhes.Pix.toFixed(2)}</small>
                        <small style="color:var(--subtext)">Din: R$ ${h.detalhes.Dinheiro.toFixed(2)}</small>
                        <small style="color:var(--subtext)">Déb: R$ ${(h.detalhes.Debito || 0).toFixed(2)}</small>
                        <small style="color:var(--subtext)">Cré: R$ ${(h.detalhes.Credito || 0).toFixed(2)}</small>
                    </div>
                </div>`;
        });
    }
});

// --- FUNÇÕES GLOBAIS (WINDOW) ---
window.tab = (id, btn) => {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    btn.classList.add('active');
};

window.btnLogout = () => { if(confirm("Deseja sair?")) signOut(auth); };
window.delAtendimento = async (id) => { if(confirm("Remover?")) await deleteDoc(doc(db, "atendimentos", id)); };
window.delP = async (id) => { if(confirm("Remover?")) await deleteDoc(doc(db, "planos", id)); };

window.abrirAcao = (id, nome, saldo, restante) => {
    docAtivoId = id; saldoTemp = saldo; restanteTemp = restante;
    document.getElementById('modalNome').innerText = nome.toUpperCase();
    document.getElementById('modalSaldoNum').innerText = saldo;
    document.getElementById('modalPgValor').value = restante;
    document.getElementById('modalAcao').style.display = 'flex';
};

window.ajustarSaldo = (val) => {
    saldoTemp = Math.max(0, saldoTemp + val);
    document.getElementById('modalSaldoNum').innerText = saldoTemp;
};

window.confirmarAcao = async () => {
    const vPg = parseFloat(document.getElementById('modalPgValor').value || 0);
    const met = document.getElementById('modalPgMetodo').value;
    if(vPg > 0) {
        await addDoc(collection(db, "vendas_dia"), { 
            valor: vPg, metodo: met, userId: auth.currentUser.uid, data: serverTimestamp() 
        });
        restanteTemp = Math.max(0, restanteTemp - vPg);
    }
    await updateDoc(doc(db, "atendimentos", docAtivoId), { saldo: saldoTemp, restante: restanteTemp });
    document.getElementById('modalAcao').style.display = 'none';
};

// --- LISTENERS DE BOTÕES ---

// Lançar Atendimento/Corte
const btnSalvar = document.getElementById('btnSalvarCorte');
if(btnSalvar) {
    btnSalvar.onclick = async () => {
        const nome = document.getElementById('c-nome').value;
        const pId = document.getElementById('c-plano').value;
        if(!nome || !pId) return alert("Preencha os dados!");
        const p = planosLocal[pId];
        await addDoc(collection(db, "atendimentos"), {
            nome, servico: p.nome, valorTotal: p.preco, restante: p.preco, saldo: p.cortes,
            userId: auth.currentUser.uid, data: serverTimestamp()
        });
        document.getElementById('c-nome').value = "";
    };
}

// Criar Novo Plano
const btnPlano = document.getElementById('btnNovoPlano');
if(btnPlano) {
    btnPlano.onclick = async () => {
        const nome = document.getElementById('p-nome').value;
        const preco = parseFloat(document.getElementById('p-preco').value);
        const cortes = parseInt(document.getElementById('p-cortes').value);
        if(!nome || isNaN(preco)) return alert("Dados inválidos!");
        await addDoc(collection(db, "planos"), { nome, preco, cortes, userId: auth.currentUser.uid });
        document.getElementById('p-nome').value = ""; 
        document.getElementById('p-preco').value = ""; 
        document.getElementById('p-cortes').value = "";
    };
}

// Encerrar Caixa e Salvar Histórico
const btnCaixa = document.getElementById('btnFecharCaixa');
if(btnCaixa) {
    btnCaixa.onclick = async () => {
        const uid = auth.currentUser.uid;
        const q = query(collection(db, "vendas_dia"), where("userId", "==", uid));
        const snap = await getDocs(q);
        
        if(snap.empty) return alert("O caixa já está vazio!");
        if(!confirm("Deseja SALVAR e encerrar o caixa de hoje?")) return;

        let resumo = { Pix: 0, Dinheiro: 0, Débito: 0, Crédito: 0, Total: 0 };
        snap.forEach(d => {
            const v = d.data();
            if(resumo[v.metodo] !== undefined) resumo[v.metodo] += v.valor;
            resumo.Total += v.valor;
        });

        try {
            // Salva no Histórico antes de apagar o caixa atual
            await addDoc(collection(db, "historico_fechamentos"), {
                userId: uid,
                totalDia: resumo.Total,
                detalhes: {
                    Pix: resumo.Pix,
                    Dinheiro: resumo.Dinheiro,
                    Debito: resumo.Débito,
                    Credito: resumo.Crédito
                },
                data: serverTimestamp()
            });

            // Apaga as vendas temporárias do dia
            const promessas = snap.docs.map(d => deleteDoc(doc(db, "vendas_dia", d.id)));
            await Promise.all(promessas);

            alert("Caixa encerrado e histórico salvo!");
        } catch (e) {
            alert("Erro ao salvar histórico.");
        }
    };
}

// Backup de Dados (JSON)
const btnBackup = document.getElementById('btnBackup');
if(btnBackup) {
    btnBackup.onclick = async () => {
        const uid = auth.currentUser.uid;
        const dados = { atendimentos: [], planos: [], historico: [] };
        
        const atends = await getDocs(query(collection(db, "atendimentos"), where("userId", "==", uid)));
        atends.forEach(d => dados.atendimentos.push(d.data()));
        
        const plans = await getDocs(query(collection(db, "planos"), where("userId", "==", uid)));
        plans.forEach(d => dados.planos.push(d.data()));

        const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_barbearia_${new Date().toLocaleDateString()}.json`;
        a.click();
    };
}

// Reset Total do Sistema
const btnResetG = document.getElementById('btnResetGeral');
if(btnResetG) {
    btnResetG.onclick = async () => {
        if(!confirm("⚠️ AVISO CRÍTICO: Isso apagará TODOS os seus dados. Confirma?")) return;
        const uid = auth.currentUser.uid;
        const colecoes = ["vendas_dia", "atendimentos", "planos", "historico_fechamentos"];
        for (const col of colecoes) {
            const q = query(collection(db, col), where("userId", "==", uid));
            const snap = await getDocs(q);
            const promessas = snap.docs.map(d => deleteDoc(doc(db, col, d.id)));
            await Promise.all(promessas);
        }
        alert("Sistema resetado!");
        window.location.reload();
    };
}}