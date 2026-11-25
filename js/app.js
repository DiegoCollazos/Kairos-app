/*
 * Kairós · Interfaz del formulador.
 * Entrada con token de GitHub, selección del repositorio de datos de la organización
 * y carga del Excel de configuración (organización, grupos, líneas e investigadores).
 */
(function () {
  'use strict';

  var RUTA_CONFIG = 'datos/configuracion.json';
  var RUTA_EXCEL = 'datos/excel/configuracion.xlsx';
  var CLAVE_SESION = 'kairos.sesion';

  var estado = {
    token: null,
    usuario: null,
    repo: null,
    config: null,
    gh: null,
    carga: null // { archivo, bytes, resultado }
  };

  var raiz = document.getElementById('app');

  /* ---------- utilidades de DOM (todo texto entra como textContent) ---------- */

  function el(etiqueta, atributos, hijos) {
    var nodo = document.createElement(etiqueta);
    Object.keys(atributos || {}).forEach(function (k) {
      var v = atributos[k];
      if (v == null || v === false) return;
      if (k === 'texto') nodo.textContent = v;
      else if (k.indexOf('on') === 0) nodo.addEventListener(k.slice(2), v);
      else nodo.setAttribute(k, v === true ? '' : v);
    });
    (hijos || []).forEach(function (h) {
      if (h == null || h === false) return;
      nodo.appendChild(typeof h === 'string' ? document.createTextNode(h) : h);
    });
    return nodo;
  }

  function montar(nodo) {
    raiz.replaceChildren(nodo);
  }

  function logo(tamano, conTexto) {
    return el('span', { class: 'logo', style: 'font-size:' + (tamano * 0.8) + 'px' }, [
      el('img', { src: 'img/kairos-icono-fondo-oscuro.svg', width: tamano, height: tamano, alt: '' }),
      conTexto ? 'Kairós' : null
    ]);
  }

  /* ---------- sesión ---------- */

  function guardarSesion(recordar) {
    var datos = JSON.stringify({ token: estado.token, repo: estado.repo });
    try {
      sessionStorage.setItem(CLAVE_SESION, datos);
      if (recordar) localStorage.setItem(CLAVE_SESION, datos);
      else localStorage.removeItem(CLAVE_SESION);
    } catch (e) { /* almacenamiento no disponible: la sesión dura lo que la pestaña */ }
  }

  function leerSesion() {
    try {
      var s = sessionStorage.getItem(CLAVE_SESION) || localStorage.getItem(CLAVE_SESION);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }

  function cerrarSesion() {
    try {
      sessionStorage.removeItem(CLAVE_SESION);
      localStorage.removeItem(CLAVE_SESION);
    } catch (e) { /* nada que borrar */ }
    estado = { token: null, usuario: null, repo: null, config: null, gh: null, carga: null };
    location.hash = '';
    vistaEntrada();
  }

  function mensajeError(e) {
    if (e && e.propio) return e.message;
    if (e && e.estado === 401) return 'El token no es válido o ya expiró. Cree uno nuevo en GitHub.';
    if (e && e.estado === 403) return 'El token no tiene permiso para esta acción. Revise que tenga acceso de lectura y escritura a "Contents" del repositorio.';
    if (e && e.estado === 404) return 'No se encontró el repositorio, o el token no tiene acceso a él.';
    if (e && e.estado === -1) return 'El token tiene caracteres no válidos. Cópielo de nuevo desde GitHub, sin espacios ni texto adicional.';
    if (e && e.estado === 0 && e.sinRed) return 'Este navegador no logra comunicarse con GitHub (api.github.com). Suele deberse a la red (por ejemplo, la red institucional o una VPN que bloquea el sitio), a un bloqueador de anuncios o extensión de privacidad, o a la falta de conexión. Pruebe en una ventana de incógnito o desde otra red, por ejemplo los datos del celular.';
    if (e && e.estado === 0) return 'GitHub responde, pero rechazó la petición con el token desde este navegador. Pruebe en una ventana de incógnito sin extensiones; si persiste, cree un token nuevo. (Detalle: ' + e.message + ')';
    return 'No se pudo conectar con GitHub' + (e && e.message ? ' (' + e.message + ')' : '') + '.';
  }

  // Ante un error de red, averigua si GitHub es alcanzable sin token para dar un mensaje útil.
  function diagnosticar(e) {
    if (!e || e.estado !== 0) throw e;
    return KairosGitHub.hayConexion().then(function (ok) {
      e.sinRed = !ok;
      throw e;
    });
  }

  /* ---------- vista: entrada ---------- */

  function vistaEntrada(error) {
    var inputToken = el('input', { id: 'token', type: 'password', placeholder: 'github_pat_…', autocomplete: 'off', required: true });
    var recordar = el('input', { id: 'recordar', type: 'checkbox' });
    var boton = el('button', { class: 'btn', type: 'submit', texto: 'Entrar' });
    var zonaMensaje = el('div', {}, [error ? el('div', { class: 'mensaje mensaje-error', role: 'alert', texto: error }) : null]);

    var form = el('form', { class: 'tarjeta', onsubmit: function (ev) {
      ev.preventDefault();
      var token = KairosGitHub.limpiarToken(inputToken.value);
      if (!token) return;
      if (!KairosGitHub.tokenValido(token)) {
        zonaMensaje.replaceChildren(el('div', { class: 'mensaje mensaje-error', role: 'alert', texto: 'Eso no parece un token de GitHub: debe empezar por "github_pat_" y tener solo letras, números y guiones bajos. Cópielo de nuevo desde GitHub.' }));
        return;
      }
      boton.disabled = true;
      boton.textContent = 'Verificando…';
      entrar(token, null, recordar.checked).catch(diagnosticar).catch(function (e) {
        boton.disabled = false;
        boton.textContent = 'Entrar';
        zonaMensaje.replaceChildren(el('div', { class: 'mensaje mensaje-error', role: 'alert', texto: mensajeError(e) }));
      });
    } }, [
      el('div', { class: 'campo' }, [
        el('label', { for: 'token', texto: 'Token de acceso de GitHub' }),
        inputToken
      ]),
      el('label', { class: 'check', for: 'recordar' }, [recordar, 'Recordar en este navegador']),
      boton,
      el('p', { class: 'ayuda', texto: 'El token solo se guarda en este navegador y da acceso únicamente al repositorio de datos de su organización.' }),
      zonaMensaje
    ]);

    montar(el('div', { class: 'entrada' }, [
      el('section', { class: 'entrada-marca' }, [
        logo(40, true),
        el('div', { style: 'display:flex;flex-direction:column;gap:16px' }, [
          el('h1', {}, ['Encuentra tu convocatoria.', el('br'), 'Mide tu oportunidad.']),
          el('p', { texto: 'Scouting semanal de convocatorias CTeI nacionales e internacionales, match con las líneas de sus grupos y estimación de viabilidad según los términos de referencia.' })
        ]),
        el('p', { style: 'font-size:13px;color:#B8C4D6', texto: 'Kairós (καιρός): el momento oportuno.' })
      ]),
      el('section', { class: 'entrada-form' }, [
        el('div', {}, [
          el('div', { style: 'display:flex;flex-direction:column;gap:8px' }, [
            el('h2', { style: 'font-size:30px', texto: 'Ingresar' }),
            el('p', { class: 'ayuda', style: 'font-size:15px', texto: 'Use el token personal de GitHub que creó para el repositorio de su organización.' })
          ]),
          form,
          el('div', { class: 'tarjeta' }, [
            el('h3', { style: 'font-size:17px', texto: '¿Primera vez? Cree su token en 3 pasos' }),
            el('ol', { class: 'pasos' }, [
              el('li', { texto: 'Acepte la invitación al repositorio de datos de su organización (kairos-datos-…).' }),
              el('li', {}, ['En GitHub, vaya a ', el('strong', { texto: 'Settings › Developer settings › Fine-grained tokens' }), ' y pulse "Generate new token".']),
              el('li', {}, ['Elija ', el('strong', { texto: 'solo ese repositorio' }), ', dé permiso de ', el('strong', { texto: 'Contents: Read and write' }), ' y pegue aquí el token.'])
            ]),
            el('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener', texto: 'Crear token en GitHub' })
          ])
        ])
      ])
    ]));
    inputToken.focus();
  }

  /* ---------- entrada y selección de repositorio ---------- */

  function entrar(token, repoGuardado, recordar) {
    var gh = KairosGitHub.crear(token);
    return gh.usuario().then(function (usuario) {
      estado.token = token;
      estado.gh = gh;
      estado.usuario = usuario;
      if (repoGuardado) return gh.repo(repoGuardado).then(function (r) { return [r]; });
      return gh.reposKairos();
    }).then(function (repos) {
      if (repos.length === 1) return elegirRepo(repos[0].nombre, recordar);
      vistaElegirRepo(repos, recordar);
    });
  }

  function vistaElegirRepo(repos, recordar) {
    var zona = el('div');
    var contenido;
    if (repos.length) {
      var select = el('select', { id: 'repo' }, repos.map(function (r) {
        return el('option', { value: r.nombre, texto: r.nombre });
      }));
      contenido = [
        el('div', { class: 'campo' }, [el('label', { for: 'repo', texto: 'Repositorio de su organización' }), select]),
        el('button', { class: 'btn', type: 'button', texto: 'Continuar', onclick: function () {
          elegirRepo(select.value, recordar).catch(diagnosticar).catch(function (e) {
            zona.replaceChildren(el('div', { class: 'mensaje mensaje-error', role: 'alert', texto: mensajeError(e) }));
          });
        } })
      ];
    } else {
      var manual = el('input', { id: 'repo-manual', type: 'text', placeholder: 'usuario/kairos-datos-organizacion' });
      contenido = [
        el('div', { class: 'mensaje mensaje-aviso', texto: 'El token no tiene acceso a ningún repositorio cuyo nombre empiece por "' + KairosGitHub.PREFIJO_REPO + '". Escríbalo a mano o cree un token nuevo con acceso a él.' }),
        el('div', { class: 'campo' }, [el('label', { for: 'repo-manual', texto: 'Repositorio (usuario/nombre)' }), manual]),
        el('button', { class: 'btn', type: 'button', texto: 'Continuar', onclick: function () {
          var nombre = manual.value.trim();
          if (!/^[\w.-]+\/[\w.-]+$/.test(nombre)) {
            zona.replaceChildren(el('div', { class: 'mensaje mensaje-error', role: 'alert', texto: 'Escriba el repositorio como usuario/nombre.' }));
            return;
          }
          estado.gh.repo(nombre).then(function () { return elegirRepo(nombre, recordar); }).catch(diagnosticar).catch(function (e) {
            zona.replaceChildren(el('div', { class: 'mensaje mensaje-error', role: 'alert', texto: mensajeError(e) }));
          });
        } })
      ];
    }
    montar(el('div', { class: 'entrada' }, [
      el('section', { class: 'entrada-marca' }, [logo(40, true), el('p', { texto: 'Hola, ' + (estado.usuario.name || estado.usuario.login) + '.' })]),
      el('section', { class: 'entrada-form' }, [el('div', {}, [
        el('h2', { style: 'font-size:28px', texto: 'Elija su organización' }),
        el('div', { class: 'tarjeta' }, contenido.concat([zona]))
      ])])
    ]));
  }

  function elegirRepo(nombre, recordar) {
    return estado.gh.repo(nombre).then(function (r) {
      if (!r.privado) {
        throw { propio: true, message: 'El repositorio ' + nombre + ' es público. Los datos de la organización deben estar en un repositorio privado.' };
      }
      estado.repo = r.nombre;
      estado.escritura = r.escritura;
      guardarSesion(recordar);
      return cargarConfig();
    }).then(function () {
      if (!location.hash) location.hash = estado.config ? '#inicio' : '#configuracion';
      enrutar();
    });
  }

  function cargarConfig() {
    return estado.gh.leerTexto(estado.repo, RUTA_CONFIG).then(function (archivo) {
      estado.config = archivo ? JSON.parse(archivo.texto) : null;
    });
  }

  /* ---------- estructura de la aplicación ---------- */

  var SECCIONES = [
    { id: 'inicio', nombre: 'Inicio' },
    { id: 'convocatorias', nombre: 'Convocatorias', pronto: true },
    { id: 'seguimiento', nombre: 'Seguimiento', pronto: true },
    { id: 'viabilidad', nombre: 'Viabilidad', pronto: true },
    { id: 'configuracion', nombre: 'Configuración' }
  ];

  function marco(seccion, contenido) {
    var org = estado.config && estado.config.organizacion;
    var menu = el('nav', { class: 'menu', 'aria-label': 'Menú principal' }, [logo(28, true)].concat(
      SECCIONES.map(function (s) {
        return el('a', { href: '#' + s.id, 'aria-current': s.id === seccion ? 'page' : null }, [
          s.nombre, s.pronto ? el('span', { class: 'pronto', texto: 'pronto' }) : null
        ]);
      }),
      [el('div', { class: 'menu-pie' }, [
        el('span', { texto: (estado.usuario.name || estado.usuario.login) }),
        el('span', { texto: org ? org.nombre : estado.repo }),
        el('button', { type: 'button', texto: 'Cerrar sesión', onclick: cerrarSesion })
      ])]
    ));
    montar(el('div', { class: 'app' }, [menu, el('main', { class: 'contenido' }, contenido)]));
  }

  function encabezado(titulo, subtitulo) {
    return el('header', {}, [subtitulo ? el('p', { texto: subtitulo }) : null, el('h1', { texto: titulo })]);
  }

  function subtituloOrg() {
    var org = estado.config && estado.config.organizacion;
    return org ? [org.nombre, org.dependencia].filter(Boolean).join(' · ') : estado.repo;
  }

  function enrutar() {
    if (!estado.repo) return;
    var id = (location.hash || '#inicio').slice(1);
    var seccion = SECCIONES.filter(function (s) { return s.id === id; })[0] || SECCIONES[0];
    if (seccion.id === 'inicio') vistaInicio();
    else if (seccion.id === 'configuracion') vistaConfiguracion();
    else vistaPronto(seccion);
  }

  /* ---------- vista: inicio ---------- */

  function vistaInicio() {
    var c = estado.config;
    var nombre = estado.usuario.name || estado.usuario.login;
    var cuerpo;
    if (!c) {
      cuerpo = el('div', { class: 'tarjeta' }, [
        el('h2', { style: 'font-size:19px', texto: 'Primer paso: configure su organización' }),
        el('p', { class: 'ayuda', style: 'font-size:15px', texto: 'Descargue la plantilla de Excel, complete los datos de su organización, grupos, líneas e investigadores, y súbala en Configuración.' }),
        el('a', { class: 'btn', href: '#configuracion', style: 'align-self:flex-start', texto: 'Ir a Configuración' })
      ]);
    } else {
      cuerpo = el('div', { class: 'tarjeta' }, [
        el('h2', { style: 'font-size:19px', texto: 'Su organización en Kairós' }),
        resumenCifras(c),
        el('p', { class: 'ayuda', texto: 'El scouting semanal, el match y el envío de correos llegarán en los siguientes pasos.' })
      ]);
    }
    marco('inicio', [encabezado('Hola, ' + nombre.split(' ')[0], subtituloOrg()), cuerpo]);
  }

  function aLideres(c) {
    return c.destinatarios === 'lideres' || !(c.investigadores && c.investigadores.length);
  }

  function resumenCifras(c) {
    var cifra = function (n, texto) { return el('span', { class: 'cifra' }, [el('strong', { texto: String(n) }), texto]); };
    if (aLideres(c)) {
      return el('div', { class: 'cifras' }, [
        cifra(c.grupos.length, ' grupos'),
        cifra(c.lineas.length, ' líneas'),
        cifra(c.grupos.filter(function (g) { return g.lider_correo; }).length, ' líderes reciben correos')
      ]);
    }
    return el('div', { class: 'cifras' }, [
      cifra(c.grupos.length, ' grupos'),
      cifra(c.lineas.length, ' líneas'),
      cifra(c.investigadores.length, ' investigadores'),
      cifra(c.investigadores.filter(function (i) { return i.recibe_correos; }).length, ' reciben correos')
    ]);
  }

  function vistaPronto(seccion) {
    marco(seccion.id, [
      encabezado(seccion.nombre, subtituloOrg()),
      el('div', { class: 'tarjeta vacio', texto: 'Esta sección está en construcción.' })
    ]);
  }

  /* ---------- vista: configuración ---------- */

  function vistaConfiguracion() {
    var c = estado.config;
    var zonaResultado = el('div', { style: 'display:flex;flex-direction:column;gap:16px' });
    var inputArchivo = el('input', { id: 'excel', type: 'file', accept: '.xlsx', style: 'position:absolute;width:1px;height:1px;opacity:0', onchange: function () {
      if (inputArchivo.files[0]) procesarArchivo(inputArchivo.files[0], zonaResultado);
      inputArchivo.value = '';
    } });

    var estadoActual = c
      ? [
          el('p', { class: 'ayuda', texto: 'Última carga: ' + fecha(c.actualizado) + (c.actualizado_por ? ' por ' + c.actualizado_por : '') + '.' }),
          resumenCifras(c)
        ]
      : [el('p', { class: 'ayuda', texto: 'Todavía no ha cargado la configuración de su organización.' })];

    marco('configuracion', [
      encabezado('Configuración', subtituloOrg()),
      el('section', { class: 'tarjeta' }, [
        el('h2', { style: 'font-size:19px', texto: 'Organización, grupos e investigadores' })
      ].concat(estadoActual, [
        el('div', { style: 'display:flex;flex-wrap:wrap;gap:10px;align-items:center' }, [
          inputArchivo,
          el('label', { class: 'btn', for: 'excel', tabindex: '0', role: 'button', onkeydown: function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); inputArchivo.click(); }
          }, texto: c ? 'Subir Excel actualizado' : 'Subir Excel' }),
          el('a', { class: 'btn btn-sec', href: 'plantillas/kairos_configuracion_organizacion.xlsx', download: true, texto: 'Descargar plantilla' })
        ]),
        estado.escritura === false ? el('div', { class: 'mensaje mensaje-aviso', texto: 'Su token solo tiene permiso de lectura: podrá revisar el Excel pero no guardarlo.' }) : null
      ])),
      zonaResultado,
      c ? vistaDatosGuardados(c) : null
    ]);
  }

  function procesarArchivo(archivo, zona) {
    zona.replaceChildren(el('div', { class: 'mensaje mensaje-aviso', texto: 'Leyendo ' + archivo.name + '…' }));
    archivo.arrayBuffer().then(function (buffer) {
      var bytes = new Uint8Array(buffer);
      var libro;
      try {
        libro = XLSX.read(bytes, { type: 'array' });
      } catch (e) {
        zona.replaceChildren(el('div', { class: 'mensaje mensaje-error', role: 'alert', texto: 'No se pudo leer el archivo. Verifique que sea un Excel (.xlsx) hecho con la plantilla de Kairós.' }));
        return;
      }
      var resultado = KairosExcel.validarConfiguracion(XLSX, libro);
      estado.carga = { archivo: archivo.name, bytes: bytes, resultado: resultado };
      mostrarResultado(zona);
    });
  }

  function listaMensajes(lista) {
    return el('ul', { class: 'lista-mensajes' }, lista.map(function (m) {
      return el('li', { texto: m.hoja + (m.fila ? ', fila ' + m.fila : '') + ': ' + m.mensaje });
    }));
  }

  function mostrarResultado(zona) {
    var r = estado.carga.resultado;
    var hijos = [];
    if (r.errores.length) {
      hijos.push(el('div', { class: 'mensaje mensaje-error', role: 'alert' }, [
        el('strong', { texto: 'Hay ' + r.errores.length + ' error(es) que debe corregir en el Excel antes de guardar:' }),
        listaMensajes(r.errores)
      ]));
    } else {
      hijos.push(el('div', { class: 'mensaje mensaje-ok' }, [el('strong', { texto: 'El archivo ' + estado.carga.archivo + ' está correcto.' })]));
    }
    if (r.avisos.length) {
      hijos.push(el('div', { class: 'mensaje mensaje-aviso' }, [
        el('strong', { texto: r.avisos.length + ' aviso(s), puede guardar igualmente:' }),
        listaMensajes(r.avisos)
      ]));
    }
    if (!r.errores.length) {
      var zonaGuardar = el('div');
      var boton = el('button', { class: 'btn', type: 'button', texto: 'Guardar en Kairós', disabled: estado.escritura === false, onclick: function () {
        boton.disabled = true;
        boton.textContent = 'Guardando…';
        guardar().catch(diagnosticar).then(function () {
          estado.carga = null;
          vistaConfiguracion();
        }, function (e) {
          boton.disabled = false;
          boton.textContent = 'Guardar en Kairós';
          zonaGuardar.replaceChildren(el('div', { class: 'mensaje mensaje-error', role: 'alert', texto: mensajeError(e) }));
        });
      } });
      hijos.push(el('section', { class: 'tarjeta' }, [
        el('h2', { style: 'font-size:19px', texto: 'Vista previa' }),
        resumenCifras(r.datos),
        tablaOrganizacion(r.datos.organizacion),
        tablaGrupos(r.datos),
        tablaInvestigadores(r.datos),
        el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, [
          boton,
          el('button', { class: 'btn btn-sec', type: 'button', texto: 'Cancelar', onclick: function () { estado.carga = null; zona.replaceChildren(); } })
        ]),
        zonaGuardar
      ]));
    }
    zona.replaceChildren.apply(zona, hijos);
  }

  function guardar() {
    var datos = JSON.parse(JSON.stringify(estado.carga.resultado.datos));
    datos.actualizado = new Date().toISOString();
    datos.actualizado_por = estado.usuario.login;
    var json = JSON.stringify(datos, null, 2) + '\n';
    var quien = estado.usuario.login;
    return estado.gh.escribir(estado.repo, RUTA_EXCEL, KairosGitHub.bytesABase64(estado.carga.bytes), 'Kairós: Excel de configuración subido por ' + quien)
      .then(function () {
        return estado.gh.escribir(estado.repo, RUTA_CONFIG, KairosGitHub.textoABase64(json), 'Kairós: configuración actualizada por ' + quien);
      })
      .then(function () { estado.config = datos; });
  }

  function vistaDatosGuardados(c) {
    return el('section', { class: 'tarjeta' }, [
      el('h2', { style: 'font-size:19px', texto: 'Datos guardados' }),
      tablaOrganizacion(c.organizacion),
      tablaGrupos(c),
      tablaInvestigadores(c)
    ]);
  }

  /* ---------- tablas ---------- */

  function tabla(titulo, columnas, filas) {
    return el('div', { style: 'display:flex;flex-direction:column;gap:8px' }, [
      el('h3', { style: 'font-size:16px', texto: titulo }),
      el('div', { class: 'tabla-caja' }, [
        el('table', {}, [
          el('thead', {}, [el('tr', {}, columnas.map(function (c) { return el('th', { scope: 'col', texto: c }); }))]),
          el('tbody', {}, filas.map(function (f) {
            return el('tr', {}, f.map(function (v) { return el('td', { texto: v }); }));
          }))
        ])
      ])
    ]);
  }

  function tablaOrganizacion(o) {
    return tabla('Organización', ['Organización', 'Dependencia', 'Ciudad', 'Formulador', 'Correo'], [[
      o.nombre + (o.sigla ? ' (' + o.sigla + ')' : ''), o.dependencia, [o.ciudad, o.pais].filter(Boolean).join(', '),
      o.formulador_nombre + (o.formulador_cargo ? ' · ' + o.formulador_cargo : ''), o.formulador_correo
    ]]);
  }

  function tablaGrupos(d) {
    return tabla('Grupos y líneas', ['Grupo', 'Facultad', 'Categoría', 'Líder', 'Correo del líder', 'Líneas'], d.grupos.map(function (g) {
      var lineas = d.lineas.filter(function (l) { return l.grupo.toLowerCase() === g.codigo.toLowerCase(); })
        .map(function (l) { return l.codigo + ' ' + l.nombre; }).join(' · ');
      return [g.codigo + ' · ' + g.nombre, g.facultad || '—', g.categoria || '—', g.lider_nombre, g.lider_correo, lineas || '—'];
    }));
  }

  function tablaInvestigadores(d) {
    if (aLideres(d)) return null;
    return tabla('Investigadores', ['Nombre', 'Correo', 'Grupo', 'Líneas', 'Recibe correos'], d.investigadores.map(function (i) {
      return [i.nombres + ' ' + i.apellidos, i.correo, i.grupo, i.lineas.join('; '), i.recibe_correos ? 'Sí' : 'No'];
    }));
  }

  function fecha(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });
    } catch (e) { return iso; }
  }

  /* ---------- arranque ---------- */

  window.addEventListener('hashchange', enrutar);

  var sesion = leerSesion();
  if (sesion && sesion.token) {
    raiz.replaceChildren(el('div', { class: 'vacio', texto: 'Conectando con GitHub…' }));
    entrar(sesion.token, sesion.repo, !!localStorageTiene()).catch(diagnosticar).catch(function (e) {
      cerrarSesionSilenciosa();
      vistaEntrada(mensajeError(e));
    });
  } else {
    vistaEntrada();
  }

  function localStorageTiene() {
    try { return localStorage.getItem(CLAVE_SESION); } catch (e) { return null; }
  }

  function cerrarSesionSilenciosa() {
    try { sessionStorage.removeItem(CLAVE_SESION); localStorage.removeItem(CLAVE_SESION); } catch (e) { /* nada */ }
  }
})();
