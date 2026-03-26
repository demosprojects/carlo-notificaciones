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
        `${productosFiltrados.length} de ${total} piezas  ·  ${conStock} con stock  ·  ${sinStock} sin stock`;

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
        } else {
            datos.fechaCreacion = Date.now();
            await addDoc(collection(db, "products"), datos);
        }
        cerrarModalAdmin();
        cargarProductos();
        mostrarToast(id ? 'Producto actualizado' : 'Producto creado', 'success');
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
            cerrarModalConfirm("modal-eliminar");
            cargarProductos();
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
// SISTEMA DE TOASTS Y CONFIRMACIÓN ELEGANTE
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
// MÓDULO DE PEDIDOS
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

// null = primera carga aún no procesada
let pedidosConocidos = null;
let _snapshotUnsub = null;

function escucharPedidosEnTiempoReal() {
    // Evitar listeners duplicados si se llama más de una vez
    if (_snapshotUnsub) {
        _snapshotUnsub();
        _snapshotUnsub = null;
    }

    const q = query(collection(db, "orders"), orderBy("fecha", "desc"));

    _snapshotUnsub = onSnapshot(q, (snap) => {
        const pedidosNuevos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (pedidosConocidos === null) {
            // Primera carga: registrar todos los IDs existentes sin notificar
            pedidosConocidos = new Set(pedidosNuevos.map(p => p.id));
        } else {
            // Cargas siguientes: detectar IDs nuevos
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
        // Reconectar automáticamente después de 5 segundos
        _snapshotUnsub = null;
        setTimeout(escucharPedidosEnTiempoReal, 5000);
    });
}

// ─── NOTIFICACIONES ──────────────────────────────────────────────────────────

async function solicitarPermisoNotificaciones() {
    if (!("Notification" in window) || !navigator.serviceWorker) return;
    if (Notification.permission === "denied") return;

    if (Notification.permission !== "granted") {
        const permiso = await Notification.requestPermission();
        if (permiso !== "granted") return;
    }

    console.log("[Admin] Notificaciones activadas ✓");
}

// Notificación vía ntfy.sh (llega SIEMPRE, celular bloqueado o app cerrada)
// + vía Service Worker cuando la app está abierta
async function notificarNuevoPedido(pedido) {
    const nombre    = pedido.nombre || "Cliente";
    const total     = Number(pedido.total || 0).toLocaleString("es-AR");
    const cantItems = (pedido.items || []).length;
    const itemsTxt  = cantItems === 1 ? "1 producto" : `${cantItems} productos`;

    // ─── 0. Toast + sonido en pantalla (app abierta) ─────────────────
    mostrarToast(`🛍 Nuevo pedido de ${nombre} - $${total} - ${itemsTxt}`, 'info', 8000);

    // Sonido de notificación
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

    // ─── 1. ntfy.sh: llega aunque el celu esté bloqueado ─────────────────────
    try {
        await fetch("https://ntfy.sh/Carlo_essential", {
            method: "POST",
            headers: {
                "Title":        "Nuevo pedido en tu tienda",
                "Priority":     "high",
                "Tags":         "shopping,bell",
                "Content-Type": "text/plain"
            },
            body: "Ingresa al admin para visualizarlo"
        });
        console.log("[ntfy] Notificación enviada ✓");
    } catch(e) {
        console.warn("[ntfy] Error al notificar:", e);
    }

}

// ─── FCM: NOTIFICACIONES CON APP CERRADA ─────────────────────────────────────
// Permite recibir notificaciones incluso cuando el celular está bloqueado
// y la app web está completamente cerrada.
// Requiere: reemplazar VAPID_KEY arriba con tu clave real de Firebase Console.

async function activarFCM() {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (!navigator.serviceWorker) return;
    if (!VAPID_KEY) {
        console.warn("[FCM] VAPID_KEY no configurada. Las notificaciones con app cerrada no funcionarán.");
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
            // Guardar el token en Firestore asociado al usuario admin
            const uid = auth.currentUser?.uid;
            if (uid) {
                await updateDoc(doc(db, "admins", uid), { fcmToken: token }).catch(() => {
                    // Si el doc no existe, crearlo
                    import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js")
                        .then(({ setDoc }) => setDoc(doc(db, "admins", uid), { fcmToken: token }, { merge: true }));
                });
            }
        }
    } catch(e) {
        console.warn("[FCM] Error al activar FCM:", e);
    }

    // Manejar notificaciones FCM cuando la app está en primer plano
    onMessage(messaging, (payload) => {
        console.log("[FCM] Mensaje en foreground:", payload);
        // La notificación background la maneja el SW automáticamente.
        // Cuando la app está abierta, podemos mostrar nuestro propio toast.
        const data = payload.data || {};
        if (data.nombre) {
            mostrarToast(`🛍️ Nuevo pedido de ${data.nombre}`, 'info', 6000);
        }
    });
}

