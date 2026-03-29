import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    getAuth, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getMessaging, getToken, onMessage
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

const firebaseConfig = {
    apiKey: "AIzaSyCZSkqpGlv-gzeBH10VfJ1cpEavjUV0MAM",
    authDomain: "carlo-xavi.firebaseapp.com",
    projectId: "carlo-xavi",
    storageBucket: "carlo-xavi.firebasestorage.app",
    messagingSenderId: "1092306113916",
    appId: "1:1092306113916:web:f66b8e9e72548c723300f9"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const auth = getAuth(app);
const messaging = getMessaging(app);


const VAPID_KEY = "BPW4FiIUjrDAz1XLRrYrCZQJWxQ-DCLg4V2AtfB-L1rq0b0hn7PVf0xirecKtZjHZMPhizWmA6mZBbY3fDJvpdQ";

let productos = [];
let productosFiltrados = [];

// --- AUTH GUARD ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "login.html";
    } else {
        cargarProductos();
        escucharPedidosEnTiempoReal();
        solicitarPermisoNotificaciones().then(() => activarFCM());
    }
});


// --- CARGA ---
async function cargarProductos() {
    toggleLoader(true);
    try {
        const querySnapshot = await getDocs(collection(db, "products"));
        productos = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        aplicarFiltros();
    } catch (e) {
        console.error("Error Carlo Essential Admin:", e);
    } finally {
        toggleLoader(false);
    }
}

function aplicarFiltros() {
    const texto       = document.getElementById('admin-buscador').value.toLowerCase();
    const catFiltro   = document.getElementById('filtro-categoria')?.value || '';
    const dispFiltro  = document.getElementById('filtro-disponibilidad')?.value || '';

    const estaDisponible = p => p.disponible !== false;

    productosFiltrados = productos.filter(p => {
        const matchTexto = p.nombre.toLowerCase().includes(texto);
        const matchCat   = !catFiltro || p.categoria === catFiltro;
        const matchDisp  = !dispFiltro
            || (dispFiltro === 'disponible' &&  estaDisponible(p))
            || (dispFiltro === 'sin-stock'  && !estaDisponible(p));
        return matchTexto && matchCat && matchDisp;
    });

    const total    = productos.length;
    const conStock = productos.filter(estaDisponible).length;
    const sinStock = total - conStock;
    document.getElementById('stats-text').innerText =
        `${productosFiltrados.length} de ${total} piezas  \u00b7  ${conStock} con stock  \u00b7  ${sinStock} sin stock`;

    renderAdmin();
}

document.getElementById('admin-buscador').addEventListener('input', aplicarFiltros);

// --- RENDER ---
function renderAdmin() {
    const container = document.getElementById("admin-productos");
    container.innerHTML = productosFiltrados.map(p => `
        <div class="bg-[#0a0a0a] rounded-3xl p-4 border border-white/5 group hover:border-[#d4af37] transition-all">
            <div class="aspect-square rounded-2xl overflow-hidden mb-4 bg-black relative">
                <img src="${p.imagenes[0]}" class="w-full h-full object-cover group-hover:scale-110 transition-transform">
                ${!p.disponible ? '<span class="absolute top-2 left-2 bg-black text-white text-[8px] px-2 py-1 rounded-full uppercase">Sin Stock</span>' : ''}
            </div>
            <h3 class="font-luxury italic text-sm text-white truncate">${p.nombre}</h3>
            <p class="text-[#d4af37] font-bold text-xs mt-1">$${Number(p.precio).toLocaleString()}</p>
            
            <div class="flex gap-2 mt-4">
                <button onclick="editarProducto('${p.id}')" class="flex-1 bg-white/5 py-2 rounded-xl text-[9px] uppercase font-bold hover:bg-[#d4af37] hover:text-black transition-all">Editar</button>
                <button onclick="eliminarProducto('${p.id}')" class="w-10 bg-red-900/20 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all">
                    <i class="fa-solid fa-trash-can text-xs"></i>
                </button>
            </div>
        </div>
    `).join("");
}

// --- ACCIONES ---
window.aplicarFiltros = aplicarFiltros;

window.abrirModalCrear = () => {
    document.getElementById("modal-form").classList.remove("hidden");
    document.body.style.overflow = "hidden";
    const body = document.getElementById("modal-body");
    if (body) body.scrollTop = 0;
    limpiarForm();
    if (typeof cargarVariantes === 'function') cargarVariantes([]);
    document.getElementById("modal-titulo").textContent = "Nuevo producto";
};

window.cerrarModalAdmin = () => {
    document.getElementById("modal-form").classList.add("hidden");
    document.body.style.overflow = "";
};

window.guardarProducto = async () => {
    const id = document.getElementById("edit-id").value;
    const btn = document.getElementById("btn-guardar");

    const imgs = [];
    for(let i=1; i<=6; i++) {
        const val = document.getElementById(`img${i}`)?.value;
        if(val) imgs.push(val);
    }

    const datos = {
        nombre: document.getElementById("nombre").value,
        precio: Number(document.getElementById("precio").value),
        categoria: document.getElementById("categoria").value,
        descripcion: document.getElementById("descripcion").value,
        caracteristicas: document.getElementById("caracteristicas").value,
        disponible: document.getElementById("disponible").checked,
        esNuevo: document.getElementById("esNuevo")?.checked || false,
        enOferta: document.getElementById("enOferta")?.checked || false,
        precioOferta: document.getElementById("enOferta")?.checked ? (Number(document.getElementById("precioOferta")?.value) || 0) : 0,
        imagenes: imgs,
        variantes: typeof obtenerVariantes === 'function' ? obtenerVariantes() : [],
        fecha: Date.now()
    };

    btn.disabled = true;
    btn.classList.add("btn-loading");
    btn.querySelector(".btn-text").textContent = id ? "Actualizando..." : "Guardando...";

    try {
        if(id) {
            await updateDoc(doc(db, "products", id), datos);
            const idx = productos.findIndex(x => x.id === id);
            if (idx !== -1) productos[idx] = { ...productos[idx], ...datos };
        } else {
            datos.fechaCreacion = Date.now();
            const docRef = await addDoc(collection(db, "products"), datos);
            productos.unshift({ id: docRef.id, ...datos });
        }
        cerrarModalAdmin();
        aplicarFiltros();
        mostrarToast(id ? 'Producto actualizado con \u00e9xito' : 'Producto cargado con \u00e9xito', 'success');
    } catch(e) {
        mostrarToast('Error al guardar el producto', 'error');
    } finally {
        btn.disabled = false;
        btn.classList.remove("btn-loading");
        btn.querySelector(".btn-text").textContent = "Guardar producto";
    }
};

