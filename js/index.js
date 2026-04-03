import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Configuração do Firebase do Projeto Z
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

// Mapeamento dos elementos do index.html
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const btnLogin = document.getElementById('btnLogin');
const btnReset = document.getElementById('btnReset');
const messageDiv = document.getElementById('message');

// --- FUNÇÃO DE LOGIN ---
btnLogin.onclick = async () => {
    const email = emailInput.value;
    const password = passwordInput.value;

    if(!email || !password) {
        messageDiv.style.color = "#ff4444";
        messageDiv.innerText = "PREENCHA TODOS OS CAMPOS";
        return;
    }

    try {
        // Mantém o usuário logado mesmo se fechar a aba
        await setPersistence(auth, browserLocalPersistence);
        await signInWithEmailAndPassword(auth, email, password);
        
        messageDiv.style.color = "var(--accent)";
        messageDiv.innerText = "ACESSO AUTORIZADO! ENTRANDO...";
        
        // REDIRECIONAMENTO: Ajustado para o nome do seu arquivo (dash.html)
        setTimeout(() => {
            window.location.href = "dash.html";
        }, 800);

    } catch (error) {
        messageDiv.style.color = "#ff4444";
        messageDiv.innerText = "ERRO: ACESSO NEGADO";
        console.error(error);
    }
};

// --- FUNÇÃO DE RECUPERAR SENHA ---
btnReset.onclick = async () => {
    const email = emailInput.value;
    if(!email) return alert("Digite o email primeiro!");
    try {
        await sendPasswordResetEmail(auth, email);
        alert("Email de recuperação enviado! Verifique sua caixa de entrada.");
    } catch (error) {
        alert("Erro ao enviar recuperação.");
    }
};