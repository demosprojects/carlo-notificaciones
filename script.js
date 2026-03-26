import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Configuración de Carlo Xavi
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

let productos = [];
let productosFiltrados = [];
let carrito = JSON.parse(localStorage.getItem("carlo-web")) || [];
let categoriaActual = "Todos";
let lightboxImagenes = [];
let lightboxIndex    = 0;
let varianteSeleccionada = null;

// --- NOTIFICACIONES LUXURY ---
function showToast(msj) {
    const t = document.getElementById("toast");
    t.innerHTML = `<i class="fa-solid fa-crown text-[#d4af37] mr-2"></i> ${msj}`;
    t.classList.remove("translate-y-32");
    setTimeout(() => t.classList.add("translate-y-32"), 3000);
}

// --- CARGA CON SKELETONS DARK ---
function renderSkeletons() {
    const contenedor = document.getElementById("productos-grid");
    const skeletonHTML = `
        <div class="bg-[#121212] rounded-3xl overflow-hidden border border-white/5">
            <div class="skeleton aspect-[4/5] w-full"></div>
            <div class="p-6 space-y-4">
                <div class="skeleton h-3 w-1/3 rounded"></div>
                <div class="skeleton h-6 w-3/4 rounded"></div>
                <div class="skeleton h-12 w-full rounded-full"></div>
            </div>
        </div>
    `;
    contenedor.innerHTML = skeletonHTML.repeat(4);
}

async function cargarProductos() {
    renderSkeletons();
    try {
        const querySnapshot = await getDocs(collection(db, "products"));
        productos = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Sincronizar carrito contra stock real de Firebase
        let huboSinStockNuevo = false;
        let huboCambioPrecio  = false;
        let huboEliminado     = false;
        carrito = carrito.map(item => {
            const fresh = productos.find(p => p.id === item.id);
            if (!fresh) {
                // Producto eliminado de la base de datos
                if (!item._eliminado) huboEliminado = true;
                return { ...item, _eliminado: true };
            }

            // Detectar si es variante y buscar su stock actualizado
            const esVariante = item._key && item._key.includes('__');
            let ahoraDisponible = fresh.disponible !== false;

            if (esVariante) {
                // Extraer nombre de variante del key (formato: "prodId__nombreVariante")
                const nombreVariante = item._key.slice(item._key.indexOf('__') + 2);
                const varianteFresh  = (fresh.variantes || []).find(v => v.nombre === nombreVariante);
                if (varianteFresh) {
                    // Stock de la variante específica manda
                    ahoraDisponible = varianteFresh.disponible !== false;
                } else {
                    // Variante ya no existe en el producto → marcar como eliminada
                    if (!item._eliminado) huboEliminado = true;
                    return { ...item, _eliminado: true };
                }
            }

            const eraDisponible = item.disponible !== false;
            if (eraDisponible && !ahoraDisponible) huboSinStockNuevo = true;

            // Calcular precio actualizado (con oferta si aplica)
            const enOferta   = fresh.enOferta === true && fresh.precioOferta > 0 && fresh.precioOferta < fresh.precio;
            let precioActual = item.precio;
            if (!esVariante) {
                precioActual = enOferta ? fresh.precioOferta : fresh.precio;
                if (precioActual !== item.precio) huboCambioPrecio = true;
            }

            return {
                ...item,
                _eliminado:   false,
                disponible:   ahoraDisponible,
                precio:       precioActual,
                enOferta:     fresh.enOferta,
                precioOferta: fresh.precioOferta
            };
        });
        guardarCarrito();

        if (huboEliminado)    showToast("Un producto de tu carrito ya no está disponible");
        if (huboSinStockNuevo) showToast("Hay productos en tu carrito que ya no tienen stock");
        if (huboCambioPrecio)  showToast("El precio de un producto en tu carrito fue actualizado");

        aplicarFiltros();
        actualizarContador();
    } catch (e) {
        console.error("Error Carlo Xavi DB:", e);
        showToast("Error al conectar con la colección");
    }
}