window.editarProducto = (id) => {
    const p = productos.find(x => x.id === id);
    if(!p) return;
    
    document.getElementById("edit-id").value = p.id;
    document.getElementById("nombre").value = p.nombre;
    document.getElementById("precio").value = p.precio;
    document.getElementById("categoria").value = p.categoria;
    document.getElementById("descripcion").value = p.descripcion || "";
    document.getElementById("caracteristicas").value = p.caracteristicas || "";
    document.getElementById("disponible").checked = p.disponible !== false;
    const esNuevoEl = document.getElementById("esNuevo");
    if (esNuevoEl) esNuevoEl.checked = p.esNuevo === true;
    const enOfertaEl = document.getElementById("enOferta");
    if (enOfertaEl) {
        enOfertaEl.checked = p.enOferta === true;
        if (typeof toggleDescuento === 'function') toggleDescuento();
        const precioOfertaEl = document.getElementById("precioOferta");
        if (precioOfertaEl) precioOfertaEl.value = p.precioOferta || '';
        if (typeof actualizarPreviewDescuento === 'function') actualizarPreviewDescuento();
    }

    p.imagenes.forEach((url, i) => {
        const inp = document.getElementById(`img${i+1}`);
        const pre = document.getElementById(`preview-${i+1}`);
        if(inp && pre) {
            inp.value = url;
            pre.src = url;
            pre.classList.remove('hidden');
        }
    });

    if (typeof cargarVariantes === 'function') cargarVariantes(p.variantes || []);

    document.getElementById("modal-form").classList.remove("hidden");
    document.body.style.overflow = "hidden";
    document.getElementById("modal-titulo").textContent = "Editar producto";
    const body = document.getElementById("modal-body");
    if (body) body.scrollTop = 0;
};

window.eliminarProducto = (id) => {
    const p = productos.find(x => x.id === id);
    if(!p) return;

    document.getElementById("eliminar-nombre").textContent = p.nombre;
    abrirModalConfirm("modal-eliminar");

    const btn = document.getElementById("btn-confirm-eliminar");
    const btnClone = btn.cloneNode(true);
    btn.parentNode.replaceChild(btnClone, btnClone.previousSibling ? btnClone : btn);
    document.getElementById("btn-confirm-eliminar").replaceWith(btnClone);

    btnClone.addEventListener("click", async () => {
        btnClone.disabled = true;
        btnClone.classList.add("btn-loading");
        try {
            await deleteDoc(doc(db, "products", id));
            productos = productos.filter(x => x.id !== id);
            cerrarModalConfirm("modal-eliminar");
            aplicarFiltros();
            mostrarToast('Producto eliminado', 'error');
        } catch(e) {
            mostrarToast('Error al eliminar', 'error');
        } finally {
            btnClone.disabled = false;
            btnClone.classList.remove("btn-loading");
        }
    });
};

// --- LOGOUT ---
document.getElementById('btn-logout').addEventListener('click', () => {
    abrirModalConfirm("modal-logout");
});

document.getElementById('btn-confirm-logout').addEventListener('click', async () => {
    const btn = document.getElementById("btn-confirm-logout");
    btn.disabled = true;
    btn.classList.add("btn-loading");
    try {
        await signOut(auth);
        window.location.href = "login.html";
    } catch(e) {
        btn.disabled = false;
        btn.classList.remove("btn-loading");
    }
});

function toggleLoader(show) {
    document.getElementById("loader").classList.toggle("hidden", !show);
    document.getElementById("admin-productos").classList.toggle("hidden", show);
}

function limpiarForm() {
    document.getElementById("edit-id").value = "";
    document.getElementById("nombre").value = "";
    document.getElementById("precio").value = "";
    document.getElementById("descripcion").value = "";
    document.getElementById("caracteristicas").value = "";
    document.getElementById("disponible").checked = true;
    const esNuevoEl2 = document.getElementById("esNuevo");
    if (esNuevoEl2) esNuevoEl2.checked = false;
    document.getElementById("categoria").value = "";
    const enOfertaEl = document.getElementById("enOferta");
    if (enOfertaEl) { enOfertaEl.checked = false; if (typeof toggleDescuento === 'function') toggleDescuento(); }
    const precioOfertaEl = document.getElementById("precioOferta");
    if (precioOfertaEl) precioOfertaEl.value = '';
    for(let i=1; i<=6; i++) {
        const inp = document.getElementById(`img${i}`);
        const pre = document.getElementById(`preview-${i}`);
        const zone = document.getElementById(`zone-${i}`);
        if(inp) inp.value = "";
        if(pre) { pre.classList.add('hidden'); pre.src = ""; }
        if(zone) zone.classList.remove('has-image');
    }
    const varContainer = document.getElementById('variantes-container');
    if (varContainer) varContainer.innerHTML = '';
    const varEmpty = document.getElementById('variantes-empty');
    if (varEmpty) varEmpty.style.display = 'block';
}

// ============================================
// SISTEMA DE TOASTS Y CONFIRMACI\u00d3N ELEGANTE
// ============================================

