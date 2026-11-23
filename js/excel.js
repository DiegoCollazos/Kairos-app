/*
 * Kairós · Lectura y validación del Excel de configuración de la organización.
 *
 * Funciones puras: reciben un libro de SheetJS y devuelven los datos normalizados
 * junto con la lista de errores (bloquean el guardado) y avisos (no bloquean).
 * Se usa en el navegador (window.KairosExcel) y en las pruebas con Node.
 */
(function (global) {
  'use strict';

  var HOJAS = {
    organizacion: 'Organización',
    grupos: 'Grupos',
    lineas: 'Líneas',
    investigadores: 'Investigadores'
  };

  // Campos de la hoja Organización (formato campo / valor).
  var CAMPOS_ORGANIZACION = [
    { clave: 'nombre', etiqueta: 'Nombre de la organización', obligatorio: true },
    { clave: 'sigla', etiqueta: 'Sigla' },
    { clave: 'nit', etiqueta: 'NIT' },
    { clave: 'tipo', etiqueta: 'Tipo de organización', obligatorio: true },
    { clave: 'pais', etiqueta: 'País', obligatorio: true },
    { clave: 'ciudad', etiqueta: 'Ciudad', obligatorio: true },
    { clave: 'dependencia', etiqueta: 'Dependencia', obligatorio: true },
    { clave: 'dominio_correo', etiqueta: 'Dominio de correo institucional' },
    { clave: 'formulador_nombre', etiqueta: 'Nombre del formulador', obligatorio: true },
    { clave: 'formulador_cargo', etiqueta: 'Cargo del formulador', obligatorio: true },
    { clave: 'formulador_correo', etiqueta: 'Correo del formulador', obligatorio: true, correo: true },
    { clave: 'telefono', etiqueta: 'Teléfono de contacto' }
  ];

  // Columnas de las hojas en formato tabla.
  var COLUMNAS = {
    grupos: [
      { clave: 'codigo', etiqueta: 'Código del grupo', obligatorio: true },
      { clave: 'nombre', etiqueta: 'Nombre del grupo', obligatorio: true },
      { clave: 'codigo_minciencias', etiqueta: 'Código Minciencias' },
      { clave: 'categoria', etiqueta: 'Categoría Minciencias' },
      { clave: 'facultad', etiqueta: 'Facultad o dependencia' },
      { clave: 'lider_nombre', etiqueta: 'Nombre del líder', obligatorio: true },
      { clave: 'lider_correo', etiqueta: 'Correo del líder', obligatorio: true, correo: true },
      { clave: 'gruplac', etiqueta: 'Enlace GrupLAC' },
      { clave: 'descripcion', etiqueta: 'Descripción del grupo' }
    ],
    lineas: [
      { clave: 'codigo', etiqueta: 'Código de la línea', obligatorio: true },
      { clave: 'grupo', etiqueta: 'Código del grupo', obligatorio: true },
      { clave: 'nombre', etiqueta: 'Nombre de la línea', obligatorio: true },
      { clave: 'descripcion', etiqueta: 'Descripción', obligatorio: true },
      { clave: 'palabras_clave', etiqueta: 'Palabras clave', obligatorio: true, lista: true },
      { clave: 'palabras_excluir', etiqueta: 'Palabras a excluir', lista: true },
      { clave: 'areas_ocde', etiqueta: 'Áreas OCDE', lista: true },
      { clave: 'ods', etiqueta: 'ODS relacionados', lista: true }
    ],
    investigadores: [
      { clave: 'nombres', etiqueta: 'Nombres', obligatorio: true },
      { clave: 'apellidos', etiqueta: 'Apellidos', obligatorio: true },
      { clave: 'correo', etiqueta: 'Correo', obligatorio: true, correo: true },
      { clave: 'grupo', etiqueta: 'Código del grupo', obligatorio: true },
      { clave: 'rol', etiqueta: 'Rol en el grupo' },
      { clave: 'categoria', etiqueta: 'Categoría Minciencias' },
      { clave: 'lineas', etiqueta: 'Líneas', obligatorio: true, lista: true },
      { clave: 'cvlac', etiqueta: 'Enlace CvLAC' },
      { clave: 'orcid', etiqueta: 'ORCID' },
      { clave: 'recibe_correos', etiqueta: 'Recibe correos', obligatorio: true }
    ]
  };

  // Valores de los ejemplos que trae la plantilla: si siguen en el archivo, hay que borrarlos.
  var MARCAS_EJEMPLO = ['uejemplo.edu.co', 'universidad ejemplo'];

  var RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function normalizar(texto) {
    return String(texto == null ? '' : texto)
      .replace(/\*/g, '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function limpiar(valor) {
    return String(valor == null ? '' : valor).trim();
  }

  function aLista(valor) {
    return limpiar(valor).split(';').map(function (v) { return v.trim(); }).filter(Boolean);
  }

  function buscarHoja(libro, nombre) {
    var objetivo = normalizar(nombre);
    for (var i = 0; i < libro.SheetNames.length; i++) {
      if (normalizar(libro.SheetNames[i]) === objetivo) return libro.Sheets[libro.SheetNames[i]];
    }
    return null;
  }

  function filas(XLSX, hoja) {
    return XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '', raw: false, blankrows: false });
  }

  function esEjemplo(valores) {
    var texto = normalizar(valores.join(' '));
    return MARCAS_EJEMPLO.some(function (m) { return texto.indexOf(m) !== -1; });
  }

  function leerTabla(XLSX, libro, claveHoja, resultado) {
    var nombreHoja = HOJAS[claveHoja];
    var hoja = buscarHoja(libro, nombreHoja);
    if (!hoja) {
      resultado.errores.push({ hoja: nombreHoja, mensaje: 'Falta la hoja "' + nombreHoja + '".' });
      return [];
    }
    var datos = filas(XLSX, hoja);
    if (!datos.length) {
      resultado.errores.push({ hoja: nombreHoja, mensaje: 'La hoja está vacía.' });
      return [];
    }
    var encabezados = datos[0].map(normalizar);
    var columnas = COLUMNAS[claveHoja];
    var indices = {};
    var faltan = [];
    columnas.forEach(function (c) {
      var i = encabezados.indexOf(normalizar(c.etiqueta));
      if (i === -1) { if (c.obligatorio) faltan.push(c.etiqueta); } else { indices[c.clave] = i; }
    });
    if (faltan.length) {
      resultado.errores.push({ hoja: nombreHoja, mensaje: 'Faltan columnas obligatorias: ' + faltan.join(', ') + '.' });
      return [];
    }

    var registros = [];
    for (var f = 1; f < datos.length; f++) {
      var fila = datos[f];
      if (!fila.some(function (v) { return limpiar(v) !== ''; })) continue;
      var numeroFila = f + 1;
      if (esEjemplo(fila)) {
        resultado.errores.push({ hoja: nombreHoja, fila: numeroFila, mensaje: 'Es una fila de ejemplo de la plantilla: bórrela o reemplácela con sus datos.' });
        continue;
      }
      var registro = { _fila: numeroFila };
      columnas.forEach(function (c) {
        var bruto = indices[c.clave] === undefined ? '' : fila[indices[c.clave]];
        registro[c.clave] = c.lista ? aLista(bruto) : limpiar(bruto);
        var vacio = c.lista ? registro[c.clave].length === 0 : registro[c.clave] === '';
        if (c.obligatorio && vacio) {
          resultado.errores.push({ hoja: nombreHoja, fila: numeroFila, mensaje: 'Falta "' + c.etiqueta + '".' });
        } else if (c.correo && !vacio && !RE_CORREO.test(registro[c.clave])) {
          resultado.errores.push({ hoja: nombreHoja, fila: numeroFila, mensaje: 'El correo "' + registro[c.clave] + '" no es válido.' });
        }
      });
      registros.push(registro);
    }
    return registros;
  }

  function leerOrganizacion(XLSX, libro, resultado) {
    var nombreHoja = HOJAS.organizacion;
    var hoja = buscarHoja(libro, nombreHoja);
    var org = {};
    if (!hoja) {
      resultado.errores.push({ hoja: nombreHoja, mensaje: 'Falta la hoja "' + nombreHoja + '".' });
      return org;
    }
    var mapa = {};
    filas(XLSX, hoja).forEach(function (fila, i) {
      if (i === 0) return;
      mapa[normalizar(fila[0])] = { valor: limpiar(fila[1]), fila: i + 1 };
    });
    var valores = [];
    CAMPOS_ORGANIZACION.forEach(function (c) {
      var entrada = mapa[normalizar(c.etiqueta)];
      org[c.clave] = entrada ? entrada.valor : '';
      valores.push(org[c.clave]);
      if (c.obligatorio && !org[c.clave]) {
        resultado.errores.push({ hoja: nombreHoja, fila: entrada ? entrada.fila : undefined, mensaje: 'Falta "' + c.etiqueta + '".' });
      } else if (c.correo && org[c.clave] && !RE_CORREO.test(org[c.clave])) {
        resultado.errores.push({ hoja: nombreHoja, fila: entrada.fila, mensaje: 'El correo "' + org[c.clave] + '" no es válido.' });
      }
    });
    if (esEjemplo(valores)) {
      resultado.errores.push({ hoja: nombreHoja, mensaje: 'Todavía tiene los datos de ejemplo de la plantilla: reemplácelos con los de su organización.' });
    }
    org.dominio_correo = org.dominio_correo.replace(/^@/, '').toLowerCase();
    return org;
  }

  function duplicados(registros, clave, hoja, etiqueta, resultado, comoError) {
    var vistos = {};
    registros.forEach(function (r) {
      var v = String(r[clave]).toLowerCase();
      if (!v) return;
      if (vistos[v]) {
        (comoError ? resultado.errores : resultado.avisos).push({
          hoja: hoja, fila: r._fila,
          mensaje: etiqueta + ' "' + r[clave] + '" está repetido (también en la fila ' + vistos[v] + ').'
        });
      } else {
        vistos[v] = r._fila;
      }
    });
  }

  function validarConfiguracion(XLSX, libro) {
    var resultado = { errores: [], avisos: [], datos: null };

    var organizacion = leerOrganizacion(XLSX, libro, resultado);
    var grupos = leerTabla(XLSX, libro, 'grupos', resultado);
    var lineas = leerTabla(XLSX, libro, 'lineas', resultado);
    var investigadores = leerTabla(XLSX, libro, 'investigadores', resultado);

    duplicados(grupos, 'codigo', HOJAS.grupos, 'El código de grupo', resultado, true);
    duplicados(lineas, 'codigo', HOJAS.lineas, 'El código de línea', resultado, true);
    duplicados(investigadores, 'correo', HOJAS.investigadores, 'El correo', resultado, true);

    var codigosGrupo = {};
    grupos.forEach(function (g) { codigosGrupo[g.codigo.toLowerCase()] = true; });
    var codigosLinea = {};
    lineas.forEach(function (l) {
      codigosLinea[l.codigo.toLowerCase()] = true;
      if (l.grupo && !codigosGrupo[l.grupo.toLowerCase()]) {
        resultado.errores.push({ hoja: HOJAS.lineas, fila: l._fila, mensaje: 'El grupo "' + l.grupo + '" no existe en la hoja Grupos.' });
      }
    });

    investigadores.forEach(function (inv) {
      if (inv.grupo && !codigosGrupo[inv.grupo.toLowerCase()]) {
        resultado.errores.push({ hoja: HOJAS.investigadores, fila: inv._fila, mensaje: 'El grupo "' + inv.grupo + '" no existe en la hoja Grupos.' });
      }
      inv.lineas.forEach(function (l) {
        if (!codigosLinea[l.toLowerCase()]) {
          resultado.errores.push({ hoja: HOJAS.investigadores, fila: inv._fila, mensaje: 'La línea "' + l + '" no existe en la hoja Líneas.' });
        }
      });
      var recibe = normalizar(inv.recibe_correos);
      if (inv.recibe_correos && recibe !== 'si' && recibe !== 'no') {
        resultado.errores.push({ hoja: HOJAS.investigadores, fila: inv._fila, mensaje: '"Recibe correos" debe ser Sí o No.' });
      }
      inv.recibe_correos = recibe === 'si';
      inv.correo = inv.correo.toLowerCase();
      var dominio = organizacion.dominio_correo;
      if (dominio && inv.correo && !inv.correo.endsWith('@' + dominio) && !inv.correo.endsWith('.' + dominio)) {
        resultado.avisos.push({ hoja: HOJAS.investigadores, fila: inv._fila, mensaje: 'El correo ' + inv.correo + ' no es del dominio institucional (' + dominio + ').' });
      }
    });

    lineas.forEach(function (l) {
      var tiene = investigadores.some(function (inv) {
        return inv.lineas.some(function (c) { return c.toLowerCase() === l.codigo.toLowerCase(); });
      });
      if (l.codigo && !tiene) {
        resultado.avisos.push({ hoja: HOJAS.lineas, fila: l._fila, mensaje: 'La línea ' + l.codigo + ' no tiene investigadores asignados: nadie recibirá sus convocatorias.' });
      }
    });

    if (!resultado.errores.some(function (e) { return e.hoja === HOJAS.grupos; }) && grupos.length === 0) {
      resultado.errores.push({ hoja: HOJAS.grupos, mensaje: 'No hay grupos registrados.' });
    }
    if (!resultado.errores.some(function (e) { return e.hoja === HOJAS.lineas; }) && lineas.length === 0) {
      resultado.errores.push({ hoja: HOJAS.lineas, mensaje: 'No hay líneas registradas.' });
    }
    if (investigadores.length === 0) {
      resultado.avisos.push({ hoja: HOJAS.investigadores, mensaje: 'No hay investigadores registrados.' });
    }

    function sinFila(lista) {
      return lista.map(function (r) {
        var copia = {};
        Object.keys(r).forEach(function (k) { if (k !== '_fila') copia[k] = r[k]; });
        return copia;
      });
    }

    resultado.datos = {
      version: 1,
      organizacion: organizacion,
      grupos: sinFila(grupos),
      lineas: sinFila(lineas),
      investigadores: sinFila(investigadores)
    };
    return resultado;
  }

  var api = { validarConfiguracion: validarConfiguracion, HOJAS: HOJAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.KairosExcel = api;
})(this);