// --- RENDERIZADO DE PIEZAS ---
function renderProductos() {
    const contenedor = document.getElementById("productos-grid");

    if (productosFiltrados.length === 0) {
        contenedor.innerHTML = `
            <div class="col-span-full py-20 text-center">
                <p class="text-gray-500 font-luxury font-semibold tracking-wide text-xl">No se han encontrado piezas en esta colección.</p>
            </div>`;
        return;
    }

    contenedor.innerHTML = productosFiltrados.map(p => {
        const disponible = p.disponible !== false;
        const enOferta   = p.enOferta === true && p.precioOferta > 0 && p.precioOferta < p.precio;
        const pct        = enOferta ? Math.round((1 - p.precioOferta / p.precio) * 100) : 0;

        const precioDB = disponible
            ? (enOferta
                ? `<div class="flex items-center justify-center gap-2 flex-wrap">
                       <span class="text-gray-500 line-through text-xs font-light">$ ${Number(p.precio).toLocaleString('es-AR')}</span>
                       <span class="text-white/90 font-bold tracking-widest text-sm">$ ${Number(p.precioOferta).toLocaleString('es-AR')}</span>
                       <span class="bg-[#d4af37] text-black text-[8px] font-black px-2 py-0.5 rounded-full">-${pct}%</span>
                   </div>`
                : `<p class="text-white/80 font-light tracking-widest text-sm">$ ${Number(p.precio).toLocaleString('es-AR')}</p>`)
            : `<p class="text-gray-600 font-light tracking-widest text-xs uppercase">Sin disponibilidad</p>`;

        return `
            <div class="product-card group relative rounded-3xl overflow-hidden" onclick="verDetalles('${p.id}')">
                <div class="aspect-[4/5] overflow-hidden relative">
                    <img src="${p.imagenes[0]}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 ${!disponible ? 'grayscale opacity-40' : ''}" loading="lazy">
                    <div class="absolute top-4 left-4 flex flex-col gap-2">
                        ${p.esNuevo ? `<span class="bg-white text-black text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-xl">✦ Nuevo</span>` : ''}
                        ${enOferta ? `<span class="bg-[#d4af37] text-black text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-xl">-${pct}% OFF</span>` : ''}
                        ${!disponible ? '<span class="bg-white/10 backdrop-blur-md text-white text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Sold Out</span>' : ''}
                    </div>
                </div>
                <div class="p-4 text-center">
                    <p class="text-[9px] text-[#d4af37] font-bold uppercase tracking-[0.3em] mb-1">${p.categoria || 'Colección'}</p>
                    <h3 class="font-luxury font-semibold text-base text-white mb-2 group-hover:text-[#d4af37] transition-colors leading-tight">${p.nombre}</h3>
                    ${precioDB}
                    <button class="mt-4 w-full py-2.5 rounded-full border border-white/10 text-white text-[9px] font-black uppercase tracking-[0.2em] group-hover:bg-[#d4af37] group-hover:text-black group-hover:border-[#d4af37] transition-all duration-500">
                        Ver producto
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

// --- LÓGICA DE FILTROS ---
window.filtrarCategoria = function(cat) {
    categoriaActual = cat;
    document.querySelectorAll('.cat-btn').forEach(btn => {
        const label = btn.innerText.trim().replace('🏷 ', '');
        btn.classList.remove('active', 'border-[#d4af37]', 'text-[#d4af37]', 'bg-[#d4af37]', 'text-black');
        if (label === cat || btn.innerText.trim() === cat) {
            btn.classList.add('active', 'border-[#d4af37]', 'text-[#d4af37]');
            if (cat === 'Ofertas') {
                btn.classList.add('bg-[#d4af37]', 'text-black');
                btn.classList.remove('text-[#d4af37]');
            }
        }
    });
    aplicarFiltros();
    // Scroll hacia la sección de productos (con offset por el nav sticky)
    const seccion = document.getElementById('productos');
    if (seccion) {
        const navHeight = document.querySelector('nav')?.offsetHeight || 0;
        const top = seccion.getBoundingClientRect().top + window.scrollY - navHeight - 16;
        window.scrollTo({ top, behavior: 'smooth' });
    }
};

function aplicarFiltros() {
    const texto = document.getElementById('buscador-principal').value.toLowerCase().trim();
    productosFiltrados = productos.filter(p => {
        const matchText = p.nombre.toLowerCase().includes(texto) || (p.categoria && p.categoria.toLowerCase().includes(texto));
        const matchCat  = (categoriaActual === "Todos")
            || (categoriaActual === "Ofertas" ? p.enOferta === true : p.categoria === categoriaActual);
        return matchText && matchCat;
    });

    // Ordenar:
    //  1) Badge "Nuevo" con stock → primero, por fechaCreacion desc
    //  2) Con stock sin badge     → por fechaCreacion desc (editar no mueve al tope)
    //  3) Sin stock               → al final, por fechaCreacion desc
    productosFiltrados.sort((a, b) => {
        const grupo = p => {
            if (p.disponible === false) return 2;
            if (p.esNuevo === true)     return 0;
            return 1;
        };
        const ga = grupo(a), gb = grupo(b);
        if (ga !== gb) return ga - gb;
        // Dentro del mismo grupo: fecha de creación (no de edición)
        const fa = a.fechaCreacion || a.fecha || 0;
        const fb = b.fechaCreacion || b.fecha || 0;
        return fb - fa;
    });

    renderProductos();
}

document.getElementById('buscador-principal').addEventListener('input', aplicarFiltros);

function renderPrecioVariantes(p, modo) {
    const isMobile = modo === 'mobile';
    const textoPrecioBase = isMobile ? 'text-2xl' : 'text-3xl';
    const btnPy           = isMobile ? 'py-3.5 text-xs' : 'py-5 text-sm';
    const enOferta        = p.enOferta === true && p.precioOferta > 0 && p.precioOferta < p.precio;

    // Sin stock
    if (p.disponible === false) {
        return `
            <p class="text-gray-500 font-light tracking-widest text-xs uppercase ${isMobile ? 'mt-1' : 'mb-10'}">Producto sin stock</p>
            <button onclick="pedirSinStock('${p.id}')" class="w-full bg-[#25D366]/15 border border-[#25D366]/40 text-[#25D366] ${btnPy} rounded-full font-black uppercase tracking-widest hover:bg-[#25D366] hover:text-black transition-all shadow-xl flex items-center justify-center gap-2">
                <i class="fa-brands fa-whatsapp ${isMobile ? 'text-sm' : ''}"></i> Consultar disponibilidad
            </button>`;
    }

    // Helper: bloque precio con o sin oferta
    function precioHTML(precioOriginal, claseTexto) {
        if (!enOferta) return `<p class="text-white/80 font-light tracking-widest ${claseTexto}">$ ${Number(precioOriginal).toLocaleString('es-AR')}</p>`;
        const pct = Math.round((1 - p.precioOferta / precioOriginal) * 100);
        return `
            <div class="flex items-center gap-3 flex-wrap">
                <span class="text-gray-500 line-through font-light text-lg">$ ${Number(precioOriginal).toLocaleString('es-AR')}</span>
                <span class="text-white/90 font-bold tracking-widest ${claseTexto}">$ ${Number(p.precioOferta).toLocaleString('es-AR')}</span>
                <span class="bg-[#d4af37] text-black text-[9px] font-black px-2.5 py-1 rounded-full">-${pct}%</span>
            </div>`;
    }

    // Con variantes (las variantes no se mezclan con precio oferta global)
    if (p.variantes && p.variantes.length > 0) {
        const primeraVariante = p.variantes[0];
        const primeraDisponible = primeraVariante.disponible !== false;

        // Helper: renderiza el bloque de precio para una variante (tachado + oferta o normal)
        function precioVarianteHTML(v, claseTexto) {
            const vEnOferta = v.enOferta === true && v.precioOferta > 0 && v.precioOferta < v.precio;
            if (!vEnOferta) {
                return `<span class="${claseTexto}">$ ${Number(v.precio).toLocaleString('es-AR')}</span>`;
            }
            const pct = Math.round((1 - v.precioOferta / v.precio) * 100);
            return `
                <span class="text-gray-500 line-through font-light" style="font-size:0.85em;">$ ${Number(v.precio).toLocaleString('es-AR')}</span>
                <span class="${claseTexto}">$ ${Number(v.precioOferta).toLocaleString('es-AR')}</span>
                <span class="bg-[#d4af37] text-black text-[8px] font-black px-2 py-0.5 rounded-full">-${pct}%</span>`;
        }

        const opcionesHTML = p.variantes.map((v, i) => {
            const vDisponible = v.disponible !== false;
            const vEnOferta   = v.enOferta === true && v.precioOferta > 0 && v.precioOferta < v.precio;
            const precioLabel = vDisponible
                ? (vEnOferta
                    ? `<span class="line-through text-[9px] opacity-50">$${Number(v.precio).toLocaleString('es-AR')}</span> <span class="text-[#d4af37]">$${Number(v.precioOferta).toLocaleString('es-AR')}</span>`
                    : `$ ${Number(v.precio).toLocaleString('es-AR')}`)
                : `<span class="text-red-400/70">Sin stock</span>`;
            const imagenEsc = (v.imagen || '').replace(/'/g, "\\'");

            return `
            <button type="button"
                onclick="seleccionarVariante('${p.id}', '${v.nombre}', ${v.precio}, ${vDisponible}, this, ${vEnOferta ? v.precioOferta : 0}, '${imagenEsc}')"
                class="variante-btn flex-1 px-3 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all
                    ${i === 0
                        ? (vDisponible ? 'border-[#d4af37] bg-[#d4af37]/10 text-[#d4af37]' : 'border-red-500/50 bg-red-500/10 text-red-400')
                        : (vDisponible ? 'border-white/10 text-gray-400 hover:border-white/30' : 'border-red-500/20 text-red-500/50 hover:border-red-500/40')
                    }"
                data-nombre="${v.nombre}" data-precio="${v.precio}" data-disponible="${vDisponible}" data-precio-oferta="${vEnOferta ? v.precioOferta : 0}" data-imagen="${imagenEsc}">
                ${v.imagen ? `<img src="${v.imagen}" class="w-8 h-8 object-cover rounded-lg mx-auto mb-1 border border-white/10" loading="lazy">` : ''}
                ${v.nombre}<br>
                <span class="font-light normal-case tracking-normal text-[10px] flex items-center gap-1 justify-center flex-wrap">${precioLabel}</span>
            </button>`;
        }).join('');

        // Display inicial (primera variante)
        const v0EnOferta = primeraVariante.enOferta === true && primeraVariante.precioOferta > 0 && primeraVariante.precioOferta < primeraVariante.precio;
        const displayInicial = primeraDisponible
            ? `<span class="flex items-center gap-3 flex-wrap">${precioVarianteHTML(primeraVariante, textoPrecioBase)}</span>`
            : `<span class="text-red-400 text-sm uppercase tracking-widest font-light">Sin stock</span>`;

        return `
            <div class="${isMobile ? '' : 'mb-4'}">
                <p id="precio-display-${p.id}" class="text-white/80 font-light tracking-widest ${isMobile ? '' : 'mb-2'}" style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                    ${displayInicial}
                </p>
            </div>
            <div class="flex flex-wrap gap-2 ${isMobile ? 'mb-0' : 'mb-6'}">
                ${opcionesHTML}
            </div>
            <input type="hidden" id="variante-sel-nombre-${p.id}" value="${primeraVariante.nombre}">
            <input type="hidden" id="variante-sel-precio-${p.id}" value="${v0EnOferta ? primeraVariante.precioOferta : primeraVariante.precio}">
            <input type="hidden" id="variante-sel-disponible-${p.id}" value="${primeraDisponible}">
            <input type="hidden" id="variante-sel-imagen-${p.id}" value="${primeraVariante.imagen || ''}">
            <button id="btn-add-${p.id}" onclick="agregarCarritoConVariante('${p.id}')"
                class="w-full ${primeraDisponible ? 'bg-[#d4af37] text-black hover:bg-white' : 'bg-white/5 text-gray-500 cursor-not-allowed'} ${btnPy} rounded-full font-black uppercase tracking-widest transition-all shadow-xl ${isMobile ? '' : 'mt-2'}"
                ${primeraDisponible ? '' : 'disabled'}>
                ${primeraDisponible ? 'Añadir al Carrito' : 'Sin stock'}
            </button>`;
    }

    // Sin variantes
    return `
        <div class="${isMobile ? '' : 'mb-10'}">
            ${precioHTML(p.precio, textoPrecioBase)}
        </div>
        <button onclick="agregarCarrito('${p.id}')"
            class="w-full bg-[#d4af37] text-black ${btnPy} rounded-full font-black uppercase tracking-widest hover:bg-white transition-all shadow-xl">
            Añadir al Carrito
        </button>`;
}

window.seleccionarVariante = function(prodId, nombre, precio, disponible, btnEl, precioOferta = 0, imagenVariante = '') {
    const enOferta = precioOferta > 0 && precioOferta < precio;
    const precioFinal = enOferta ? precioOferta : precio;

    // Actualizar display de precio
    const display = document.getElementById(`precio-display-${prodId}`);
    if (display) {
        if (!disponible) {
            display.innerHTML = `<span class="text-red-400 text-sm uppercase tracking-widest font-light">Sin stock</span>`;
        } else if (enOferta) {
            const pct = Math.round((1 - precioOferta / precio) * 100);
            display.innerHTML = `
                <span class="text-gray-500 line-through font-light text-lg">$ ${Number(precio).toLocaleString('es-AR')}</span>
                <span class="text-white/90 font-bold tracking-widest text-3xl">$ ${Number(precioOferta).toLocaleString('es-AR')}</span>
                <span class="bg-[#d4af37] text-black text-[9px] font-black px-2.5 py-1 rounded-full">-${pct}%</span>`;
        } else {
            display.innerHTML = `<span class="text-white/80 font-light tracking-widest text-3xl">$ ${Number(precio).toLocaleString('es-AR')}</span>`;
        }
    }

    // Guardar selección — precio final para el carrito
    document.getElementById(`variante-sel-nombre-${prodId}`).value = nombre;
    document.getElementById(`variante-sel-precio-${prodId}`).value = precioFinal;
    const dispInput = document.getElementById(`variante-sel-disponible-${prodId}`);
    if (dispInput) dispInput.value = disponible ? 'true' : 'false';

    // Guardar imagen de variante seleccionada
    const imgInput = document.getElementById(`variante-sel-imagen-${prodId}`);
    if (imgInput) imgInput.value = imagenVariante || '';

    // Cambiar imagen principal si la variante tiene foto propia
    if (imagenVariante) {
        const mainImg = document.getElementById('main-img');
        if (mainImg) {
            mainImg.style.opacity = '0';
            setTimeout(() => { mainImg.src = imagenVariante; mainImg.style.opacity = '1'; mainImg.style.transition = 'opacity 0.25s ease'; }, 180);
        }
    }

    // Actualizar botón de carrito
    const btnAdd = document.getElementById(`btn-add-${prodId}`);
    if (btnAdd) {
        if (disponible) {
            btnAdd.disabled = false;
            btnAdd.textContent = 'Añadir al Carrito';
            btnAdd.classList.remove('bg-white/5', 'text-gray-500', 'cursor-not-allowed');
            btnAdd.classList.add('bg-[#d4af37]', 'text-black', 'hover:bg-white');
        } else {
            btnAdd.disabled = true;
            btnAdd.textContent = 'Sin stock';
            btnAdd.classList.remove('bg-[#d4af37]', 'text-black', 'hover:bg-white');
            btnAdd.classList.add('bg-white/5', 'text-gray-500', 'cursor-not-allowed');
        }
    }

    // Resaltar botón activo
    btnEl.closest('.flex').querySelectorAll('.variante-btn').forEach(b => {
        const bDisp = b.dataset.disponible !== 'false';
        b.classList.remove('border-[#d4af37]', 'bg-[#d4af37]/10', 'text-[#d4af37]',
                           'border-red-500/50', 'bg-red-500/10', 'text-red-400',
                           'border-white/10', 'text-gray-400',
                           'border-red-500/20', 'text-red-500/50');
        if (bDisp) {
            b.classList.add('border-white/10', 'text-gray-400');
        } else {
            b.classList.add('border-red-500/20', 'text-red-500/50');
        }
    });
    if (disponible) {
        btnEl.classList.remove('border-white/10', 'text-gray-400', 'border-red-500/20', 'text-red-500/50');
        btnEl.classList.add('border-[#d4af37]', 'bg-[#d4af37]/10', 'text-[#d4af37]');
    } else {
        btnEl.classList.remove('border-white/10', 'text-gray-400', 'border-red-500/20', 'text-red-500/50');
        btnEl.classList.add('border-red-500/50', 'bg-red-500/10', 'text-red-400');
    }
};

window.agregarCarritoConVariante = function(prodId) {
    const nombre    = document.getElementById(`variante-sel-nombre-${prodId}`)?.value;
    const precio    = document.getElementById(`variante-sel-precio-${prodId}`)?.value;
    const dispInput = document.getElementById(`variante-sel-disponible-${prodId}`);
    const imgInput  = document.getElementById(`variante-sel-imagen-${prodId}`);
    const disponible = dispInput ? dispInput.value !== 'false' : true;
    const imagenVariante = imgInput ? imgInput.value : '';
    if (!disponible) {
        showToast("Esta variante no tiene stock");
        return;
    }
    agregarCarrito(prodId, nombre, precio ? Number(precio) : null, imagenVariante);
};

// --- MODAL DE DETALLES ---
window.verDetalles = function(id) {
    const p = productos.find(x => x.id === id);
    if (!p) return;

    lightboxImagenes = p.imagenes;
    lightboxIndex    = 0;

    const isMobile = window.innerWidth < 768;
    const thumbnails = p.imagenes.length > 1 ? `
        <div class="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            ${p.imagenes.map(img => `
                <button onclick="cambiarImagenDetalle('${img}')" class="w-9 h-9 md:w-12 md:h-12 rounded-full border-2 border-white/10 overflow-hidden transition-all hover:border-[#d4af37]">
                    <img src="${img}" class="w-full h-full object-cover">
                </button>
            `).join('')}
        </div>` : '';

    const enOferta   = p.enOferta === true && p.precioOferta > 0 && p.precioOferta < p.precio;
    const pct        = enOferta ? Math.round((1 - p.precioOferta / p.precio) * 100) : 0;

    const badges = `
        <div class="absolute top-4 left-4 flex flex-col gap-2">
            ${p.esNuevo ? `<span class="bg-white text-black text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-xl">✦ Nuevo</span>` : ''}
            ${enOferta ? `<span class="bg-[#d4af37] text-black text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-xl">-${pct}% OFF</span>` : ''}
            ${p.disponible === false ? '<span class="bg-white/10 backdrop-blur-md text-white text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Sold Out</span>' : ''}
        </div>`;

    if (isMobile) {
        // ── MÓVIL: bottom sheet ──
        document.getElementById("detalle-contenido").innerHTML = `
            <div class="relative w-full bg-[#050505] flex-shrink-0">
                <img id="main-img" src="${p.imagenes[0]}" class="w-full object-cover cursor-zoom-in" style="height: 42vh; max-height: 320px;" onclick="abrirLightbox(0)">
                ${badges}
                ${thumbnails}
                <button onclick="abrirLightbox(0)" class="absolute bottom-4 right-4 w-8 h-8 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-full border border-white/20 text-white/70 hover:text-white hover:bg-black/70 transition-all z-10">
                    <i class="fa-solid fa-expand text-xs"></i>
                </button>
            </div>
            <div class="flex flex-col bg-[#0a0a0a] overflow-y-auto flex-1">
                <div class="sticky top-0 z-10 bg-[#0a0a0a] flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/5">
                    <span class="text-[#d4af37] text-[9px] font-black uppercase tracking-[0.4em]">${p.categoria}</span>
                    <button onclick="cerrarModal('modal-detalles')" class="w-8 h-8 flex items-center justify-center border border-white/15 rounded-full text-white/60 hover:text-white transition-all">
                        <i class="fa-solid fa-xmark text-sm"></i>
                    </button>
                </div>
                <div class="px-5 py-5 flex flex-col gap-4">
                    <h2 class="font-luxury font-semibold text-white text-2xl leading-tight">${p.nombre}</h2>
                    <p class="text-white/55 font-light leading-relaxed text-sm">${p.descripcion || 'Pieza de alta calidad.'}</p>
                    ${renderPrecioVariantes(p, 'mobile')}
                    ${p.caracteristicas ? `
                    <div class="pt-4 border-t border-white/5">
                        <h4 class="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-3">Especificaciones</h4>
                        <pre class="text-xs text-gray-500 font-sans whitespace-pre-line leading-loose">${p.caracteristicas}</pre>
                    </div>` : ''}
                </div>
            </div>
        `;
    } else {
        // ── DESKTOP: lado a lado clásico ──
        document.getElementById("detalle-contenido").innerHTML = `
            <div class="w-1/2 bg-[#050505] relative" style="min-height: 480px;">
                <img id="main-img" src="${p.imagenes[0]}" class="w-full h-full object-cover absolute inset-0 cursor-zoom-in" onclick="abrirLightbox(0)">
                ${badges}
                ${thumbnails}
                <button onclick="cerrarModal('modal-detalles')"
                        class="absolute top-5 right-5 z-50 w-9 h-9 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-full text-white/60 hover:text-white hover:bg-black/70 transition-all">
                    <i class="fa-solid fa-xmark"></i>
                </button>
                <button onclick="abrirLightbox(0)" class="absolute bottom-5 right-5 z-50 w-9 h-9 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-full border border-white/20 text-white/70 hover:text-white hover:bg-black/70 transition-all">
                    <i class="fa-solid fa-expand text-xs"></i>
                </button>
            </div>
            <div class="w-1/2 p-16 flex flex-col justify-center bg-[#0a0a0a] overflow-y-auto" style="max-height: 90vh;">
                <span class="text-[#d4af37] text-xs font-bold uppercase tracking-[0.4em] mb-4">${p.categoria}</span>
                <h2 class="text-5xl font-luxury font-semibold text-white mb-6 leading-tight">${p.nombre}</h2>
                <p class="text-white/60 font-light leading-relaxed mb-8 text-base">${p.descripcion || 'Pieza de alta calidad.'}</p>
                ${renderPrecioVariantes(p, 'desktop')}
                ${p.caracteristicas ? `
                <div class="mt-8 pt-8 border-t border-white/5">
                    <h4 class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Especificaciones</h4>
                    <pre class="text-xs text-gray-500 font-sans whitespace-pre-line leading-loose">${p.caracteristicas}</pre>
                </div>` : ''}
            </div>
        `;
    }

    document.getElementById("modal-detalles").classList.remove("hidden");
    bloquearScroll();
};

window.cambiarImagenDetalle = (src) => {
    const idx = lightboxImagenes.indexOf(src);
    if (idx >= 0) lightboxIndex = idx;
    const main = document.getElementById('main-img');
    main.style.opacity = 0;
    setTimeout(() => { main.src = src; main.style.opacity = 1; }, 200);
};

// --- CARRITO (CARLO-WEB) ---
window.agregarCarrito = function(id, varianteNombre, variantePrecio, imagenVariante) {
    const prod = productos.find(p => p.id === id);
    if (!prod || prod.disponible === false) return showToast("Pieza no disponible");

    const enOferta    = prod.enOferta === true && prod.precioOferta > 0 && prod.precioOferta < prod.precio;
    const precioBase  = variantePrecio ? Number(variantePrecio) : prod.precio;
    const precioFinal = (!variantePrecio && enOferta) ? prod.precioOferta : precioBase;
    const nombreFinal   = varianteNombre  ? `${prod.nombre} — ${varianteNombre}` : prod.nombre;
    const carritoKey    = varianteNombre  ? `${id}__${varianteNombre}` : id;

    // Imagen a mostrar en carrito: si variante tiene foto propia úsala, si no la primera del producto
    const imagenes = (imagenVariante && imagenVariante !== '')
        ? [imagenVariante, ...prod.imagenes]
        : prod.imagenes;

    const existe = carrito.find(p => p._key === carritoKey);
    if (existe) {
        existe.cantidad++;
    } else {
        carrito.push({ ...prod, imagenes, nombre: nombreFinal, precio: precioFinal, _key: carritoKey, cantidad: 1 });
    }

    guardarCarrito();
    actualizarContador();
    showToast(`${nombreFinal} agregado al carrito`);
};

function guardarCarrito() {
    localStorage.setItem("carlo-web", JSON.stringify(carrito));
}

window.vaciarCarrito = function() {
    document.getElementById("modal-vaciar").classList.remove("hidden");
};

window.confirmarVaciar = function() {
    document.getElementById("modal-vaciar").classList.add("hidden");
    carrito = [];
    guardarCarrito();
    actualizarContador();
    abrirCarrito();
    showToast("Carrito vaciado");
};

window.cancelarVaciar = function() {
    document.getElementById("modal-vaciar").classList.add("hidden");
};

window.abrirCarrito = function() {
    const lista = document.getElementById("carrito-lista");
    let total = 0;

    document.getElementById("modal-carrito").classList.remove("hidden");
    bloquearScroll();

    const btnVaciar = document.getElementById("btn-vaciar");
    if (btnVaciar) btnVaciar.classList.toggle("hidden", carrito.length === 0);

    if (!carrito.length) {
        lista.innerHTML = `
            <div class="py-20 text-center flex flex-col items-center gap-4">
                <i class="fa-solid fa-bag-shopping text-4xl text-white/10"></i>
                <p class="text-white/50 font-luxury font-semibold tracking-wide text-xl">El carrito está vacío</p>
                <p class="text-gray-600 text-xs uppercase tracking-widest">Agrega productos para comenzar</p>
            </div>`;
    } else {
        const sinStock    = carrito.filter(p => p.disponible === false && !p._eliminado);
        const eliminados  = carrito.filter(p => p._eliminado);
        const hayBloqueantes = sinStock.length > 0 || eliminados.length > 0;

        let avisoSinStock = '';
        if (eliminados.length > 0) {
            const nombres = eliminados.map(p => `<strong>${p.nombre}</strong>`).join(', ');
            avisoSinStock += `
                <div class="flex items-start gap-3 bg-orange-500/10 border border-orange-500/30 rounded-2xl p-4 mb-2">
                    <i class="fa-solid fa-triangle-exclamation text-orange-400 mt-0.5 flex-shrink-0 text-base"></i>
                    <div>
                        <p class="text-orange-400 text-xs font-black uppercase tracking-widest mb-1">Producto eliminado</p>
                        <p class="text-orange-200/60 text-xs leading-relaxed">${nombres} ${eliminados.length > 1 ? 'ya no están disponibles' : 'ya no está disponible'}. Eliminá ${eliminados.length > 1 ? 'esos productos' : 'ese producto'} del carrito para continuar.</p>
                    </div>
                </div>`;
        }
        if (sinStock.length > 0) {
            const nombres = sinStock.map(p => `<strong>${p.nombre}</strong>`).join(', ');
            avisoSinStock += `
                <div class="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-2">
                    <i class="fa-solid fa-circle-exclamation text-red-400 mt-0.5 flex-shrink-0 text-base"></i>
                    <div>
                        <p class="text-red-400 text-xs font-black uppercase tracking-widest mb-1">No podés enviar el pedido</p>
                        <p class="text-red-200/60 text-xs leading-relaxed">${nombres} ${sinStock.length > 1 ? 'ya no tienen' : 'ya no tiene'} stock. Eliminá ${sinStock.length > 1 ? 'esos productos' : 'ese producto'} del carrito para continuar.</p>
                    </div>
                </div>`;
        }

        lista.innerHTML = avisoSinStock + carrito.map(p => {
            const esEliminado = p._eliminado === true;
            const esSinStock  = p.disponible === false && !esEliminado;
            const esProblema  = esEliminado || esSinStock;
            if (!esProblema) total += p.precio * p.cantidad;

            const borderClass = esEliminado ? 'border-orange-500/25' : esSinStock ? 'border-red-500/25' : 'border-white/5';
            const imgClass    = esProblema ? 'grayscale opacity-40' : '';
            const iconOverlay = esEliminado
                ? '<div class="absolute inset-0 flex items-center justify-center"><i class="fa-solid fa-triangle-exclamation text-orange-400/90 text-xl"></i></div>'
                : esSinStock
                    ? '<div class="absolute inset-0 flex items-center justify-center"><i class="fa-solid fa-ban text-red-400/80 text-xl"></i></div>'
                    : '';
            const subtitulo = esEliminado
                ? `<p class="text-orange-400 text-[9px] uppercase tracking-widest font-black">Eliminado — quitá este producto</p>`
                : esSinStock
                    ? `<p class="text-red-400 text-[9px] uppercase tracking-widest font-black">Sin stock — eliminá este producto</p>`
                    : `<p class="text-[#d4af37] font-bold text-sm">$ ${(p.precio * p.cantidad).toLocaleString('es-AR')}</p>`;
            const trashClass = esEliminado
                ? 'text-orange-500 bg-orange-500/15 hover:bg-orange-500 hover:text-white'
                : esSinStock
                    ? 'text-red-500 bg-red-500/15 hover:bg-red-500 hover:text-white'
                    : 'text-gray-600 hover:text-red-400 hover:bg-red-400/10';

            return `
                <div class="flex gap-3 items-center bg-white/5 p-3 rounded-2xl border ${borderClass}">
                    <div class="relative flex-shrink-0">
                        <img src="${p.imagenes[0]}" class="w-16 h-16 object-cover rounded-xl ${imgClass}">
                        ${iconOverlay}
                    </div>
                    <div class="flex-1 min-w-0">
                        <h4 class="font-luxury font-semibold text-white text-base truncate ${esProblema ? 'line-through opacity-50' : ''}">${p.nombre}</h4>
                        ${subtitulo}
                        <div class="flex items-center gap-3 mt-1.5">
                            <button onclick="cambiarCantidad('${p._key || p.id}', -1)" class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white border border-white/10 rounded-full transition-colors ${esProblema ? 'opacity-30 pointer-events-none' : ''}"><i class="fa-solid fa-minus text-[9px]"></i></button>
                            <span class="text-white text-sm font-bold w-4 text-center">${p.cantidad}</span>
                            <button onclick="cambiarCantidad('${p._key || p.id}', 1)" class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white border border-white/10 rounded-full transition-colors ${esProblema ? 'opacity-30 pointer-events-none' : ''}"><i class="fa-solid fa-plus text-[9px]"></i></button>
                        </div>
                    </div>
                    <button onclick="eliminarDelCarrito('${p._key || p.id}')" class="flex-shrink-0 w-7 h-7 flex items-center justify-center ${trashClass} rounded-full transition-all">
                        <i class="fa-solid fa-trash-can text-xs"></i>
                    </button>
                </div>
            `;
        }).join("");
    }

    document.getElementById("total-carrito").innerText = `$ ${total.toLocaleString('es-AR')}`;

    const btnEnviar = document.getElementById("btn-enviar-pedido");
    const hayBloqueantes2 = carrito.some(p => p.disponible === false || p._eliminado === true);
    if (btnEnviar) {
        if (hayBloqueantes2) {
            btnEnviar.disabled = true;
            btnEnviar.classList.add("opacity-40", "cursor-not-allowed");
            btnEnviar.classList.remove("hover:bg-white");
        } else {
            btnEnviar.disabled = false;
            btnEnviar.classList.remove("opacity-40", "cursor-not-allowed");
            btnEnviar.classList.add("hover:bg-white");
        }
    }
    document.getElementById("modal-carrito").classList.remove("hidden");
};

// --- PEDIR SIN STOCK POR WHATSAPP ---
window.pedirSinStock = function(id) {
    const p = productos.find(x => x.id === id);
    if (!p) return;
    const baseUrl = window.location.origin + window.location.pathname;
    const linkProducto = `${baseUrl}?p=${p.id}`;
    const msj = `Hola! Me interesa el siguiente producto que aparece sin stock:%0A%0A*${p.nombre}*%0A🔎 Producto: ${linkProducto}%0A%0A¿Tienen disponibilidad o fecha estimada de reposición?`;
    window.open(`https://wa.me/5493624895445?text=${msj}`);
};

// --- LIGHTBOX DE IMÁGENES ---
window.abrirLightbox = function(index) {
    lightboxIndex = index;
    const lb = document.getElementById('lightbox');
    lb.classList.remove('hidden');
    bloquearScroll();
    renderLightbox();
};

window.cerrarLightbox = function() {
    document.getElementById('lightbox').classList.add('hidden');
    desbloquearScroll();
};

window.lightboxNav = function(dir) {
    lightboxIndex = (lightboxIndex + dir + lightboxImagenes.length) % lightboxImagenes.length;
    renderLightbox();
};

function renderLightbox() {
    document.getElementById('lb-img').src = lightboxImagenes[lightboxIndex];
    document.getElementById('lb-counter').textContent = `${lightboxIndex + 1} / ${lightboxImagenes.length}`;

    const thumbsEl = document.getElementById('lb-thumbs');
    if (lightboxImagenes.length > 1) {
        thumbsEl.innerHTML = lightboxImagenes.map((img, i) => `
            <button onclick="abrirLightbox(${i})" class="lb-thumb w-10 h-10 rounded-lg border-2 overflow-hidden transition-all ${i === lightboxIndex ? 'border-[#d4af37]' : 'border-white/10'} hover:border-[#d4af37]">
                <img src="${img}" class="w-full h-full object-cover">
            </button>
        `).join('');
    } else {
        thumbsEl.innerHTML = '';
    }
    document.getElementById('lb-prev').classList.toggle('hidden', lightboxImagenes.length <= 1);
    document.getElementById('lb-next').classList.toggle('hidden', lightboxImagenes.length <= 1);
}

window.cambiarCantidad = (key, delta) => {
    const item = carrito.find(p => (p._key || p.id) === key);
    if (!item) return;
    if (delta === -1 && item.cantidad === 1) {
        eliminarDelCarrito(key);
        return;
    }
    item.cantidad += delta;
    if (item.cantidad <= 0) carrito = carrito.filter(p => (p._key || p.id) !== key);
    guardarCarrito(); actualizarContador(); abrirCarrito();
};

window.eliminarDelCarrito = (key) => {
    const prod = carrito.find(p => (p._key || p.id) === key);
    if (!prod) return;
    document.getElementById("confirm-nombre").textContent = prod.nombre;
    document.getElementById("confirm-img").src = prod.imagenes[0];
    document.getElementById("modal-confirmar").classList.remove("hidden");
    window._pendingDeleteId = key;
};

function actualizarContador() {
    const count = carrito.reduce((acc, p) => acc + p.cantidad, 0);
    document.getElementById("cart-count").innerText = count;
}

// --- BLOQUEO DE SCROLL (compatible iOS) ---
function bloquearScroll() {
    document.body.classList.add('modal-active');
}

function desbloquearScroll() {
    document.body.classList.remove('modal-active');
}

window.cerrarModal = (id) => {
    document.getElementById(id).classList.add("hidden");
    // Solo desbloquear si no hay otro modal abierto
    const modalesAbiertos = ['modal-detalles', 'modal-carrito', 'lightbox']
        .filter(m => m !== id)
        .some(m => !document.getElementById(m).classList.contains('hidden'));
    if (!modalesAbiertos) desbloquearScroll();
};

window.confirmarEliminar = () => {
    const key = window._pendingDeleteId;
    if (!key) return;
    carrito = carrito.filter(p => (p._key || p.id) !== key);
    window._pendingDeleteId = null;
    document.getElementById("modal-confirmar").classList.add("hidden");
    guardarCarrito(); actualizarContador(); abrirCarrito();
    showToast("Producto eliminado del carrito");
};

window.cancelarEliminar = () => {
    window._pendingDeleteId = null;
    document.getElementById("modal-confirmar").classList.add("hidden");
};

// --- NUEVO FLUJO DE PEDIDOS ---

window.abrirFormularioPedido = function() {
    if (!carrito.length) return;
    if (carrito.some(p => p.disponible === false || p._eliminado === true)) {
        showToast("Eliminá los productos sin stock para continuar");
        return;
    }
    document.getElementById("pedido-nombre").value = "";
    document.getElementById("pedido-contacto").value = "";
    document.getElementById("pedido-pago").value = "";
    document.getElementById("pedido-envio").value = "";
    document.getElementById("modal-pedido").classList.remove("hidden");
};

window.cerrarFormularioPedido = function() {
    document.getElementById("modal-pedido").classList.add("hidden");
};

window.cerrarPedidoOk = function() {
    document.getElementById("modal-pedido-ok").classList.add("hidden");
    desbloquearScroll();
};

window.confirmarPedido = async function() {
    const nombre   = document.getElementById("pedido-nombre").value.trim();
    const contacto = document.getElementById("pedido-contacto").value.trim();
    const pago     = document.getElementById("pedido-pago").value;
    const envio    = document.getElementById("pedido-envio").value;

    if (!nombre || !contacto || !pago || !envio) {
        showToast("Completá todos los campos para continuar");
        return;
    }

    const COSTO_ENVIO = 2000;
    const tieneEnvio = envio === "Si";

    let subtotalProductos = 0;
    const items = carrito.map(p => {
        subtotalProductos += p.precio * p.cantidad;
        return {
            id:       p.id,
            nombre:   p.nombre,
            precio:   p.precio,
            cantidad: p.cantidad,
            imagen:   p.imagenes?.[0] || "",
            subtotal: p.precio * p.cantidad
        };
    });

    const costoEnvio = tieneEnvio ? COSTO_ENVIO : 0;
    const total = subtotalProductos + costoEnvio;

    const btn    = document.getElementById("btn-confirmar-pedido");
    const txtEl  = btn.querySelector(".btn-confirmar-text");
    const spinEl = btn.querySelector(".btn-confirmar-spinner");

    btn.disabled = true;
    txtEl.classList.add("hidden");
    spinEl.classList.remove("hidden");

    try {
        await addDoc(collection(db, "orders"), {
            nombre,
            contacto,
            medioPago: pago,
            envio,
            costoEnvio,
            subtotalProductos,
            items,
            total,
            estado: "pendiente",
            fecha: Date.now()
        });

        cerrarFormularioPedido();
        cerrarModal("modal-carrito");
        document.getElementById("modal-pedido-ok").classList.remove("hidden");

        carrito = [];
        guardarCarrito();
        actualizarContador();

    } catch(e) {
        console.error("Error al guardar pedido:", e);
        showToast("Error al enviar el pedido, intentá de nuevo");
    } finally {
        btn.disabled = false;
        txtEl.classList.remove("hidden");
        spinEl.classList.add("hidden");
    }
};

// --- INICIO ---
cargarProductos();

// --- DEEP LINKING: Abrir producto desde URL ---
window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('p');

    if (productId) {
        // Mostrar loader inmediatamente
        const loader = document.getElementById('deeplink-loader');
        loader.classList.remove('hidden');
        loader.style.display = 'flex';

        const checkProducts = setInterval(() => {
            if (productos.length > 0) {
                clearInterval(checkProducts);
                verDetalles(productId);
                // Ocultar loader con fade
                loader.style.transition = 'opacity 0.4s ease';
                loader.style.opacity = '0';
                setTimeout(() => {
                    loader.style.display = 'none';
                    loader.classList.add('hidden');
                    loader.style.opacity = '';
                    loader.style.transition = '';
                }, 400);
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        }, 100);
    }
});

document.addEventListener('keydown', (e) => {
    const lb = document.getElementById('lightbox');
    if (!lb.classList.contains('hidden')) {
        if (e.key === 'Escape') cerrarLightbox();
        if (e.key === 'ArrowRight') lightboxNav(1);
        if (e.key === 'ArrowLeft')  lightboxNav(-1);
    }
});