window.mostrarToast = function(mensaje, tipo = 'success', duracion = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.innerHTML = `<i class="fa-solid ${icons[tipo] || icons.success}" style="font-size:12px;"></i> ${mensaje}`;
    container.appendChild(toast);
    requestAnimationFrame(() => { requestAnimationFrame(() => toast.classList.add('show')); });
    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
    }, duracion);
};

let _confirmAccionCallback = null;
window.mostrarConfirmAccion = function({ titulo, texto, labelOk = 'Eliminar', callback }) {
    document.getElementById('confirm-accion-titulo').textContent = titulo;
    document.getElementById('confirm-accion-texto').textContent = texto;
    const btnOk = document.getElementById('btn-confirm-accion-ok');
    btnOk.querySelector('.btn-text').textContent = labelOk;
    _confirmAccionCallback = callback;
    document.getElementById('modal-confirm-accion').classList.add('show');
};
window.cerrarConfirmAccion = function() {
    document.getElementById('modal-confirm-accion').classList.remove('show');
    _confirmAccionCallback = null;
};
document.getElementById('modal-confirm-accion')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-confirm-accion')) cerrarConfirmAccion();
});
document.getElementById('btn-confirm-accion-ok')?.addEventListener('click', async () => {
    if (!_confirmAccionCallback) return;
    const btn = document.getElementById('btn-confirm-accion-ok');
    btn.disabled = true;
    btn.classList.add('btn-loading');
    try {
        await _confirmAccionCallback();
    } finally {
        btn.disabled = false;
        btn.classList.remove('btn-loading');
    }
});

// ============================================
// M\u00d3DULO DE PEDIDOS
// ============================================

let todosLosPedidos = [];
let pedidosFiltrados = [];

window.mostrarSeccion = function(seccion) {
    const mains = document.querySelectorAll('main');
    const secPedidos = document.getElementById('seccion-pedidos');

    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('activo');
        btn.style.background = '';
        btn.style.border = '';
        btn.style.color = '';
    });

    const navActivo = document.getElementById(`nav-${seccion}`);
    if (navActivo) navActivo.classList.add('activo');

    if (seccion === 'inventario') {
        if (mains[0]) mains[0].classList.remove('hidden');
        if (secPedidos) secPedidos.classList.add('hidden');
    } else if (seccion === 'pedidos') {
        if (mains[0]) mains[0].classList.add('hidden');
        if (secPedidos) secPedidos.classList.remove('hidden');
    }
};

// ============================================
// ESCUCHA DE PEDIDOS EN TIEMPO REAL (MEJORADO)
// ============================================

let pedidosConocidos = null;
let _snapshotUnsub = null;

function escucharPedidosEnTiempoReal() {
    if (_snapshotUnsub) {
        _snapshotUnsub();
        _snapshotUnsub = null;
    }

    const q = query(collection(db, "orders"), orderBy("fecha", "desc"));

    _snapshotUnsub = onSnapshot(q, (snap) => {
        const pedidosNuevos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (pedidosConocidos === null) {
            pedidosConocidos = new Set(pedidosNuevos.map(p => p.id));
        } else {
            pedidosNuevos.forEach(p => {
                if (!pedidosConocidos.has(p.id)) {
                    pedidosConocidos.add(p.id);
                    notificarNuevoPedido(p);
                }
            });
        }

        todosLosPedidos = pedidosNuevos;
        filtrarPedidos();
        actualizarBadgePedidos();

        const loader = document.getElementById('pedidos-loader');
        const grid   = document.getElementById('pedidos-grid');
        if (loader) loader.classList.add('hidden');
        if (grid)   grid.classList.remove('hidden');
    }, (error) => {
        console.error("[Admin] Error en onSnapshot:", error);
        _snapshotUnsub = null;
        setTimeout(escucharPedidosEnTiempoReal, 5000);
    });
}

// \u2500\u2500\u2500 NOTIFICACIONES \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

async function solicitarPermisoNotificaciones() {
    if (!("Notification" in window) || !navigator.serviceWorker) return;
    if (Notification.permission === "denied") return;

    if (Notification.permission !== "granted") {
        const permiso = await Notification.requestPermission();
        if (permiso !== "granted") return;
    }

    console.log("[Admin] Notificaciones activadas \u2713");
}

async function notificarNuevoPedido(pedido) {
    const nombre    = pedido.nombre || "Cliente";
    const total     = Number(pedido.total || 0).toLocaleString("es-AR");
    const cantItems = (pedido.items || []).length;
    const itemsTxt  = cantItems === 1 ? "1 producto" : `${cantItems} productos`;

    mostrarToast(`Nuevo pedido`, 'info', 8000);

    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
    } catch(e) { /* silenciar si no hay AudioContext */ }
}

// \u2500\u2500\u2500 FCM \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

async function activarFCM() {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (!navigator.serviceWorker) return;
    if (!VAPID_KEY) {
        console.warn("[FCM] VAPID_KEY no configurada. Las notificaciones con app cerrada no funcionar\u00e1n.");
        return;
    }

    try {
        const swReg = await navigator.serviceWorker.ready;
        const token = await getToken(messaging, {
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: swReg
        });

        if (token) {
            console.log("[FCM] Token obtenido:", token);
            const uid = auth.currentUser?.uid;
            if (uid) {
                await updateDoc(doc(db, "admins", uid), { fcmToken: token }).catch(() => {
                    import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js")
                        .then(({ setDoc }) => setDoc(doc(db, "admins", uid), { fcmToken: token }, { merge: true }));
                });
            }
        }
    } catch(e) {
        console.warn("[FCM] Error al activar FCM:", e);
    }

    onMessage(messaging, (payload) => {
        console.log("[FCM] Mensaje en foreground:", payload);
        const data = payload.data || {};
        if (data.nombre) {
            mostrarToast(`Nuevo pedido`, 'info', 6000);
        }
    });
}

