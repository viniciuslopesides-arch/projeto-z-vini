import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, where, orderBy, doc, deleteDoc, getDocs, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- CONFIGURAÇÃO DO FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyCsvNMfta3Y2sQUxYHunCIyTcrrH6eT6j8",
    authDomain: "projetoz-do-vini.firebaseapp.com",
    projectId: "projetoz-do-vini",
    storageBucket: "projetoz-do-vini.firebasestorage.app",
    messagingSenderId: "183074290629",
    appId: "1:183074290629:web:1823c0f0428d2d9bc869ac"
};

// Inicialização
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- VARIÁVEIS DE ESTADO ---
let planosLocal = {};      // Armazena os planos para busca rápida ao lançar cortes
let docAtivoId = null;     // ID do cliente selecionado no modal
let saldoTemp = 0;         // Controle temporário de saldo de cortes
let restanteTemp = 0;      // Controle temporário de valor pendente
let deferredPrompt;        // Armazena o evento de instalação do PWA

// --- LÓGICA PWA (INSTALAÇÃO NO CELULAR) ---
// Detecta se o navegador permite a instalação do app
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const container = document.getElementById('installContainer');
    if(container) container.style.display = 'block'; // Mostra o banner de instalação
});

// --- SEGURANÇA E ACESSO ---
// Verifica se o usuário está logado antes de liberar o sistema
onAuthStateChanged(auth, user => {
    if(user) { 
        const display = document.getElementById('user-display');
        if(display) display.innerText = `CONECTADO: ${user.email.split('@')[0].toUpperCase()}`;
        core(); // Inicia o monitoramento de dados
    } else { 
        window.location.href = "index.html"; // Expulsa se não estiver logado
    }
});

// --- MOTOR PRINCIPAL (DADOS EM TEMPO REAL) ---
function core() {
    const uid = auth.currentUser.uid;

    // 1. MONITORAR CAIXA DO DIA (Vendas_dia)
    onSnapshot(query(collection(db, "vendas_dia"), where("userId", "==", uid)), snap => {
        let cx = { Pix: 0, Dinheiro: 0, Débito: 0, Crédito: 0, Total: 0 };
        snap.forEach(d => { 
            const v = d.data(); 
            if(cx[v.metodo] !== undefined) cx[v.metodo] += v.valor; 
            cx.Total += v.valor; 
        });
        // Atualiza a UI das Finanças
        document.getElementById('f-total').innerText = `R$ ${cx.Total.toFixed(2)}`;
        document.getElementById('f-pix').innerText = `R$ ${cx.Pix.toFixed(2)}`;
        document.getElementById('f-dinheiro').innerText = `R$ ${cx.Dinheiro.toFixed(2)}`;
        document.getElementById('f-debito').innerText = `R$ ${cx.Débito.toFixed(2)}`;
        document.getElementById('f-credito').innerText = `R$ ${cx.Crédito.toFixed(2)}`;
    });

    // 2. MONITORAR LISTA DE PLANOS
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

    // 3. MONITORAR ATENDIMENTOS E DEVEDORES
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

    // 4. MONITORAR HISTÓRICO E GRÁFICO (Performance)
    onSnapshot(query(collection(db, "historico_fechamentos"), where("userId", "==", uid), orderBy("data", "asc")), snap => {
        const listaH = document.getElementById('lista-historico-detalhado');
        const containerGrafico = document.getElementById('grafico-performance');
        let maxValor = 0; let fechamentos = [];
        snap.forEach(d => {
            const h = d.data(); fechamentos.push(h);
            if (h.totalDia > maxValor) maxValor = h.totalDia;
        });

        // Desenha as barras do gráfico
        if (containerGrafico) {
            containerGrafico.innerHTML = '<div style="display: flex; align-items: flex-end; justify-content: space-around; height: 120px; padding: 10px 0;"></div>';
            const barraContainer = containerGrafico.querySelector('div');
            fechamentos.slice(-7).forEach(h => {
                const altura = maxValor > 0 ? (h.totalDia / maxValor) * 100 : 0;
                const dataF = h.data ? new Date(h.data.seconds * 1000).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}) : '--';
                barraContainer.innerHTML += `
                    <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
                        <div style="background: var(--accent); width: 15px; height: ${altura}px; border-radius: 3px 3px 0 0; min-height: 2px;"></div>
                        <span style="font-size: 0.6rem; color: var(--subtext); margin-top: 5px;">${dataF}</span>
                    </div>`;
            });
        }

        // Preenche a lista de fechamentos passados
        if (listaH) {
            listaH.innerHTML = "";
            [...fechamentos].reverse().forEach(h => {
                const dataF = h.data ? new Date(h.data.seconds * 1000).toLocaleDateString('pt-BR') : '---';
                listaH.innerHTML += `
                    <div class="gold-card" style="margin-bottom:10px; border-left: 4px solid var(--accent)">
                        <div style="display:flex; justify-content:space-between">
                            <b>${dataF}</b><b style="color:var(--accent)">R$ ${h.totalDia.toFixed(2)}</b>
                        </div>
                    </div>`;
            });
        }
    });
}

// --- FUNÇÕES GLOBAIS (WINDOW) ---
// Gerenciamento de Abas
window.tab = (id, btn) => {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    btn.classList.add('active');
};

// Logout
window.btnLogout = () => { if(confirm("Deseja sair do sistema?")) signOut(auth); };

// Deletar Atendimento ou Plano
window.delAtendimento = async (id) => { if(confirm("Deseja excluir este atendimento?")) await deleteDoc(doc(db, "atendimentos", id)); };
window.delP = async (id) => { if(confirm("Deseja excluir este plano?")) await deleteDoc(doc(db, "planos", id)); };

