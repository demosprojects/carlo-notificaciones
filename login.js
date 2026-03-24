import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCZSkqpGlv-gzeBH10VfJ1cpEavjUV0MAM",
    authDomain: "carlo-xavi.firebaseapp.com",
    projectId: "carlo-xavi",
    storageBucket: "carlo-xavi.firebasestorage.app",
    messagingSenderId: "1092306113916",
    appId: "1:1092306113916:web:f66b8e9e72548c723300f9"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Si ya hay sesión activa → ir directo al admin
onAuthStateChanged(auth, (user) => {
    if (user) window.location.href = "admin.html";
});

// Mensajes de error en español
const errorMessages = {
    "auth/invalid-email":        "El correo no tiene un formato válido.",
    "auth/user-not-found":       "No existe una cuenta con ese correo.",
    "auth/wrong-password":       "Contraseña incorrecta. Intentá de nuevo.",
    "auth/invalid-credential":   "Credenciales incorrectas. Verificá tus datos.",
    "auth/too-many-requests":    "Demasiados intentos. Esperá unos minutos.",
    "auth/network-request-failed": "Sin conexión. Verificá tu red.",
};

function mostrarError(msg) {
    const el = document.getElementById('error-msg');
    el.textContent = msg;
    el.style.display = 'block';
    // Re-trigger shake animation
    el.style.animation = 'none';
    el.offsetHeight; // reflow
    el.style.animation = '';
}

function ocultarError() {
    document.getElementById('error-msg').style.display = 'none';
}

document.getElementById('btn-login').addEventListener('click', async () => {
    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const btn      = document.getElementById('btn-login');

    ocultarError();

    if (!email || !password) {
        mostrarError("Completá todos los campos.");
        return;
    }

    // Estado de carga
    btn.disabled = true;
    btn.classList.add('loading');

    try {
        await signInWithEmailAndPassword(auth, email, password);
        window.location.href = "admin.html";
    } catch (err) {
        const msg = errorMessages[err.code] || "Ocurrió un error inesperado.";
        mostrarError(msg);
        btn.disabled = false;
        btn.classList.remove('loading');
    }
});