if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("message", (event) => {
        const { type, pedidoId } = event.data || {};
        if (type === "ABRIR_PEDIDO" && pedidoId) {
            mostrarSeccion("pedidos");
            setTimeout(() => {
                if (window.verDetallePedido) window.verDetallePedido(pedidoId);
            }, 400);
        }
    });
}

function actualizarBadgePedidos() {
    const pendientes = todosLosPedidos.filter(p => p.estado === 'pendiente').length;
    const badge = document.getElementById('pedidos-badge');
    if (!badge) return;
    if (pendientes > 0) {
        badge.textContent = pendientes;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

let filtroEstadoActual = '';

window.setFiltroEstado = function(estado) {
    filtroEstadoActual = estado;
    ['todos','pendiente','contactado','cancelado'].forEach(k => {
        const chip = document.getElementById(`chip-${k}`);
        if (!chip) return;
        const esperado = k === 'todos' ? '' : k;
        chip.classList.toggle('activo', filtroEstadoActual === esperado);
    });
    filtrarPedidos();
};

window.filtrarPedidos = function() {
    const busqueda = (document.getElementById('pedidos-buscador')?.value || '').toLowerCase().trim();
    const sinCompletados = todosLosPedidos.filter(p => p.estado !== 'completado');

    pedidosFiltrados = sinCompletados.filter(p => {
        const matchEstado = !filtroEstadoActual || p.estado === filtroEstadoActual;
        const matchBusqueda = !busqueda ||
            (p.nombre || '').toLowerCase().includes(busqueda) ||
            (p.contacto || '').toLowerCase().includes(busqueda);
        return matchEstado && matchBusqueda;
    });

    const cuentas = { pendiente: 0, contactado: 0, cancelado: 0, archivo: 0 };
    todosLosPedidos.forEach(p => {
        if (p.estado === 'completado') cuentas.archivo++;
        else if (cuentas[p.estado] !== undefined) cuentas[p.estado]++;
    });
    ['pendiente','contactado','cancelado','archivo'].forEach(k => {
        const el = document.getElementById(`cnt-${k}`);
        if (!el) return;
        if (cuentas[k] > 0) { el.textContent = cuentas[k]; el.classList.remove('hidden'); }
        else el.classList.add('hidden');
    });

    const total      = sinCompletados.length;
    const pendientes = cuentas.pendiente;
    const statsEl    = document.getElementById('pedidos-stats');
    if (statsEl) statsEl.textContent = `${pedidosFiltrados.length} de ${total} pedidos activos  \u00b7  ${pendientes} pendientes`;

    renderPedidos();
};

function renderPedidos() {
    const grid = document.getElementById('pedidos-grid');
    if (!grid) return;

    if (pedidosFiltrados.length === 0) {
        grid.innerHTML = `
            <div class="py-20 text-center">
                <p class="text-gray-600 font-luxury text-xl">No hay pedidos a\u00fan.</p>
            </div>`;
        return;
    }

    grid.innerHTML = pedidosFiltrados.map(p => {
        const fecha   = new Date(p.fecha).toLocaleDateString('es-AR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
        const estadoClass = `estado-${p.estado || 'pendiente'}`;
        const estadoLabel = ESTADOS.find(e => e.key === p.estado)?.label || 'Pendiente';
        const itemsResumen = (p.items || []).map(i => `${i.nombre} x${i.cantidad}`).join(' \u00b7 ');

        return `
        <div onclick="verDetallePedido('${p.id}')" class="pedido-card cursor-pointer bg-[#0a0a0a] rounded-2xl p-4 border border-white/5 hover:border-[#d4af37]/40 transition-all active:scale-[0.98]">
            <div class="flex items-start justify-between gap-2 mb-3">
                <div class="flex-1 min-w-0">
                    <p class="text-white font-bold text-sm truncate">${p.nombre}</p>
                    <p class="text-gray-500 text-[10px] mt-0.5">${fecha}</p>
                </div>
                <span class="estado-badge ${estadoClass} flex-shrink-0">${estadoLabel}</span>
            </div>
            <p class="text-gray-600 text-[9px] truncate mb-3">${itemsResumen}</p>
            <div class="flex items-center justify-between">
                <p class="text-[#d4af37] font-bold text-base">$${Number(p.total).toLocaleString('es-AR')}</p>
                <p class="text-gray-600 text-[9px]">${(p.items || []).length} pieza${(p.items || []).length !== 1 ? 's' : ''}</p>
            </div>
        </div>`;
    }).join('');
}

const ESTADOS = [
    { key: 'pendiente',   label: 'Pendiente',   cls: 'estado-pendiente' },
    { key: 'contactado',  label: 'Contactado',  cls: 'estado-contactado' },
    { key: 'completado',  label: 'Completado',  cls: 'estado-completado' },
    { key: 'cancelado',   label: 'Cancelado',   cls: 'estado-cancelado' },
];

window.verDetallePedido = function(id) {
    const p = todosLosPedidos.find(x => x.id === id);
    if (!p) return;

    const fecha   = new Date(p.fecha).toLocaleDateString('es-AR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const estadoClass = `estado-${p.estado || 'pendiente'}`;
    const estadoLabel = ESTADOS.find(e => e.key === p.estado)?.label || 'Pendiente';

    const itemsHTML = (p.items || []).map(item => `
        <div class="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
            ${item.imagen ? `<img src="${item.imagen}" class="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-black border border-white/10">` : '<div class="w-14 h-14 rounded-xl bg-white/5 flex-shrink-0"></div>'}
            <div class="flex-1 min-w-0">
                <p class="text-white text-sm truncate font-bold">${item.nombre}</p>
                <p class="text-gray-500 text-[10px]">x${item.cantidad} \u00b7 $${Number(item.precio).toLocaleString('es-AR')} c/u</p>
            </div>
            <p class="text-[#d4af37] text-sm font-bold flex-shrink-0">$${Number(item.subtotal).toLocaleString('es-AR')}</p>
        </div>
    `).join('');

    document.getElementById('detalle-pedido-body').innerHTML = `
        <div class="flex items-center justify-between gap-3 mb-4">
            <div>
                <p class="text-white font-bold text-lg">${p.nombre}</p>
                <span class="estado-badge ${estadoClass}">${estadoLabel}</span>
            </div>
            <div class="flex gap-2">
                <button onclick="imprimirTicket('${p.id}')" class="w-10 h-10 flex items-center justify-center bg-white/5 text-white/70 rounded-full hover:bg-white/10 transition-all" title="Imprimir Ticket">
                    <i class="fa-solid fa-print text-sm"></i>
                </button>
                <button onclick="descargarTicketPNG('${p.id}')" class="w-10 h-10 flex items-center justify-center bg-white/5 text-white/70 rounded-full hover:bg-white/10 transition-all" title="Descargar PNG para t\u00e9rmica">
                    <i class="fa-solid fa-image text-sm"></i>
                </button>
                <button onclick="descargarTicketPDF('${p.id}')" class="w-10 h-10 flex items-center justify-center bg-white/5 text-white/70 rounded-full hover:bg-white/10 transition-all" title="Descargar PDF">
                    <i class="fa-solid fa-file-arrow-down text-sm"></i>
                </button>
                <button onclick="confirmarEliminarPedido('${p.id}')" class="w-10 h-10 flex items-center justify-center bg-red-900/20 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-all">
                    <i class="fa-solid fa-trash-can text-sm"></i>
                </button>
            </div>
        </div>
        <div class="grid grid-cols-2 gap-3 mb-4">
            <div class="bg-white/3 rounded-xl p-3 border border-white/5 col-span-2">
                <p class="text-[9px] text-gray-500 uppercase tracking-widest mb-1">Contacto</p>
                <p class="text-white text-sm font-medium mb-2">${p.contacto}</p>
                <div class="flex gap-2">
                    <button onclick="copiarContacto('${p.contacto}', this)" title="Copiar numero" style="display:flex;align-items:center;gap:5px;padding:4px 10px;border-radius:99px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);color:#9ca3af;font-size:10px;font-weight:700;letter-spacing:0.05em;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.borderColor='rgba(255,255,255,0.25)';this.style.color='#fff'" onmouseout="this.style.borderColor='rgba(255,255,255,0.1)';this.style.color='#9ca3af'">
                        <i class="fa-regular fa-copy" style="font-size:9px;"></i> Copiar
                    </button>
                    <button onclick="abrirWhatsApp('${p.contacto}', '${p.nombre || ''}')"
                        title="Enviar WhatsApp" style="display:flex;align-items:center;gap:5px;padding:4px 10px;border-radius:99px;background:rgba(37,211,102,0.12);border:1px solid rgba(37,211,102,0.25);color:#25d366;font-size:10px;font-weight:700;letter-spacing:0.05em;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background='rgba(37,211,102,0.22)';this.style.borderColor='rgba(37,211,102,0.5)'" onmouseout="this.style.background='rgba(37,211,102,0.12)';this.style.borderColor='rgba(37,211,102,0.25)'">
                        <i class="fa-brands fa-whatsapp" style="font-size:11px;"></i> WhatsApp
                    </button>
                </div>
            </div>
            <div class="bg-white/3 rounded-xl p-3 border border-white/5">
                <p class="text-[9px] text-gray-500 uppercase tracking-widest mb-1">Medio de pago</p>
                <p class="text-white text-sm">${p.medioPago}</p>
            </div>
            <div class="bg-white/3 rounded-xl p-3 border border-white/5">
                <p class="text-[9px] text-gray-500 uppercase tracking-widest mb-1">Env\u00edo</p>
                <p class="text-sm font-bold ${p.envio === 'Si' ? 'text-[#d4af37]' : 'text-gray-400'}">
                    ${p.envio === 'Si' ? ' Con env\u00edo' : p.envio === 'No' ? ' Retira' : '\u2014'}
                </p>
            </div>
        </div>
        <div class="bg-white/3 rounded-xl p-3 mb-3 border border-white/5">
            <p class="text-[9px] text-gray-500 uppercase tracking-widest mb-3">Piezas del pedido</p>
            ${itemsHTML}
            <div class="pt-3 mt-2 border-t border-white/5 space-y-2">
                ${p.envio === 'Si' ? `
                <div class="flex justify-between">
                    <p class="text-gray-500 text-[10px]">Subtotal productos</p>
                    <p class="text-gray-400 text-[10px]">$${Number(p.subtotalProductos || (p.total - (p.costoEnvio || 2000))).toLocaleString('es-AR')}</p>
                </div>
                <div class="flex justify-between">
                    <p class="text-gray-500 text-[10px]">Env\u00edo</p>
                    <p class="text-[#d4af37] text-[10px] font-bold">+ $${Number(p.costoEnvio || 2000).toLocaleString('es-AR')}</p>
                </div>` : ''}
                <div class="flex justify-between pt-2 border-t border-white/5">
                    <p class="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Total a cobrar</p>
                    <p class="text-[#d4af37] font-bold text-xl">$${Number(p.total).toLocaleString('es-AR')}</p>
                </div>
            </div>
        </div>
        <p class="text-[9px] text-gray-600 text-right italic">Recibido: ${fecha}</p>
    `;

    const btnsEl = document.getElementById('detalle-estados-btns');
    btnsEl.innerHTML = ESTADOS.map(e => `
        <button onclick="cambiarEstadoPedido('${p.id}', '${e.key}', this)" 
            class="estado-badge ${e.cls} cursor-pointer hover:opacity-80 transition-opacity ${p.estado === e.key ? 'ring-2 ring-white/30' : ''}">
            ${e.label}<span class="estado-btn-spinner"></span>
        </button>
    `).join('');

    abrirModalConfirm('modal-pedido-detalle');
};

window.copiarContacto = function(numero, btn) {
    navigator.clipboard.writeText(numero).then(function() {
        var orig = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check" style="font-size:9px;"></i> Copiado!';
        btn.style.color = '#d4af37';
        btn.style.borderColor = 'rgba(212,175,55,0.4)';
        setTimeout(function() {
            btn.innerHTML = orig;
            btn.style.color = '';
            btn.style.borderColor = '';
        }, 2000);
    }).catch(function() {
        var ta = document.createElement('textarea');
        ta.value = numero;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    });
};

window.abrirWhatsApp = function(numero, nombre) {
    var limpio = numero.replace(/[\s\-()]/g, '');
    if (limpio.startsWith('0')) limpio = '54' + limpio.substring(1);
    else if (!limpio.startsWith('54') && limpio.length <= 10) limpio = '54' + limpio;
    var saludo = nombre ? ' ' + nombre : '';
    var mensaje = encodeURIComponent(
        'Hola' + saludo + '! Recibimos tu pedido y quedamos en contacto para coordinar los detalles de la compra. Seguimos por aca!'
    );
    window.open('https://wa.me/' + limpio + '?text=' + mensaje, '_blank');
};

window.cambiarEstadoPedido = async function(id, nuevoEstado, btnEl) {
    if (btnEl) {
        btnEl.classList.add('estado-btn-loading');
        const spinner = btnEl.querySelector('.estado-btn-spinner');
        if (spinner) spinner.style.display = 'inline-block';
    }
    try {
        await updateDoc(doc(db, "orders", id), { estado: nuevoEstado });
        cerrarModalConfirm('modal-pedido-detalle');
        const labels = { pendiente: 'Pendiente', contactado: 'Contactado', completado: 'Completado', cancelado: 'Cancelado' };
        const iconos = { pendiente: '\ud83d\udd50', contactado: '\ud83d\udcde', completado: '\u2705', cancelado: '\u2717' };
        mostrarToast(`${iconos[nuevoEstado] || ''} Pedido marcado como ${labels[nuevoEstado] || nuevoEstado}`,
            nuevoEstado === 'completado' ? 'success' : nuevoEstado === 'cancelado' ? 'error' : 'info');
    } catch(e) {
        mostrarToast('Error al actualizar el estado', 'error');
    } finally {
        if (btnEl) {
            btnEl.classList.remove('estado-btn-loading');
            const spinner = btnEl.querySelector('.estado-btn-spinner');
            if (spinner) spinner.style.display = '';
        }
    }
};

window.confirmarEliminarPedido = function(id) {
    const p = todosLosPedidos.find(x => x.id === id);
    mostrarConfirmAccion({
        titulo: 'Eliminar pedido',
        texto: `\u00bfSeguro que quer\u00e9s eliminar el pedido de ${p?.nombre || 'este cliente'} definitivamente? Esta acci\u00f3n no se puede deshacer.`,
        labelOk: 'Eliminar',
        callback: async () => {
            await deleteDoc(doc(db, "orders", id));
            cerrarConfirmAccion();
            cerrarModalConfirm('modal-pedido-detalle');
            mostrarToast('Pedido eliminado', 'error');
        }
    });
};

// --- FUNCI\u00d3N DE IMPRESI\u00d3N ---
window.imprimirTicket = function(id) {
    const p = todosLosPedidos.find(x => x.id === id);
    if (!p) return;

    const fecha = new Date(p.fecha).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    
    const ticketHTML = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Ticket - ${p.nombre}</title>
        <style>
            body { font-family: 'Courier New', Courier, monospace; width: 80mm; margin: 0 auto; padding: 10px; color: #000; font-size: 12px; }
            .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
            .logo { font-size: 18px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; }
            .info { margin-bottom: 10px; line-height: 1.4; }
            .items-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
            .items-table th { text-align: left; border-bottom: 1px solid #000; font-size: 10px; }
            .items-table td { padding: 5px 0; vertical-align: top; }
            .total-row { border-top: 1px dashed #000; padding-top: 5px; text-align: right; font-size: 14px; font-weight: bold; }
            .footer { text-align: center; margin-top: 20px; font-size: 10px; border-top: 1px solid #000; padding-top: 10px; }
            @media print { .no-print { display: none; } }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="logo">CARLO ESSENTIAL</div>
            <div style="font-size: 9px; margin-top: 4px;">Villa \u00c1ngela, Chaco</div>
            <div style="font-size: 9px;">${fecha} hs</div>
        </div>
        
        <div class="info">
            <strong>CLIENTE:</strong> ${p.nombre}<br>
            <strong>CONTACTO:</strong> ${p.contacto}<br>
            <strong>PAGO:</strong> ${p.medioPago}
        </div>

        <table class="items-table">
            <thead>
                <tr>
                    <th>DESCRIPCI\u00d3N</th>
                    <th style="text-align: right;">CANT</th>
                    <th style="text-align: right;">TOTAL</th>
                </tr>
            </thead>
            <tbody>
                ${p.items.map(i => `
                    <tr>
                        <td style="font-size: 10px;">${i.nombre}</td>
                        <td style="text-align: right;">${i.cantidad}</td>
                        <td style="text-align: right;">$${Number(i.subtotal).toLocaleString('es-AR')}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>

        ${p.envio === 'Si' ? `
        <div style="text-align: right; font-size: 11px; padding-top: 5px; border-top: 1px dashed #000;">
            <div style="margin-bottom: 3px;">SUBTOTAL PRODUCTOS: $${Number(p.subtotalProductos || (p.total - (p.costoEnvio || 2000))).toLocaleString('es-AR')}</div>
            <div style="margin-bottom: 5px;">ENV\u00cdO: $${Number(p.costoEnvio || 2000).toLocaleString('es-AR')}</div>
        </div>
        <div class="total-row">
            TOTAL: $${Number(p.total).toLocaleString('es-AR')}
        </div>
        ` : `
        <div class="total-row">
            TOTAL: $${Number(p.total).toLocaleString('es-AR')}
        </div>
        `}

        <div class="footer">
            \u00a1Gracias por tu compra!<br>
            carloessential.com.ar
        </div>

        <script>
            window.onload = function() {
                window.print();
                setTimeout(() => window.close(), 500);
            }
        <\/script>
    </body>
    </html>
    `;
    const win = window.open('', '_blank', 'width=450,height=600');
    win.document.write(ticketHTML);
    win.document.close();
};

// ============================================
// DESCARGA DE TICKET COMO PNG (para t\u00e9rmica que imprime im\u00e1genes)
// ============================================

window.descargarTicketPNG = async function(id) {
    const p = todosLosPedidos.find(x => x.id === id);
    if (!p) return;

    // Cargar html2canvas si no est\u00e1 disponible
    if (!window.html2canvas) {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    const fecha = new Date(p.fecha).toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const envioHTML = p.envio === 'Si' ? `
        <div style="border-top:1px dashed #ccc;padding-top:6px;margin-top:4px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#555;margin-bottom:2px;">
                <span>SUBTOTAL PRODUCTOS</span>
                <span>$${Number(p.subtotalProductos || (p.total - (p.costoEnvio || 2000))).toLocaleString('es-AR')}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#555;">
                <span>ENV\u00cdO</span>
                <span>$${Number(p.costoEnvio || 2000).toLocaleString('es-AR')}</span>
            </div>
        </div>
    ` : '';

    const itemsHTML = (p.items || []).map(item => `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:5px 0;border-bottom:1px solid #eee;gap:8px;">
            <div style="flex:1;font-size:11px;line-height:1.4;color:#111;">${item.nombre}</div>
            <div style="font-size:11px;color:#555;white-space:nowrap;margin:0 8px;">x${item.cantidad}</div>
            <div style="font-size:11px;font-weight:700;color:#111;white-space:nowrap;">$${Number(item.subtotal).toLocaleString('es-AR')}</div>
        </div>
    `).join('');

    // Crear el nodo del ticket fuera de pantalla
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        position: fixed;
        left: -9999px;
        top: 0;
        width: 320px;
        background: #fff;
        color: #000;
        font-family: 'Courier New', Courier, monospace;
        padding: 20px 18px 24px;
        box-sizing: border-box;
        z-index: -1;
    `;

    wrapper.innerHTML = `
        <div style="text-align:center;border-bottom:1px dashed #999;padding-bottom:12px;margin-bottom:12px;">
            <div style="font-size:17px;font-weight:900;letter-spacing:3px;text-transform:uppercase;">CARLO ESSENTIAL</div>
            <div style="font-size:9px;color:#555;margin-top:3px;">Villa \u00c1ngela, Chaco</div>
            <div style="font-size:9px;color:#555;margin-top:1px;">${fecha} hs</div>
        </div>

        <div style="margin-bottom:12px;font-size:11px;line-height:1.7;">
            <div><span style="font-weight:700;">CLIENTE:</span> ${p.nombre}</div>
            <div><span style="font-weight:700;">CONTACTO:</span> ${p.contacto}</div>
            <div><span style="font-weight:700;">PAGO:</span> ${p.medioPago}</div>
            ${p.envio === 'Si' ? '<div><span style="font-weight:700;">ENV\u00cdO:</span> Con env\u00edo</div>' : '<div><span style="font-weight:700;">RETIRA:</span> En local</div>'}
        </div>

        <div style="border-top:1px solid #000;border-bottom:1px solid #000;padding:4px 0;margin-bottom:8px;display:flex;justify-content:space-between;font-size:10px;font-weight:700;letter-spacing:0.5px;">
            <span style="flex:1;">DESCRIPCI\u00d3N</span>
            <span style="margin:0 8px;">CANT</span>
            <span>TOTAL</span>
        </div>

        ${itemsHTML}

        ${envioHTML}

        <div style="border-top:2px solid #000;margin-top:8px;padding-top:8px;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:12px;font-weight:900;letter-spacing:1px;">TOTAL A COBRAR</span>
            <span style="font-size:18px;font-weight:900;">$${Number(p.total).toLocaleString('es-AR')}</span>
        </div>

        <div style="text-align:center;margin-top:18px;padding-top:10px;border-top:1px dashed #999;font-size:9px;color:#555;line-height:1.6;">
            \u00a1Gracias por tu compra!<br>carloessential.com.ar
        </div>
    `;

    document.body.appendChild(wrapper);

    try {
        const canvas = await html2canvas(wrapper, {
            scale: 3, // 3x = alta resoluci\u00f3n para t\u00e9rmica
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false
        });

        const link = document.createElement('a');
        link.download = `ticket-${p.nombre.replace(/\s+/g, '-')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch(e) {
        mostrarToast('Error al generar la imagen', 'error');
        console.error('[PNG Ticket]', e);
    } finally {
        document.body.removeChild(wrapper);
    }
};

// ============================================
// DESCARGA DE TICKET COMO PDF (para celular / t\u00e9rmica)
// ============================================

window.descargarTicketPDF = async function(id) {
    const p = todosLosPedidos.find(x => x.id === id);
    if (!p) return;

    if (!window.jspdf) {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: [80, 297], orientation: 'portrait' });

    const fecha = new Date(p.fecha).toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const margen = 5;
    let y = 8;

    doc.setFont('courier', 'bold');
    doc.setFontSize(13);
    doc.text('CARLO ESSENTIAL', 40, y, { align: 'center' });
    y += 5;

    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.text('Villa Angela, Chaco', 40, y, { align: 'center' });
    y += 4;
    doc.text(fecha + ' hs', 40, y, { align: 'center' });
    y += 4;

    doc.setLineDashPattern([1, 1], 0);
    doc.line(margen, y, 80 - margen, y);
    y += 5;

    doc.setFontSize(8);
    doc.setFont('courier', 'bold');
    doc.text('CLIENTE:', margen, y);
    doc.setFont('courier', 'normal');
    doc.text(' ' + p.nombre, margen + 15, y);
    y += 4;
    doc.setFont('courier', 'bold');
    doc.text('CONTACTO:', margen, y);
    doc.setFont('courier', 'normal');
    doc.text(' ' + p.contacto, margen + 18, y);
    y += 4;
    doc.setFont('courier', 'bold');
    doc.text('PAGO:', margen, y);
    doc.setFont('courier', 'normal');
    doc.text(' ' + p.medioPago, margen + 10, y);
    y += 5;

    doc.setLineDashPattern([], 0);
    doc.line(margen, y, 80 - margen, y);
    y += 3;
    doc.setFont('courier', 'bold');
    doc.setFontSize(7);
    doc.text('DESCRIPCION', margen, y);
    doc.text('C', 58, y, { align: 'right' });
    doc.text('TOTAL', 75, y, { align: 'right' });
    y += 2;
    doc.line(margen, y, 80 - margen, y);
    y += 4;

    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    (p.items || []).forEach(item => {
        const lineas = doc.splitTextToSize(item.nombre, 45);
        doc.text(lineas, margen, y);
        doc.text(String(item.cantidad), 58, y, { align: 'right' });
        doc.text('$' + Number(item.subtotal).toLocaleString('es-AR'), 75, y, { align: 'right' });
        y += lineas.length * 4 + 1;
    });

    if (p.envio === 'Si') {
        y += 1;
        doc.setLineDashPattern([1, 1], 0);
        doc.line(margen, y, 80 - margen, y);
        y += 4;
        doc.setFontSize(7);
        const subTotal = Number(p.subtotalProductos || (p.total - (p.costoEnvio || 2000)));
        doc.text('SUBTOTAL: $' + subTotal.toLocaleString('es-AR'), 75, y, { align: 'right' });
        y += 4;
        doc.text('ENVIO: $' + Number(p.costoEnvio || 2000).toLocaleString('es-AR'), 75, y, { align: 'right' });
        y += 2;
    }

    doc.setLineDashPattern([1, 1], 0);
    doc.line(margen, y, 80 - margen, y);
    y += 5;
    doc.setFont('courier', 'bold');
    doc.setFontSize(10);
    doc.text('TOTAL: $' + Number(p.total).toLocaleString('es-AR'), 75, y, { align: 'right' });
    y += 7;

    doc.setLineDashPattern([], 0);
    doc.line(margen, y, 80 - margen, y);
    y += 4;
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.text('Gracias por tu compra!', 40, y, { align: 'center' });
    y += 4;
    doc.text('carloessential.com.ar', 40, y, { align: 'center' });

    doc.save('ticket-' + p.nombre.replace(/\s+/g, '-') + '.pdf');
};

// Inicializar navegaci\u00f3n: marcar inventario como activo al cargar
document.addEventListener('DOMContentLoaded', () => {
    mostrarSeccion('inventario');
    const chipTodos = document.getElementById('chip-todos');
    if (chipTodos) chipTodos.classList.add('activo');
});

// ============================================
// ARCHIVO DE PEDIDOS COMPLETADOS
// ============================================

window.abrirArchivoCompletados = function() {
    const completados = todosLosPedidos.filter(p => p.estado === 'completado');
    const body = document.getElementById('archivo-body');
    const stats = document.getElementById('archivo-stats');

    if (stats) {
        const totalArchivado = completados.reduce((acc, p) => acc + (Number(p.total) || 0), 0);
        stats.textContent = `${completados.length} pedidos completados \u00b7 Total $${totalArchivado.toLocaleString('es-AR')}`;
    }

    if (!body) return;

    if (completados.length === 0) {
        body.innerHTML = `
            <div class="py-16 text-center">
                <i class="fa-solid fa-box-open text-3xl text-gray-700 mb-4 block"></i>
                <p class="text-gray-600 font-luxury text-lg">El archivo est\u00e1 vac\u00edo</p>
                <p class="text-gray-700 text-xs mt-2">Los pedidos marcados como "Completado" aparecer\u00e1n aqu\u00ed.</p>
            </div>`;
    } else {
        body.innerHTML = completados.map(p => {
            const fecha = new Date(p.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            const itemsResumen = (p.items || []).map(i => `${i.nombre} x${i.cantidad}`).join(' \u00b7 ');
            return `
            <div style="background:#0f0f0f;border:1px solid rgba(52,211,153,0.12);border-radius:1rem;padding:1rem 1.1rem;display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.3rem;flex-wrap:wrap;">
                        <span style="font-family:'Cormorant Garamond',serif;font-size:1.05rem;color:#fff;font-weight:700;">${p.nombre}</span>
                        <span class="estado-badge estado-completado">Completado</span>
                    </div>
                    <p style="font-size:10px;color:#6b7280;margin-bottom:2px;"><i class="fa-solid fa-phone" style="margin-right:5px;"></i>${p.contacto}</p>
                    <p style="font-size:10px;color:#6b7280;margin-bottom:4px;"><i class="fa-solid fa-credit-card" style="margin-right:5px;"></i>${p.medioPago}</p>
                    <p style="font-size:9px;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px;">${itemsResumen}</p>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                    <p style="color:#34d399;font-weight:700;font-size:1.1rem;">$${Number(p.total).toLocaleString('es-AR')}</p>
                    <p style="font-size:9px;color:#4b5563;margin-top:2px;">${fecha}</p>
                    <div style="display:flex;gap:0.4rem;margin-top:0.5rem;justify-content:flex-end;">
                        <button onclick="imprimirTicket('${p.id}')" style="width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.05);border:none;color