// Abrir Modal de Pagamento/Saldo
window.abrirAcao = (id, nome, saldo, restante) => {
    docAtivoId = id; saldoTemp = saldo; restanteTemp = restante;
    document.getElementById('modalNome').innerText = nome.toUpperCase();
    document.getElementById('modalSaldoNum').innerText = saldo;
    document.getElementById('modalPgValor').value = restante;
    document.getElementById('modalAcao').style.display = 'flex';
};

// Ajustar Saldo de Cortes dentro do Modal
window.ajustarSaldo = (val) => {
    saldoTemp = Math.max(0, saldoTemp + val);
    document.getElementById('modalSaldoNum').innerText = saldoTemp;
};

// Salvar alterações do Modal (Pagamento + Redução de Saldo)
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

// --- INTERAÇÕES COM ELEMENTOS DA PÁGINA ---

// 1. LANÇAR NOVO ATENDIMENTO
document.getElementById('btnSalvarCorte').onclick = async () => {
    const nome = document.getElementById('c-nome').value;
    const pId = document.getElementById('c-plano').value;
    if(!nome || !pId) return alert("Preencha o nome e selecione um plano!");
    const p = planosLocal[pId];
    await addDoc(collection(db, "atendimentos"), {
        nome, servico: p.nome, valorTotal: p.preco, restante: p.preco, saldo: p.cortes,
        userId: auth.currentUser.uid, data: serverTimestamp()
    });
    document.getElementById('c-nome').value = "";
};

// 2. CRIAR NOVO PLANO
document.getElementById('btnNovoPlano').onclick = async () => {
    const nome = document.getElementById('p-nome').value;
    const preco = parseFloat(document.getElementById('p-preco').value);
    const cortes = parseInt(document.getElementById('p-cortes').value);
    if(!nome || isNaN(preco)) return alert("Preencha os dados do plano corretamente!");
    await addDoc(collection(db, "planos"), { nome, preco, cortes, userId: auth.currentUser.uid });
    document.getElementById('p-nome').value = ""; document.getElementById('p-preco').value = ""; document.getElementById('p-cortes').value = "";
};

// 3. ENCERRAR CAIXA (SALVAR NO HISTÓRICO)
document.getElementById('btnFecharCaixa').onclick = async () => {
    const uid = auth.currentUser.uid;
    const snap = await getDocs(query(collection(db, "vendas_dia"), where("userId", "==", uid)));
    if(snap.empty) return alert("O caixa já está vazio!");
    if(!confirm("Encerrar o caixa de hoje e salvar no histórico?")) return;

    let resumo = { Pix: 0, Dinheiro: 0, Debito: 0, Credito: 0, Total: 0 };
    snap.forEach(d => {
        const v = d.data();
        const m = v.metodo === "Débito" ? "Debito" : v.metodo === "Crédito" ? "Credito" : v.metodo;
        resumo[m] += v.valor; resumo.Total += v.valor;
    });

    await addDoc(collection(db, "historico_fechamentos"), {
        userId: uid, totalDia: resumo.Total, detalhes: resumo, data: serverTimestamp()
    });

    const promessas = snap.docs.map(d => deleteDoc(doc(db, "vendas_dia", d.id)));
    await Promise.all(promessas);
    alert("Caixa encerrado com sucesso!");
};

// 4. SISTEMA DE BACKUP (BAIXAR JSON)
document.getElementById('btnBackup').onclick = async () => {
    const uid = auth.currentUser.uid;
    const dados = { atendimentos: [], planos: [], historico_fechamentos: [] };
    const collections = ["atendimentos", "planos", "historico_fechamentos"];
    
    for (const col of collections) {
        const snap = await getDocs(query(collection(db, col), where("userId", "==", uid)));
        snap.forEach(d => dados[col].push(d.data()));
    }

    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `BarberCash_Backup_${new Date().toLocaleDateString()}.json`; a.click();
};

// 5. SISTEMA DE IMPORTAÇÃO (SUBIR JSON)
document.getElementById('fileInput').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const dados = JSON.parse(ev.target.result);
            const uid = auth.currentUser.uid;
            if(!confirm("Isso adicionará os dados deste arquivo à sua conta. Confirmar?")) return;

            const importar = async (col, lista) => {
                for(const item of lista) { 
                    item.userId = uid; // Vincula ao usuário atual
                    await addDoc(collection(db, col), item); 
                }
            };

            if(dados.planos) await importar("planos", dados.planos);
            if(dados.atendimentos) await importar("atendimentos", dados.atendimentos);
            if(dados.historico_fechamentos) await importar("historico_fechamentos", dados.historico_fechamentos);

            alert("Importação concluída!"); location.reload();
        } catch (err) { alert("Arquivo JSON inválido ou corrompido."); }
    };
    reader.readAsText(file);
};

// 6. BOTÃO DE INSTALAÇÃO PWA
document.getElementById('btnInstall').onclick = async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt = null;
        document.getElementById('installContainer').style.display = 'none';
    }
};

// 7. RESET TOTAL DO SISTEMA
document.getElementById('btnResetGeral').onclick = async () => {
    if(!confirm("⚠️ AVISO: Isso apagará TODOS os seus dados do banco de dados permanentemente!")) return;
    const uid = auth.currentUser.uid;
    const colecoes = ["vendas_dia", "atendimentos", "planos", "historico_fechamentos"];
    for (const col of colecoes) {
        const snap = await getDocs(query(collection(db, col), where("userId", "==", uid)));
        await Promise.all(snap.docs.map(d => deleteDoc(doc(db, col, d.id))));
    }
    alert("Sistema reiniciado do zero!"); location.reload();
};