// Cuando el usuario hace clic en la notificación y el SW nos avisa
// que hay que abrir el detalle de un pedido
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
    if (statsEl) statsEl.textContent = `${pedidosFiltrados.length} de ${total} pedidos activos  ·  ${pendientes} pendientes`;

    renderPedidos();
};

function renderPedidos() {
    const grid = document.getElementById('pedidos-grid');
    if (!grid) return;

    if (pedidosFiltrados.length === 0) {
        grid.innerHTML = `
            <div class="py-20 text-center">
                <p class="text-gray-600 font-luxury text-xl">No hay pedidos aún.</p>
            </div>`;
        return;
    }

    grid.innerHTML = pedidosFiltrados.map(p => {
        const fecha   = new Date(p.fecha).toLocaleDateString('es-AR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
        const estadoClass = `estado-${p.estado || 'pendiente'}`;
        const estadoLabel = ESTADOS.find(e => e.key === p.estado)?.label || 'Pendiente';
        const itemsResumen = (p.items || []).map(i => `${i.nombre} x${i.cantidad}`).join(' · ');

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
                <p class="text-gray-500 text-[10px]">x${item.cantidad} · $${Number(item.precio).toLocaleString('es-AR')} c/u</p>
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
                <p class="text-[9px] text-gray-500 uppercase tracking-widest mb-1">Envío</p>
                <p class="text-sm font-bold ${p.envio === 'Si' ? 'text-[#d4af37]' : 'text-gray-400'}">
                    ${p.envio === 'Si' ? '🚚 Con envío' : p.envio === 'No' ? '🏪 Retira' : '—'}
                </p>
            </div>
        </div>
        <div class="bg-white/3 rounded-xl p-3 mb-3 border border-white/5">
            <p class="text-[9px] text-gray-500 uppercase tracking-widest mb-3">Piezas del pedido</p>
            ${itemsHTML}
            <div class="flex justify-between pt-4 mt-2 border-t border-white/5">
                <p class="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Total a cobrar</p>
                <p class="text-[#d4af37] font-bold text-xl">$${Number(p.total).toLocaleString('es-AR')}</p>
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
        const iconos = { pendiente: '🕐', contactado: '📞', completado: '✅', cancelado: '✗' };
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
        texto: `¿Seguro que querés eliminar el pedido de ${p?.nombre || 'este cliente'} definitivamente? Esta acción no se puede deshacer.`,
        labelOk: 'Eliminar',
        callback: async () => {
            await deleteDoc(doc(db, "orders", id));
            cerrarConfirmAccion();
            cerrarModalConfirm('modal-pedido-detalle');
            mostrarToast('Pedido eliminado', 'error');
        }
    });
};

// --- FUNCIÓN DE IMPRESIÓN ---
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
            <div style="font-size: 9px; margin-top: 4px;">Villa Ángela, Chaco</div>
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
                    <th>DESCRIPCIÓN</th>
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

        <div class="total-row">
            TOTAL: $${Number(p.total).toLocaleString('es-AR')}
        </div>

        <div class="footer">
            ¡Gracias por tu compra!<br>
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

// Inicializar navegación: marcar inventario como activo al cargar
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
        stats.textContent = `${completados.length} pedidos completados · Total $${totalArchivado.toLocaleString('es-AR')}`;
    }

    if (!body) return;

    if (completados.length === 0) {
        body.innerHTML = `
            <div class="py-16 text-center">
                <i class="fa-solid fa-box-open text-3xl text-gray-700 mb-4 block"></i>
                <p class="text-gray-600 font-luxury text-lg">El archivo está vacío</p>
                <p class="text-gray-700 text-xs mt-2">Los pedidos marcados como "Completado" aparecerán aquí.</p>
            </div>`;
    } else {
        body.innerHTML = completados.map(p => {
            const fecha = new Date(p.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            const itemsResumen = (p.items || []).map(i => `${i.nombre} x${i.cantidad}`).join(' · ');
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
                        <button onclick="imprimirTicket('${p.id}')" style="width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.05);border:none;color:#9ca3af;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'" title="Imprimir ticket">
                            <i class="fa-solid fa-print" style="font-size:10px;"></i>
                        </button>
                        <button onclick="eliminarDelArchivo('${p.id}', this)" style="width:30px;height:30px;border-radius:50%;background:rgba(248,113,113,0.1);border:none;color:#f87171;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s;" onmouseover="this.style.background='rgba(248,113,113,0.2)'" onmouseout="this.style.background='rgba(248,113,113,0.1)'" title="Eliminar permanentemente">
                            <i class="fa-solid fa-trash-can" style="font-size:10px;"></i>
                        </button>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    abrirModalConfirm('modal-archivo');
};

window.eliminarDelArchivo = function(id, btnEl) {
    const p = todosLosPedidos.find(x => x.id === id);
    mostrarConfirmAccion({
        titulo: 'Eliminar del archivo',
        texto: `¿Eliminar el pedido de ${p?.nombre || 'este cliente'} permanentemente del archivo?`,
        labelOk: 'Eliminar',
        callback: async () => {
            await deleteDoc(doc(db, 'orders', id));
            cerrarConfirmAccion();
            mostrarToast('Pedido eliminado del archivo', 'error');
            const card = btnEl?.closest('div[style*="background:#0f0f0f"]');
            if (card) {
                card.style.transition = 'opacity 0.3s, transform 0.3s';
                card.style.opacity = '0';
                card.style.transform = 'scale(0.97)';
                setTimeout(() => {
                    card.remove();
                    const body = document.getElementById('archivo-body');
                    const stats = document.getElementById('archivo-stats');
                    const completados = todosLosPedidos.filter(p => p.estado === 'completado');
                    if (stats) {
                        const total = completados.reduce((a, p) => a + (Number(p.total) || 0), 0);
                        stats.textContent = `${completados.length} pedidos completados · Total $${total.toLocaleString('es-AR')}`;
                    }
                    if (body && body.children.length === 0) {
                        body.innerHTML = `<div style="padding:4rem 0;text-align:center;"><i class="fa-solid fa-box-open" style="font-size:2rem;color:#374151;display:block;margin-bottom:1rem;"></i><p style="font-family:'Cormorant Garamond',serif;font-size:1.1rem;color:#4b5563;">El archivo está vacío</p></div>`;
                    }
                }, 300);
            }
        }
    });
};
// ============================================
// WAKE LOCK + RECONEXIÓN EN BACKGROUND
// Mantiene la app activa con pantalla bloqueada
// y reconecta Firebase si se cortó la conexión.
// ============================================

let _wakeLock = null;

// Pedir Wake Lock para evitar que Android suspenda la pestaña
async function activarWakeLock() {
    if (!('wakeLock' in navigator)) {
        console.warn('[WakeLock] No soportado en este navegador/dispositivo.');
        return;
    }
    try {
        _wakeLock = await navigator.wakeLock.request('screen');
        console.log('[WakeLock] Activo ✓');
        _wakeLock.addEventListener('release', () => {
            console.log('[WakeLock] Liberado (pantalla apagada o sistema lo canceló)');
        });
    } catch (e) {
        console.warn('[WakeLock] No se pudo activar:', e.message);
    }
}

// Reactivar Wake Lock cuando la pantalla vuelve a estar visible
// (el sistema lo libera al bloquear, hay que pedirlo de nuevo al desbloquear)
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
        console.log('[Visibility] App visible de nuevo — reconectando...');

        // Reactivar Wake Lock
        await activarWakeLock();

        // Reconectar el listener de Firestore por si se cayó
        escucharPedidosEnTiempoReal();
    }
});

// Reconexión extra por si la red se corta y vuelve
window.addEventListener('online', () => {
    console.log('[Network] Conexión restaurada — reconectando Firestore...');
    escucharPedidosEnTiempoReal();
});

// Arrancar Wake Lock al cargar la app
activarWakeLock();
